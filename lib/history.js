// vNext.2 — historical MBP work from the Jan–Jun ticket file (ACTUAL, timestamped). Pure functions shared by the History & Patterns
// page, the Fleet capability panel, scripts/reconcile.mjs and the tests. Nothing here is live data.
//
// Ticket fields (engine/build.py › export_tickets): occ = PLN-off occurrence (minutes from 2026-01-01 00:00 WIB), to = take-over lag,
// arr = check-in − occurrence, job = take-over → genset running-hour stop (h), out = resolution category, rc = root-cause category.
//
// Power-on outcome (REPORTED, from the ticket's "Resolution Action" drop-down + running-hour meter — not telemetry):
//   power_on        resolution "connect to genset" AND running hours > 0 recorded
//   connected_no_rh resolution "connect to genset" but no running hours → outcome not confirmed
//   pln_back        "PLN back on" before the genset was connected (no power-on needed)
//   other_action    other resolution (refuel, token, rectifier, …)
//   no_checkin      no check-in time → the visit / outcome cannot be confirmed (shown as missing, never as failure)
// Power-on is never inferred from visit counts.
import { isNum } from "./logic.js";
import { judgeTicket } from "./mbpperf.js";

export const OUTCOMES = ["power_on", "connected_no_rh", "pln_back", "other_action", "no_checkin"];
export const CATEGORIES = ["P", "B", "S", "O"];            // PLN off · battery · power rental · other (ticket root cause)
export const JUDGE = ["ontime", "late", "bbt_unknown", "no_arrival", "not_pln"];   // keys distinct from OUTCOMES
export const T0 = Date.UTC(2026, 0, 1) - 7 * 3600e3;        // 2026-01-01 00:00 WIB in UTC ms
export const PERIOD_DAYS = 181;

export function ticketOutcome(k) {
  if (k.out === "N") return "no_checkin";
  if (k.out === "P") return "pln_back";
  if (k.out === "G") return isNum(k.job) && k.job > 0 ? "power_on" : "connected_no_rh";
  return "other_action";
}
/** calendar month (1–12, WIB) and ISO-like week index from the start of the period */
export const monthOf = (occ) => new Date(T0 + 7 * 3600e3 + occ * 60e3).getUTCMonth() + 1;
export const weekOf = (occ) => Math.floor(occ / (7 * 1440));
export const dayOf = (occ) => Math.floor(occ / 1440);

/** one enriched row per ticket (site joined), no recount of anything else */
export function enrichTickets(tickets, sitesById) {
  return tickets.map((k) => {
    const s = sitesById.get(k.site) || null;
    return { ...k, _s: s, outcome: ticketOutcome(k), judge: judgeTicket(k, s), month: monthOf(k.occ), week: weekOf(k.occ), site_class: s?.site_class || null,
      nop: s?.nop || null, matched_site: !!s };
  });
}

/** filters shared by the timeline, the hotspot map and the capability table (one record set) */
export function filterTickets(rows, { months = null, nop = null, camps = null, classes = null, cats = null, outcomes = null } = {}) {
  return rows.filter((r) => (!months || (r.month >= months[0] && r.month <= months[1])) && (!nop || nop === "All NOPs" || r.nop === nop)
    && (!camps || camps.includes(r.mbp)) && (!classes || !classes.length || classes.includes(r.site_class))
    && (!cats || !cats.length || cats.includes(r.rc)) && (!outcomes || !outcomes.length || outcomes.includes(r.outcome)));
}

const med = (a) => { if (!a.length) return null; const v = [...a].sort((x, y) => x - y), h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };

/** timeline buckets (week or month) with outcome counts; every bucket of the period is present (zero = no jobs, not missing) */
export function timeline(rows, by = "week") {
  const key = by === "month" ? (r) => r.month : (r) => r.week;
  const keys = by === "month" ? [1, 2, 3, 4, 5, 6] : Array.from({ length: Math.ceil(PERIOD_DAYS / 7) }, (_, i) => i);
  const B = new Map(keys.map((k) => [k, { k, n: 0, ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])), ontime: 0, late: 0, judged: 0 }]));
  for (const r of rows) { const b = B.get(key(r)); if (!b) continue; b.n++; b[r.outcome]++; if (r.judge === "ontime") { b.ontime++; b.judged++; } else if (r.judge === "late") { b.late++; b.judged++; } }
  return [...B.values()].map((b) => ({ ...b, ontime_rate: b.judged ? b.ontime / b.judged : null }));
}

/** capability profile per base camp: sample counts, on time (same rule as the KPI layer), power-on outcomes, outage categories,
 *  arrival / running-hour medians. Rates are null below minN judged / outcome-known jobs (shown as "few", not 0). */
export function capability(rows, { minN = 10 } = {}) {
  const by = new Map();
  for (const r of rows) {
    const c = by.get(r.mbp) || by.set(r.mbp, { mbp_id: r.mbp, jobs: 0, sites: new Set(), arr: [], rh: [], ...Object.fromEntries(JUDGE.map((j) => [j, 0])), ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])), ...Object.fromEntries(CATEGORIES.map((x) => [`rc_${x}`, 0])) }).get(r.mbp);
    c.jobs++; c.sites.add(r.site); c[r.judge]++; c[r.outcome]++; c[`rc_${r.rc}`] = (c[`rc_${r.rc}`] || 0) + 1;
    if (isNum(r.arr)) c.arr.push(r.arr); if (r.outcome === "power_on") c.rh.push(r.job);
  }
  return [...by.values()].map((c) => {
    const judged = c.ontime + c.late, known = c.jobs - c.no_checkin;      // power-on rate over jobs with a confirmed visit
    // running-hour entries heaped at ~4 h (3.9–4.1) — a data-entry pattern seen in some NOPs; flagged, not corrected
    const heap = c.rh.length ? c.rh.filter((v) => v >= 3.9 && v <= 4.1).length / c.rh.length : null;
    return { ...c, sites: c.sites.size, arr: undefined, rh: undefined, judged, rh_heap: heap, ontime_rate: judged >= minN ? c.ontime / judged : null,
      outcome_known: known, power_on_rate: known >= minN ? c.power_on / known : null, arr_median: med(c.arr), rh_median: med(c.rh), rh_total: c.rh.reduce((a, v) => a + v, 0) };
  });
}

/** demand hotspots: jobs aggregated per site (where the work actually happened) — NOT a deployment recommendation */
export function hotspots(rows) {
  const by = new Map();
  for (const r of rows) { if (!r._s || !isNum(r._s.lat)) continue; const h = by.get(r.site) || by.set(r.site, { site: r._s, jobs: 0, power_on: 0, late: 0, rh: 0 }).get(r.site);
    h.jobs++; if (r.outcome === "power_on") { h.power_on++; h.rh += r.job || 0; } if (r.judge === "late") h.late++; }
  return [...by.values()];
}

/** totals for the history scorecards (same denominators as the table) */
export function historyTotals(rows) {
  const t = { jobs: rows.length, ...Object.fromEntries(JUDGE.map((j) => [j, 0])), ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])), unmatched_site: 0 };
  for (const r of rows) { t[r.judge]++; t[r.outcome]++; if (!r.matched_site) t.unmatched_site++; }
  t.judged = t.ontime + t.late; t.ontime_rate = t.judged ? t.ontime / t.judged : null;
  t.outcome_known = t.jobs - t.no_checkin; t.power_on_rate = t.outcome_known ? t.power_on / t.outcome_known : null;
  return t;
}
