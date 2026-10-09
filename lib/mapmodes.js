// v3.5 — map modes (pure, no React / Leaflet). One category key per SITE; everything above the site (cluster, NOP, AREA)
// is a roll-up of these site keys, so every colour on the map can be traced back to individual sites.
//   keys : legend order, worst first      bad : keys that count as "problem" for the roll-up share
//   key  : site → category                size: site → magnitude (dot size / roll-up weight; unit in `sizeUnit`)
//   hollow: site → true when the site's category rests on weaker evidence (drawn as a ring)
import { isNum, RESP_POWER, ACTION_TYPES } from "./logic.js";

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
  // MBP (Coverage & map)
  priority: { keys: ["P1", "P2", "P3", "P4"], bad: ["P1", "P2"], key: (s) => s.mbp_priority_level || "P4", size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => !s.covered },
  design: { keys: ["Dead", "Critical", "Degraded", "Below design", "Meets design", "Unknown"], bad: ["Dead", "Critical", "Degraded"], key: (s) => s.bbt_status || "Unknown",
    size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  survival: { keys: ["late", "beyond", "unknown", "arrive"], bad: ["late", "beyond"],
    key: (s) => (!s.covered ? "beyond" : s.bbt_status === "Unknown" ? "unknown" : s.can_arrive_before_bbt ? "arrive" : "late"), size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => !s.covered },
  // Overview › Health (follows the period filter)
  gap: { keys: ["big", "small", "meets", "nodata"], bad: ["big", "small"],
    key: (s) => (!isNum(s.avail_delta_pp) ? "nodata" : s.avail_delta_pp >= 0 ? "meets" : s.avail_delta_pp <= -GAP_BIG_PP ? "big" : "small"), size: (s) => s.ran_outage_h, sizeUnit: "h" },
  cause: { keys: ["power", "transport", "ran", "other", "unknown", "none"], bad: ["power", "transport", "ran", "other", "unknown"], key: dominantCause, size: (s) => s.ran_outage_h, sizeUnit: "h" },
  // Overview › Accountability (follows the period filter)
  resp: { keys: [...RESP_POWER, "utility_inferred", "unknown", "none"], bad: [...RESP_POWER, "utility_inferred", "unknown"], key: (s) => s.resp?.primary || "none",
    size: (s) => s.ran_power_down_h, sizeUnit: "h", hollow: (s) => s.resp?.kind === "INFERRED" || s.resp?.kind === "UNKNOWN" },
  // BBS › Actions (BBT / priority = full H1)
  batch: { keys: ["P1", "P2", "P3", "P4", "none"], bad: ["P1", "P2"], key: (s) => s.bbs_priority_level || "none", size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  bbsstatus: { keys: ["Dead", "Critical", "Degraded", "Below design", "Meets design", "Unknown"], bad: ["Dead", "Critical", "Degraded"], key: (s) => s.bbt_status || "Unknown",
    size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  bbtgap: { keys: ["lt25", "p25_50", "p50_80", "ge80", "no_actual", "no_design"], bad: ["lt25", "p25_50"],
    key: (s) => (s.bbt_design_evidence === "PROXY" ? "no_design" : s.bbt_gap_ratio == null ? "no_actual"
      : s.bbt_gap_ratio < 0.25 ? "lt25" : s.bbt_gap_ratio < 0.5 ? "p25_50" : s.bbt_gap_ratio < 0.8 ? "p50_80" : "ge80"),
    size: (s) => (s.bbt_gap_min > 0 ? s.bbt_gap_min : 0), sizeUnit: "min", hollow: (s) => s.bbt_design_evidence === "ESTIMATED" },
  // v3.7 BBS › Actions — what kind of work (high level): replace / upgrade / check setting / test / collect data / monitor / none
  actiontype: { keys: ACTION_TYPES, bad: ["REPLACE", "UPGRADE", "SETTING", "TEST", "DATA"], key: (s) => s.action_type || "NONE", size: (s) => s.pln_total_h, sizeUnit: "h", hollow: (s) => !s.battery?.measured },
  // Overview › Trend (cluster label painted on its sites; key comes from the Trend tab)
  trend: { keys: ["Deteriorating", "Mixed", "Stable", "Improving", "Insufficient data"], bad: ["Deteriorating", "Mixed"], key: (s) => s._trend || "Insufficient data",
    size: (s) => s.q2_power_h, sizeUnit: "h" },
  // Data › Quality — first missing input, in decision order
  dq: { keys: ["no_ran", "no_bbt", "no_pln", "no_hist", "complete"], bad: ["no_ran", "no_bbt", "no_pln", "no_hist"],
    key: (s) => (!isNum(s.avail_wc_pct) ? "no_ran" : (s.bbt_value_evidence || "UNAVAILABLE") === "UNAVAILABLE" ? "no_bbt" : !s.pln_known ? "no_pln" : !s.mbp_hist_known ? "no_hist" : "complete") },
};
export const MAP_KEYS = Object.fromEntries(Object.entries(MAP_MODES).map(([k, m]) => [k, m.key]));
