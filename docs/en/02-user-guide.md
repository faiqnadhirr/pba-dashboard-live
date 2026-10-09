# 02 · User guide

This guide walks through every screen. Screens are in Indonesian by default; switch with **EN | ID** at the top right. Tab names below are given as *English (Indonesian)*.

## 1. Screen layout

```text
┌ PBA — Power Backup Analytic │ Snapshot 2026-01-01 → 2026-06-30 │ DEMO │ cfg hash │ Overview · MBP · BBS · Data & Config │ refresh │ EN|ID ┐
├ sub-tabs of the active menu ───────────────────────────────────────────────────────────────────────────────────────────────────────┤
├ NOP ▾ │ Class chips │ ☐ + inactive │ ☐ + off-air (180) │ ☐ + fixed genset (1,368) │           Scope: 18,407 sites · All NOPs │ Reset ┤
├ PERIOD ⓘ  Daily · Weekly · Monthly · Quarter · Full H1 · Custom   ◀ May 2026 ▶            BBT, priority & actions = full H1     ┤
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  [legend-filter chip, when active]
  KPI cards (click ↗ for the breakdown)
  Hero map (Site · Cluster · NOP)
  Charts and tables of the tab
```

- **Header badges.** *Snapshot* = the data period. *DEMO* = config changes stay in your browser. *cfg xxxxxx* = hash of the active configuration (red with ✎ when you changed it), so two people can confirm they look at the same rules. *Last pipeline refresh* = when the data was built (the data is a snapshot, never "live").
- **Filter bar (sticky).** It applies to every tab:
  - **NOP** — one NOP or all. The number in brackets is the site count in scope.
  - **Class** — Diamond, Platinum, Gold, Silver, Bronze (multi-select).
  - **+ inactive** — include sites that are not active in Dapot.
  - **+ off-air** — include sites flagged as suspected off-air / dismantled / data issue (excluded by default; see [04 §13](04-methodology.md#13-off-air--data-issue-flag)).
  - **+ fixed genset** (v3.8) — include sites with a fixed genset (excluded by default: they back themselves up, so they need no MBP and are left out of PLN-off/MBP analysis; see [04 §16](04-methodology.md#16-ops-feedback-v36)). URL `gen=1`.
  - **Scope chip** — what is currently included; **Reset filter** clears NOP, class, toggles, period and Site-list presets.
- **KPI badges.** *filtered* = follows the filter bar. *portfolio* = whole AREA1 regardless of the filter (used for statistics that need many sites, e.g. correlation). *full H1* (amber) = this figure depends on BBT/priority/coverage, which always use the full snapshot even when a shorter period is selected.

## 2. Period filter

Buttons: **Daily · Weekly · Monthly · Quarter · Full H1 · Custom**.

- Daily / Weekly / Monthly / Quarter show a stepper **◀ label ▶** to move to the previous/next period. Weeks run Monday–Sunday (the first week is 1–4 Jan).
- **Custom** shows two date fields (1 Jan – 30 Jun 2026) and the number of days.
- The period is stored in the URL (`?per=…`), so a shared link opens the same period.

**What follows the period:** availability and gap, downtime by cause, power downtime, PLN outage count and hours, mains-fail events, responsibility from power tickets, MBP deployments and backup hours.
**What always uses full H1:** BBT and battery status, MBP/BBS priority, recommended actions, dark-site profile, off-air flag, MBP coverage and assignment. These need all the evidence; on short periods they would jump around. Cards that depend on them carry the *full H1* badge.
**Tabs that ignore the period** (a blue note says so): Trend (fixed Q1 vs Q2), Simulation, Placement, BBT estimation, Correlation, Telemetry, Config.

The monthly charts on Health highlight the selected months.

## 3. Hero map (all menus)

Every menu opens with a map of all sites in scope. The behaviour is the same everywhere.

| Control | What it does |
|---|---|
| **Click a dot** | Opens a card with the site's key figures and **"Why this colour"** — the site's own one-line reason. Works at any zoom (7-px click tolerance), no need to zoom in first. |
| **Hover a dot** | Tooltip with the site and its reason. |
| **Colour by ▾** | Switches the map mode for that tab (e.g. Health: *Availability vs target* or *Main cause of downtime*). |
| **Legend chips** | Each category is a toggle with its site count. A hidden category is struck through. **Hiding a category filters the whole tab** (KPIs, charts, tables) and shows a chip: "N categories hidden — everything on this tab uses X of Y sites · View X sites → · Show all". |
| **Dot size** | The magnitude for that mode (e.g. network downtime, power downtime, PLN outage hours). |
| **Ring (hollow dot)** | The category rests on weaker evidence — e.g. BBS: status not measured; Accountability: party not confirmed by a ticket; MBP: no MBP within radius. |
| **Site · Cluster · NOP** | Level switch. At Cluster/NOP each bubble is a **pie of its sites' categories**; the number in the centre is the share of problem sites (Trend shows ▼ ◆ ▲ =). Bubble size ∝ number of sites. |
| **Click a bubble** | Opens the **roll-up (justification) panel** — see §6. |
| **"Roll up to: cluster › NOP"** | In a site card, opens the panel of the site's cluster or NOP. |

MBP-specific controls (Coverage & map, Placement): **MBP coverage** checkbox (draws the radius around every base camp, labelled with the km from Config), **Coverage radius** slider (changes the radius everywhere — KPIs, tables, simulation), **MBP base camps** and **Sites** layer toggles. Clicking a base camp shows its radius, the sites it serves (lines) and its workload card.

Map modes per menu:

| Menu | Modes (colour) | Size | Ring |
|---|---|---|---|
| Health | Availability vs target: ≥ 1 pp below / < 1 pp below / meets / no RAN data · Main cause: power / transport / RAN / other / unknown / none | network downtime | — |
| Accountability | Responsible party: PLN, internal, battery, genset, vendor, operational, PLN-triggered (inferred), unknown, none | power downtime | party not confirmed by a ticket |
| MBP | MBP priority · Battery vs design · MBP arrives before BBT? | power downtime | no MBP within radius / status not measured |
| BBS | BBS batch P1–P4 / no action · Battery vs design | PLN outage hours | status not measured |
| Trend | Cluster trend Q1→Q2 (default level Cluster) | Q2 power downtime | — |
| Data quality | First missing input: no RAN → no battery evidence → no PLN data → no MBP history → complete | — | — |

## 4. Menus and tabs

### 4.1 Overview › Health (Kesehatan)
- **KPIs:** Availability (with target and number of sites with RAN data) · Gap vs target (pp) · …of which power (pp of the gap caused by power) · Sites below target · Network downtime (site-hours) · BBT measured. Cards with ↗ open the drilldown (§5).
- **Hero map:** availability vs target per site, or main cause.
- **What causes the availability gap?** Target, actual, gap and the contribution of each cause in pp; the bar segments are clickable → Site list sorted by that cause's hours.
- **Availability vs target per month** and **Power downtime per month** (selected period highlighted).
- **Availability vs target per NOP** (per cluster when a NOP is selected): click a NOP row to set the NOP filter.

### 4.2 Overview › Accountability (Akuntabilitas)
- **KPIs:** Power downtime (hours; drilldown by evidence basis) · share OBSERVED (ticket root cause) · share INFERRED (mains-fail alarms, no root cause) · share UNKNOWN.
- **Hero map:** responsible party per site.
- **Responsibility bar** (click a party → Site list for that party), table of hours/share/sites per party and the **mapping rules** (which ticket values map to which party).
- **Per NOP** table and **Sites** table (expand a row for the plain-language "Why"; open the site drawer).

### 4.3 Overview › Impact (Dampak)
- **Worst clusters — power sites dark:** severity score from the share of dark sites, power downtime per site, availability gap and MBP-P1/P2 dark share (weights shown). Click a cluster for its sites.
- **Top 15 worst sites:** each component (availability gap, power downtime, battery risk, priority, recurrence, criticality) is a 0–1 rank; primary/secondary driver named.

### 4.4 Overview › Trend (Tren)
- Fixed comparison **Q1 (Jan–Mar) vs Q2 (Apr–Jun)**; does not follow the period filter.
- Count chips (Deteriorating / Mixed / Stable / Improving / Insufficient data) and "vs network" chips.
- **Hero map** at Cluster level (▼ ◆ ▲ =). Click a cluster bubble for its reason and the sites with the largest Q2 power downtime.
- **Dumbbell chart** of the 15 clusters with the worst change (Q1 hollow dot → Q2 filled dot); click a cluster to filter the table.
- **Cluster table** with availability Q1/Q2, change, dark sites Q1/Q2, power downtime Q1/Q2 and the "Why" of the label.

### 4.5 MBP › Coverage & map (Cakupan & peta)
- **KPIs:** Sites within MBP radius · MBP arrives before BBT · Late & site goes dark · BBT unknown · Average ETA (assigned) · Under-served base camps (portfolio).
- **Coverage breakdown:** every site counted once in exactly one of five segments (arrive / late & dark / late, no dark evidence / BBT unknown / beyond radius); the five always add up to the scope.
- **Reachable ≤ 30 min** (v3.8): share of sites whose fastest MBP within the radius arrives within the ops response target (default 30 min, ETA **includes** 15 min mobilisation), plus a bar of the ETA bands ≤ 30 · 30–60 · 60–120 · > 120 min · beyond radius · island.
- **Map** with MBP layers (§3). The legend filter here drives the KPIs and breakdown of this tab.
- **Base camp analysis** (decision support): sites assigned, P1+P2, share dark before MBP, average km/ETA, workload, signal (Under-served / Balanced / Possibly over-served) with the criteria met.
- **Suggested locations** for extra MBPs / relocation (straight-line, snapped to a real anchor site).

### 4.6 MBP › Site list (Daftar site)
- **Compact** (default; columns needed to act, no column numbers) and **Detail (14 columns)** — the 14 mandatory management columns in order: 1 Priority · 2 Site ID · 3 Site name · 4 Class · 5 Dependency (PROXY) · 6 NOP · 7 BBT design · 8 BBT measured · 9 PLN outage (frequency) · 10 Outage duration · 11 Distance to MBP · 12 Travel time · 13 Historical MBP · 14 MBP backup time. Detail can also show the *computed design (unvalidated)*.
- **Filter per assigned MBP** (base camp dropdown).
- **Presets from other screens** arrive as a chip "Filter: … · N sites ×" (`?sel=`): drilldown segments, chart clicks, legend filters, roll-up panels. Cause/party presets add an "Hours (filter)" column and sort by it.
- Search box, sortable columns, row click → site drawer, **Export CSV** (English headers; includes `coverage_gap` and context columns).
- The Action column shows **"Battery OK — MBP coverage gap · Placement →"** when the battery needs no action but no MBP can arrive in time (or none is within the radius).

### 4.7 MBP › Simulation (Simulasi)
- **Inputs:** affected sites (Top-N by PLN outage frequency / area outage of a cluster TO with the share of its sites / type site IDs), outage duration, departure hour (traffic), MBPs busy/unavailable.
- **Alternative scenarios:** B — move one base camp to a site location; C — add N pre-positioned MBPs; D — a different outage duration.
- **Scenario comparison:** affected, need MBP, saved, late, unserved (busy / no coverage / island), no feasible MBP, average/max ETA, expected downtime, **priority-weighted coverage**.
- **Recommended allocation** map and table per scenario with the step-by-step "Why" of each assignment (candidates within radius → can arrive before BBT → chosen MBP → fallback).

### 4.8 MBP › Placement & fleet size (Penempatan & jumlah armada) — ESTIMATED
- Pick a NOP, the **target share** of MBP-P1/P2 sites to reach before BBT, and **max additional MBPs**.
- KPIs: MBP-P1/P2 road-reachable sites (+ island and battery-shorter-than-mobilisation, reported separately) · reached now · current base camps · additional MBPs needed · fleet size · relocation candidates.
- Map of proposed locations (NEW-n), **marginal gain** chart/table (+1, +2, … MBPs), proposed anchor sites with coordinates, **relocation candidates** (tested cumulatively), and a fleet-size summary for all NOPs.

- **v3.6 response target.** Buttons *Before BBT · ≤ 30 · ≤ 60 · ≤ 120 min* switch the reach rule from "arrives before the battery runs out" to an ops response-time target; *Target sites* switches between MBP-P1/P2 and **all active sites**. In minute mode up to +100 MBPs can be added. New spots are one representative site **per kecamatan** (an active, non-island site nearest to the kecamatan centre), so a proposal is never in the sea or empty forest; the table shows kecamatan and regency.
- **Ideal fleet (dimensioning).** Ideal = max(current base camps + additional needed for the reach target, **concurrent PLN-off jobs at p95**). Concurrency = MBP jobs running in the same hour in H1 (ticket takeover → RH stop). The all-NOP table adds *Concurrent jobs p95 (max)*, *Ideal fleet* and *Driven by* (reach or concurrent jobs, ⧗).
- **Standby location per base camp — centre of gravity → kecamatan.** For each base camp: weighted centre of its assigned sites (weights: PLN-off duration · short BBT · class · repeated PLN-off tickets), snapped to a kecamatan site in the regencies the camp serves. Verdict *Move / Fine-tune (same kecamatan) / Stay* (a move must add ≥ 2 % of the camp's weight within the target or cut the weighted ETA by ≥ 5 min), sites reachable within the target now → at the recommendation, shift in km, two alternative kecamatan; map with today's camps and ★ recommendations; "other regency" tag when the move crosses a regency border.

### 4.8b MBP › Productivity (Produktivitas) — v3.6
Per base camp, H1 (full period): tickets handled, PLN-off handled, % own visits; **area** = sites assigned to the camp: PLN-off tickets in the area, visited (ticket with a check-in), **% visit (area)** = visited ÷ PLN-off tickets in the area (ops definition), % sites visited; sites served; RH total / average / median; response median (ticket takeover → check-in). KPIs on top, a "lowest 15" ranking with a metric picker (orange = below median) and the full table with CSV export.

### 4.9 MBP › Telemetry pilot (Pilot telemetri)
Design of the Teltonika FMC920 data feed (GPS, MBP-on/off), what PBA gains, the roll-out plan, and a **"try the data model"** box that derives sessions from a CSV in the browser (nothing is uploaded). See [MBP telemetry design](../MBP_TELEMETRY_DESIGN.md).

### 4.10 BBS › Problem criteria & actions (Kriteria masalah & aksi)
- **Criteria note:** design (120 min standard), Critical < 25 %, Degraded < 50 %, Dead ≤ 5 min; evidence precedence; severity floor.
- **KPIs:** sites needing action · BBS-P1…P4 batch cards (drilldown by battery evidence) · inspect & verify.
- **Hero map:** BBS batch or battery status; ring = status not measured; size = PLN outage hours.
- **Battery vs design** table: per status, how many are measured / ticket / unverified / estimated / no data. Click a row or bar segment → sets the Status and Status-basis chips of the action list.
- **Action list:** chips for priority, status, status basis and action; each row expands to the evidence table (Metric → Value → Threshold → Rule) and conflicts; export CSV.

### 4.11 BBS › BBT estimation (Estimasi BBT)
How BBT is calculated (Kaplan-Meier, censoring), the **test on unseen sites** (MAE, bias, status accuracy for each method) and **battery survival curves** by class or battery type (portfolio).

### 4.12 BBS › Correlation (Korelasi)
Spearman ρ of measured BBT with each factor (★ = requested by management) and the correlation table (n, Pearson r, Spearman ρ, strength, ⚠ caveat). Portfolio — not affected by the filter, because small filtered groups give unreliable coefficients.

### 4.13 Data & Config › Data quality (Kualitas data)
Hero map of missing inputs; sources and row counts; **evidence per field** (click a field for its breakdown); unknown PLN / MBP history / 2025 outage counts; missing-value % per field; unmatched IDs; off-air list with reasons; hidden base camps; access classes; BBT design evidence and calibration; DERIVED-UNVERIFIED sites; PIC → base camp matching and possible duplicates; build sanity checks.

### 4.14 Data & Config › Config
Read-only by default. **Edit (what-if)** unlocks priority cut-offs, BBT criteria, unknown handling, travel model, rules, design-from-battery, placement, base-camp signal and dependency mapping. Changes recompute every tab instantly and stay in your browser only (DEMO mode). Export/import JSON to share a proposal; the agreed values are then committed to `engine/config/`. See [05 · Configuration](05-configuration.md).

## 5. Drilldown panel (KPI ↗)

Clicking a KPI card with ↗ (Enter/Space also works, Esc closes) opens a side panel:
- **Total** and its **formula** in words (e.g. "BBT measured = ACTUAL (9,201) + DERIVED backed by site evidence (1,251) = 10,452 of 19,771").
- **Donut** of the evidence composition (≤ 5 segments, counts and %); click a segment to select it.
- **Per NOP** (per cluster when a NOP is selected) stacked bars with the same segments, sorted by the "No data" share.
- **View N sites →** opens the Site list with exactly the same filter (the counts always match).

Available on: BBT measured, Sites below target, Network downtime, …of which power, Power downtime, the four coverage cards, BBS-P1…P4, and every field of Data quality › Evidence per field.

## 6. Roll-up (justification) panel — NOP › cluster › site

Opened by clicking a Cluster/NOP bubble, or "Roll up to" in a site card.
- **Breadcrumb** AREA1 › NOP › cluster (click to move up).
- **Why — built from its sites:** e.g. "59 % of the sites are problem sites (816 of 1,374 …). They carry 188,353 h of the unit's 212,260 h network downtime (89 %)." Every number is a count or sum of the unit's sites.
- **Category bar** of the unit.
- **Clusters in this NOP** (worst first) — click to drill down.
- **Sites behind it** — the top 15 problem sites, largest magnitude first, each with its **own one-line reason** (e.g. "availability 71.59 % vs target 98.29 % (−26.70 pp) · main cause power 945 h of 1,227 h"). Click → site drawer.
- **View N problem sites →** (Site list for the NOP and the problem categories) and **Filter dashboard to NOP**.

## 7. Site drawer

Opened from any site row, map card or panel. It shows, top to bottom: identity (class, NOP, cluster, city, access, VIP, active); MBP and BBS priority with score, battery status and evidence tag; the **recommended action** with the evidence table and priority drivers; availability and causes; power responsibility with "Why"; the 14 mandatory fields; MBP reach (MBPs in radius, nearest, can arrive, assigned MBP, ETA confidence, access basis, assignment basis); battery evidence (status basis, % of design, dark months, BBT basis, events, lower bound, type/age, NE load, no-battery tickets, coordinates and precision); monthly charts, battery events and recent tickets. v3.6: kecamatan in the header; **Fixed genset** tag and note (basis, kVA); **'No battery' ticket(s) — field check** tag (tickets no longer set the battery status); *Fastest MBP ETA (target 30 min)* row. A note explains the difference between *PLN outage duration (PLN records)* and *Power (RAN downtime)* when they differ a lot. When a non-H1 period is selected, a note states which figures follow the period.

## 8. Language, links and exports

- **EN | ID** switches all text, number formats (1.234,5 vs 1,234.5) and engine reasons. The choice is remembered; `?lang=en` in a link overrides it.
- **Every view is a link.** The URL carries the tab, NOP, classes, toggles, period, Site-list preset and language (`?view=mbp.sitelist&nop=NOP%20BATAM&per=m:202605&sel=…&lang=id`). Copy it to share exactly what you see; Back/Forward work.
- **CSV exports** are always English, with `.` as the decimal separator, so they load cleanly into Excel/Python regardless of the UI language.

## 9. v3.7 — MBP-first navigation and new MBP screens

- **The Overview (availability) menu is hidden** from the presentation flow (its data is the most likely to differ from Power BI). It is not deleted: the footer link *Show the Overview menu* (or `?full=1`) brings it back. The app now opens on **MBP › MBP overview**.
- **MBP menu order:** MBP overview · Coverage & map · MBP performance · Relocation backtest · Dispatch priority · Simulation · Placement & fleet size · Site list · Telemetry pilot.
- **MBP overview (management):** KPIs always out of ALL sites in scope (e.g. "935 of 942 sites"), number of MBPs and sites per MBP, jobs and on-time share (actual); a 640-px hero map where **base camps are coloured by performance** (legend 🚚 toggles), click a base camp → card with capability + performance → *Open MBP detail*; three short lists (under-utilised / low on-time / high load); per-NOP table (units, sites, within radius and arrives-before-BBT of all sites, P1/P2, jobs, on time, status counts).
- **MBP performance:** status filter chips, KPIs (jobs, occupancy, on time, genset connected, arrival median), scatter *occupancy vs on time* (click a dot), the formula box, and a ranked table (score = percentile of occupancy 40 % · on time 40 % · genset 20 %).
- **MBP detail drawer:** capability (sites in radius, assigned, ETA, dark before MBP), performance (jobs, occupancy, on time, capture, outcome bar, jobs per month, impact shares), the site list (assigned or served, P1/P2 highlighted, jobs by this camp / on time / by other camps) and the latest jobs; buttons to the backtest and the dispatch list.
- **Relocation backtest:** choose the NOP, the base camp (under-utilised first), the destination (automatic shortlist or any kecamatan) and *move within the same cluster* or the whole NOP. KPIs: on time with today's locations vs after the move, the camp's jobs and occupancy before → after, colour before → after, shift km; scenario map; candidate table; *Test all* for every grey camp of the NOP.
- **Dispatch priority:** choose a base camp; punch list of its sites (assigned + served in H1) ranked savable-first then score; tick or paste the sites that are down now → recommended order with the reason; audit of H1 decisions (priority followed %, exceptions); *Download dependency template* for NOP officers.
- **BBS › actions:** *Action types* tiles (replace · upgrade · check setting · capacity test / verify · collect data · monitor) — a click switches the map to *Action type* and filters the list; new chip *Action type* in the list; the map subtitle states that colour = BBS priority, not site class.

## 10. v3.8 — AREA 4 and "Data available"

- **AREA 1 | AREA 4** switch in the header (URL `area=4`). AREA 4 is a light version built from the data received so far.
- **AREA 4 tabs:** *AREA 4 overview* (KPIs, hero map coloured by availability gap / main cause / battery, per-NOP table) · *Availability & causes* (weekly W1–W31 and monthly Jan–Jul trend, per cluster and per kecamatan) · *Battery (BBT)* (status from the BBT Site Details snapshot, problem list; a warning explains that ≈ 77 % of measured sites show ≤ 5 min and the file period must be confirmed) · *Field staff & BPS* (BPS / TS / PM from the HW Master FME on the map, sites within the radius of a BPS, workload per person) · *Data available*.
- **Data & Config › Data available** (both areas): feature matrix (✔ / ◐ / ✖ per AREA with the missing source), loaded sources, and the next files to send in priority order.
- AREA 4 has no MBP tickets, BBT events, battery inventory or PLN intervals yet, so MBP performance / backtest / dispatch and BBS action rules stay AREA 1 only.
