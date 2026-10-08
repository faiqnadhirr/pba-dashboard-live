# Changelog / Riwayat versi

Each version lists the main changes (EN) and a short Indonesian summary (ID).

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
