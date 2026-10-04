# PBA v3.4 — period filter + hero map


- **Period buttons** (second row of the filter bar): `Daily · Weekly · Monthly · Quarter · Full H1 · Custom`, with ◀ ▶ to step and two date fields for Custom. Stored in the URL (`?per=d:20260512`, `w:20260511`, `m:202605`, `q:2`, `r:20260501-20260520`).
- **What follows the period:** availability and downtime by cause (RAN daily), power downtime, PLN outages (BBT event intervals), mains-fail events, power-ticket responsibility, MBP deployments/RH hours. **What stays full H1** (badge "H1 penuh"): BBT and battery status, MBP/BBS priority, actions, dark-site profile, off-air flag, MBP coverage/assignment. Trend, Simulation, Placement, Estimation, Correlation, Telemetry and Config show a note that they do not follow the period.
- **Data:** `engine/build.py` writes `public/data/period/YYYYMM.json` (sparse site-day series, seconds, ~1 MB gzip per month), loaded only when a period other than H1 is chosen. Sites whose PLN data is the monthly summary are prorated inside a month. Test `v3.4` checks that H1 re-summed from the daily files equals the snapshot, Q1 + Q2 = H1, and the days of May add up to May.
- **Map:** every site on one canvas layer (no "zoom in to click"), 7-px click tolerance, dot size = power downtime, small base-camp squares at far zoom. **Legend chips are toggles** with counts; on Coverage & map the KPIs and breakdown follow the legend, with "View N sites" (`?sel=map_<mode>~keys`). **MBP coverage** checkbox draws the radius around every base camp, labelled with the km from Config.
- New env var for faster rebuilds: `PBA_DAILY_CACHE=/path/daily.pkl` (cache of the daily RAN read).

## v3.4 period filter (no scoring change)

Observed, time-stamped quantities are re-summed over the selected days from `period/YYYYMM.json` (RAN daily wall-clock seconds with the same per-day cap as the monthly figures; merged PLN intervals by start day; mains-fail events by day; tickets by occurrence day). Availability = 1 − outage / (24 h × RAN days present in the period); target = the site's H1 target. Responsibility uses the period's ticket root causes and mains-fail events. BBT (Kaplan-Meier over all events), battery status, priorities and actions are **not** recomputed per period: short windows have too few battery events and would make priorities jump; they are labelled "full H1".
