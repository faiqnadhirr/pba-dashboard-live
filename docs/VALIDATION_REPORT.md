# Validation report

Built 2026-10-02 15:06 WIB · Result: **ALL CHECKS PASSED** (25/25)

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
| RAN cause buckets (wall-clock) non-negative | ✅ |  |
| Q1 + Q2 hours ≈ total RAN hours | ✅ |  |

## Analytics

| Check | Result | Detail |
|---|---|---|
| event totals preserved | ✅ | 227,155 |
| MBP deployments preserved | ✅ | 46,996 |
| MBP backup hours preserved | ✅ | 146,637 h |
| KM estimator less biased than naive median (censoring) | ✅ | {'KM comparable-site (censoring-aware)': {'mae_min': 36.9, 'bias_min': -3.9, 'status_accuracy': 0.692}, 'Naive median of exhausted events': {'mae_min': 40.2, 'bias_min': -22.6, 'status_accuracy': 0.623}, 'Own-site history Jan–Apr (KM)': {'mae_min': 30.3, 'bias_min': 1.2, 'status_accuracy': 0.699}, 'Gradient boosting (AI, site features)': {'mae_min': 38.1, 'bias_min': -9.3, 'status_accuracy': 0.587}} |

## Decision

| Check | Result | Detail |
|---|---|---|
| access class from Dapot/regency only (every site has a basis) | ✅ | {'mainland': 18311, 'unknown': 1229, 'riverine_delta': 330, 'island': 286, 'remote': 71} |
| PIC matching: uncertain matches not merged | ✅ | {'MATCHED': 337, 'UNMATCHED': 22, 'NEEDS REVIEW': 2} |
| estimated BBT never labelled ACTUAL/DERIVED | ✅ |  |
| measured BBT never labelled ESTIMATED | ✅ |  |
| estimates carry confidence + method | ✅ | 8,058 |
| estimate ≥ the site's survived-outage lower bound | ✅ |  |
| no road ETA basis for island sites (access class = island only from Dapot) | ✅ | 286 island sites |
