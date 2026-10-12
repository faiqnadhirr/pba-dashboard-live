// v4.2 — build-time KPI layer, basecamp_final and reconciliation (FIX-01/02/03/06/08/17).
// Usage: node scripts/kpi_check.mjs [dataDir=public/data]   (called by engine/build.py; AREA 4 is read from <dataDir>/a4 when present)
// Writes <dataDir>/kpi.json and <dataDir>/basecamps.json — the SAME functions the dashboard runs (lib/kpi.js, lib/basecamp.js) —
// and exits 1 when any guardrail fails: totals header = Σ legend = Σ NOP table, every ratio within 0–100 %, busy at peak ≤ units,
// evidence per field adds up to the sites, no non-selectable base camp in a recommendation list, no placeholder ID in the output.
import fs from "node:fs";
import path from "node:path";
import { buildModelByArea, bbtUnknown } from "../lib/logic.js";
import { fromColumnar, mergeAreas } from "../lib/data.js";
import { computeKpis, reconcile } from "../lib/kpi.js";
import { mbpPerformance, groupEvents } from "../lib/mbpperf.js";
import { basecampFinal, basecampCounts, areaCoverage, recommendable, LIST_STATUS, BC_STATUS } from "../lib/basecamp.js";

const dir = process.argv[2] || "public/data";
const loadDir = (d) => {
  const rd = (f, dflt) => { const p = path.join(d, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : dflt; };
  const E = { cols: [], rows: [] };
  return { meta: rd("meta.json"), sites: fromColumnar(rd("sites.json")), mbps: rd("mbps.json", []), fam: fromColumnar(rd("familiarity.json", E)),
    tickets: fromColumnar(rd("tickets.json", E)), events: fromColumnar(rd("pln_ev.json", E)) };
};
const parts = [{ a: "AREA 1", d: loadDir(dir) }];
if (fs.existsSync(path.join(dir, "a4", "meta.json"))) parts.push({ a: "AREA 4", d: loadDir(path.join(dir, "a4")) });
const D = mergeAreas(parts), cfg = D.meta.config;
const M = buildModelByArea(D.sites, D.mbps, cfg);
const coverage = areaCoverage(D.meta.areas);
const act = M.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
const ev = groupEvents(D.events);
const perf = mbpPerformance(M, D.mbps, D.tickets, cfg, ev);
const BC = basecampFinal(M, D.mbps, perf, cfg, { areas: D.meta.areas, mergeReview: D.meta.mbp?.merge_review || [] });
const K = computeKpis(act, D.mbps, D.tickets, D.events, cfg, { evBySite: ev, perf, unmatchedByNop: D.meta.dq?.ticket_gaps, coverage });
const fullAreas = Object.entries(coverage).filter(([, v]) => v === "FULL").map(([a]) => a);
const KF = computeKpis(act.filter((s) => fullAreas.includes(s.area)), D.mbps.filter((m) => fullAreas.includes(m.area)), D.tickets, D.events, cfg, { evBySite: ev, perf, unmatchedByNop: D.meta.dq?.ticket_gaps, coverage });

const bad = [];
if (new Set(D.mbps.map((m) => m.mbp_id)).size !== D.mbps.length) bad.push("duplicate base-camp IDs across the merged dataset");
bad.push(...reconcile(K).map((x) => `KPI (all areas): ${x}`), ...reconcile(KF).map((x) => `KPI (full-data areas): ${x}`));
// FIX-01 / FIX-02 — header = Σ legend (status) = Σ NOP table (units)
const C = basecampCounts(BC);
const sumStatus = BC_STATUS.reduce((a, k) => a + (C.by[k] || 0), 0), sumNop = K.nops.reduce((a, r) => a + r.mbp, 0);
if (!(C.total === sumStatus && C.total === sumNop && C.total === D.mbps.length)) bad.push(`base camps: header ${D.mbps.length} · table ${C.total} · Σ status ${sumStatus} · Σ NOP ${sumNop}`);
if (BC.some((r) => !BC_STATUS.includes(r.status))) bad.push("base camp with an unknown status");
// FIX-03 — recommendations contain selectable camps only
for (const st of LIST_STATUS) { const L = recommendable(BC, st); if (L.some((r) => !r.selectable)) bad.push(`list ${st} contains a non-selectable base camp`); }
// FIX-17 — evidence per field adds up to the sites; one BBT-unknown definition
const evc = {}; for (const s of act) { const e = s.battery?.display?.evidence || "UNAVAILABLE"; evc[e] = (evc[e] || 0) + 1; }
if (Object.values(evc).reduce((a, b) => a + b, 0) !== act.length) bad.push("BBT evidence does not add up to the sites");
if (act.filter(bbtUnknown).length !== K.area.bbt_unknown) bad.push(`BBT unknown: sites ${act.filter(bbtUnknown).length} ≠ KPI ${K.area.bbt_unknown}`);
// FIX-08 — plotted + not plotted = all sites
const plotted = M.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)).length, noCoord = M.filter((s) => !(Number.isFinite(s.lat) && Number.isFinite(s.lon)));
if (plotted + noCoord.length !== M.length) bad.push("plotted + not plotted ≠ sites");
// FIX-15 — no placeholder ID left in the output
const PH = /^\s*(|-+|X+\d*|N\/?A|NULL|NONE|0+|\?+|TBD|NAN|<NA>)\s*$/i;
const ph = [...M.map((s) => s.site_id), ...D.mbps.map((m) => m.mbp_id)].filter((x) => PH.test(String(x ?? "")));
if (ph.length) bad.push(`placeholder IDs in output: ${ph.slice(0, 5).join(", ")}`);

const r4 = (x) => (typeof x === "number" ? +x.toFixed(4) : x);
const slim = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, r4(v)]));
fs.writeFileSync(path.join(dir, "basecamps.json"), JSON.stringify({ built_at: D.meta.built_at, coverage, total: C.total, by_status: C.by, rows: BC }));
fs.writeFileSync(path.join(dir, "kpi.json"), JSON.stringify({ built_at: D.meta.built_at, coverage, area: slim(K.area), full: slim(KF.area), nops: K.nops.map(slim),
  sites_total: M.length, plotted, not_plotted: noCoord.map((s) => s.site_id), problems: bad }));
const A = KF.area, p = (x) => (x == null ? "—" : (100 * x).toFixed(1) + "%");
console.log(`[kpi] ${Object.entries(coverage).map(([a, c]) => `${a} ${c}`).join(" · ")} · sites ${M.length} (plotted ${plotted}) · base camps ${C.total} ` +
  `(${BC_STATUS.map((k) => `${k} ${C.by[k] || 0}`).join(", ")})`);
console.log(`[kpi] full-data areas: P1/P2 reach ${A.p12_reach}/${A.p12_eval} (${p(A.p12_reach_pct)}; ACTUAL ${A.p12_reach_actual} · ESTIMATED ${A.p12_reach_estimated} · DERIVED ${A.p12_reach_derived}; not verified ${A.p12_unverified}) · ` +
  `long outages P1/P2 ${A.served_p12}/${A.need_p12} · working time median ${p(A.occupancy_median)} of ${A.occupancy_n} units · BBS-P1 ${A.bbs_p1} · setting ${A.setting}`);
if (bad.length) { console.error("[kpi] RECONCILIATION FAILED:\n  " + bad.join("\n  ")); process.exit(1); }
console.log("[kpi] reconciliation OK (header = Σ legend = Σ table, shares 0–100 %, busy ≤ units, lists selectable only)");
