// v4.0 — ONE KPI layer. Every headline number shown on any tab is computed here, once, from the model rows + MBP jobs + PLN events.
// scripts/kpi_check.mjs runs the same function at build time and FAILS the build when the per-NOP figures do not add up to the AREA
// figure, or when a share is impossible (> 100 %). Tabs read the result instead of recounting.
import { isNum, quantile, actionType } from "./logic.js";
import { sitePairs, groupEvents, mbpPerformance, modelCheck, perfCfg } from "./mbpperf.js";

const P12 = (s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2";
export const COUNT_KEYS = ["sites", "p12", "reach", "p12_reach", "mbp", "mbp_located", "need", "served", "ontime", "need_p12", "served_p12", "ontime_p12",
  "jobs", "jobs_pln", "jobs_judged", "jobs_ontime", "busy_h", "bbs_p1", "bbs_p2", "setting", "replace", "upgrade", "bbt_unknown", "tickets_unmatched"];

const zero = () => Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
const share = (a, b) => (b ? a / b : null);

/** KPI rows for the AREA and every NOP. sites = model rows already filtered (active, not off-air, not genset-protected by default). */
export function computeKpis(sites, mbps, tickets, events, cfg, { evBySite = null, perf = null, unmatchedByNop = null } = {}) {
  const c = perfCfg(cfg);
  const ev = evBySite || groupEvents(events);
  const pf = perf || mbpPerformance(sites, mbps, tickets, cfg, ev);
  const byId = new Map(sites.map((s) => [s.site_id, s]));
  const units = new Map(), A = zero();
  const row = (n) => units.get(n) || units.set(n, { nop: n, ...zero(), busy: [], conc: [] }).get(n);
  for (const s of sites) {
    const r = row(s.nop || "—"), p = P12(s);
    r.sites++; if (p) r.p12++;
    const ok = !!(s.covered && s.can_arrive_before_bbt);
    if (ok) { r.reach++; if (p) r.p12_reach++; }
    if (s.bbs_priority_level === "P1") r.bbs_p1++; else if (s.bbs_priority_level === "P2") r.bbs_p2++;
    const at = actionType(s.recommended_action);
    if (at === "SETTING") r.setting++; else if (at === "REPLACE") r.replace++; else if (at === "UPGRADE") r.upgrade++;
    if (s.bbt_status === "Unknown" || !isNum(s.bbt_effective_min)) r.bbt_unknown++;
    const pr = sitePairs(ev.get(s.site_id), s);
    if (pr) { r.need += pr.need; r.served += pr.served; r.ontime += pr.ontime; if (p) { r.need_p12 += pr.need; r.served_p12 += pr.served; r.ontime_p12 += pr.ontime; } }
  }
  for (const m of mbps) { const r = row(m.nop || "—"); r.mbp++; if (isNum(m.lat)) r.mbp_located++; const p = pf.get(m.mbp_id);
    if (p) { r.jobs += p.jobs; r.jobs_pln += p.plnoff; r.jobs_judged += p.judged; r.jobs_ontime += p.ontime; r.busy_h += p.busy_h; if (p.jobs) r.busy.push(p.busy); } }
  // concurrent jobs per NOP (actual): at every job start, how many jobs of that NOP were running
  const byNop = new Map();
  for (const k of tickets) { const s = byId.get(k.site); if (!s) continue; const st = k.occ + (isNum(k.to) ? k.to : 0), en = st + 60 * (isNum(k.job) ? k.job : c.default_job_h);
    (byNop.get(s.nop) || byNop.set(s.nop, []).get(s.nop)).push([st, en]); }
  for (const [n, L] of byNop) {
    L.sort((a, b) => a[0] - b[0]); const ends = []; const r = row(n);
    for (const [st, en] of L) { while (ends.length && ends[0] <= st) ends.shift(); let i = ends.findIndex((e) => e > en); if (i < 0) i = ends.length; ends.splice(i, 0, en); r.conc.push(ends.length); }
  }
  if (unmatchedByNop) for (const v of Array.isArray(unmatchedByNop) ? unmatchedByNop : Object.entries(unmatchedByNop).map(([nop, x]) => ({ nop, ...x }))) if (units.has(v.nop)) units.get(v.nop).tickets_unmatched = v.unmatched || 0;
  const calib = modelCheck(sites, mbps, tickets, cfg);
  const fin = (r) => ({ ...r, busy: undefined, conc: undefined,
    reach_pct: share(r.reach, r.sites), p12_reach_pct: share(r.p12_reach, r.p12),
    served_pct: share(r.served, r.need), ontime_pct: share(r.ontime, r.need), p12_ontime_pct: share(r.ontime_p12, r.need_p12), p12_served_pct: share(r.served_p12, r.need_p12),
    extra_jobs: Math.max(0, r.jobs_pln - r.served), jobs_ontime_pct: share(r.jobs_ontime, r.jobs_judged),
    occupancy: share(r.busy_h, r.mbp * c.period_hours), occupancy_median: r.busy.length ? quantile(r.busy, 0.5) : null,
    conc_p95: r.conc.length ? Math.ceil(quantile(r.conc, 0.95)) : null, conc_max: r.conc.length ? Math.max(...r.conc) : null,
    calib: calib[r.nop] || null });
  const nops = [...units.values()].map(fin).sort((a, b) => a.nop.localeCompare(b.nop));
  for (const r of units.values()) for (const k of COUNT_KEYS) A[k] += r[k];
  const allBusy = [...units.values()].flatMap((r) => r.busy);
  const area = { ...fin({ nop: "AREA", ...A, busy: allBusy, conc: [] }), conc_p95: null, conc_max: null, calib: calib.__all,
    calib_ok_nops: nops.filter((r) => r.calib?.ok).length, calib_nops: nops.filter((r) => r.calib).length };
  return { area, nops, byNop: new Map(nops.map((r) => [r.nop, r])) };
}

/** same KPI over a NOP scope (selector): AREA row when "All NOPs", the NOP row otherwise */
export const kpiFor = (K, nop) => (!K ? null : nop === "All NOPs" ? K.area : K.byNop.get(nop) || null);

/** reconciliation: Σ NOP = AREA for every count, no share above 100 %. Returns a list of problems (empty = OK). */
export function reconcile(K) {
  const bad = [];
  for (const k of COUNT_KEYS) { const s = K.nops.reduce((a, r) => a + r[k], 0); if (Math.abs(s - K.area[k]) > 1e-6) bad.push(`${k}: Σ NOP ${s} ≠ AREA ${K.area[k]}`); }
  for (const r of [K.area, ...K.nops]) for (const k of ["reach_pct", "p12_reach_pct", "served_pct", "ontime_pct", "p12_ontime_pct", "jobs_ontime_pct"])
    if (r[k] != null && (r[k] < 0 || r[k] > 1 + 1e-9)) bad.push(`${r.nop}.${k} = ${(100 * r[k]).toFixed(1)} % (outside 0–100 %)`);
  for (const r of [K.area, ...K.nops]) { if (r.served > r.need) bad.push(`${r.nop}: served ${r.served} > need ${r.need}`); if (r.ontime > r.served) bad.push(`${r.nop}: on-time ${r.ontime} > served ${r.served}`); }
  return bad;
}
