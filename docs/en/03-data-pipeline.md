# 03 · Data & pipeline

## 1. End-to-end flow

```text
 Raw files (Excel/CSV/ZIP)          engine/  (Python 3.11+)                          public/data/  (JSON)                 Browser (Next.js)
 ─────────────────────────          ─────────────────────────────────────           ─────────────────────                ─────────────────────
 Dapot ALL Site            ─┐       1 ingestion/load.py   read by name pattern       sites.json   (1 row / site)         lib/data.js  loadAll()
 Tracking Ticket MBP        │       2 normalization/clean  IDs, dups, coords,        mbps.json    (base camps)            lib/logic.js buildModel()
 New_BBT 2026               ├────►    tickets, events, access class, PIC match  ──►  familiarity.json                ──►    one rule engine →
 BBT Site Details (6 mo)    │       3 analytics/kpi        site-grain KPIs           meta.json    (config, QA, charts)    all tabs, maps, exports
 BBT Export monthly (events)│       4 bbs/survival+model   Kaplan-Meier, estimates   detail/<nop>.json (drawer, lazy)     lib/period.js (period)
 Avail RAN daily (6 mo)    ─┘       5 mbp/*                base camps, matching      period/<YYYYMM>.json (lazy)          lib/rollup.js (roll-up)
                                    6 build.py → JSON + sanity + npm test
                                    7 validate.py → docs/VALIDATION_REPORT.md
```

The pipeline runs **once per data refresh** (about 2 minutes, plus ~30 s for the daily period files). The web app never reads raw files.

## 2. Source files

Files are found by **name pattern** in the raw folder (sub-folders are fine). Default folder: `engine/data/raw/`, or `python build.py --raw "D:\PBA raw"`.

| Pattern | File | Grain | Used for |
|---|---|---|---|
| `*Dapot*ALL*Site*.xlsx` | Dapot ALL Site TSEL | site | Master list (AREA1 filter), class, NOP, cluster TO, city/regency, coordinates, "Kepulauan" flag, HUB category, VIP, active |
| `*Tracking*Ticket*MBP*.xlsx` (sheets *MBP Team*, *Tracking Site*) | Tracking Ticket MBP Jan–Jun | base camp; ticket | Base camps and PIC names, coordinates; power/MBP tickets with RC owner, RC 1/RC 2, MBP PIC, RH start/stop, status |
| `*New*BBT*.xlsx` | New_BBT_2026 | site | Battery type, age, banks, quantity, NE load (A), HUB site bucket |
| `*BBT*Site*Details*.csv` (one per month) | BBT Site Details Jan…Jun | site-month | Monthly BBT summary (median), PLN "Repetitive" count and total PLN-down hours (fallback) |
| `*BBT*Export*monthly*.xlsx` | BBT_Exportmonthly_AREA1 | event | Every mains-fail event: start, clear, NE-down clear, backup minutes, LOW BATT/NE DOWN (exhausted) flag |
| `*Avail*RAN*.zip` **or** the extracted `*.csv` (not both) | Avail_RAN_BeforeRecon_site_ne_base_AREA1_daily | site-day | Availability, target, outage and duration per cause (power, transport, RAN, other), NE-seconds |

Raw files are **Telkomsel-confidential**: they are never committed (`engine/data/` is git-ignored) and never published.

## 3. Cleaning and normalisation

| Step | Rule | Current result |
|---|---|---|
| Canonical key | `site_id = upper(trim(Site ID))` in every source | 100 % join on the master |
| Scope | Dapot rows with Area = AREA1 | 20,236 rows → 20,227 sites (9 duplicate IDs removed) |
| Coordinates | Outside the Sumatera box → null; published at source precision (up to 6 decimals) | 8 sites with bad coordinates |
| Base camps | MBP Team sheet; missing decimal point repaired; reviewed merge map `engine/config/basecamp_merge.csv` | 327 → 319 base camps (8 merged pairs); after the merge 284 actual, 6 repaired, 29 without location |
| Tickets | Exact duplicates removed; cancelled tickets excluded from deployments; RH hour-meter difference > 48 h = outlier | 47,249 → 47,210 rows; RH valid 99.65 % |
| PIC → base camp | EXACT → HIGH (normalised name) → MEDIUM (fuzzy ≥ 0.92, same NOP, unique) → NEEDS REVIEW (not used) → UNMATCHED | 97.5 % of tickets matched; ambiguous names never merged |
| BBT events | Exact duplicates removed; dates within the period | 227,538 → 227,155 events; 31.7 % battery-exhausted |
| PLN intervals | Events merged per site when they overlap/touch; end = mains-fail clear, else NE-down clear, else start + backup | 3,298 overlapping events merged → 223,857 intervals |
| RAN | NE-summed seconds ÷ number of NEs (= denum / 86,400), capped at 86,400 s per site-day → **wall-clock** | 6 months, 1 row per site-day |
| Access class | From Dapot "Kepulauan" + regency name only (never from a missing ETA) | mainland 18,311 · unknown 1,229 · riverine/delta 330 · island 286 · remote 71 |
| Dependency | HUB Site bucket → children count (PROXY, editable mapping) | — |
| Monthly BBT summary | Rejected when it contradicts an outage the battery is proven to have survived | 1,156 values rejected |

## 4. Site-grain aggregation

**Every source is aggregated to one row per site before any join**, so no join can multiply rows. Main site fields:

- **Identity:** site_id, name, class, NOP, cluster_to, city, active, VIP, lat/lon + decimals, urban flag, access class + basis, HUB bucket.
- **Battery evidence:** battery type, age, load, banks, quantity; BBT value + evidence + basis; measured value; lower bound; estimate low/high + confidence; event counts (total, exhausted, censored, flapping flag); "Tidak Ada Baterai" ticket count.
- **Power / PLN:** PLN outage frequency and total hours (+ source: event intervals or monthly summary), anomaly months, 2025 outage hours.
- **Availability (RAN, wall-clock):** availability %, target %, hours, outage and downtime per cause; monthly series (hours, outage, power) and Q1/Q2 totals for the trend.
- **MBP history:** in ticket file, primary historical MBP, deployments, backup hours; root-cause counts per responsibility class (`rc_*`).

## 5. Output files (`public/data/`)

| File | Size* | Loaded | Content |
|---|---|---|---|
| `sites.json` | 12 MB | at start | Columnar `{cols, rows}`, one row per site (fields above) |
| `mbps.json` | 0.1 MB | at start | Base camps with coordinates, status, PIC, merged-from, workload |
| `familiarity.json` | 0.5 MB | at start | How often each MBP served each site (site × MBP → count) |
| `meta.json` | 0.1 MB | at start | Effective config, snapshot and source status, QA counters, build sanity, monthly series per NOP, BBS analytics (correlation, KM curves, estimator test), PIC matching, duplicates, unmatched IDs |
| `detail/<nop>.json` | 19 MB total | when a site drawer opens | Per site: monthly figures, recent tickets, battery events |
| `period/<YYYYMM>.json` | 29 MB total (≈1 MB gzip per month) | only when a period other than Full H1 is chosen | Sparse site-day series: RAN downtime per cause (seconds), days present, PLN intervals, monthly-summary PLN, mains-fail events, tickets (day, root-cause class, deployment, RH hours) |

\* uncompressed; Vercel serves them compressed.

## 6. Evidence levels

| Tag | Meaning | Examples |
|---|---|---|
| **ACTUAL** | Observed directly at the site | BBT = Kaplan-Meier median of the site's own events; base camp coordinates as recorded; ticket root cause |
| **DERIVED** | Calculated from observed data | Monthly BBT summary (when supported); PLN intervals; wall-clock availability; MBP backup hours |
| **ESTIMATED** | Modelled | BBT from comparable-site Kaplan-Meier; travel time; placement |
| **PROXY** | Stand-in for data that does not exist | Dependency (HUB bucket); 120-min design; design from an assumed Ah per bank |
| **UNAVAILABLE** | No data | Shown as "—", never as 0 |
| *TICKET* / *DERIVED-UNVERIFIED* | Battery status from a "Tidak Ada Baterai" ticket / derived value not supported by site evidence | see [04 §3](04-methodology.md#3-battery-status-and-evidence-precedence) |

## 7. Quality gates

1. **Build sanity** (`build.py`): correlation n equals the exported fields; battery banks exported; merged base camps removed and tickets remapped; base camp IDs unique; monthly power series has 6 months and never exceeds hours in the month; coordinates keep their precision.
2. **JS rule tests** (`npm test`, 38 tests) run automatically at the end of `build.py`; the build fails if any test fails (skip only with `PBA_SKIP_JS_TESTS=1`).
3. **Validation** (`validate.py`, 25 checks in data / sanity / analytics / decision groups) → `docs/VALIDATION_REPORT.md`.

## 8. How to rebuild the data

```powershell
cd C:\PBA\pba-dashboard
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r engine\requirements.txt
cd engine
python build.py --raw "D:\PBA raw"      # ~2–3 min → ..\public\data\*.json (+ runs npm test)
python validate.py                      # 25 checks → ..\docs\VALIDATION_REPORT.md
```

Optional environment variables (speed up repeated builds while developing):

| Variable | Effect |
|---|---|
| `PBA_RAW_CACHE=C:\tmp\raw.pkl` | Cache of the parsed raw files (re-used if it exists — delete it when raw files change) |
| `PBA_DAILY_CACHE=C:\tmp\daily.pkl` | Cache of the daily RAN read for the period files |
| `PBA_SKIP_JS_TESTS=1` | Do not run `npm test` at the end (not for production builds) |

After a rebuild, commit/upload the changed `public/data/` files; Vercel redeploys automatically (see [07](07-deployment-operations.md)).
