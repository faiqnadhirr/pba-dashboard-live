# 04 · Methodology & rules

All decisions below are implemented once, in `lib/logic.js` (the rule engine), and used by every tab, export, simulation and test. Thresholds in *italics* are configurable (see [05](05-configuration.md)); the defaults are shown.

## 1. Principles

- **Site grain.** Every source is reduced to one row per site before joining. Aggregates (cluster, NOP, AREA) are sums or counts of sites.
- **Evidence precedence.** Measured beats inspection beats ticket beats derived beats estimated. An estimate can raise priority or request a test, but never triggers replacement or upgrade.
- **Missing ≠ zero.** Unknown values show "—". In percentile-rank scores they get a neutral rank (*`unknown_handling.neutral_rank` = 0.5*) and a flag.
- **Hard constraints.** The MBP radius and "arrives before the battery runs out" are applied before any preference.
- **Explainability.** Every recommendation stores Metric → Value → Threshold → Rule and a plain "Why".

## 2. BBT — battery backup time

Each mains-fail event is a test of the battery:
- **Exhausted** (LOW BATT / NE DOWN before PLN returned): the event shows the real backup time.
- **Censored** (PLN returned first — about 68 % of events): the battery lasted *at least* that long.

Treating censored events as the backup time would underestimate batteries. PBA therefore uses **Kaplan-Meier survival analysis**, which handles censoring.

How the BBT value of a site is chosen:

| Order | Source | Evidence | Rule |
|---|---|---|---|
| 1 | Kaplan-Meier median of the site's **own events** | ACTUAL | Used when the median is actually reached (≥ *`bbt.min_exhaustion_events`* = 1 exhausted event) |
| 2 | Battery outlived most outages (median not reached) | → estimate | Only a **lower bound** is known (651 sites); the estimate is floored at the longest outage survived |
| 3 | Monthly BBT summary (median of months) | DERIVED | Used only if it does not contradict the events; 1,156 values rejected because they were shorter than an outage the battery survived |
| 4 | Comparable-site Kaplan-Meier | ESTIMATED | Most specific group with ≥ 200 events: class × battery type × NOP, then coarser fallbacks; *conditional* on what the site already survived; range ± MAE; confidence Medium-Low (has a lower bound) or Low |
| 5 | Nothing | UNAVAILABLE | No events, no summary, no battery attributes → action "Collect data" |

**Supported DERIVED (A4).** A DERIVED Dead/Critical value is trusted only with site evidence: ≥ *2* exhausted events, **or** power downtime ≥ *1 h* **and** ≥ *50 %* of the PLN outage hours. Otherwise it becomes **DERIVED-UNVERIFIED**: no priority floor, BBT severity 0.5, action "Inspect & verify" (rule R2b).

**Estimator test on unseen sites** (learn from Jan–Apr events of 70 % of sites, predict the May–Jun KM median of the other 30 %):

| Method | MAE | Bias | Status accuracy |
|---|---|---|---|
| **KM comparable-site (used)** | 36.9 min | −3.9 min | 69 % |
| Naive median of exhausted events | 40.2 min | −22.6 min | 62 % |
| Gradient boosting on site features | 38.1 min | −9.3 min | 59 % |
| Own-site history Jan–Apr (reference) | 30.3 min | +1.2 min | 70 % |

The naive method is strongly biased low (it ignores censoring); the KM estimator is nearly unbiased.

**BBT design.** Problem criteria use the management design of *120 min* (`bbt.criteria_basis = standard`). A per-site **computed design** is also calculated — banks × Ah per bank × usable DoD ÷ NE load (A) × 60, clipped to *30–480 min* — but **Ah per bank is assumed** (100 Ah; the source has no Ah field), so it is shown separately as "computed design (unvalidated)". Its evidence: DERIVED (banks and load known), ESTIMATED (load missing → median load of that battery type), PROXY (no banks → class default). Data quality shows a calibration check (measured BBT ≈ 25 % of the computed design → the Ah assumption needs confirming).

## 3. Battery status and evidence precedence

Status is a **separate scale from priority**:

| Status | Rule (design D = 120 min) |
|---|---|
| ✖ Dead | BBT ≤ *5 min* (a "Tidak Ada Baterai" ticket counts only when `ticket_sets_status: true`; v3.6 default: flag only, see §16) |
| ▲ Critical | BBT < *25 %* of D |
| ◆ Degraded | BBT < *50 %* of D |
| ◐ Below design | BBT < D |
| ✔ Meets design | BBT ≥ D |
| ? Unknown | no evidence |

**Precedence** (highest wins): 1 measured BBT (ACTUAL/DERIVED) · 2 validated inspection (not yet in the data) · 3 ticket evidence ("Tidak Ada Baterai") · 4 derived inference · 5 estimate. Disagreements are shown as conflicts (e.g. AGR132: measured 27 min and a no-battery ticket → stays Critical on the measurement, flagged "verify ticket"). One function (`batteryAssessment`) decides status, evidence and the displayed BBT, so a row never shows a status that contradicts its BBT cell.

## 4. Availability, gap and causes

- Source: RAN daily feed converted to **wall-clock** (NE-seconds ÷ number of NEs, capped at 24 h per site-day).
- **Availability** = 1 − outage hours ÷ (24 h × days with data). **Target** = the site's RAN target. **Gap (pp)** = availability − target (negative = below target). The three are always shown together.
- **Cause decomposition:** outage = power + transport + RAN + other + **unknown** (outage hours with no cause). If the cause buckets overlap (sum > outage), they are scaled down proportionally and unknown = 0 (stated in the UI).
- The gap is attributed to causes **in proportion to their hours** — coincidence, not causation.
- **Main cause** of a site (Health map) = the cause with the most hours (unknown if the unattributed hours are larger).

## 5. Power responsibility

From the site's own power/MBP tickets (RC owner, RC 1, RC 2):

| Party | Ticket evidence |
|---|---|
| PLN / utility | PLN OFF, EAS, transformer |
| Internal power system | MCB / KWH / cable, rectifier |
| Battery | Tidak Ada Baterai |
| Generator | genset |
| Vendor | TI/TP, Sewa Daya |
| Operational | token, activity |

- **OBSERVED** — tickets with root cause: the site's power downtime is split in proportion to its tickets per party; majority = primary party.
- **INFERRED (PLN-triggered, not confirmed)** — mains-fail alarms and power downtime but no ticket root cause.
- **UNKNOWN** — power downtime with no ticket and no alarm.
- A weak battery or a long PLN outage is **never** used on its own to assign blame.

## 6. MBP coverage, travel time and assignment

**Coverage radius (hard constraint).** A site is *covered* when at least one located base camp is within *`mbp.max_radius_km`* = **120 km** (straight line). Uncovered sites are never assigned. The radius is adjustable (map slider or Config).

**Travel time (ESTIMATED).**
- Road km = straight km × *1.35*. ETA = *15 min* mobilisation + road km ÷ speed.
- Speed: urban *25 km/h*; rural *35 km/h* below 15 road-km, *45 km/h* beyond.
- Multipliers: departure in peak hours (*7, 8, 16–18*) × *1.4* urban / × *1.15* rural; night (*22–04*) × *1.2*; access class riverine/delta × *1.5*, remote × *2.0*.
- **Island sites have no road ETA** (sea logistics, not modelled); tables show an indicative road-equivalent (× 3) marked "sea access". Access class comes only from Dapot/regency, never from a missing ETA.
- ETA confidence: ESTIMATED · access class unknown · low confidence (difficult access) · UNAVAILABLE (island).

**Assignment (same logic as the simulation).**
1. Candidates = base camps within the radius with a road ETA.
2. **Hard constraint:** keep those that arrive before the effective BBT (Dead = 0 min).
3. Among those: the site's historical primary MBP, else the fastest MBP of the same NOP, else the fastest within the radius (other NOP).
4. If none can arrive in time: fallback to the earliest arrival, flagged "NO MBP can arrive before BBT".

**Dark before the MBP arrives (`reach_risk`)** = the MBP cannot arrive before BBT **and** the site really goes dark on power (dark site, §11) or its battery ran out at least once.

**Coverage breakdown** (Coverage & map): every site falls in exactly one of — MBP arrives before BBT · late & site goes dark · late, no dark evidence · BBT unknown · beyond radius.

**Coverage gap label.** If the BBS action is "No action" but BBT is known and the MBP cannot arrive in time (or no MBP is within the radius), the action shows **"Battery OK — MBP coverage gap"** with a link to Placement; exported as `coverage_gap = true`.

## 7. MBP priority (response priority)

Score 0–1 = weighted sum of factors (weights re-normalised to 100 %):

| Factor | Weight | Definition |
|---|---|---|
| Site class | 25 | Diamond 1.0 · Platinum 0.8 · Gold 0.6 · Silver 0.4 · Bronze 0.2 · Unknown 0.3 |
| PLN outage frequency | 20 | percentile rank among sites with PLN data (neutral 0.5 if unknown) |
| ETA − BBT gap | 20 | max(0, ETA − BBT) ÷ design, capped at 1; 1 when not covered |
| Dependency (PROXY) | 15 | children ÷ 15, capped at 1 |
| Distance to MBP | 10 | km ÷ radius; 1 when not covered |
| Availability gap | 10 | gap ÷ *3 pp*, capped at 1 |
| VIP, outage duration, MBP history | 0 | available, weight 0 by default |

Levels: **P1 ≥ 0.55 · P2 ≥ 0.42 · P3 ≥ 0.30 · else P4**. The top three drivers are listed per site ("Pemicu prioritas MBP").

## 8. BBS priority and action list

**Listed** (need a BBS action): status Dead/Critical/Degraded, **or** a hub (dependency > 0) that goes dark before the MBP arrives.

**Score:**

| Factor | Weight | Definition |
|---|---|---|
| BBT severity | 35 | 1 − BBT ÷ design (Dead = 1; unverified/unknown = 0.5) |
| PLN exposure | 25 | 0.5 × frequency rank + 0.35 × duration rank + 0.15 × 2025-outage rank |
| Class | 15 | as above |
| Dependency | 15 | as above |
| Availability gap | 10 | as above |

Levels: **P1 ≥ 0.63 · P2 ≥ 0.54 · P3 ≥ 0.45 · else P4**. **Severity floor:** a *measured* Dead/Critical battery is never below **P2**. Batches: P1 = Batch 1 (≤ 2 weeks) · P2 = Batch 2 (this month) · P3 = Batch 3 (next PM cycle) · P4 = Batch 4 (next quarter).

**Action rules** — first match wins:

| Rule | Condition | Action |
|---|---|---|
| R1 | Dead from a "Tidak Ada Baterai" ticket, no measured BBT | Replenishment — install battery |
| R2 | Problem status based on an ESTIMATE | Inspect & verify (capacity test) — never replace on an estimate |
| R2b | DERIVED Dead/Critical without supporting site evidence | Inspect & verify |
| R3 / R3b | Measured Dead (R3b: NE load ≥ *45 A*) | Battery replacement (R3b: higher capacity) |
| R4 | Measured Critical and age ≥ replacement age (*VRLA 4 y, Lithium 8 y, other 5 y*) | Battery replacement |
| R5 | Critical/Degraded and NE load ≥ *45 A* | Battery upgrade (add capacity) |
| R6 / R6b | Measured Critical, younger than replacement age / age unknown | Capacity test → replace/upgrade / Battery replacement |
| R7 | Degraded and PLN outage frequency in the top quartile of listed sites | Battery upgrade |
| R8 | Degraded at P1/P2 | Capacity test → replace/upgrade (no "Monitor" at high priority) |
| R9 | Degraded at P3/P4, PLN exposure not high | Monitor — re-test at next PM |
| R10 | Hub with ETA > BBT | MBP standby + battery upgrade |
| R0 / R-data | Nothing applies / no BBT evidence | No action / Collect data |

**MBP standby flag:** Dead/Critical with high PLN exposure, or R10.

## 9. Simulation (MBP › Simulation)

1. Affected sites are sorted by MBP priority. A site needs an MBP when the outage is longer than its effective BBT.
2. **Pass 1 (feasible only):** each site in priority order gets the best *free* MBP that can arrive before its BBT. Among feasible MBPs the cost is 0.7 × ETA (normalised) − 0.2 × familiarity (times it served the site) + 0.1 × workload.
3. **Pass 2 (fallback):** remaining free MBPs go to sites nobody can save, earliest arrival first. This stops a hopeless site from taking the only MBP that could save another site.
4. **Outcomes:** saved · late (dark until the MBP arrives, capped by the outage) · unserved – busy · unserved – no coverage · unserved – island · no MBP needed.
5. **Expected downtime** = Σ dark minutes; **priority-weighted coverage** = share of affected-site priority that is saved or needs no MBP.
6. Scenarios: A current · B move one base camp · C +N pre-positioned MBPs (weighted k-means of the sites that need one, snapped to a real site) · D different outage duration.

## 10. Placement & fleet size (ESTIMATED)

Per NOP, targets = MBP-P1/P2 sites (active, not off-air) that are road-reachable and whose BBT is longer than the mobilisation time; islands and too-short batteries are reported separately.
- Reach = straight km ≤ radius **and** ETA ≤ effective BBT.
- Greedy: add one MBP at a time at the location (snapped to a real MBP-P1/P2 site) that reaches the most not-yet-reached targets, until *90 %* of targets are reached or *+15* MBPs.
- Relocation candidates: existing base camps whose removal, tested **cumulatively**, loses < *0.5 pp* of reach (max *3*).

**Base-camp signal:** *Under-served* when ≥ *2* of: P1/P2 sites ≥ *15* · ≥ *30 %* of its sites dark before the MBP · average ETA ≥ *60 min* · workload ≥ *p80*. *Possibly over-served:* low workload, ≤ *2* P1/P2 sites and average ETA < 30 min.

## 11. Dark site, impact and trend

- **Dark month** = power-caused downtime ≥ *8 h* (RAN, wall-clock) in the month. **Dark site** = ≥ *2* dark months of 6. **Dark in a quarter** = ≥ *2* of 3 months.
- **Worst clusters** (Impact): severity = weighted percentile ranks of share of dark sites (*30*), power downtime per site (*25*), availability gap (*30*), MBP-P1/P2 dark share (*15*); clusters with < *5* sites excluded.
- **Top 15 worst sites:** availability gap *30* · power downtime *25* · battery risk *20* · MBP priority *10* · PLN recurrence *10* · class *5*; primary/secondary driver named.
- **Trend Q1 → Q2** (per cluster): primary signal = availability change, ≥ +*0.5 pp* Improving, ≤ −*0.5 pp* Deteriorating; secondary = change of the dark-site share, ±*2 pp*. When the signals disagree, or availability is stable but the dark share moves → **Mixed** with the reason. < *5* sites with data in both quarters → Insufficient data. **vs network** compares each cluster's change with the whole scope's change (−0.76 pp in H1-2026, a May event).

## 12. Correlation (management request)

Spearman ρ (and Pearson r) of measured BBT with each factor, over sites with measured BBT and a value for the factor (portfolio). Current: PLN frequency 0.19 · total duration 0.30 · average duration 0.39 · longest outage 0.55; battery age, banks, load, VIP, tickets |ρ| < 0.07. **Caveat:** BBT and PLN duration come from the same event feed — a longer outage is what lets a longer battery run be observed — so part of the correlation is mechanical (censoring). PLN history is therefore used for **exposure/priority**, not to estimate BBT.

## 13. Off-air / data-issue flag

A site is flagged when any holds: downtime ≥ *30 %* of the period · any month with downtime ≥ *90 %* of its hours · downtime ≥ *10 %* with no battery alarms and no tickets. Flagged sites are excluded from every KPI unless "+ off-air" is ticked, and are listed with reasons in Data quality.

## 14. Period filter semantics (v3.4)

Observed, time-stamped quantities are re-summed over the selected days from `period/YYYYMM.json`: RAN wall-clock seconds per cause (same per-day cap as the monthly figures), PLN intervals by start day, mains-fail events by day, tickets by occurrence day. Availability = 1 − outage ÷ (24 h × RAN days present in the period); target = the site's H1 target; responsibility uses the period's tickets and events. Sites whose PLN data is the monthly summary are prorated within a month (flagged). **BBT, status, priorities, actions, dark profile, off-air and coverage are not recomputed per period.** Tested: H1 re-summed from the daily files equals the snapshot; Q1 + Q2 = H1; the days of a month add up to the month.

## 15. Drilldowns and roll-up (v3.3 / v3.5)

- **Drilldown:** each KPI is a partition of the sites in scope into ≤ 5 evidence segments; "View N sites" applies exactly the same predicate in the Site list.
- **Map modes:** each site gets one category key per mode (e.g. Health: ≥ 1 pp below / < 1 pp below / meets / no data); problem categories are defined per mode.
- **Roll-up:** a cluster or NOP is the multiset of its sites: counts per category, number and share of problem sites, sum of the magnitude (hours). The justification panel lists the clusters of a NOP and the problem sites with the largest magnitude, each with its own reason. Tested for every mode: NOP = Σ clusters = Σ sites.

## 16. Ops feedback (v3.8)

Changes agreed with operations (Ayatullah, Pak Nizar), all computed per site and rolled up.

**Fixed genset.** `fixed_genset` = ACTIVE when Dapot has *Genset Active* with a BACKUP/MAIN POWER type, or New_BBT has *Genset Fix Telkomsel* 1/2, state GENSET ACTIVE, backup power = GENSET or main power containing GENSET; OFF when the text says power off / shutdown / dismantle / broken. ACTIVE sites (1,378; 1,134 from Dapot, 244 only from New_BBT) are `genset_protected`: no reach risk, never "MBP needed" in the simulation, not a placement target, no coverage-gap label, and **excluded from the default scope** (filter *+ fixed genset*). Source will switch to the SWFM fixed-genset export when available (`thresholds.yaml › fixed_genset`).

**Battery status without RC tickets.** `bbt.ticket_sets_status: false`: a "Tidak Ada Baterai" ticket no longer makes a battery *Dead*; it is shown as a flag ("field check needed") with the BBT estimate kept. Responsibility (Accountability) still uses ticket root causes. Setting the key to `true` restores the old rule (R1 "install battery").

**BBT gap — design vs actual.** Design = banks × Ah per bank × usable DoD ÷ NE load × 60 (Ah per bank **assumed** 100 until capacity data exists). `bbt_gap_ratio` = measured BBT ÷ design, only for measured batteries with a non-PROXY design; `bbt_gap_min` = design − measured. BBS map mode *BBT gap* (< 25 % · 25–50 % · 50–80 % · ≥ 80 % · no actual · no design), KPI median ratio and a column in the action list.

**Response-time target.** `mbp.response_target_min` (30) — ETA of the fastest MBP within the radius (`eta_fastest_min`, includes 15 min mobilisation). AREA1 today: ≈ 30 % of active road sites ≤ 30 min, ≈ 79 % ≤ 60, ≈ 97 % ≤ 120. Placement accepts a deadline instead of BBT: reach = straight km ≤ radius **and** ETA ≤ deadline; dark hours avoided are still measured against BBT.

**Kecamatan anchors.** For every kecamatan (Dapot *Subdistrict*): the active, located, non-island site nearest to the centroid of its sites. Placement candidates = target sites (≤ 400) + one anchor per kecamatan; reach sets are precomputed and a greedy set cover adds the anchor that reaches the most not-yet-reached targets.

**Dimensioning.** Concurrent PLN-off jobs per NOP: job interval = takeover (or occurred) → RH stop (0–48 h; else + RH hours; else + median), sampled per hour → p90 / p95 / p99 / max. Ideal fleet = max(current + additional for the reach target, ⌈p95⌉). Concurrency is small (p95 ≈ 2–4 in most NOPs), so the **30-minute reach** drives the fleet size.

**Centre of gravity → kecamatan.** Site weight = 0.35 · PLN-off duration rank + 0.25 · (1 − BBT/design) + 0.15 · class score + 0.25 · repeated PLN-off ticket rank (floor 0.02). Per base camp (sites keep their camp): weighted centroid → the 6 nearest kecamatan anchors inside the regencies holding ≥ 20 % of the camp's weight (+ its own) → best = most weight within the target, then lowest weighted ETA. Verdict *Stay* unless ≥ 2 % of weight is gained or weighted ETA improves ≥ 5 min; *Fine-tune* when the kecamatan is the same. AREA1: sites ≤ 30 min 5,043 → ≈ 6,250 if all recommendations are applied.

**Productivity.** Per base camp from MBP tickets (not cancelled): tickets, PLN-off, check-ins, distinct sites, RH total/mean/median, median takeover → check-in. Area visit rate = PLN-off tickets with a check-in ÷ PLN-off tickets of the sites assigned to the camp.

## 17. MBP performance, backtest, dispatch and BBS action types (v3.8)

**Jobs.** `tickets.json` = every MBP ticket taken over by a base camp (not cancelled) with occurrence, take-over delay, check-in delay, job hours (take-over → RH stop, 0–48 h, else RH hours), resolution (genset / PLN back / no check-in / other) and RC (PLN off / no battery / power rental / other). 46,996 jobs in H1, 39,139 of them PLN off.

**Utilisation and performance (proposal, `mbp_perf`).** Occupancy = Σ job hours ÷ 4,344 h (one MBP backs up one site at a time). On time (PLN-off jobs only) = check-in − occurrence ≤ the site's effective BBT; jobs at sites with unknown BBT are not judged. Classes: *under-utilised* (grey) when < 2 jobs/month or occupancy < 3 %; *high load* (purple) when occupancy ≥ 25 % and on time is not red; otherwise on time ≥ 60 % green, < 35 % red, amber in between (AREA1 median ≈ 44 %); fewer than 10 judged jobs = *too few jobs*. Score = percentile rank of occupancy (40 %), on time (40 %) and genset-connected share (20 %). Capture = share of the jobs of the camp's own area done by the camp.

**Relocation backtest (ESTIMATED).** Replay of the NOP's H1 jobs in time order: dispatch = occurrence + the ticket's own take-over delay (capped at 240 min); the job goes to the fastest free base camp within the radius (travel model with the hour's traffic multiplier); the camp is busy for travel + job hours; on time = delay + travel ≤ BBT. Baseline = same replay with today's locations. Candidates = kecamatan anchors (same cluster by default — ops: units move between clusters with the same FMC only), short-listed by how many late / unserved jobs they could have reached in time, each fully replayed; ranked by Δ jobs on time NOP-wide, then Δ unserved.

**Dispatch priority (static, `dispatch`).** Score = 0.40 class + 0.30 dependency (child sites ÷ 15; ACTUAL from `engine/data/site_dependency.csv` when NOP officers fill the template, else HUB-bucket PROXY) + 0.30 MBP priority. Order: sites the camp can still reach before BBT first, then BBT unknown, then already-late, then beyond radius; within a group by score. Audit: each H1 moment a camp took a job while other jobs for it were waiting (occurred before the take-over, taken later, ≤ 24 h) — followed when the taken site's score ≥ the best waiting score − 0.02.

**BBS action types and setting check.** `actionType()` maps each recommended action to REPLACE / UPGRADE / SETTING / TEST / DATA / MONITOR / NONE (map mode *Action type*, tiles, list filter). New rules before R6: **R6c** measured Critical on a battery younger than 40 % of its replacement age (`battery_young_share`) and **R6d** measured Critical lithium with unknown age → *Check rectifier / LVD / BMS setting → re-test* (field finding: short BBT from LVD / BMS setting or load, not wear). AREA1: replacements 1,131 → 680, setting checks 566.

### 17b. Ideal utilisation (v3.7.1 — replaces the occupancy/on-time colour)
- **Need** per base camp = Σ over its assigned active sites of PLN outages (PLN records, H1) longer than the site's effective BBT — the site would go dark without an MBP. Counted from a per-site duration histogram (buckets 0/15/30/45/60/90/120/180/240/360/480/720+ min; the bucket containing the BBT is split linearly). AREA1: ≈ 34,200 outages needed an MBP.
- **Serapan kebutuhan** = PLN-off MBP jobs at those sites (any base camp) ÷ need. AREA1 ≈ 98 %; per base camp indicative (PLN events exist for ≈ 13.8k sites and only part of the tickets match an event).
- **Map colour (ideal utilisation):** grey = idle (< 2 jobs/month or occupancy < 3 %) with little area need → relocate; red = area needs MBP but serapan < 50 % (also when idle); purple = occupancy ≥ 25 % → add a unit; blue = serapan ≥ 150 % (preventive dispatch or incomplete PLN records → check efficiency); amber 50–80 %; green ≥ 80 % = balanced; white = area need < 3 per month. On time is the second colour option.
- **Score** = percentile rank of serapan (35 %), on time (35 %) and occupancy (30 %).
- **RC "Baterai / Tidak Ada Baterai" jobs:** counted as workload, never judged on time nor used for battery status; base camps with ≥ 30 % such jobs carry a ⚑ flag (provisional, to verify with ops).
- **Radius** stays adjustable (MBP overview presets 20/30/40/60/120 km, map slider, Config); default 120 km.
