# 09 · Limitations, assumptions & roadmap

## 1. Known limitations and assumptions

| Item | Status | Effect | How to resolve |
|---|---|---|---|
| **Dependency** (child sites per hub) | PROXY from the "HUB Site" bucket | Hub importance is approximate | Export the transmission topology (hub → child sites) |
| **BBT design** | 120 min management design (PROXY); per-site design uses an **assumed 100 Ah per bank** | Computed design is unvalidated (measured ≈ 25 % of it) | Add Ah/model per battery bank to New_BBT |
| **Battery inspection** | Not in the data | Precedence level 2 is empty | Feed capacity-test / inspection results |
| **Travel time** | Speed model (straight line × 1.35, speed by area, multipliers), not routing | ETAs are indicative; islands have none | Calibrate with telemetry trips or a routing API |
| **MBP availability** | Not known in real time; simulation lets the user mark MBPs busy | Recommendations assume all MBPs are free | MBP telemetry (FMC920) |
| **Cause attribution** | Proportional to hours | Shows coincidence, not causation | Ticket-level root cause for every outage |
| **Responsibility** | Only where tickets have a root cause; otherwise inferred/unknown | Large share inferred (PLN-triggered, not confirmed) | Mandatory root cause in tickets |
| **Monthly-only sources** | BBT monthly summary; PLN monthly fallback for sites without events | Prorated inside a month in the period filter (flagged) | Event-level data for all sites |
| **Period filter range** | Built for Jan–Jun 2026 | New periods need the year/month list in `lib/period.js` | Make the range data-driven |
| **Correlation** | Partly mechanical (censoring) | Not used to estimate BBT | — (documented caveat) |
| **Scope** | AREA1, H1-2026 snapshot; not live | Decisions reflect the snapshot | Scheduled pipeline / API |
| **Config governance** | What-if in the browser only (DEMO) | No server-side approval trail | Operational mode (below) |

## 2. Demo vs operational mode

PBA currently runs in **DEMO** mode. An **operational** mode would add: one approved server-side configuration, user roles, an audit/version trail of configuration changes and an "effective from" date, scheduled data refresh, and sign-in through the corporate identity provider instead of a shared basic-auth password.

## 3. MBP telemetry (Teltonika FMC920)

Design only (see [MBP telemetry design](../MBP_TELEMETRY_DESIGN.md)): GPS location and MBP-on/off for every MBP via 4G, stored as raw points and derived sessions (depart, arrive, on, off, site). Gains: columns 13–14 become ACTUAL, live MBP availability replaces the assumption that all MBPs are free, and travel times are calibrated from real trips. Roll-out: pilot 10–20 MBPs in one NOP for 4–6 weeks, compare with tickets, then scale.

## 4. Integration with Watson (PHP / MySQL)

The interactive parts (map, legend filters, drilldowns, period, roll-up) run in the browser and stay JavaScript in every option; what can move to PHP is the backend, data, login and rule engine.

| Option | Content | Indicative effort | Notes |
|---|---|---|---|
| **A. Embed in Watson** (recommended first) | Watson (PHP/MySQL) provides login, roles and API endpoints returning the same JSON shapes; the built PBA frontend is mounted in a Watson page; the Python pipeline writes to MySQL instead of JSON files | 1–2 weeks | Keeps all features and tests; data no longer in a repo/Vercel |
| **B. Port the rule engine to PHP** | A + `lib/logic.js` rewritten in PHP so other Watson modules (e.g. work orders) can use the decisions; results precomputed and stored in MySQL | + 2–3 weeks | Needs golden tests: PHP output identical to JS on the snapshot; avoid two engines running in parallel |
| **C. Full rewrite** | Server-rendered PHP pages with JS only for maps/charts | 1.5–2.5 months | Highest cost and risk; features rebuilt from scratch |

Rule of thumb: **only one rule engine may decide**. If the engine moves to PHP, the frontend should only read its results.

## 5. Suggested roadmap

1. **Data:** Ah per battery bank, hub topology, mandatory ticket root cause, inspection results.
2. **Operations:** Watson embedding (option A), scheduled refresh, SSO and roles.
3. **Telemetry pilot** in one NOP; feed ACTUAL MBP location/availability.
4. **Governance:** server-side approved configuration with history.
5. **Feedback loop:** record actions taken (replaced, tested, MBP sent) and measure their effect on availability in the next period.
