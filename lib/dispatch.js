// v5.0 — "which MBP should go to this site?" for one site with a PLN outage. Uses the existing engine only:
// candidatesFor (base camps within the reach cap, cost = ETA + familiarity + workload weights, penalty outside the preferred radius)
// and selectMbp (only camps that arrive before the BBT are eligible when any can; otherwise the earliest arrival).
// Busy status is NOT known by the system: the user can mark camps busy by hand, and the result says so.
import { candidatesFor, selectMbp, isNum } from "./logic.js";

export const OUTCOMES = ["no_need", "before", "after", "all_busy", "none_in_range", "unknown"];

/** outageMin = expected outage duration (null = unknown); busy = Set of camp ids the user marked busy; hour = departure hour (rush) */
export function dispatchFor(site, mbps, fam, cfg, { outageMin = null, busy = new Set(), hour = null } = {}) {
  const bbtKnown = site && site.bbt_status !== "Unknown" && isNum(site.bbt_effective_min);
  const bbt = bbtKnown ? site.bbt_effective_min : null;
  if (!site) return { outcome: "unknown", why: "no_site", list: [] };
  if (!isNum(site.lat) || !isNum(site.lon)) return { outcome: "unknown", why: "no_coords", list: [], bbt };
  if (site.access_class === "island") return { outcome: "unknown", why: "island", list: [], bbt };
  const all = candidatesFor(site, mbps, { fam: fam || new Map() }, cfg, hour, new Set()).list;   // every camp in reach, busy or not
  const list = all.map((x) => ({ ...x, busy: busy.has(x.mbp_id), before: bbtKnown && isNum(x.eta_min) ? x.eta_min <= bbt : null }));
  const free = list.filter((x) => !x.busy);
  const pick = free.length ? selectMbp(free, bbtKnown ? bbt : Infinity) : { pick: null, mode: "none" };
  // ranking shown to the user = the engine's order: eligible (before BBT) by cost, then the rest by earliest arrival; busy last
  const elig = new Set((pick.feasible || []).map((x) => x.mbp_id));
  const ranked = [...list].sort((a, b) => (a.busy - b.busy) || ((elig.has(b.mbp_id) ? 1 : 0) - (elig.has(a.mbp_id) ? 1 : 0))
    || (elig.has(a.mbp_id) ? a.cost - b.cost : (a.eta_min ?? 1e9) - (b.eta_min ?? 1e9)));
  ranked.forEach((x, i) => { x.rank = i + 1; x.chosen = pick.pick?.mbp_id === x.mbp_id; });
  let outcome;
  if (bbtKnown && isNum(outageMin) && outageMin <= bbt) outcome = "no_need";
  else if (!list.length) outcome = "none_in_range";
  else if (!free.length) outcome = "all_busy";
  else if (!bbtKnown) outcome = "unknown";
  else outcome = pick.pick && pick.pick.eta_min <= bbt ? "before" : "after";
  return { outcome, why: !bbtKnown ? "bbt_unknown" : null, bbt, list: ranked, pick: pick.pick || null, mode: pick.mode };
}
