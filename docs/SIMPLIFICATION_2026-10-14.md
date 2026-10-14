# PBA Dashboard — Simplification implementation report (2026-10-14)

Scope: presentation and workflow only (buckets 1–4 of `claude/PBA_BUCKETS_REVIEW.md`). No formula, threshold or definition was changed.
Every new grouping is a partition of an existing engine state and is tested (SB-1 … SB-4 in `tests/logic.test.mjs`).

## 1. Expected vs actual counts (AREA 1 dashboard scope: active, not off-air, not genset-protected = 18,407 sites)

| Measure | Brief | Actual (computed) | Match |
|---|---|---|---|
| P1/P2 Keburu / Tidak keburu / Belum bisa dinilai | 1,693 / 873 / 100 | 1,693 / 873 / 100 (`reachBreakdown` = `reachSplit`) | ✔ |
| Condition groups act / below / meets / unknown | 3,957 / 10,162 / 3,027 / 1,261 | 3,957 / 10,162 / 3,027 / 1,261 | ✔ |
| Evidence groups measured / estimated / verify / none | 9,685 / 7,361 / 100 / 1,261 | 9,685 (ACTUAL 8,541 + DERIVED 1,144) / 7,361 / 100 / 1,261 | ✔ |

Nothing was hard-coded: the numbers on screen come from `lib/coverage.js`, `lib/bbsgroups.js`, `lib/opstatus.js` over the model.

Additional counts (no baseline in the brief):

- Fleet operational status (327 base camps): Perlu dicek 108 (low 72 + high 36) · Bisa dipindah 11 · Aman 133 (watch 91 + good 42) · Belum bisa dinilai 75. Flag "Bersihkan data" 57.
- Not-reached reasons (873): island 179 · beyond search limit 4 · battery ≤ mobilisation 66 · too far 624. A site can have more than one reason ("any" counts: beyond 11, battery 79); the display uses the first in the fixed order.

## 2. Findings and decisions (reported, not "fixed" into the numbers)

1. **Idle but not selectable** — 13 idle camps, 2 not selectable → shown as *Belum bisa dinilai* (never offered as movable). Hence movable 11.
2. **Sometimes late (watch, 91)** → *Aman*, with "kadang telat" as the reason (the existing alert threshold is `ontime_low`).
3. **Sizing denominator ≠ KPI reach** — Units sizing counts road-reachable P1/P2 sites with BBT > mobilisation (e.g. NOP BATAM 58/61) while the sandbox shows all located P1/P2 (59/162). Definitions unchanged; the result sentence now states numerator and denominator so the two are not confused.
4. **Sizing "battery shorter than mobilisation" includes unknown BBT** — across AREA 1, 83 of the 165 excluded sites have an unknown BBT (engine uses the effective BBT as given). The exclusion line now shows "(n di antaranya BBT tidak diketahui)". Recommend collecting battery data rather than treating these as short batteries.
5. **Demand-centre proposals that reduce reach** — `basecampGravity` can recommend a move whose reach within the response target drops (e.g. BATAM BPS003-TJP 5 → 3). Such proposals are not listed as candidates (counted under the list) but remain visible in "Detail: pusat permintaan".
6. **Validation gate** — job-replay candidates appear only when the model reproduces the NOP's actual on-time within ±5 pp (existing calibration rule). Demand-centre and free-up candidates are distance estimates and are labelled with their source.
7. **Fix** — map mode `reachwhy` returned key `no` outside the Explorer (caught by test v3.5); fallback now computes the reason without Config.

## 3. Changes by bucket

See `docs/CHANGELOG.md › vSimplify`. Files: `lib/opstatus.js`, `lib/coverage.js`, `lib/bbsgroups.js`, `lib/dispatch.js` (sim groups), `lib/mapmodes.js`,
`components/tabs/{FleetTab,Explorer,PlanTab,Placement,MoveCandidates,SimTab,SimMap,HistoryTab,BatteryRisk,BbsActions}.jsx`, `components/{Snapshot,opUi,ShapeIcon,MapView,Workspace,mapModes}.jsx`, `app/page.jsx`, `i18n/en.json`, `i18n/id.json`.

Cross-page flow (verified in the browser): Coverage site → *Uji di Perencanaan* (sandbox, site focused) · → *Cek baterai*; Battery Condition → *Lihat tindak lanjut* (row selected in Field Actions); move candidate → *Uji di sandbox* (e.g. BPS003-KRM → Sei Beduk: replay 220/367 → 230/367 jobs on time, +10 = candidate; P1/P2 reach 59 → 57 visible as trade-off); sizing → *Buka 11 unit di sandbox* (Pekanbaru 19 → 30 units); outage boxes filter map + worklist (Batam: 8 / 0 / 7 / 0 / 5 = 20).

## 4. Tests, build, runtime

- `npm test` 84 / 84 (80 → 84: SB-1 Fleet status partition, SB-2 reach tabs = KPI split + one reason each, SB-3 outage boxes partition + sandbox hand-over kinds + legacy links, SB-4 BBS groups partition + cross-page links).
- `node scripts/kpi_check.mjs` reconciliation OK; `npm run reconcile` all ✔.
- `next build` OK; browser: no page errors; no raw i18n keys (EN desktop, ID 390 px); no horizontal overflow at 390 px.
- Before / after screenshots: `simplify/compare_*.png` (before = vNext.2.1 package, after = this build).

## 5. Limitations

- Deployment not done from here (GitHub not accessible); the live site still runs the previous deploy.
- AREA 4 has no MBP jobs / PLN events: job-replay candidates, replayed on-time and history are N/A there by design.
- Fleet "Perlu dicek" combines often-late and busy; the panel shows which (and both when both apply).
