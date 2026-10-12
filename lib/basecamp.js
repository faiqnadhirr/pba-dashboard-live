// v4.2 — basecamp_final: ONE table of base camps (after merge) that every widget reads — header, legend, NOP table, lists, KPIs.
// Built once per data snapshot (scripts/kpi_check.mjs writes it to public/data/basecamps.json at build time, and the dashboard
// computes the very same function so a what-if config stays consistent; a test checks both are identical).
// Status is exactly ONE value per base camp, decided in this order (first match wins):
//   noloc (no location) → nodata (AREA without MBP job data) → none (no jobs) → few (< min judged jobs) → under (idle)
//   → high (busy) → low (often late) → watch (sometimes late) → good (on time)
import { isNum } from "./logic.js";
import { perfCfg } from "./mbpperf.js";

export const BC_STATUS = ["noloc", "nodata", "none", "few", "under", "high", "low", "watch", "good"];
export const UNASSIGNED = "Unassigned / no location";
/** recommendation lists may only contain these statuses, and only selectable camps */
export const LIST_STATUS = new Set(["under", "high", "low"]);

/** coverage per AREA: FULL when that AREA has MBP job tickets AND PLN outage events, else PARTIAL */
export function areaCoverage(areas = []) {
  return Object.fromEntries(areas.map((a) => [a.area, a.has_jobs && a.has_events ? "FULL" : "PARTIAL"]));
}

export function statusOf(p, cfg, { hasLoc, coverage }) {
  const c = perfCfg(cfg);
  if (!hasLoc) return "noloc";
  if (coverage === "PARTIAL") return "nodata";
  if (!p || !p.jobs) return "none";
  if ((p.judged || 0) < c.min_jobs || p.ontime_rate == null) return "few";
  if (p.jobs / 6 < c.under_jobs_month_max || p.busy < c.under_busy_max) return "under";
  if (p.busy >= c.high_busy_min) return "high";
  if (p.ontime_rate < c.ontime_low) return "low";
  if (p.ontime_rate < c.ontime_good) return "watch";
  return "good";
}

/** unique, name-free code per base camp: "BPS004-BJI", a second camp with the same code becomes "BPS004-BJI·2" */
function codesFor(ids) {
  const base = (id) => { const p = String(id).split("-"); return /^(BPS|MBP|TS|SCD)\d*$/i.test(p[0]) && p[1] ? (p.length === 2 && p[1].length > 4 ? p[0] : `${p[0]}-${p[1]}`) : String(id).slice(0, 12); };
  const seen = new Map(), out = new Map();
  for (const id of [...ids].sort()) { const b = base(id); const n = (seen.get(b) || 0) + 1; seen.set(b, n); out.set(id, n === 1 ? b : `${b}·${n}`); }
  return out;
}

/** possible duplicates still waiting for review: the PENDING pairs of the merge map (engine/config/basecamp_merge.csv) */
export function pendingDuplicates(mbps, mergeReview = []) {
  const ids = new Set(mbps.map((m) => m.mbp_id)), dup = new Map();
  const add = (a, b, why) => { if (!ids.has(a) || !ids.has(b) || a === b) return; (dup.get(a) || dup.set(a, []).get(a)).push({ with: b, why }); (dup.get(b) || dup.set(b, []).get(b)).push({ with: a, why }); };
  for (const r of mergeReview) if (r.review_state === "PENDING") add(r.keep, r.drop, r.status || "NEEDS REVIEW");
  // camps sharing one position are NOT flagged: several BPS operators often work from one pool. A record that never gets a site
  // (e.g. the second person at BPS004-BJI) is caught by "no sites assigned" instead.
  return dup;
}

/** the table. model = site rows (all AREAs, built per AREA); perf = mbpPerformance map. */
export function basecampFinal(model, mbps, perf, cfg, { areas = [], mergeReview = [] } = {}) {
  const cov = areaCoverage(areas);
  const assigned = new Map();
  for (const s of model) if (s.mbp_assigned) assigned.set(s.mbp_assigned, (assigned.get(s.mbp_assigned) || 0) + 1);
  const dup = pendingDuplicates(mbps, mergeReview);
  const applied = new Map(mergeReview.filter((r) => r.review_state === "APPLIED").map((r) => [r.keep, r]));
  const codes = codesFor(mbps.map((m) => m.mbp_id));
  return mbps.map((m) => {
    const p = perf.get(m.mbp_id), hasLoc = isNum(m.lat) && isNum(m.lon);
    const coverage = cov[m.area] || "FULL";
    const sites = assigned.get(m.mbp_id) || 0, d = dup.get(m.mbp_id) || [];
    const reasons = [];
    if (!hasLoc) reasons.push("noloc");
    if (!m.nop) reasons.push("nonop");
    if (hasLoc && sites === 0) reasons.push("nosites");
    if (d.length) reasons.push("dup");
    const status = statusOf(p, cfg, { hasLoc, coverage });
    return { mbp_id: m.mbp_id, code: codes.get(m.mbp_id), pic_name: m.pic_name || null, area: m.area || null, coverage,
      nop: m.nop || UNASSIGNED, has_location: hasLoc, sites_assigned: sites, selectable: reasons.length === 0, clean_reasons: reasons,
      dup_with: d.map((x) => x.with), dup_why: d.map((x) => x.why), dup_state: d.length ? "PENDING" : applied.has(m.mbp_id) ? "APPLIED" : null,
      status, jobs: p?.jobs ?? 0, judged: p?.judged ?? 0, busy: p?.busy ?? 0, ontime_rate: p?.ontime_rate ?? null };
  });
}

/** counts per status and per NOP — the only aggregation the UI uses for base camps */
export function basecampCounts(rows) {
  const by = {}, nop = new Map();
  for (const r of rows) {
    by[r.status] = (by[r.status] || 0) + 1;
    const x = nop.get(r.nop) || nop.set(r.nop, { nop: r.nop, area: r.area, units: 0, located: 0, ...Object.fromEntries(BC_STATUS.map((k) => [k, 0])) }).get(r.nop);
    x.units++; if (r.has_location) x.located++; x[r.status]++;
  }
  return { total: rows.length, by, byNop: nop };
}

/** recommendation list of one status: selectable camps only (no location / no NOP / no sites / possible duplicate → cleanup panel) */
export const recommendable = (rows, status) => rows.filter((r) => r.status === status && r.selectable);
export const needsCleanup = (rows) => rows.filter((r) => !r.selectable);
