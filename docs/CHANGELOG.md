# Changelog / Riwayat versi

Each version lists the main changes (EN) and a short Indonesian summary (ID).

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
