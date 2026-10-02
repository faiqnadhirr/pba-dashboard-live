# Validation report

Built 2026-10-01 22:47 · Result: **ALL CHECKS PASSED** (29/29)

## Data

| Check | Result | Detail |
|---|---|---|
| one row per AREA1 site (no row multiplication) | ✅ | 20,227 sites |
| no null site IDs | ✅ |  |
| event dates within Jan–Jun 2026 | ✅ | 2026-01-01 00:00:59 → 2026-06-30 23:50:50 |
| RAN covers 6 months, site-month unique | ✅ |  |
| unmatched IDs reported | ✅ | {'unmatched_tickets': 0, 'unmatched_bbt_events': 0, 'unmatched_bbt_monthly': 0, 'unmatched_ran': 2, 'unmatched_new_bbt': 8} |
| MBP coordinates inside Sumatera bbox | ✅ | {'ACTUAL': 292, 'MISSING': 29, 'REPAIRED': 6} |

## Sanity

| Check | Result | Detail |
|---|---|---|
| RAN power-down wall-clock ≤ hours in month (every site-month) | ✅ | max 1.00 of month |
| RAN transport-down wall-clock ≤ hours in month | ✅ |  |
| availability between 0 and 100% | ✅ |  |
| PLN outage intervals do not overlap after merge | ✅ | 3,298 overlapping events merged into neighbours |
| PLN outage hours ≤ period hours (4,344 h) for every site | ✅ | max 1088 h |
| BBT values within 0–720 min | ✅ |  |

## Analytics

| Check | Result | Detail |
|---|---|---|
| event totals preserved | ✅ | 227,155 |
| MBP deployments preserved | ✅ | 46,996 |
| MBP backup hours preserved | ✅ | 146,637 h |
| mbp_priority_score not degenerate | ✅ | n=20,227 p10=0.13 p50=0.27 p90=0.44 |
| bbs_priority_score not degenerate | ✅ | n=4,520 p10=0.31 p50=0.48 p90=0.60 |
| KM estimator less biased than naive median (censoring) | ✅ | {'KM comparable-site (censoring-aware)': {'mae_min': 36.9, 'bias_min': -3.9, 'status_accuracy': 0.692}, 'Naive median of exhausted events': {'mae_min': 40.2, 'bias_min': -22.6, 'status_accuracy': 0.623}, 'Own-site history Jan–Apr (KM)': {'mae_min': 30.3, 'bias_min': 1.2, 'status_accuracy': 0.699}, 'Gradient boosting (AI, site features)': {'mae_min': 38.1, 'bias_min': -9.1, 'status_accuracy': 0.589}} |

## Decision

| Check | Result | Detail |
|---|---|---|
| every mbp_priority_level=P1 has drivers | ✅ | 706 |
| every bbs_priority_level=P1 has drivers | ✅ | 256 |
| every site needing action has action + reason + batch | ✅ | 4,520 sites |
| combined rule: no hub with ETA > BBT left at 'No action' | ✅ | 591 hubs |
| estimated BBT never labelled ACTUAL/DERIVED | ✅ |  |
| measured BBT never labelled ESTIMATED | ✅ |  |
| estimates carry confidence + method | ✅ | 8,058 |
| estimate ≥ the site's survived-outage lower bound | ✅ |  |
| estimated-only problem sites → Inspect & verify (or Replenishment / MBP standby) | ✅ | {'Inspect & verify (capacity test) — BBT is estimated': 814, 'MBP standby + battery upgrade (hub goes dark before MBP arrives)': 97, 'Replenishment (battery missing / no battery)': 3} |
| no road ETA for island sites | ✅ | 687 island sites |
| dependency evidence = PROXY/UNAVAILABLE only | ✅ |  |
