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

## 3. Battery status (BBS step 3, criteria)

Status vs design (all editable):
- **OK**: ≥ 50%
- **Degraded**: 25–50%
- **Critical**: < 25%
- **Dead**: ≤ 5 min, or a "Tidak Ada Baterai" ticket with BBT unknown or < 25%

## 4. MBP

- **Coverage.** Each site is assigned to the MBP that served it most in H1 (if that MBP is located in the same NOP). Otherwise it goes to the nearest MBP in the NOP. If the NOP has no located MBP, the nearest MBP in any NOP is used.
- **Travel time (ESTIMATED).**
  - Formula: 15 min mobilisation + (km × 1.35) / speed.
  - Speed: urban 25 km/h; rural trips under 15 road-km 35 km/h; longer rural trips 45 km/h.
  - Multipliers: peak 07–08 & 16–18 ×1.4 urban / ×1.15 rural; night ×1.2.
  - Island sites have no road ETA.
- **ETA − BBT gap.** A site has **reach risk** when ETA > BBT (or it has no road ETA) and it has PLN outages.
- **MBP priority** (weights re-normalised):

  | Factor | Weight | Type |
  |---|---|---|
  | Class | 25 | management |
  | Outage frequency | 20 | management |
  | Dependency | 15 | management |
  | Distance | 10 | management |
  | ETA − BBT gap | 20 | added |
  | Availability gap | 10 | added |

  Score cut-offs: P1 ≥ 0.55 · P2 ≥ 0.42 · P3 ≥ 0.30 · P4 below that.
- **Simulation.** Greedy allocation in priority order. Each site takes the best free MBP by candidate cost = 0.7·ETA − 0.2·familiarity + 0.1·workload. One MBP serves one site per run. Outcomes: saved / late / unserved (no MBP) / unserved (island) / not needed.
  - Scenario A: current setup
  - Scenario B: one base camp moved
  - Scenario C: +N MBPs pre-positioned (weighted k-means of the late or unserved sites)
  - Scenario D: a different outage duration
- **Base camp analysis.** For each MBP: load, P1/P2 sites and at-risk sites. Suggested extra base camp = priority-weighted centre of at-risk P1/P2 sites, snapped to a real anchor site.

## 5. BBS action list (BBS step 3, actions)

**Sites listed** are those with Battery Dead, Critical or Degraded, **plus hubs with reach risk** (the combined MBP–BBS rule).

**Priority** (weights re-normalised):

| Factor | Weight |
|---|---|
| BBT gap vs design | 35 |
| Historical PLN outage (0.5·freq rank + 0.35·duration rank + 0.15·2025 hours rank) | 25 |
| Class | 15 |
| Dependency | 15 |
| Availability gap | 10 |

Score cut-offs: P1 ≥ 0.63 · P2 ≥ 0.54 · P3 ≥ 0.45 · P4 below that. Each level maps to an execution batch:

| Priority | Batch |
|---|---|
| P1 | Batch 1, ≤ 2 weeks |
| P2 | Batch 2, this month |
| P3 | Batch 3, next PM cycle |
| P4 | Batch 4, next quarter |

**Action rules** (first match wins):

| # | Condition | Action |
|---|---|---|
| 1 | Dead + no-battery ticket | **Replenishment** |
| 2 | BBT estimated | **Inspect & verify** |
| 3 | Dead/Critical + battery age ≥ limit (VRLA 4 y, Lithium 8 y) | **Replacement** |
| 4 | Problem + NE load ≥ 45 A | **Upgrade** |
| 5 | Dead/Critical, age unknown | **Replacement** |
| 6 | Dead/Critical, age known but below limit | **Inspect → replace/upgrade** |
| 7 | Degraded + PLN frequency in top quartile | **Upgrade** |
| 8 | Degraded otherwise | **Monitor** |
| 9 | Hub with reach risk | **MBP standby + battery upgrade** |

`mbp_standby_flag` links the action list to the MBP module.

## 6. Browser = engine

`lib/logic.js` is a 1:1 port of the Python scoring, status, action and simulation logic. `npm test` checks that, on the default configuration, all 20,227 sites get identical levels, statuses, actions and reach-risk flags to the Python build.
