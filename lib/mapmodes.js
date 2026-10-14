// v3.5 — map modes (pure, no React / Leaflet). One category key per SITE; everything above the site (cluster, NOP, AREA)
// is a roll-up of these site keys, so every colour on the map can be traced back to individual sites.
//   keys : legend order, worst first      bad : keys that count as "problem" for the roll-up share
//   key  : site → category                size: site → magnitude (dot size / roll-up weight; unit in `sizeUnit`)
//   hollow: site → true when the site's category rests on weaker evidence (drawn as a ring)
import { isNum, RESP_POWER, ACTION_TYPES, bbtUnknown, ranUnavailable, reachOk, REACH_EVIDENCE } from "./logic.js";
import { reachTab, reachReason } from "./coverage.js";
import { statusGroup } from "./bbsgroups.js";

const CAUSES = ["power", "transport", "ran", "other"];
const causeH = (s, c) => Math.max(0, s[`ran_${c}_down_h`] || 0);
export const dominantCause = (s) => {
  if (!((s.ran_outage_h || 0) > 0)) return "none";
  let best = "unknown", bh = 0;
  for (const c of CAUSES) if (causeH(s, c) > bh) { bh = causeH(s, c); best = c; }
  const unk = Math.max(0, s.ran_outage_h - CAUSES.reduce((a, c) => a + causeH(s, c), 0));
  return unk > bh ? "unknown" : best;
};
export const GAP_BIG_PP = 1;   // "far below target" threshold (pp) for the Health map

export const MAP_MODES = {
  // buckets 1–4 (2026-10-14) — display groupings of existing results (no new calculation)
  reach3: { keys: ["no", "unv", "ok"], bad: ["no"], key: (s) => reachTab(s), size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => reachTab(s) === "unv" },
  // _why is attached by the Explorer from lib/coverage.js › reachReason(s, cfg); without it the reason is computed without cfg (no battery_short)
  reachwhy: { keys: ["too_far", "battery_short", "beyond", "island", "unv", "ok"], bad: ["too_far", "battery_short", "beyond", "island"], key: (s) => s._why || (reachTab(s) === "no" ? reachReason(s) : reachTab(s)), size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => reachTab(s) === "unv" },
  bbsgroup: { keys: ["act", "warn", "ok", "unk"], bad: ["act"], key: (s) => statusGroup(s), size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  // MBP (Coverage & map)
  priority: { keys: ["P1", "P2", "P3", "P4"], bad: ["P1", "P2"], key: (s) => s.mbp_priority_level || "P4", size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => !s.covered },
  design: { keys: ["Dead", "Critical", "Degraded", "Below design", "Meets design", "Unknown"], bad: ["Dead", "Critical", "Degraded"], key: (s) => s.bbt_status || "Unknown",
    size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  // v4.2 (FIX-05/07) — same definitions as the KPI layer: unknown = bbtUnknown, arrive = reachOk, unverified = BBT evidence not usable
  survival: { keys: ["late", "beyond", "unverified", "unknown", "arrive"], bad: ["late", "beyond"],
    key: (s) => (bbtUnknown(s) ? "unknown" : !REACH_EVIDENCE.has(s.battery?.display?.evidence) ? "unverified" : !s.covered ? "beyond" : reachOk(s) ? "arrive" : "late"), size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => !s.covered },
  // Overview › Health (follows the period filter)
  gap: { keys: ["big", "small", "meets", "notarget", "nodata"], bad: ["big", "small"],
    key: (s) => (ranUnavailable(s) ? "nodata" : !isNum(s.avail_delta_pp) ? "notarget" : s.avail_delta_pp >= 0 ? "meets" : s.avail_delta_pp <= -GAP_BIG_PP ? "big" : "small"), size: (s) => s.ran_outage_h, sizeUnit: "h" },
  cause: { keys: ["power", "transport", "ran", "other", "unknown", "none"], bad: ["power", "transport", "ran", "other", "unknown"], key: dominantCause, size: (s) => s.ran_outage_h, sizeUnit: "h" },
  // Overview › Accountability (follows the period filter)
  resp: { keys: [...RESP_POWER, "utility_inferred", "unknown", "none"], bad: [...RESP_POWER, "utility_inferred", "unknown"], key: (s) => s.resp?.primary || "none",
    size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => s.resp?.kind === "INFERRED" || s.resp?.kind === "UNKNOWN" },
  // BBS › Actions (BBT / priority = full H1)
  batch: { keys: ["P1", "P2", "P3", "P4", "none"], bad: ["P1", "P2"], key: (s) => s.bbs_priority_level || "none", size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  bbsstatus: { keys: ["Dead", "Critical", "Degraded", "Below design", "Meets design", "Unknown"], bad: ["Dead", "Critical", "Degraded"], key: (s) => s.bbt_status || "Unknown",
    size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  bbtgap: { keys: ["lt25", "p25_50", "p50_80", "ge80", "no_actual"], bad: ["lt25", "p25_50"],
    key: (s) => (s.bbt_gap_ratio == null ? "no_actual"
      : s.bbt_gap_ratio < 0.25 ? "lt25" : s.bbt_gap_ratio < 0.5 ? "p25_50" : s.bbt_gap_ratio < 0.8 ? "p50_80" : "ge80"),
    size: (s) => (s.bbt_gap_min > 0 ? s.bbt_gap_min : 0), sizeUnit: "min", hollow: () => false },   // v4.0 — vs the 120-min standard
  // v3.7 BBS › Actions — what kind of work (high level): replace / upgrade / check setting / test / collect data / monitor / none
  actiontype: { keys: ACTION_TYPES, bad: ["REPLACE", "UPGRADE", "SETTING", "TEST", "DATA"], key: (s) => s.action_type || "NONE", size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  // Overview › Trend (cluster label painted on its sites; key comes from the Trend tab)
  trend: { keys: ["Deteriorating", "Mixed", "Stable", "Improving", "Insufficient data"], bad: ["Deteriorating", "Mixed"], key: (s) => s._trend || "Insufficient data",
    size: (s) => s.q2_power_h, sizeUnit: "h" },
  // Data › Quality — first missing input, in decision order
  dq: { keys: ["no_ran", "no_bbt", "no_pln", "no_hist", "complete"], bad: ["no_ran", "no_bbt", "no_pln", "no_hist"],
    key: (s) => (ranUnavailable(s) ? "no_ran" : bbtUnknown(s) ? "no_bbt" : !s.pln_known ? "no_pln" : !s.mbp_hist_known ? "no_hist" : "complete") },
};
export const MAP_KEYS = Object.fromEntries(Object.entries(MAP_MODES).map(([k, m]) => [k, m.key]));
