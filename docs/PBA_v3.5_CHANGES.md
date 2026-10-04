# PBA v3.5 — hero map per menu, site → cluster → NOP justification


- **One hero map per menu**, same behaviour everywhere (click any dot without zooming, legend chips = toggles, card with the site's own reason):
  Health (availability vs target / main cause; follows the period), Accountability (responsible party; ring = not confirmed by a ticket), MBP (unchanged), BBS actions (BBS batch / battery status; ring = status not measured), Trend (cluster trend, default level Cluster), Data quality (first missing input).
- **Legend filters the whole tab**: hiding a category removes those sites from the tab's KPIs, charts and tables; a chip says how many sites are used and links to the same sites in the Site list (`?sel=map_<mode>~keys`).
- **Level switch Site · Cluster · NOP.** Bubbles are pies of the site categories; every number is a count or sum over the unit's sites (`lib/rollup.js`). Click a bubble → justification panel: AREA › NOP › cluster breadcrumb, share of problem sites and the hours they carry, clusters of the NOP (worst first, click to drill down), and the top problem sites with their **own one-line reason** (click → site drawer). "View N problem sites" and "Filter dashboard to NOP".
- Test `v3.5` checks, for every map mode, that NOP = Σ clusters = Σ sites (counts, problem sites, hours) and that the drivers listed are that NOP's problem sites.
