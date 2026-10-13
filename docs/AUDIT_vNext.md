# PBA vNext — baseline audit & implementation checklist (2026-10-13)

Source of truth: the local working copy (v5.0). The GitHub repo and the live deployment could not be opened from this session
(`GitHub access to this repository is not enabled`; the live app is behind basic auth), so repo ↔ deploy parity is **not verified**.

## Baseline (reproduced with `node scripts/kpi_check.mjs`, AREA 1 = FULL, AREA 4 = PARTIAL)

| Brief value | Source in code | Current value | Status |
|---|---|---|---|
| 327 base camps, 29 without location | `basecampCounts(bcScope)` (lib/basecamp.js) | 327 · noloc 29 | ✔ matches |
| 18,407 sites | `kpiFor(K).sites` (lib/kpi.js, FULL areas, active, no off-air / genset) | 18,407 | ✔ |
| 2,666 priority sites | `p12_eval` | 2,666 (of which 100 have DERIVED-UNVERIFIED BBT) | ✔ — see note |
| 1,693 / 2,666 reachable before BBT | `p12_reach` (REACH_EVIDENCE = ACTUAL/ESTIMATED/DERIVED) | 1,693 (1,440 ACTUAL · 197 ESTIMATED · 56 DERIVED) | ✔ |
| 49 % historical jobs on time | `jobs_ontime_pct` | 48.75 % | ✔ |
| 13 idle / 36 busy / 72 often late | basecamp_final status `under` / `high` / `low` | 13 / 36 / 72 | ✔ |

Note: the 100 priority sites with an unverified BBT stay in the 2,666 denominator (existing, documented KPI definition: they cannot
be confirmed as reachable). vNext keeps the definition and shows them as a separate grey "not verified" segment, so unknown is never
drawn as a failure.

Data facts used by the UI (AREA 1 active scope): BBT evidence ACTUAL 8,541 · ESTIMATED 7,361 · UNAVAILABLE 1,261 · DERIVED 1,144 ·
DERIVED-UNVERIFIED 100 · TICKET 0. `action_batch` is 1:1 with `bbs_priority_level` (Batch n ⇔ BBS-Pn) → not a separate category.
No ESTIMATED-only site has a REPLACE action (rule engine; now also a test).

## Defect / design / data classification

| Finding | Kind | Action |
|---|---|---|
| Fleet hero = 4 diagnostic tiles (model-calibration, cost comparison) before the fleet numbers | design | Fleet Snapshot hero; tiles moved to "Baseline & data confidence" |
| "Can the model be trusted?" wording | design | "Model validation by NOP" |
| Radius = 20–200 km range slider in every map | design | 20 / 40 / 80 / Custom buttons (one component in MapView) |
| Selected-camp radius shown as a permanent white Leaflet tooltip over the map; detail asides plain white | design | label moved to the legend; one detail-panel surface |
| Explorer: long ETA method sentence above the map | design | "Indicative ETA ⓘ" |
| Map toolbar mixes level / layers / radius / mode | design | grouped: Mode · Layers · Radius · Level; legend chips with reset |
| AREA 1-only banner on every page | design | contextual chip in the hero / scope tooltip |
| Planning: 4 tools, relocation backtest results not openable in the move sandbox | design | question → baseline → tool; "Open in sandbox" uses the same scenario engine |
| Scenario colours: blue = gain, orange = lost (clash with ACTUAL / ESTIMATED colours) | design | green / red / grey / purple scenario palette |
| Outage scenario: worklist not linked to the map; unknown BBT silently assumed 0 | design + transparency | linked worklist, availability summary, "BBT unknown (assumed 0 min)" flag and count |
| Fleet-size: stop reason not stated | design | explicit stop condition (target met / limit reached / no candidate adds reach) |
| "BBS-P1 · Batch 1" tiles | design | BBS-P1 … P4 + suggested window; batch only in CSV |
| Battery Risk page name, status / evidence only as chips | design | "Kondisi Baterai / Battery Condition" with clickable status and evidence bars |
| Outage default NOP / backtest default NOP hidden (PALEMBANG / BENGKULU) | design | NOP shown in the baseline strip |
| Repo / live deployment not reachable | environment | reported, not verified |

## Checklist
1. Nav: rename BBS pages, supporting-area divider label, legacy links unchanged.
2. Fleet Performance: snapshot hero, map modes, radius buttons, panel surface, Baseline & data confidence section.
3. Explorer: coverage hero + progress bar, Indicative ETA tooltip, grouped controls.
4. Resource Planning: question cards, baseline strip, sandbox hand-off, sizing stop condition, outage worklist ↔ map, scenario colours.
5. Battery Condition: status + evidence bars → filter map + table, active filter chips, reset.
6. Field Actions: priority / condition / evidence / action separated, batch removed from the main view, worklist columns.
7. Tests (radius independence, ESTIMATED never → REPLACE, scenario palette), build, browser checks, docs, report.
