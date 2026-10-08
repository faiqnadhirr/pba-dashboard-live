# 06 · Architecture & code

## 1. Stack

| Layer | Technology |
|---|---|
| Pipeline | Python 3.11+ — pandas, polars, numpy, scikit-learn, openpyxl/calamine, pyyaml |
| Web app | Next.js 16 (App Router) · React 19 · Tailwind CSS 3 · Leaflet 1.9 + react-leaflet 5 · Recharts 2 |
| Tests | Node's built-in test runner (`node --test`) on the real data snapshot; Python validation script |
| Hosting | Vercel (static data in `public/data`, basic auth in `proxy.js`) |

There is no database and no server-side business logic: the server only serves files behind a login.

## 2. Repository layout

```text
pba-dashboard/
├─ app/
│  ├─ layout.jsx, globals.css
│  └─ page.jsx              ← shell: header, menus, filter bar, period bar, URL state, model + period overlay, drawers
├─ components/
│  ├─ ui.jsx                ← shared UI: Kpi, Card, DataTable, tags, formatters, site-list columns, ActionLabel
│  ├─ MapView.jsx           ← Leaflet map: canvas site layer, legend toggles, levels Site/Cluster/NOP, MBP layers
│  ├─ MapHero.jsx           ← hero map card + useMapLegend() (legend = tab filter) + LegendChip
│  ├─ mapModes.jsx          ← colours, legend labels and the one-line site reason per map mode
│  ├─ RollupPanel.jsx       ← NOP › cluster › site justification panel
│  ├─ DrillPanel.jsx        ← KPI "Total → breakdown" panel
│  ├─ PeriodBar.jsx         ← period buttons, stepper, custom dates, labels
│  ├─ SiteDrawer.jsx        ← site detail
│  └─ tabs/                 ← one file per tab (Health, Accountability, Impact, Trend, MbpTab, SimTab, Placement,
│                              Telemetry, BbsActions, BbsAnalysis, DataQuality, ConfigTab)
├─ lib/
│  ├─ logic.js              ← THE rule engine (status, priorities, assignment, actions, simulation, placement, analytics)
│  ├─ data.js               ← data access (loadAll, loadDetail) — the only place that fetches /data
│  ├─ period.js             ← period parsing/stepping, loading period files, re-summing, overlay on the model
│  ├─ mapmodes.js           ← map modes: site → category key, magnitude, "problem" keys (pure)
│  ├─ rollup.js             ← site → cluster → NOP roll-up and justification (pure)
│  ├─ drill.js              ← drilldown definitions and Site-list presets (?sel=) (pure)
│  ├─ view.js               ← display helpers (coverage gap)
│  ├─ nav.jsx               ← navigation context and <Go> links
│  ├─ i18n.js, i18n-dicts.js← t(), tv(), language, locale formatting, English for CSV
│  ├─ i18n-engine.js        ← translation of engine (English) text into Indonesian, pattern by pattern
│  └─ maplegend.js          ← legend key order per mode
├─ i18n/en.json, id.json    ← UI dictionaries (same keys; ~1,270 each)
├─ engine/                  ← Python pipeline (see 03)
│  ├─ build.py, validate.py, requirements.txt
│  ├─ config/thresholds.yaml, scoring.yaml, basecamp_merge.csv
│  └─ src/ingestion, normalization, analytics, bbs, mbp, telemetry
├─ public/data/             ← generated JSON (sites, mbps, familiarity, meta, detail/, period/)
├─ tests/logic.test.mjs     ← 38 regression tests
├─ proxy.js                 ← basic auth for every path (when env vars are set)
└─ docs/                    ← this documentation (en/, id/), changelog, telemetry design, validation report
```

## 3. Runtime data flow (browser)

```text
loadAll() ─► data {sites, mbps, familiarity, meta}
              │
cfg (meta.config, or what-if from localStorage)
              │
buildModel(sites, mbps, cfg)  ── lib/logic.js ──►  model: one object per site with every decision
              │                                    (battery, status, coverage, assignment, priorities, action, resp, av …)
period ≠ H1 ? loadPeriodFiles → periodAgg → applyPeriod(model)  ──► pmodel (observed metrics replaced)
              │
filters (inactive, off-air, NOP, class) ──► scope
              │
each tab: useMapLegend(scope) ──► vis (legend filter) ──► KPIs / charts / tables / map / rollup / drill
```

- **One model** is built once per configuration; every tab reads the same site objects.
- `useMemo` keeps recomputation cheap: building the model for ~20k sites takes well under a second; re-summing a period ~0.1 s plus ~0.5 s for the overlay.
- Detail files are loaded lazily per NOP when a site drawer opens; period files per month when a period is selected (cached).

## 4. URL state

All navigation state lives in the query string, so any view can be shared and Back/Forward work:

| Param | Example | Meaning |
|---|---|---|
| `view` | `mbp.sitelist` | Menu.tab; unknown values fall back to the group's first tab with a notice |
| `nop` | `NOP BATAM` | NOP filter |
| `cls` | `Diamond,Gold` | Class filter |
| `inactive`, `offair` | `1` | Include inactive / off-air sites |
| `per` | `m:202605`, `w:20260511`, `d:20260512`, `q:2`, `r:20260501-20260520` | Period (absent = Full H1) |
| `sel` | `bbt_measured~actual`, `cause~power`, `map_gap~big+small` | Site-list preset (drilldown, chart click, legend filter, roll-up) |
| `lang` | `id` / `en` | Language (always carried) |

`page.jsx` builds links with `hrefFor()` and changes state with `navigate()`; components use `<Go to={{view, nop, sel}}>`, which renders a real `<a href>` (middle-click and copy work).

## 5. Internationalisation

- `i18n/en.json` and `i18n/id.json` are flat dictionaries with identical keys (a test enforces parity and that every literal key used in code exists).
- `t(key, vars)` interpolates `{var}`; `tv(prefix, value)` translates enumerations (status, action, cause, party…).
- Number formatting follows the locale (`1.234,5` in ID, `1,234.5` in EN).
- CSV export runs under `withEnglish()`, so headers and values stay English with `.` decimals.
- **Engine text** (rules, reasons, evidence, drivers, assignment basis, simulation steps, trend reasons…) is produced in English by `lib/logic.js` and translated **in the UI** by `lib/i18n-engine.js` (ordered regex patterns → `eng.*` keys). The engine output and CSV are therefore byte-identical in both languages. Test `1b` runs every engine string of the snapshot through the patterns and fails if any segment is left untranslated.

## 6. Key design decisions

| Decision | Why |
|---|---|
| Rule engine in the browser (JS), pipeline only prepares evidence | What-if config recomputes instantly; one source of truth for UI, exports and tests |
| Columnar JSON, lazy detail/period files | ~20k sites load fast; heavy data only on demand |
| Canvas site layer, no clustering | All dots clickable at AREA zoom; fast with 20k points |
| Legend = tab filter; roll-up = sums of sites | Every number on screen can be traced to sites; consistency is testable |
| Frontend translation of engine text | Keeps decisions and CSV unchanged; a coverage test prevents regressions |
| Period overlay instead of a period-aware engine | Observed metrics follow the period; decisions keep full evidence |

## 7. Extending PBA

- **New tab:** add a component under `components/tabs/`, register it in `GROUPS` in `app/page.jsx`, add `nav.*` keys to both dictionaries.
- **New map mode:** add it to `lib/mapmodes.js` (keys worst-first, `bad`, `key`, `size`, `hollow`), colours/labels/reason in `components/mapModes.jsx`, i18n keys `map.mode.*`, `map.size.*`, `map.hollow.*`; pass it in `modes` of `MapHero`. The roll-up test will cover it automatically.
- **New KPI drilldown:** add an entry in `DRILLS` (`lib/drill.js`) and `drill.<id>.title/formula` keys; call `openDrill(id)` from the card.
- **New rule or threshold:** change `lib/logic.js` + YAML; add a regression test; check that `1b` still passes (add an `eng.*` pattern for any new engine sentence).
- **Moving to an API / Watson:** replace the fetches in `lib/data.js` (and `loadPeriodFiles` in `lib/period.js`) with endpoints returning the same JSON shapes. See [09 §4](09-limitations-roadmap.md#4-integration-with-watson-php--mysql).
