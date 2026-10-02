# PBA v2 — method (one page per decision)

Scope: AREA1 (Dapot master, 20,227 sites), Jan–Jun 2026. Canonical key: `site_id` = upper(trim(Site ID)). It matches 100% across sources.
Every source is aggregated to **site grain before any join**. `validate.py` checks this: 29 checks covering data, physical sanity, totals and decisions.

## 1. Inputs and corrections

| Item | Treatment | Evidence |
|---|---|---|
| PLN outage frequency and duration | BBT events → **merged intervals** per site. Interval end = mains-fail clear, else NE-down clear, else start + backup. 3,298 overlapping events were merged. Sites without events fall back to the monthly summary, capped per month. | DERIVED |
| Availability / site condition | RAN daily feed. Durations are NE-summed, so they are converted to wall-clock (÷ NE count = denum / 86,400, capped at 86,400 s/day). Availability = 1 − outage / period. Gap = target − availability (pp). | DERIVED |
| MBP base camps | MBP Team sheet. 292 have actual coordinates, 6 were repaired (missing decimal point), 29 have none. The MBP name equals the ticket PIC string (96.9% of tickets match). | ACTUAL / DERIVED |
| Historical MBP and backup time | Tickets with an MBP PIC (not cancelled). Backup time = RH Stop − RH Start (genset hour meter; it matches clock time within 1 h in 97% of tickets). | DERIVED |
| Dependency | `HUB Site` bucket → children count (editable in Config). There is no topology list in the data. | PROXY |
| BBT design | 120 min. The source system's Good/Bad split is also about 120 min. | PROXY |

## 2. BBT (BBS steps 1–2)

Each mains-fail event is a battery test:
- If the battery ran out (LOW BATT / NE DOWN), the event gives the true backup time.
- If PLN came back first (68% of events), the event is **censored**: the battery lasted *at least* that long.

How BBT is set per site:

1. **Measured (ACTUAL).** The **Kaplan-Meier median** of the site's own events, used when the median is actually reached.
2. **Battery outlived most outages** (KM median not reached, 651 sites). Only a lower bound is known, so the site is treated as estimated: the estimate is floored at the longest outage it survived.
3. **Monthly summary fallback (DERIVED).** Used only when it does not contradict the event evidence. 1,156 monthly values were rejected because they were shorter than an outage the battery is proven to have survived.
4. **Estimated (ESTIMATED).** A comparable-site Kaplan-Meier curve, taken from the most specific group with at least 200 events (class × battery type × NOP, then coarser fallbacks). The estimate is *conditional on what the site already survived*. Range ±MAE. Confidence is Medium-Low if the site has a lower bound, otherwise Low.
5. **UNAVAILABLE.** No battery attributes, no outage history and no events. Action = *Collect data*.

**Validation on unseen sites.** Models learn from Jan–Apr events of 70% of sites and predict the May–Jun KM median of the other 30%:

| Method | MAE | Bias | Status accuracy |
|---|---|---|---|
| **KM comparable-site (used)** | 36.9 min | −3.9 | 69% |
| Naive median of exhausted events | 40.2 min | **−22.6** | 62% |
| Gradient boosting (AI, site features) | 38.1 min | −9.1 | 59% |
| Own-site history (reference) | 30.3 min | +1.2 | 70% |

**Correlation (management request).** Spearman ρ of BBT vs PLN frequency is 0.19, vs total duration 0.30, vs average duration 0.39, and vs longest outage 0.55. Both BBT and PLN duration come from **the same event feed**: a longer outage is what lets a longer battery run be observed. Part of the correlation is therefore mechanical (censoring), not causal. For that reason PLN history feeds **exposure / priority**, and BBT itself comes from Kaplan-Meier. Battery age, banks, load, VIP and tickets all have |ρ| < 0.07.

## 3. Battery status and evidence precedence

Battery vs design (design 120 min, all editable). This is a **separate scale from priority**.

| Status | Rule |
|---|---|
| ✖ Dead | ≤ 5 min, or a "Tidak Ada Baterai" ticket with no measured BBT |
| ▲ Critical | < 25% of design |
| ◆ Degraded | 25–50% |
| ◐ Below design | 50–100% |
| ✔ Meets design | ≥ 100% |
| ? Unknown | no evidence |

**Precedence** (highest wins):

1. Measured BBT (ACTUAL / DERIVED)
2. Validated inspection (not in the data yet)
3. Ticket evidence ("Tidak Ada Baterai")
4. Derived inference
5. Estimate (Kaplan-Meier)

When sources disagree, the conflict is shown. For example, AGR132 has a measured 27 min plus a no-battery ticket. The site stays Critical on the ACTUAL value and is flagged "verify ticket".

## 4. Availability, gap and cause

- Availability, target and gap (pp) are always shown together.
- Source: RAN feed, wall-clock (DERIVED). The gap is in percentage points; negative means below target.
- **Cause decomposition.** Downtime is split into power, transport, network/RAN, other, and **unknown** (whatever the feed does not attribute). The gap is attributed in proportion to each cause's downtime. This is coincidence, not causality.
- When the buckets overlap (the same minute counted twice), they are scaled down to the observed downtime. In that case Unknown = 0, and this is stated in the UI.

## 5. Power responsibility

Power responsibility comes from the site's own power and MBP tickets (RC Owner / RC 1 / RC 2):

| Party | Ticket evidence |
|---|---|
| PLN / utility | PLN OFF, EAS, trafo |
| Internal power system | MCB / KWH / cable, rectifier |
| Battery | Tidak Ada Baterai |
| Generator | genset |
| Vendor | TI/TP, Sewa Daya |
| Operational | token, activity |

Each site's downtime hours are allocated in proportion to its tickets → **OBSERVED**.

- Mains-fail alarms but no root cause → **INFERRED (PLN-triggered, not confirmed)**.
- Nothing recorded → **UNKNOWN**.

A weak battery or a long PLN outage is never used on its own to assign blame.

## 6. MBP

**Coverage radius is a hard constraint** (120 km, adjustable on the map and in Config). A site with no located MBP within the radius is *not covered* and is never assigned.

**Assignment** uses the same rule as the simulation:

1. MBPs within the radius.
2. **Hard constraint:** keep only MBPs that arrive before the battery runs out.
3. Among those, prefer the historical MBP, then the same NOP, then the nearest.
4. If none can arrive in time, fall back to the earliest arrival and flag "no MBP can arrive before BBT".

For example, NTB020 now gets MBP-OKI-ALI GUNTUR (89 min vs 108 min BBT), not its historical MBP (134 min).

**Travel time (ESTIMATED).**

- Formula: 15 min mobilisation + km × 1.35 / speed (urban 25 km/h; rural 35 km/h under 15 road-km, 45 km/h beyond).
- Multipliers: peak ×1.4 urban / ×1.15 rural; night ×1.2.
- Access multiplier: riverine/delta ×1.5, remote ×2.0.
- **Island = no road ETA.**
- Access class comes from Dapot "Kepulauan" and regency names. It is never inferred from a missing ETA.

**MBP priority** weights:

| Factor | Weight |
|---|---|
| Class | 25 |
| Outage frequency | 20 |
| Dependency (PROXY) | 15 |
| Distance | 10 |
| ETA − BBT gap | 20 |
| Availability gap | 10 |

Cut-offs: P1 ≥ 0.55, P2 ≥ 0.42, P3 ≥ 0.30.

**Simulation.** Runs in priority order, in two passes:

- **Pass 1** assigns only MBPs that arrive in time (saves sites).
- **Pass 2** gives the remaining free MBPs to the sites nobody can save (least dark time).

This stops a hopeless site from taking the one MBP that could save another. Outcomes:

- saved
- late
- unserved – busy
- unserved – no coverage
- unserved – island
- not needed

Scenarios:

- **A** — current setup
- **B** — move one base camp
- **C** — +N MBPs at weighted k-means centres of the sites that need one, snapped to a real site
- **D** — a different outage duration

**Base camp signal.** A base camp is **Under-served** when at least 2 of these 4 hold:

- P1/P2 sites ≥ 15
- ≥ 30% of its sites go dark before the MBP arrives
- average ETA ≥ 60 min
- workload ≥ p80

The criteria met are listed for every base camp. "Possibly over-served" needs low workload, ≤ 2 P1/P2 sites and average ETA < 30 min.

**PIC → base camp matching.** Matching levels:

| Level | Rule |
|---|---|
| EXACT | identical name |
| HIGH | identical after removing prefixes (MBP/BPSnnn/SCD/TS), area codes and spelling variants |
| MEDIUM | fuzzy ≥ 0.92, same NOP, unique |
| NEEDS REVIEW | ambiguous — not used |
| UNMATCHED | no candidate |

Similar base-camp names are flagged as possible duplicates and **never merged automatically**.

## 7. Action list

**Listed:** sites that are Dead, Critical or Degraded, plus hubs that go dark before the MBP arrives.

**Priority** weights:

| Factor | Weight |
|---|---|
| BBT gap | 35 |
| PLN history | 25 |
| Class | 15 |
| Dependency | 15 |
| Availability gap | 10 |

Cut-offs: P1 ≥ 0.63, P2 ≥ 0.54, P3 ≥ 0.45. **Severity floor:** a measured Dead/Critical site is never below P2.

Batches:

| Priority | Batch |
|---|---|
| P1 | Batch 1, ≤ 2 weeks |
| P2 | Batch 2, this month |
| P3 | Batch 3, next PM cycle |
| P4 | Batch 4, next quarter |

**Rules** (first match wins; each one shows Metric → Value → Threshold → Rule → Action):

| Rule | Condition | Action |
|---|---|---|
| R1 | No measured BBT + no-battery ticket | Replenishment |
| R2 | Problem status from an ESTIMATE | **Inspect & verify** (an estimate never triggers replace/upgrade) |
| R3 / R3b | Measured Dead | Replacement (higher capacity if load ≥ 45 A) |
| R4 | Critical + age ≥ limit | Replacement |
| R5 | Critical/Degraded + load ≥ 45 A | Upgrade |
| R6 / R6b | Critical | Capacity test → replace/upgrade (age known) / Replacement (age unknown) |
| R7 | Degraded + PLN frequency in top quartile | Upgrade |
| R8 | Degraded at P1/P2 | Capacity test (no "Monitor" at high priority) |
| R9 | Degraded at P3/P4 | Monitor |
| R10 | Hub that goes dark before the MBP arrives | MBP standby + battery upgrade |

## 8. Impact and trend

**Worst clusters.** Severity (weighted percentile ranks):

| Component | Weight |
|---|---|
| Share of sites dark (power downtime ≥ 1 h) | 30 |
| Power downtime per site | 25 |
| Availability gap | 30 |
| P1/P2 dark share | 15 |

Clusters with fewer than 5 sites are excluded.

**Clusters getting worse.** Compares Q1 (Jan–Mar) with Q2 (Apr–Jun):

- **Deteriorating** — availability Δ ≤ −0.20 pp, or ≥ 2 more dark sites
- **Improving** — the mirror of that
- **Stable** — neither
- **Insufficient data** — fewer than 5 sites with data in both quarters

**Top 15 worst sites.** Weighted ranks:

| Component | Weight |
|---|---|
| Availability gap | 30 |
| Power downtime | 25 |
| Battery risk | 20 |
| MBP priority | 10 |
| PLN recurrence | 10 |
| Class | 5 |

Each site shows its components and its primary/secondary driver.

## 9. One rule engine

- Python (`engine/`) prepares **evidence only**. `engine/validate.py` checks data and sanity (25 checks).
- All statuses, priorities, actions, coverage, simulation and analytics live in **`lib/logic.js`**, and every tab uses the same model.
- `npm test` runs regression scenarios A–K on the real snapshot.
