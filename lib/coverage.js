// Bucket 2 (2026-10-14) — why a priority site is NOT reached before its battery runs out. Pure functions over the existing model
// fields (lib/logic.js › buildModel / computeCoverage / reachOk); the reach-before-BBT calculation itself is unchanged.
//
// Reach tab (same split as lib/kpi.js › reachSplit, lib/drill.js › reach_p12):
//   ok  = reachOk(s) · unv = BBT evidence not in REACH_EVIDENCE (cannot be evaluated) · no = everything else
// Reasons for "no" — ALL applicable ones are kept; the display reason is the first in this fixed order:
//   island        access_class = island → no road ETA (sea logistics not modelled)
//   beyond        no base camp within the search limit (reach_cap_km) → not covered
//   battery_short effective BBT ≤ mobilisation time → no MBP can arrive in time, even from next door (a battery problem)
//   too_far       a base camp is in reach but its ETA > BBT
import { isNum, reachOk, REACH_EVIDENCE, travelMinutes } from "./logic.js";

export const REACH_TABS = ["ok", "no", "unv"];
export const REASONS = ["island", "beyond", "battery_short", "too_far"];
export const isP12 = (s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2";

export function reachTab(s) {
  if (reachOk(s)) return "ok";
  if (!REACH_EVIDENCE.has(s.battery?.display?.evidence)) return "unv";
  return "no";
}

/** all applicable reasons for a not-reached site (empty for ok / unv) */
export function reachReasons(s, cfg) {
  if (reachTab(s) !== "no") return [];
  const mob = cfg?.travel?.mobilization_minutes, R = [];   // without cfg (map-mode fallback) battery_short cannot be judged → skipped
  if (s.access_class === "island") R.push("island");
  if (!s.covered) R.push("beyond");
  const short = isNum(mob) && isNum(s.bbt_effective_min) && s.bbt_effective_min <= mob;
  if (short) R.push("battery_short");
  if (s.covered && s.access_class !== "island" && !short) R.push("too_far");
  if (!R.length) R.push("too_far");   // covered, ETA > BBT (or no feasible ETA) — the generic case
  return R;
}
export const reachReason = (s, cfg) => reachReasons(s, cfg)[0] || null;

/** ETA − BBT in minutes where both exist (never fabricated) */
export function etaGap(s) {
  const e = isNum(s.eta_min) ? s.eta_min : isNum(s.dist_eta_min) ? s.dist_eta_min : null;
  return isNum(e) && isNum(s.bbt_effective_min) && reachTab(s) !== "unv" ? e - s.bbt_effective_min : null;
}

/** the n nearest located base camps with the existing travel model (indicative for islands). Nearest ≠ best assignment. */
export function nearestCamps(s, cfg, n = 3) {
  return (s.coverage?.inRadius || []).slice(0, n).map((x) => {
    const eta = travelMinutes(x.km, s, cfg, null, { indicative: true });
    return { mbp_id: x.mbp_id, km: x.km, nop: x.nop, eta, indicative: s.access_class === "island", before: isNum(eta) && isNum(s.bbt_effective_min) ? eta <= s.bbt_effective_min : null };
  });
}

/** counts of the reach tabs and of the display reasons (P1/P2 only) */
export function reachBreakdown(sites, cfg) {
  const tab = { ok: 0, no: 0, unv: 0 }, reason = Object.fromEntries(REASONS.map((r) => [r, 0])), any = Object.fromEntries(REASONS.map((r) => [r, 0]));
  for (const s of sites) { if (!isP12(s)) continue; const k = reachTab(s); tab[k]++; if (k === "no") { const R = reachReasons(s, cfg); reason[R[0]]++; for (const r of R) any[r]++; } }
  return { tab, reason, any };
}
