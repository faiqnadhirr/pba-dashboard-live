# 05 · Configuration reference

All thresholds and weights live in two YAML files. The pipeline copies them into `meta.json`, and the web app uses them as the default configuration.

- `engine/config/thresholds.yaml` — physical assumptions and decision thresholds
- `engine/config/scoring.yaml` — class scores and priority weights
- `engine/config/basecamp_merge.csv` — reviewed list of duplicate base camps to merge

## 1. How configuration is applied

| Mode | Where | Who sees it |
|---|---|---|
| **Default** | YAML files → `meta.json` at build time | Everyone |
| **What-if (DEMO)** | Config tab → **Edit (what-if)** → saved in the viewer's browser (localStorage), tied to the data build | Only that viewer; the header hash turns red with ✎ |
| **Agreed change** | Export JSON from the Config tab → review → edit the YAML → rebuild | Everyone after the rebuild |

The **config hash** in the header (6 characters) identifies the exact configuration; it does not depend on key order. Two screenshots with the same hash used the same rules.

Weights are **re-normalised** to 100 %, so you can enter relative values.

## 2. `thresholds.yaml`

### scope
| Key | Default | Meaning |
|---|---|---|
| `area` | AREA1 | Dapot Area kept |
| `period_start` / `period_end` | 2026-01-01 / 2026-06-30 | Snapshot period |

### bbt — battery criteria and design
| Key | Default | Meaning |
|---|---|---|
| `design_minutes` | 120 | Management BBT design (PROXY) used by the problem criteria |
| `ok_pct` | 0.50 | ≥ 50 % of design = not a problem (below → Degraded) |
| `degraded_pct` | 0.25 | below 25 % of design → Critical |
| `dead_max_minutes` | 5 | ≤ 5 min → Dead |
| `min_exhaustion_events` | 1 | Exhausted events needed to call BBT measured |
| `max_events_per_site_flag` | 300 | More events in 6 months → flagged as alarm flapping |
| `criteria_basis` | standard | `standard` = criteria vs 120 min; `site` = vs the per-site computed design |
| `design_by_class.*` | 120 | Fallback design per class when battery data is missing (PROXY) |
| `design_from_battery.ah_per_bank.*` | 100 | **Assumed** Ah per bank per battery type (no Ah field in the source) |
| `design_from_battery.usable_dod.*` | Li 0.90 · VRLA 0.50 · Mixed 0.70 · Other 0.50 | Usable depth of discharge |
| `design_from_battery.min_minutes` / `max_minutes` | 30 / 480 | Clip of the computed design |
| `derived_support.min_exhaustion_events` | 2 | A DERIVED Dead/Critical is trusted with ≥ 2 exhausted events, or… |
| `derived_support.min_power_h` | 1.0 | …power downtime ≥ 1 h **and** |
| `derived_support.min_share_of_pln` | 0.5 | …power downtime ≥ 50 % of PLN outage hours |

### battery and load
| Key | Default | Meaning |
|---|---|---|
| `battery_age_replace_years` | VRLA 4 · Lithium 8 · Other 5 | Age that triggers replacement for Critical (R4) |
| `load_high_ampere` | 45 | NE load considered high → upgrade capacity (R3b, R5) |

### mbp
| Key | Default | Meaning |
|---|---|---|
| `max_radius_km` | 120 | Coverage radius (hard constraint); also the map slider |
| `same_nop_only` | true | Coverage/candidates of the MBP's own NOP preferred |
| `assignment_mode` | history_then_nearest | Preference among feasible MBPs |
| `rh_max_hours_per_ticket` | 48 | RH hour-meter difference above this = outlier |
| `response_target_min` | 30 | v3.6 ops response-time target (ETA incl. mobilisation): Coverage KPI, Placement deadline, centre of gravity |
| `response_bands_min` | [30, 60, 120] | ETA bands on Coverage |

### travel — ETA model (ESTIMATED)
| Key | Default | Meaning |
|---|---|---|
| `road_factor` | 1.35 | Straight-line km → road km |
| `mobilization_minutes` | 15 | Preparation before departure |
| `speed_kmh.urban / rural_short / rural_long` | 25 / 35 / 45 | Speeds; rural short = road km < 15 |
| `peak_hours`, `peak_multiplier_urban / rural` | 7, 8, 16–18 · 1.4 / 1.15 | Traffic at departure |
| `night_hours`, `night_multiplier` | 22–04 · 1.2 | Slower at night |
| `island_eta` | unavailable | Islands have no road ETA |
| `access_multiplier` | mainland 1.0 · unknown 1.0 · riverine_delta 1.5 · remote 2.0 · island 3.0 (indicative only) | By access class |

### dependency_children (PROXY)
HUB Site bucket → estimated number of child sites: end site / BTS / repeater 0 · combat 1 · simpul kecil 2 · simpul 3 · simpul sedang 5 · simpul besar 8 · simpul sangat besar 12 · BSC / backbone / controller / TTC 15. Editable in Config; replace with real topology when available.

### power, site condition, levels and batches
| Key | Default | Meaning |
|---|---|---|
| `power.max_pln_events_per_month` | 200 | Monthly "Repetitive" above this = flapping → capped and flagged |
| `site_condition.full_gap_pp` | 3.0 | Availability gap (pp) that gives the full condition factor |
| `priority_levels` | P1 0.55 · P2 0.42 · P3 0.30 | MBP priority cut-offs |
| `bbs_priority_levels` | P1 0.63 · P2 0.54 · P3 0.45 | BBS priority cut-offs |
| `action_batches` | Batch 1 ≤ 2 weeks · Batch 2 this month · Batch 3 next PM · Batch 4 next quarter | Labels per BBS level |
| `severity_floor.measured_dead_critical` | P2 | Measured Dead/Critical never below this |

### availability (dark site and trend)
| Key | Default | Meaning |
|---|---|---|
| `dark_month_h` | 8.0 | Power downtime (h) that makes a dark month |
| `dark_min_months` | 2 | Dark months (of 6) that make a dark site |
| `dark_quarter_min_months` | 2 | Dark months (of 3) that make a site dark in a quarter |
| `trend_pp` | 0.50 | Availability change Q1→Q2 for Improving/Deteriorating |
| `trend_dark_share_pp` | 2.0 | Change in dark-site share (pp of sites) for the secondary signal |
| `min_cluster_sites` | 5 | Fewer → Insufficient data / excluded from worst clusters |

### offair
| Key | Default | Meaning |
|---|---|---|
| `max_outage_share` | 0.30 | Downtime ≥ 30 % of the period |
| `full_month_share` | 0.90 | Any month with downtime ≥ 90 % |
| `no_alarm_min_share` | 0.10 | Downtime ≥ 10 % with no alarms and no tickets |
| `exclude_by_default` | true | Excluded from KPIs unless "+ off-air" is ticked |

### v3.6 — fixed_genset, bbt.ticket_sets_status, gravity
| Key | Default | Meaning |
|---|---|---|
| `bbt.ticket_sets_status` | false | "Tidak Ada Baterai" tickets set status Dead (true) or are a field-check flag only (false) |
| `fixed_genset.exclude_from_mbp` | true | Fixed-genset sites need no MBP (no reach risk, not a placement target) |
| `fixed_genset.exclude_by_default` | true | Leave them out of the default scope (filter *+ fixed genset*) |
| `gravity.w_pln` / `w_bbt` / `w_class` / `w_repeat` | 0.35 / 0.25 / 0.15 / 0.25 | Site weights for the centre of gravity |
| `gravity.candidates` | 6 | Nearest kecamatan anchors scored |
| `gravity.min_city_share` | 0.2 | Candidates only in regencies holding ≥ this share of the camp's weight |
| `gravity.min_gain_share` / `min_eta_gain_min` | 0.02 / 5 | Materiality for *Move* |

### placement, base-camp signal, impact weights, unknown handling
| Key | Default | Meaning |
|---|---|---|
| `placement.target_share` | 0.90 | Share of MBP-P1/P2 targets to reach before BBT |
| `placement.max_new` | 15 | Maximum additional MBPs per NOP |
| `placement.relocation_max_loss_pp` | 0.5 | Cumulative reach loss allowed for relocation |
| `placement.relocation_max_candidates` | 3 | Maximum relocation candidates |
| `basecamp_signal.criteria_needed` | 2 | Criteria needed for Under-served |
| `basecamp_signal.p1p2_sites_min` / `reach_risk_share_min` / `avg_eta_min` / `workload_quantile` | 15 / 0.30 / 60 / 0.80 | The four criteria |
| `basecamp_signal.overserved_max_p1p2` | 2 | Possibly over-served threshold |
| `top15_weights` | availability_gap .30 · power_downtime .25 · bbt_risk .20 · priority .10 · recurrence .10 · criticality .05 | Top 15 worst sites |
| `worst_cluster_weights` | share_dark .30 · power_downtime_per_site .25 · availability_gap .30 · p1p2_dark_share .15 | Worst clusters |
| `unknown_handling.neutral_rank` | 0.5 | Rank given to sites with unknown PLN data / MBP history / 2025 outage |

## 3. `scoring.yaml`

| Block | Default |
|---|---|
| `class_score` | Diamond 1.0 · Platinum 0.8 · Gold 0.6 · Silver 0.4 · Bronze 0.2 · Unknown 0.3 |
| `mbp_priority` | class .25 · dependency .15 · outage_frequency .20 · travel_distance .10 · eta_gap .20 · site_condition .10 · vip 0 · outage_duration 0 · mbp_history 0 |
| `bbs_priority` | bbt_severity .35 · pln_exposure .25 · class .15 · dependency .15 · site_condition .10 · vip 0 |
| `mbp_candidate` | eta .70 · familiarity .20 · workload .10 (ranking of feasible MBPs in the simulation; lower cost wins) |

## 4. `basecamp_merge.csv`

Reviewable list of possible duplicate base camps. Columns: `keep`, `drop`, `status` (e.g. "LIKELY SAME PERSON (≤ 20 km, same NOP) — NEEDS REVIEW"), `km_apart`, `similarity`, `apply` (`yes`/`no`), `reviewer_note`. Only rows with `apply = yes` are merged (currently 8 of 25); the tickets of the dropped camp are remapped to the kept one. Set `apply` only after reviewing the pair (Data quality › possible duplicates); the pipeline never merges on its own.

## 5. Config tab sections (what-if)

Weights (MBP priority, BBS priority, MBP candidate ranking, worst clusters, Top 15) · Priority cut-offs · BBT criteria · Unknown handling · Travel model · Rules (severity floor, dark site, trend, off-air) · Design from battery · Placement · Base-camp signal · Dependency mapping. Buttons: **Edit (what-if)**, **Apply**, **Done**, **Export JSON**, **Import JSON**, **Reset to default**. A governance note explains that what-if changes are local until agreed and committed.

### v3.7 — mbp_perf, dispatch, battery_young_share
| Key | Default | Meaning |
|---|---|---|
| `mbp_perf.period_hours` | 4344 | Hours in H1 (occupancy denominator) |
| `mbp_perf.min_jobs` | 10 | Judged PLN-off jobs needed for an on-time class |
| `mbp_perf.under_busy_max` / `under_jobs_month_max` | 0.03 / 2 | Under-utilised (grey) |
| `mbp_perf.high_busy_min` | 0.25 | High load (purple) |
| `mbp_perf.ontime_good` / `ontime_low` | 0.60 / 0.35 | Green ≥ · red < |
| `mbp_perf.dispatch_lag_cap_min` / `default_job_h` | 240 / 3 | Backtest replay |
| `dispatch.w_class` / `w_dependency` / `w_priority` | 0.40 / 0.30 / 0.30 | Dispatch score |
| `dispatch.savable_first` | true | Savable sites first |
| `battery_young_share` | 0.4 | Critical below this share of the replacement age → check setting (R6c) |
