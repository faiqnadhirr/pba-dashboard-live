# 01 · Overview

## 1. Purpose

PBA (Power Backup Analytic) turns six months of operational data — site master, RAN availability, BBT battery events, PLN outages, MBP tickets — into **explainable decisions** for power backup in Telkomsel AREA1:

- **MBP response**: which sites need a Mobile Backup Power unit during a PLN outage, which base camp should send it, and whether it can arrive before the site's battery runs out.
- **MBP fleet**: how many MBPs are needed and where to place them (or move them) so that most high-priority sites can be reached in time.
- **BBS action list**: which batteries need replacement, upgrade, a capacity test or verification, in priority batches.
- **Health & accountability**: where availability falls short of target, which cause (power, transport, RAN, other) drives the gap, and who is responsible for power downtime (PLN, internal, battery, genset, vendor, operational).

PBA is **decision support**, not an automatic dispatcher. Every recommendation shows its evidence and rule so a NOP engineer can verify it.

## 2. Users

| User | Typical use |
|---|---|
| **NOP Regional** (main user) | Daily/weekly review of the NOP: problem sites, MBP coverage gaps, battery batches; drill from NOP to cluster to site |
| **Area management** | Portfolio view across NOPs; justify budget for batteries or extra MBPs; compare periods |
| **Analysts** | Validate data, tune thresholds (what-if), export lists, prepare reports |
| **ENOM / Triple-E engineering** | Maintain the pipeline, deploy, extend to Watson |

The layout is designed for desktop screens (works from 1366 px wide). There is no mobile layout.

## 3. Scope of the current snapshot

| Item | Value |
|---|---|
| Area | AREA1 (Sumatera) — 17 NOPs, 37 clusters (TO) |
| Period | 1 Jan – 30 Jun 2026 (H1-2026) |
| Sites (Dapot master) | 20,227; **18,407** in the default scope (active, not flagged off-air, no fixed genset — v3.6); 180 flagged off-air; 1,368 active fixed-genset sites excluded |
| MBP base camps | 319 after the reviewed merge of 8 duplicate pairs (284 with actual coordinates, 6 repaired, 29 without location) |
| BBT battery events | 227,155 (after de-duplication) → 223,857 merged PLN outage intervals |
| MBP / power tickets | 47,210 clean rows; 97.5 % matched to a base camp |
| RAN availability | daily, per site, 6 months (972,565 site-days with downtime) |

## 4. The four menus and the question each answers

| Menu | Tabs | Question |
|---|---|---|
| **Overview** (Ringkasan) | Health · Accountability · Impact · Trend | Where does availability fall short and why? Who caused the power downtime? Which clusters hurt most, and which are getting worse? |
| **MBP** | Coverage & map · Site list · Simulation · Placement & fleet size · Telemetry pilot | Can an MBP reach each site before its battery runs out? What happens in an outage scenario? How many MBPs are needed and where? |
| **BBS** | Problem criteria & actions · BBT estimation · Correlation | Which batteries to fix first and how? How is BBT estimated where it was not measured? How does BBT relate to PLN outages? |
| **Data & Config** | Data quality · Config | How complete and reliable is the data? Which thresholds drive the decisions? |

Each menu opens with a **hero map**: every site as a clickable dot, legend chips that act as filters for the whole tab, and a level switch **Site · Cluster · NOP** whose bubbles are sums of their sites.

## 5. Design principles

1. **Site first, then roll up.** Every KPI, chart and map bubble is a count or sum over sites. A NOP figure can always be opened to its clusters and sites.
2. **Evidence is always visible.** Each value carries a tag — ACTUAL, DERIVED, ESTIMATED, PROXY, UNAVAILABLE — and an estimate never triggers a replacement.
3. **Missing is not zero.** Unknown data shows "—", gets a neutral rank in scores and is listed in Data quality.
4. **One rule engine.** All statuses, priorities and actions are decided in one place (`lib/logic.js`), so every tab, export and test agrees.
5. **Hard constraints are hard.** The MBP radius and "arrive before the battery runs out" are never relaxed silently.
6. **Explain, don't just score.** Each recommendation shows Metric → Value → Threshold → Rule → Action, and a plain-language "Why".
7. **Bilingual.** The whole UI is available in Indonesian (default) and English; CSV exports stay in English.

## 6. How it works (one paragraph)

A Python pipeline (`engine/`) reads the raw files, cleans them, aggregates every source to **one row per site**, estimates BBT with Kaplan-Meier survival analysis and writes compact JSON into `public/data/`. The Next.js web app loads that JSON and computes everything else **in the browser** with one rule engine: battery status, priorities, MBP assignment, action rules, simulation, placement, drilldowns, period filtering and roll-ups. Changing a threshold in the Config tab recomputes all tabs instantly (what-if, kept in the viewer's browser). See [06 · Architecture](06-architecture.md).
