# Changelog / Riwayat versi

Each version lists the main changes (EN) and a short Indonesian summary (ID).

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
