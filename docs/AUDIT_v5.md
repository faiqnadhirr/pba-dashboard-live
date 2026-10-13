# PBA v5.0 — audit before the revamp (13 Oct 2026)

Source of truth: this working copy (v4.2, 68/68 tests, build clean). The GitHub repo and the live Vercel app could not be opened from
this session (no GitHub access granted; the live app is behind basic auth), so the repo/deployed relationship is NOT verified here.

## Baseline (AREA 1, H1 2026, default filters)
- 18,407 active sites · 327 base camps (721 with AREA 4) · P1/P2 2,666 · reachable before BBT 1,693 (63.5 %; ACTUAL 1,440 · ESTIMATED 197 · DERIVED 56; 100 unverified)
- long outages on P1/P2 sites with an MBP job 1,304 / 17,974 · working-time median 10.2 % (327 units) · BBS-P1 136 · setting checks 528
- calibration: model within ±5 pp in 12 of 16 NOPs · Rantau Prapat busy-at-peak 13 (p95) of 17 units, ticket match 89.0 %

## 1. Works — retained
Single rule engine (lib/logic.js), KPI layer (lib/kpi.js) + build reconciliation (scripts/kpi_check.mjs), basecamp_final, Kaplan-Meier
BBT estimate, BBS action rules + evidence trail, anchored replay / backtest, fleet sizing (knee), drag-and-drop scenario, outage scenario,
data quality, AREA filter, bilingual UI, URL state, CSV export (English headers), evidence labels.

## 2. Overlapping — consolidated
- MBP summary map, base-camp performance table, scatter and lists → **Fleet Performance** (one map + one base-camp table).
- Old coverage map + site list → **Coverage & Site Explorer** (one map + one site table + selected-site panel).
- Drag-and-drop scenario, fleet size, relocation backtest, outage scenario (4 tabs) → **Resource Planning** (4 steps on one page).
- BBS action list and its separate hero map → **Recommended Actions** (one workspace); new **Battery Risk** workspace.

## 3. Inconsistent / confusing interactions (fixed)
- Map and table kept separate selection; a table click opened the drawer, a map click opened a floating card — never linked.
- Legend filtering existed on some tabs only (MapHero), not on the site list; base-camp selection did not filter the table.
- Pagination lost the selected record; there was no "selected record is filtered out" state.

## 4. Data / calculation issues
- Simulation reach used only the NOP's own camps → baseline ≠ KPI for border sites (Palembang 1,770 vs 1,779). Fixed: neighbour camps
  stay in the pool; baseline = KPI (test WS-8).
- Simulation reach ignored the evidence rule of the KPI layer (unverified BBT counted). Fixed (REACH_EVIDENCE in reachOf).
- Dispatch for one outage existed only as an audit of history; no per-site "which MBP" answer. Added on the existing engine.

## 5. Missing but possible with existing data (implemented)
Shared map↔table selection, per-site dispatch candidates with explicit outcomes, scenario site-change table + CSV, battery-risk workspace.

## 6. Needs more data / integration (not simulated)
Real-time MBP availability / GPS (user can mark camps busy by hand), road routing, real Ah ratings, AREA 4 MBP tickets + PLN events,
NOP dependency (ACTUAL), live alarms.
