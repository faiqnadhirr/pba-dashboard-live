// Scorecards (2026-10-14) — headline numbers for MBP › Fleet Performance and BBS › Battery Condition.
// Every card = numerator / named denominator; every SITE card has a predicate (SC) so a click opens exactly the counted sites
// (test SC-1). Only existing fields and existing statuses are used; the comparisons below are the only new derivations:
//   expo        average PLN outage per event (pln_total_h ÷ pln_freq, mains-fail alarms) longer than the site's BBT
//   dbl         P1/P2 not reached in time (lib/coverage.js › reachTab = "no") AND battery condition group "act"
//   p12bad      P1/P2 with battery condition group "act"
//   below       measured BBT below the design (= detailed status Dead / Critical / Degraded / Below design — no new threshold)
//   lt30        measured Dead + Critical (the existing 30-min = 25 % threshold)
import { isNum, bbtUnknown } from "./logic.js";
import { reachTab, isP12 } from "./coverage.js";
import { statusGroup, evGroup } from "./bbsgroups.js";

export const isMeasured = (s) => evGroup(s) === "measured";
export const avgOutageMin = (s) => (s.pln_known && (s.pln_freq || 0) > 0 ? (60 * (s.pln_total_h || 0)) / s.pln_freq : null);
const plnBbt = (s) => isNum(avgOutageMin(s)) && !bbtUnknown(s) && isNum(s.bbt_effective_min);   // denominator of expo (all evidence)

export const SC = {
  act: (s) => statusGroup(s) === "act",
  meas: isMeasured,
  below: (s) => isMeasured(s) && ["act", "warn"].includes(statusGroup(s)),
  lt30: (s) => isMeasured(s) && (s.bbt_status === "Dead" || s.bbt_status === "Critical"),
  expo: (s) => plnBbt(s) && isMeasured(s) && avgOutageMin(s) > s.bbt_effective_min,
  expo_all: (s) => plnBbt(s) && avgOutageMin(s) > s.bbt_effective_min,
  p12bad: (s) => isP12(s) && statusGroup(s) === "act",
  dbl: (s) => isP12(s) && reachTab(s) === "no" && statusGroup(s) === "act",
  bbs_p1: (s) => s.bbs_priority_level === "P1",
};
export const SC_KEYS = Object.keys(SC);

const median = (a) => { const v = a.filter(isNum).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const cnt = (S, f) => { let n = 0; for (const s of S) if (f(s)) n++; return n; };

/** all site-based scorecard numbers for one record set (the page scope) */
export function siteScore(sites) {
  const n = sites.length, meas = sites.filter(isMeasured), p12 = sites.filter(isP12), no = p12.filter((s) => reachTab(s) === "no");
  const st = { act: 0, warn: 0, ok: 0, unk: 0 }, ev = { measured: 0, estimated: 0, unverified: 0, none: 0 }, det = {};
  for (const s of sites) { st[statusGroup(s)]++; ev[evGroup(s)]++; det[s.bbt_status || "Unknown"] = (det[s.bbt_status || "Unknown"] || 0) + 1; }
  const dbl = sites.filter(SC.dbl), p12bad = sites.filter(SC.p12bad);
  // hotspot: share of "act" per NOP (several NOPs in scope) or per cluster (one NOP)
  const nops = new Set(sites.map((s) => s.nop)), gk = nops.size > 1 ? "nop" : "cluster_to", G = new Map();
  for (const s of sites) { const g = s[gk] || "—"; const r = G.get(g) || G.set(g, { g, n: 0, act: 0 }).get(g); r.n++; if (SC.act(s)) r.act++; }
  const hot = [...G.values()].filter((r) => r.n >= 30).map((r) => ({ ...r, share: r.act / r.n })).sort((a, b) => b.share - a.share || b.act - a.act).slice(0, 3);
  const pln = sites.filter(plnBbt);
  return {
    n, st, ev, det, meas_n: meas.length, bbt_med_meas: median(meas.map((s) => s.bbt_effective_min)),
    below: cnt(sites, SC.below), lt30: cnt(sites, SC.lt30),
    expo: cnt(sites, SC.expo), expo_den: cnt(meas, plnBbt), expo_all: cnt(sites, SC.expo_all), pln_bbt_n: pln.length, no_pln: cnt(sites, (s) => !s.pln_known),
    outage_med: median(sites.map(avgOutageMin)),
    p12: p12.length, p12bad: p12bad.length, p12bad_meas: cnt(p12bad, isMeasured),
    p12_no: no.length, dbl: dbl.length, dbl_meas: cnt(dbl, isMeasured),
    bbs_any: cnt(sites, (s) => !!s.bbs_priority_level), bbs_p1: cnt(sites, SC.bbs_p1),
    replace: cnt(sites, (s) => s.action_type === "REPLACE"), upgrade: cnt(sites, (s) => s.action_type === "UPGRADE"), data: cnt(sites, (s) => s.action_type === "DATA"),
    hot, hot_by: gk,
  };
}
