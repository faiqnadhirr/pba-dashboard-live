# Changelog / Riwayat versi

Each version lists the main changes (EN) and a short Indonesian summary (ID).

## vScorecards — headline scorecards (2026-10-14)
- **MBP › Fleet Performance**: snapshot = 8 tiles, each "X dari Y (Z%)": base camps (located / not), P1/P2 sites, P1/P2 reached before BBT, jobs on time, **how late late jobs are** (median MBP arrival − BBT over the same 19,166 late jobs as the KPI: 101 min), unit working time (median 10.2 % of 327 camps; ≈ 23 jobs/unit/month), base-camp status, **double risk** (495 of 873 P1/P2 not reached with battery needing action). One factual sentence above the tiles.
- **BBS › Battery Condition**: existing 4 + 4 groups kept; 6 new tiles: measured BBT vs design (median 88 vs 120 min, n 9,685), measured below design 6,697 / 9,685 (< 30 min 1,453), **PLN outage longer than BBT** 2,106 / 9,685 measured (all evidence 3,168 / 14,602; 3,805 without PLN data not counted), P1/P2 battery needing action 681 / 2,666, double risk 495 / 873, BBS-P1 136 / 4,034 (+ replace / upgrade / collect data); hotspot line (top-3 NOP / cluster share, ≥ 30 sites). A tile click shows exactly its counted sites (card filter chip).
- `lib/scorecards.js` (predicates + `siteScore`), drill preset `sc~<card>`, `components/Scorecards.jsx` (Tile). KPI layer: additive `late_over_median` / `late_over_n` (from `mbpPerformance`, late jobs only). No existing formula, threshold or definition changed.
- Dropped as disputable: "cushion 7 min" (two medians of different populations), downtime share (correlation), confidence badge (subjective threshold), P1/P2 per camp (misleading average).
- Test SC-1 (tile = click-through count, late n = judged − on time per NOP, below / < 30 min = existing statuses). Tests 84 → 85.

## vSimplify — Simplification brief 2026-10-14 (buckets 1–4, presentation / flow only)
No calculation, threshold or definition changed. New display groups are partitions of the existing engine states (tests SB-1 … SB-4).
- **Bucket 1 · Fleet Performance** (`FleetTab.jsx`, `lib/opstatus.js`, `components/opUi.jsx`): one operational status per base camp mapped from `basecamp_final` — Perlu dicek (low + high), Bisa dipindah (idle ∧ selectable), Aman (watch + good; "kadang telat" kept as reason), Belum bisa dinilai (noloc / nodata / none / few / idle not selectable); "Bersihkan data" is a flag (selectable = false). Map modes Base camp / Site (+ P1/P2 only); radius only in Site mode. Linear flow snapshot → map → table tabs (Semua · Perlu dicek · Bisa dipindah · Bersihkan data) → panel with a one-sentence reason. Nine chips and follow-up lists removed; baseline, performance detail and per-NOP collapsed.
- **Bucket 2 · Coverage & Site Explorer** (`Explorer.jsx`, `lib/coverage.js`): tabs Keburu / Tidak keburu (default) / Belum bisa dinilai = KPI reach split; deterministic reasons (island → beyond → battery shorter than mobilisation → too far), one map colouring, neutral camps, one column set sorted by ETA − BBT, full CSV; panel with reason, BBT + evidence, 3 nearest camps, "Uji di Perencanaan" / "Cek baterai". Battery mode, camp performance colours, compact/detail toggles and dispatch panel moved out.
- **Bucket 3 · Resource Planning** (`PlanTab.jsx`, `Placement.jsx`, `MoveCandidates.jsx` new, `SimTab.jsx`, `SimMap.jsx`): three questions + one shared sandbox. Units: 2 inputs (+ advanced), one-sentence result with counts, knee marker, exclusions next to the result, "Buka n unit di sandbox"; ideal fleet, unit cost, relocation and all-NOP table under "Detail & asumsi". Move: ONE candidate list (job replay of idle camps — gated by model validation; demand centre — moved from History; units that can be freed) with source, reason, location check and "Uji di sandbox"; backtest and demand-centre detail collapsible. Demand-centre moves that reach fewer sites are not listed (counted). Outage: 3 primary inputs, advanced (depart hour, busy units, B/C/D off by default), 5 outcome boxes (saved · late · not served · not evaluable · no need) that filter map + worklist. Sandbox: 2 measures before → after with numerator / denominator, tabs Sites changed / Base camps changed, accepts move / remove / add hand-overs; suggestion panel removed. Baseline strip 6 → 4. Old links resolve (`plan=scenario` → sandbox, `plan=backtest` / `mbp.backtest` → move).
- **Bucket 4 · BBS** (`BatteryRisk.jsx`, `BbsActions.jsx`, `lib/bbsgroups.js`, `components/ShapeIcon.jsx`): Battery Condition with 4 condition groups (Perlu tindakan · Waspada · Cukup · Tidak diketahui) and 4 evidence groups (Terukur · Estimasi · Belum terverifikasi · Tidak ada data); original status / evidence labels in tooltip, table, panel and CSV; one map mode; table Site · Kondisi · BBT · Bukti · Paparan PLN mati; "Lihat tindak lanjut" opens the site in Field Actions. Field Actions: one map mode (colour = BBS priority, shape = action, shape legend), condition / evidence filters on the same 4 groups, status × evidence table and 9-action filter removed; safety rules unchanged. BBS secondary pages under "Untuk analis".
- Fix: map mode `reachwhy` fallback key outside the Explorer (test v3.5 roll-up).
- Tests 80 → 84 (SB-1 … SB-4).

## vNext.2.1 — clickability review
- **Bug fix — map icons not clickable**: every render created new Leaflet `divIcon` objects, so react-leaflet replaced the marker DOM element on each re-render (hover, wheel-guard state) and the click was lost between mousedown and mouseup. Icons (base camps, trucks, roll-up pies) are now cached by appearance (`MapView.jsx › ICONS`). Verified on every map page.
- Outage scenario: clicking a truck filters the worklist to the sites assigned to it (chip to clear).
- Hero segments are filters: Fleet / Explorer reach bar → the exact P1/P2 sites (reachable 1,693 · not reachable 873 · not verified 100, drill `reach_p12`); historical on time → History page; Planning baseline items → Explorer / History / Fleet.
- History: scorecards filter the page (jobs, on time = PLN-off, power on, no check-in; unknown PIC → Data quality); a timeline bar zooms to its month.
- Data quality count rows (unknown, missing field, design basis, access class, coordinate precision) open the matching sites in the Explorer (new drills).
- Fleet-size marginal-gain rows open the anchor site of that unit.
- Test VN-8 (drill counts = KPI split; icon cache). Tests 79 → 80.

## vNext.2 — operational integrity (reconciliation, history, capability, demand centre, rule fixes)
- **Reconciliation**: `npm run reconcile` (`scripts/reconcile.mjs`) regenerates `docs/RECONCILIATION_generated.md` with the dashboard's own functions (site / base-camp / ticket chains, metric definitions, design bases, Σ NOP = area). Discrepancies with source, formula, observed, expected and resolution: `docs/DISCREPANCIES_vNext2.md`.
- **One on-time rule**: `judgeTicket()` (lib/mbpperf.js) used by the KPI layer and the new history lib; test VN-5 checks per-camp equality.
- **History & Patterns** (MBP, new page `components/tabs/HistoryTab.jsx`, `lib/history.js`): historical badge, months / base camp / outage category / outcome filters + header Area / NOP / class on ONE job set → scorecards (jobs, on time with n, power-on with n, no check-in, not judged, unknown PIC), weekly / monthly outcome timeline, demand-hotspot map, capability profile per base camp (CSV). Jobs grouped by the camp's NOP, as in the KPI layer.
- **Power-on outcome (REPORTED)**: ticket resolution "connect genset" AND running hours > 0; no check-in = missing, not failure; never inferred from visits. Also in the Fleet camp panel.
- **Demand centre vs recommended location** (History › second view): weighted centre (Config › gravity weights shown) kept apart from the recommended real anchor site; feasibility checks (active site, not island, ≥ 4 coordinate decimals, same regency, riverine flagged), explicit exclusions, baseline comparison (own sites within 30 min, weighted ETA). Engine `basecampGravity` unchanged; it was previously only reachable with `?full=1`.
- **Rule fix (verified defect)**: BBS R10 no longer recommends a battery upgrade on an unknown (→ R10b collect field data) or estimated BBT (→ R10c inspect & verify). Test VN-6 checks that condition, evidence and action cannot contradict.
- **Definition fixes**: computed per-site design now ESTIMATED (site load) / PROXY (median load, class default) with `bbt_design_kind` (was DERIVED although the Ah rating is assumed). "PLN outage" labels → "PLN off (mains-fail alarms)"; engine source name updated.
- **Outage scenario**: unknown BBT shown as "not evaluable" with the engine's (BBT = 0) result kept beside it (`simOutcomeView`, test VN-7).
- **Maps**: wheel zoom only after a click on the map (page scroll no longer hijacked), zoom 4–17, bounds around Indonesia; Fleet on-time view relabels the status chips as a filter (no conflicting colours); demand-centre map draws sites neutral so purple = recommendation only.
- Telemetry design hidden from the navigation (prototype banner; `?full=1` or a direct link still opens it).
- Tests 76 → 79 (VN-5 … VN-7) plus updated B1 / G / Simulation tests.

## vNext.1 — default preferred radius 25 km (max 100 km)
- `engine/config/thresholds.yaml`: `mbp.max_radius_km` 120 → **25**, `radius_presets` → [25, 50, 100], new `radius_max_km: 100` (Custom input + Config slider limit). `reach_cap_km` (search limit, 250 km) unchanged, so reach before BBT stays 1,693 / 2,666. Tests G and Simulation updated (they assumed a 120 km default). Data rebuilt (build.py + build_area4.py).

## vNext — operational hierarchy (snapshot heroes, planning workflow, Battery Condition, Field Actions)
- Navigation: BBS pages renamed **Kondisi Baterai / Battery Condition** and **Tindak Lanjut Lapangan / Field Actions** (view keys unchanged, old links work); the advanced views sit after a labelled "Supporting" divider.
- **Fleet Performance**: Fleet Snapshot hero (`components/Snapshot.jsx`) — base camps / sites / priority sites, model reach 1,693 / 2,666 with a reached · not reached · BBT-not-verified bar, historical on time 49 % (n judged jobs), fleet status (13 idle · 36 busy · 72 often late) that filters map + table. Diagnostic tiles moved to a collapsible **Baseline & data confidence** section ("Model validation by NOP"). Map modes Utilization · On-time · Coverage · Priority. Fleet "busy" colour changed from purple to teal (purple = proposed unit).
- **Radius**: 20 / 40 / 80 km / Custom buttons (`RadiusControl`) in every MBP map, with "reset to 120 km"; reach before BBT does not change with it (test VN-1).
- Map toolbar grouped: Map mode · Layers (sites, base camps, coverage radius) · Radius · Level. Selected-camp radius label moved from a permanent white map tooltip into the legend; map selections use one detail-panel surface (`Panel`).
- **Coverage & Site Explorer**: coverage hero from the KPI layer with progress bar; ETA method in an "Indicative ETA ⓘ" tooltip; "responsible party" colouring removed from this page.
- **Resource Planning**: 1 choose the planning question (4 cards) → 2 baseline strip (NOP, snapshot, units, P1/P2 reach, jobs on time, validation, availability assumption) → 3 tool. Relocation analysis can open a candidate in the sandbox (same scenario engine, tagged "model suggestion"). Additional-unit sizing shows baseline → target → result → stop condition (`sizingStop`: target met / simulation limit / no more benefit). Outage scenario: summary (selection method, availability, rules), Δ vs baseline, worklist ↔ map selection with assignment panel, BBT-unknown (assumed 0 min) flagged and counted. Scenario palette green / red / grey / purple (`SCN`). Method texts folded into "Method & assumptions".
- **Battery Condition**: status scorecards + bar and a separate evidence bar (ACTUAL · DERIVED · ESTIMATED · DERIVED-UNVERIFIED · UNAVAILABLE, TICKET when present); clicks set the filter for counts, map and table; reset.
- **Field Actions**: hero with BBS-P1…P4 (+ suggested window) and the six field actions; worklist columns priority · site · condition · evidence · PLN exposure · recommended next action · reason. "Batch n" (1:1 with BBS-Pn) removed from the main view, kept in the CSV.
- Header: the "AREA 1 only" page banner became part of the scope chip ("AREA 1 (full data)", details in its tooltip).
- Tests 72 → 76 (VN-1 … VN-4). Audit: `docs/AUDIT_vNext.md`.
- *ID:* Hero ringkasan per halaman, radius tombol 20/40/80/lainnya, alur perencanaan 1-2-3 dengan baseline, halaman Kondisi Baterai dan Tindak Lanjut Lapangan.

## v5.0 — map-first revamp (MBP 3 pages, BBS 2 pages, map ↔ table connected)
- Navigation: **MBP** = Fleet Performance · Coverage & Site Explorer · Resource Planning; **BBS** = Battery Risk · Recommended Actions. Advanced views kept after a divider (coverage detail, dispatch audit, telemetry design, BBT estimate, BBT factors). Old links (`mbp.overview`, `mbp.sitelist`, `mbp.placement`, …) resolve to the new pages.
- `components/Workspace.jsx` + `lib/workspace.js`: one record set for map and table (page filters → legend → base-camp focus); shared selection `focus` (URL `site=` / `camp=`); row click highlights + flies to the marker, marker click selects the row (page opened, scrolled); "selected record outside filters" state; selection never filters.
- `lib/table.js`: search → sort (stable) → page as pure functions shared by the table, the CSV export and the tests.
- `lib/dispatch.js` + Site panel: which MBP to send for one outage, on the existing engine (candidatesFor / selectMbp), outcomes before BBT / after BBT / no MBP in reach / all marked busy / no MBP needed / cannot decide; busy = marked by hand (no live availability).
- Resource Planning: scenario baseline now equals the KPI layer (neighbour NOP camps kept, evidence rule applied); site-change table (gain / lose reach, ETA before → after) with CSV, connected to the map.
- Battery Risk page: measured / estimated / design BBT kept separate with evidence; thresholds 120 / 60 / 30 / dead.
- Secondary pages code-split (loaded when opened). Tests 68 → 72 (WS-1 … WS-8). Audit: `docs/AUDIT_v5.md`.

## v4.2 — review fixes FIX-01 … FIX-17 (one source of truth + build guardrails)
- **basecamp_final** (`lib/basecamp.js`, written to `public/data/basecamps.json` by the build): one row per base camp with `nop` (or "Unassigned / no location"), `area`, `has_location`, `selectable`, `status`. Header, legend, NOP table, lists and KPIs all read it (FIX-01/02). One status per camp, order: no location → no data (area) → no jobs → too few jobs → idle → busy → often late → sometimes late → on time.
- Recommendation lists hold selectable camps only; "Clean up first" panel lists no location / no NOP / no sites / possible duplicate with the reason (FIX-03). Base-camp codes are unique (BPS004-BJI·2).
- Data coverage per AREA (FULL / PARTIAL): "All areas" = FULL areas by default, toggle "areas with partial data"; AREA 4 reach / need / on time = N/A, base-camp status "No data" (FIX-04).
- Reach counts only ACTUAL / ESTIMATED / DERIVED (monthly summary) battery values, basis shown; design BBT (banks × Ah) never used for reach and now calibrated × 0.28 in Config (FIX-05).
- Busy at peak = distinct own base camps on a job (≤ units); build fails otherwise (FIX-06). One definition for BBT unknown / RAN unavailable; the data-quality map is labelled "first missing input" (FIX-07). Coordinates panel covers AREA 4; "N without coordinates (not drawn)" with IDs (FIX-08). Median working time shows its n (FIX-09). Long-outage columns for priority sites and all sites (FIX-10).
- Base-camp merge only with apply = yes AND reviewed_by; review state APPLIED / PENDING / REJECTED; "possible duplicate" badge (FIX-11). The 8 auto-applied merges are now PENDING until reviewed.
- Sources: area, raw, clean, derived from, last record date; AREA 4 rows; freshness badge in the header with a Config threshold (FIX-12/13/14). Placeholder IDs rejected and logged; low-coverage badge (FIX-15). Ticket match % per NOP with ⚠ below 90 % (FIX-16).
- `scripts/kpi_check.mjs` (run by `engine/build.py`) fails the build on any mismatch; tests 55 → 68 with TC-01 … TC-17 (FIX-17).

## v4.1 — one dataset (AREA = filter), 4 MBP tabs with the map as hero, plain language
- AREA 1 + AREA 4 are loaded and merged into ONE dataset (`lib/data.js › loadAll`); **Area** is a filter like NOP, plus a new **Cluster** filter. The model is built per AREA (`buildModelByArea`) so AREA 1 numbers never change when AREA 4 is added; the AREA-wide travel calibration applies to AREA 1 only.
- Header labels removed (snapshot, demo, config hash, AREA buttons). Inactive / off-air / own-genset toggles moved under "Also show".
- MBP menu 9 → 4: **Map** (headline numbers + map, with a "Simulation (drag MBP)" switch on the same screen) · Base camps · Add units? · Site list. Outage scenario, coverage, backtest, dispatch, telemetry stay under `?full=1`.
- Plain wording (ID / EN): "priority sites reachable before the battery runs out", "working time", "often late", "model trusted?", "Jan–Jun" instead of H1, etc.
- Tests 54 → 55 (merged dataset reconciles; AREA 1 unchanged by AREA 4).
- *ID:* Satu dataset (Area jadi filter seperti NOP + filter Cluster), label header dihapus, menu MBP jadi 4 dengan peta sebagai hero, bahasa dibuat sederhana.

## v4.0 — practical: one KPI layer, event-pair need, calibration first, drag-and-drop simulation, AREA 4 in the AREA 1 shape
- **ONE KPI layer** `lib/kpi.js` (every tab reads it) + `scripts/kpi_check.mjs`, run by `engine/build.py`: writes `kpi.json` and **fails the build** when Σ NOP ≠ AREA, a share is outside 0–100 % or served > need.
- **Need coverage** (was "serapan", 133 % / 733 %) = event pairs: PLN outages longer than the site BBT that have a matched MBP job (new `pln_ev.json`), ≤ 100 % by construction; other jobs shown separately.
- **Radius = preference**, not a cut-off: reach = calibrated ETA ≤ BBT within a 250-km cap (`mbp.reach_cap_km`). ETA is **calibrated** per NOP on real take-over → check-in times (`travel.calib`). BKJ358 / PSP542 / BGE163 are now reachable.
- **Calibration gate**: per NOP the model must reproduce the actual on-time within ±5 pp (12/16 NOPs); otherwise no relocation advice (Bengkulu, Dumai, Lampung, Padang Sidempuan).
- **Replay anchored on the actual** (`replayDelta`): no change = actual; only jobs of moved / removed / added camps change.
- **Simulation map (drag & drop)**: drag a base camp, add a unit by clicking the map, remove one — reach before BBT and H1 jobs on time update at once; idle-camp suggestions (gain ≥ 10 jobs and ≥ 1 pp) only when calibrated.
- **Fleet size**: default target = BBT; marginal dark hours per added unit, knee (stop below 25 % of the first unit's benefit), cost per dark hour (unit cost ASSUMED in Config).
- **One base-camp status** (Idle / Busy / Late / Watch / Good / too few jobs / no jobs); percentages only from ≥ 10 judged jobs / decisions; base-camp **codes** instead of names in management views ("show names" toggle).
- Dispatch: PROXY dependency gets weight 0 (re-normalised); audit de-duplicated per camp · site · day. MBP priority: travel distance weight 0 (distance was counted twice).
- BBS: BBS-P1 capped at P2 for sites that meet the availability target; BBT gap vs the 120-min standard (computed design rests on an assumed 100 Ah).
- **Landing story**: P1/P2 outages backed up, idle fleet, battery lever, model vs actual. Navigation: Summary · Base camps · Simulation map · Outage scenario · Fleet size · Site list (coverage / backtest / dispatch / telemetry with `?full=1`). "Suggested locations per NOP" removed.
- **AREA 4** written in the AREA 1 shape (same 80 site columns, BPS as base camps, empty tickets / events) → every screen runs; missing sources show **N/A**. Field-staff screen kept under Data.
- UX: data-age badge, red WHAT-IF banner + reset for edited thresholds, period bar only on tabs that follow it, searchable long dropdowns, precision column removed, unknown-PIC warning (Rantau Prapat: SCD-PALUTA / SCD-PALAS), mobile header (390 px, no horizontal scroll). Tests 49 → 54.
- *ID:* Satu layer KPI + rekonsiliasi saat build, cakupan kebutuhan berbasis pasangan event (≤ 100 %), radius jadi preferensi + ETA terkalibrasi + gate ±5 pp, simulasi drag & drop, armada default BBT + knee + biaya per jam mati, satu status base camp, AREA 4 berformat sama dengan AREA 1 (N/A bila belum ada data).

## v3.8 — AREA 4 (light) and "Data available"
- AREA 1 | AREA 4 switch; AREA 4 overview, availability & causes (weekly W1–W31, monthly Jan–Jul, cluster / kecamatan), battery (BBT Site Details snapshot, with a data warning), field staff & BPS reach (HW Master FME, no personal contact data).
- New pipeline `engine/build_area4.py` → `public/data/a4/`.
- Data & Config › Data available: feature matrix per AREA, loaded sources, next data to send.
- MapView: override props for custom colour modes, card rows, hollow label, base-camp legend title. Tests 48 → 49.
- *ID:* AREA 4 versi ringan dan halaman Data tersedia.

## v3.7.1 — ideal utilisation, radius presets, RC "no battery" flag
- **Ideal utilisation**: need = PLN outages longer than the site BBT (new per-site duration histogram `pln_dur_hist`); serapan kebutuhan = PLN-off jobs at the area sites ÷ need; map colour = under-utilised / under-responding / balanced / above need / high load; on time as second colour; scatter serapan vs occupancy; score serapan 35 · on time 35 · occupancy 30.
- **Radius presets** 20/30/40/60/120 km on MBP overview (still adjustable via slider / Config).
- **RC "Baterai / Tidak Ada Baterai"** jobs flagged ⚑ per base camp (workload only, provisional).
- Dependency from NOP (Berlin) left as is (PROXY + template). Tests 47 → 48.
- *ID:* Utilisasi ideal berbasis kebutuhan (padam > BBT), preset radius, flag RC tidak ada baterai.

## v3.7 — MBP-first, performance, backtest, dispatch, sharper BBS
- Overview (availability) menu hidden from navigation (footer link / `?full=1` shows it); app opens on **MBP overview**.
- **MBP overview**: per-NOP units, sites per MBP, coverage and arrive-before-BBT as share of ALL sites, jobs and on time (actual), base camps coloured by performance on the hero map, short lists, NOP table.
- **MBP performance & utilisation** (proposal, Config `mbp_perf`): occupancy, on time vs site BBT, genset share, capture, score/rank, scatter; MBP detail drawer with site list and latest jobs; map card shows performance.
- **Relocation backtest**: replay of H1 jobs with one base camp moved to a kecamatan site (same cluster by default), colour before → after, *Test all* for under-utilised camps.
- **Dispatch priority**: static score (class + dependency + MBP priority), savable first; operator input of sites down; H1 audit (priority followed, exceptions); dependency template CSV for NOP officers (engine reads `engine/data/site_dependency.csv`).
- **BBS**: action types (tiles, map mode, list filter); new rules R6c/R6d → *check rectifier / LVD / BMS setting* (replacements 1,131 → 680); map legend states colour = BBS priority.
- New output `tickets.json`; tests 43 → 47.
- *ID:* MBP-first, Ringkasan disembunyikan; Ringkasan MBP; performa & utilisasi; backtest relokasi; prioritas dispatch + audit; jenis aksi BBS dan cek setting.

## v3.6 — ops feedback (Ayatullah / Pak Nizar)
- **Fixed genset** (Dapot + New_BBT until the SWFM export arrives): 1,378 ACTIVE sites need no MBP, are not placement targets and are excluded from the default scope (filter *+ fixed genset*, URL `gen=1`); Data quality card lists them.
- **Battery status without RC tickets:** "Tidak Ada Baterai" tickets are a field-check flag; status comes from BBT evidence (`bbt.ticket_sets_status: false`). Responsibility still uses ticket root causes.
- **BBT gap design vs actual** (banks × 100 Ah assumed × DoD ÷ load): BBS map mode, KPI, action-list column.
- **Response target 30 min** (ETA incl. 15 min mobilisation): Coverage KPI + ETA bands; Placement with *Before BBT / 30 / 60 / 120 min* and *MBP-P1/P2 / all active*, kecamatan anchors, up to +100 MBPs; **ideal fleet** = max(reach need, concurrent PLN-off jobs p95).
- **Centre of gravity → kecamatan** per base camp (weights PLN-off duration, short BBT, class, repeated tickets), verdict Move / Fine-tune / Stay, alternatives, regency-change tag.
- **MBP › Productivity** tab: tickets, PLN-off in area, % visit (area), % sites visited, RH total/avg/median, response median, ranking.
- Site drawer: kecamatan, fixed-genset note, ticket flag, fastest ETA. Tests 38 → 43.
- *ID:* Masukan ops: genset tetap dikecualikan, tiket bukan status baterai, gap BBT, target respons 30 mnt + kecamatan + armada ideal, center of gravity → kecamatan, tab produktivitas.

## v3.5 — hero map on every menu, site → cluster → NOP justification
- One hero map per menu (Health, Accountability, MBP, BBS actions, Trend, Data quality) with the same behaviour: click any dot without zooming, legend chips are toggles, card with the site's own reason.
- The legend filters the whole tab (KPIs, charts, tables) with a chip and a link to the same sites in the Site list.
- Level switch Site · Cluster · NOP; bubbles are pies of the site categories; click a bubble → justification panel (breadcrumb, share of problem sites and their hours, clusters of the NOP, top problem sites with their own reason).
- Test: NOP = Σ clusters = Σ sites for every map mode.
- *ID:* Peta utama di setiap menu; legenda memfilter seluruh tab; level Site · Cluster · NOP dengan panel justifikasi yang dihitung dari site.

## v3.4 — period filter and hero map
- Period buttons Daily · Weekly · Monthly · Quarter · Full H1 · Custom with stepper and dates; stored in the URL.
- Observed metrics (availability, downtime by cause, PLN outages, events, responsibility, MBP deployments) follow the period; BBT, priority, actions, dark profile, off-air and coverage stay full H1 (badge).
- New sparse daily files `public/data/period/YYYYMM.json`; tests: H1 from daily = snapshot, Q1 + Q2 = H1, days = month.
- Map: every site on a canvas layer (click without zooming), legend toggles with counts, MBP coverage radius layer, dot size = power downtime.
- *ID:* Filter periode dengan tombol; metrik teramati ikut periode, keputusan tetap H1; peta bisa diklik tanpa zoom, legenda toggle, radius MBP jelas.

## v3.3 — coverage-gap label, engine text in Indonesian, drilldowns
- "Battery OK — MBP coverage gap" label with a link to Placement; CSV column `coverage_gap`.
- All engine text translated to Indonesian in the UI (pattern mapping); CSV stays English; coverage test over every engine string.
- Generic drilldown panel (total + formula, donut, per-NOP bars, "View N sites"); clickable charts; Trend dumbbell chart.
- Minor: unknown view fallback, language persistence in links, drawer PLN vs RAN downtime note, compact Site list fits 1350 px.
- *ID:* Label gap cakupan MBP; teks engine berbahasa Indonesia; panel rincian KPI; grafik bisa diklik; dumbbell Tren.

## v3.2 — navigation, language, consistency
- Two-level navigation (Overview · MBP · BBS · Data & Config); view in the URL; sticky filter bar with scope chip and Reset.
- EN | ID with dictionaries and locale number formats; CSV always English.
- Column 7 = design used by the criteria; computed design separate; missing data "—" with neutral rank; coordinates at source precision; coverage breakdown sums to scope; cumulative relocation; read-only Config with hash.
- *ID:* Navigasi dua level, dua bahasa, konsistensi kolom dan data kosong.

## v3.1 — correctness fixes and fleet size
- Dark site defined per month; trend with primary/secondary signals and Mixed; single battery assessment; supported/unverified DERIVED; off-air flag; per-site BBT design; distance/ETA always to a real MBP; reviewed base-camp merge map; placement & fleet size (ESTIMATED).
- *ID:* Perbaikan definisi dark site, tren, status baterai, off-air; desain BBT per site; penempatan & jumlah armada.

## v3 — hardening
- Navigation following the decision chain; MBP radius and battery survival as hard constraints; two-pass simulation; evidence precedence; P1/P2 never "Monitor"; availability/target/gap everywhere; cause decomposition and responsibility (Observed/Inferred/Unknown); PIC matching with confidence; access classes; worst clusters, trend, Top 15, base-camp signal.
- *ID:* Penguatan aturan MBP dan BBS, urutan bukti, penanggung jawab, analitik dampak.

## v2 and earlier — MVP
- Python pipeline to site-grain JSON, Kaplan-Meier BBT estimation tested on unseen sites, MBP coverage and priority, BBS criteria and action list, correlation, telemetry design (Teltonika FMC920).
- *ID:* MVP: pipeline, estimasi BBT, cakupan dan prioritas MBP, daftar aksi BBS, desain telemetri.
