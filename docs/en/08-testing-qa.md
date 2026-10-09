# 08 · Testing & QA

PBA has three automatic gates and a manual checklist. All automatic tests run on the **real data snapshot**, so they check the decisions people actually see.

```text
python engine/build.py     → build sanity checks  → npm test (38)  → fails the build on any error
python engine/validate.py  → 25 checks            → docs/VALIDATION_REPORT.md
npm test                   → 47 regression tests on lib/logic.js and the UI helpers
```

## 1. Regression tests (`tests/logic.test.mjs`, `npm test`)

| # | Test | What it guards |
|---|---|---|
| 1 | helpers | percentile rank, dependency proxy, status scale |
| 2 | travel | islands have no ETA; riverine slower than mainland; access never inferred from a missing ETA |
| 3 | A · NTB020 | the assigned MBP arrives before BBT (historical MBP not forced) |
| 4 | B · PMR107 | assignment only within the radius, anywhere |
| 5 | C · AGR132 | measured BBT beats a no-battery ticket; conflict shown; no replenishment |
| 6 | D | P1/P2 never "Monitor"; an ESTIMATED BBT never produces replace/replenish/upgrade |
| 7 | E | per-NOP scopes partition the portfolio (counts, downtime, availability) |
| 8 | F | map has distinct site/MBP markers and independent layer toggles |
| 9 | G | smaller radius → fewer covered sites, never assignment beyond it |
| 10 | H | availability · target · gap consistent at site and aggregate level |
| 11 | I | causes sum to observed downtime; unknown ≥ 0; overlap scaled, not invented |
| 12 | J | cluster trend = Q2 vs Q1 |
| 13 | K | Top 15: components sum to the score, drivers named |
| 14 | Simulation | picked MBP within radius; feasible first; outcomes classified |
| 15 | A1 | trend: availability primary, dark share secondary, disagreement → Mixed |
| 16 | A2 | dark site defined per month; dark share realistic |
| 17 | A3 | no row shows a status that contradicts its displayed BBT basis |
| 18 | A4 | unsupported derived zero BBT: no floor, Inspect & verify, not BBS-P1 |
| 19 | A5 | off-air sites flagged and excluded from the default scope |
| 20 | A6 | battery banks exported (Data quality and correlation use the same field) |
| 21 | B1 | per-site design when banks are known; class fallback only when missing |
| 22 | B2 | distance and ETA filled for located sites (nearest MBP even beyond radius) |
| 23 | B3 | base camp merge map applied |
| 24 | D1 | placement: monotonic marginal gain, real anchor sites, target respected |
| 25 | i18n | EN/ID dictionaries have the same keys; every literal key used exists |
| 26 | 3b | unknown PLN / MBP history is not zero: neutral rank, flagged |
| 27 | 3a | column 7 = design used by the criteria; computed design separate |
| 28 | 3e | coverage breakdown segments add up to the scope |
| 29 | 3f | relocation candidates cumulative and capped |
| 30 | 4 | simulation "Why" uses the same dark minutes as expected downtime |
| 31 | 4 | config hash stable and key-order independent |
| 32 | 1 | navigation: 4 groups, landing = Overview › Health, view in URL |
| 33 | 1a | "No action" with an MBP coverage gap is labelled as such (TBH048) |
| 34 | 1b | every engine string on the snapshot is covered by an Indonesian pattern |
| 35 | 2a | drilldown totals = Site-list filter; ≤ 5 segments; per-NOP sorted by "no data" share |
| 36 | v3.4 period | H1 re-summed from daily files = snapshot; Q1 + Q2 = H1; days add up to the month; decisions unchanged |
| 37 | v3.4 legend | map legend filter = Site-list filter |
| 38 | v3.5 roll-up | for every map mode, NOP = Σ clusters = Σ sites; drivers are that NOP's problem sites |
| 39 | v3.6 fixed genset | genset sites never need an MBP, are out of placement targets |
| 40 | v3.6 BBT gap | ratio = measured ÷ design only for measured batteries with a computed design |
| 41 | v3.6 response target | placement reach now = sites with fastest ETA ≤ 30 min; new spots are kecamatan sites; each step adds reach |
| 42 | v3.6 centre of gravity | recommendation is a real active kecamatan site; never worse on weighted reach |
| 43 | v3.6 exports | concurrency percentiles ordered; productivity counts consistent |
| 44 | v3.7 MBP performance | every job counted once; classes valid; on time judged only on PLN-off jobs; per-NOP sums |
| 45 | v3.7 backtest | replay accounts for every job; a no-op move changes nothing; candidates ranked, same-cluster filter |
| 46 | v3.7 dispatch | savable first, then score; audit only when other jobs were waiting |
| 47 | v3.7 BBS | action types cover every action; young Critical → check setting (R6c) |

## 2. Validation checks (`engine/validate.py`)

25 checks in four groups, written to `docs/VALIDATION_REPORT.md`:
- **Data (6):** one row per site; no null IDs; event dates in the period; RAN covers 6 months, site-month unique; unmatched IDs reported; MBP coordinates inside the Sumatera box.
- **Sanity (8):** RAN power/transport downtime ≤ hours in month; availability 0–100 %; merged PLN intervals do not overlap; PLN hours ≤ period hours; BBT within 0–720 min; cause buckets non-negative; Q1 + Q2 hours ≈ total.
- **Analytics (4):** event totals, MBP deployments and backup hours preserved; KM estimator less biased than the naive median.
- **Decision (7):** access class from Dapot only; uncertain PIC matches not merged; estimates never labelled ACTUAL/DERIVED and vice versa; estimates carry confidence and method; estimate ≥ survived lower bound; no road ETA for islands.

## 3. Build sanity checks (`engine/build.py`)

Correlation n = exported fields · battery banks exported · merged base camps removed · tickets remapped · base camp IDs unique · monthly power series has 6 months · monthly power downtime ≤ hours in month · coordinates keep > 3 decimals where the source has them. Shown in Data quality.

## 4. Manual QA checklist (before sharing a new version)

1. Open Overview › Health in **ID** and **EN**; no untranslated English sentences in ID (except terms such as "dark site", "mains-fail", evidence tags).
2. At **1366 px** width: no horizontal page scroll; the Site list Action column is visible.
3. Click a dot on each hero map at AREA zoom → site card with "Why this colour".
4. Switch to **NOP** level, click a bubble → panel; numbers in the sentence match the category bar; open a cluster and a site.
5. Hide a legend category → chip appears, KPIs change, "View N sites" opens the Site list with the same count.
6. Click a KPI ↗ → drilldown; "View N sites" count = list rows.
7. Period: Monthly ◀ ▶, Daily, Custom; Trend/Simulation show the "does not follow the period" note; *full H1* badges present.
8. Export CSV from the Site list and BBS action list: English headers, `coverage_gap` column present.
9. Copy the URL into a new window → same view, filters, period and language.
10. On Vercel: login prompt appears in an Incognito window.
