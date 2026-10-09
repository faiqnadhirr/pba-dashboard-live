"use client";
// v3.5 — display side of the map modes (colours, legend labels, the one-line SITE justification). Keys come from lib/mapmodes.js.
import { MAP_MODES } from "@/lib/mapmodes";
import { LEVEL_KIND, STATUS, CAUSE_COLOR, RESP_COLOR, fMin, fH, fPct, fPP, f3, isNum } from "./ui";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";

const NONE = "#E3E7ED";
const COLORS = {
  priority: Object.fromEntries(Object.entries(LEVEL_KIND.MBP).map(([k, v]) => [k, v.c])),
  design: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.c === "#EEF1F5" ? "#C9CFD9" : v.c === "#DDE3EC" ? "#9DB7DE" : v.c])),
  survival: { arrive: "#0ca30c", late: "#ec835a", unknown: "#A3ABB9", beyond: "#7a1414" },
  gap: { big: "#b42318", small: "#ec835a", meets: "#0ca30c", nodata: "#C9CFD9" },
  cause: { ...CAUSE_COLOR, none: NONE },
  resp: { ...RESP_COLOR, none: NONE },
  batch: { ...Object.fromEntries(Object.entries(LEVEL_KIND.BBS).map(([k, v]) => [k, v.c === "#C9CFD9" ? "#8A94A6" : v.c])), none: NONE },
  trend: { Deteriorating: "#b42318", Mixed: "#c98a00", Stable: "#8A94A6", Improving: "#066b06", "Insufficient data": "#C9CFD9" },
  bbtgap: { lt25: "#7a1414", p25_50: "#d03b3b", p50_80: "#fab219", ge80: "#0ca30c", no_actual: "#A3ABB9", no_design: "#DDE3EC" },
  actiontype: { REPLACE: "#b42318", UPGRADE: "#eb6834", SETTING: "#6b4bd8", TEST: "#2a78d6", DATA: "#1F2A44", MONITOR: "#9DB7DE", NONE: "#E3E7ED" },
  dq: { no_ran: "#7a1414", no_bbt: "#d03b3b", no_pln: "#ec835a", no_hist: "#fab219", complete: "#0ca30c" },
};
COLORS.bbsstatus = COLORS.design;

export function keyLabel(mode, k) {
  switch (mode) {
    case "priority": return `${LEVEL_KIND.MBP[k]?.i || ""} MBP-${k}`;
    case "design": case "bbsstatus": return `${STATUS[k]?.i || ""} ${tv("status", k)}`;
    case "survival": return t(`map.key.${k}`);
    case "gap": return t(`map.gap.${k}`);
    case "cause": return k === "none" ? t("map.none_down") : tv("cause", k);
    case "resp": return k === "none" ? t("map.none_power") : tv("resp", k);
    case "batch": return k === "none" ? t("map.batch.none") : `${LEVEL_KIND.BBS[k]?.i || ""} BBS-${k}`;
    case "trend": return tv("trend", k);
    case "dq": return t(`map.dq.${k}`);
    case "bbtgap": return t(`map.gap2.${k}`);
    case "actiontype": return t(`atype.${k}`);
    default: return k;
  }
}
const bbtTxt = (s) => (s.battery?.display?.text ? t("bbt.no_battery_ticket") : `${fMin(s.battery?.display?.value)} (${s.battery?.display?.evidence || "—"})`);
const availTxt = (s) => (isNum(s.avail_wc_pct) ? t("map.why.avail", { a: fPct(s.avail_wc_pct), t: fPct(s.ran_target_pct), g: fPP(s.avail_delta_pp) }) : t("map.why.no_ran"));

/** one-line, site-level justification for the site's colour in this mode */
export function siteWhy(mode, s) {
  const M = MAP_MODES[mode], k = M.key(s);
  switch (mode) {
    case "priority": return `MBP-${s.mbp_priority_level} ${f3(s.mbp_priority_score)} — ${te(s.mbp_priority_drivers, "drivers") || "—"}`;
    case "design": case "bbsstatus": return t("map.why.bbt", { s: tv("status", s.bbt_status), v: bbtTxt(s), d: fMin(s.bbt_criteria_design_min) });
    case "survival": return k === "beyond" ? t("map.why.beyond", { km: isNum(s.nearest_mbp_km) ? Math.round(s.nearest_mbp_km) : "—" })
      : k === "unknown" ? t("map.why.unknown") : t("map.why.eta", { e: fMin(s.eta_min), b: fMin(s.bbt_effective_min), m: s.mbp_assigned || "—" });
    case "gap": case "cause": {
      const dc = MAP_MODES.cause.key(s);
      return `${availTxt(s)}${dc !== "none" ? ` · ${t("map.why.cause", { c: tv("cause", dc), h: fH(s[`ran_${dc}_down_h`] ?? Math.max(0, (s.ran_outage_h || 0) - ["power", "transport", "ran", "other"].reduce((a, c) => a + (s[`ran_${c}_down_h`] || 0), 0))), o: fH(s.ran_outage_h) })}` : ""}`;
    }
    case "resp": return k === "none" ? t("map.none_power") : `${tv("resp", k)} (${s.resp.kind}) · ${fH(s.ran_power_down_h)} — ${te(s.resp.why, "resp")}`;
    case "batch": return k === "none" ? `${t("map.batch.none")} · ${tv("status", s.bbt_status)}`
      : `BBS-${s.bbs_priority_level}: ${tv("action", s.recommended_action)} — ${te(s.rule, "rule")} · BBT ${bbtTxt(s)} · ${t("map.why.pln", { h: fH(s.pln_total_h) })}`;
    case "trend": return `${tv("trend", k)} (${s.cluster_to}) · ${t("map.why.trend", { a: fH(s.q1_power_h), b: fH(s.q2_power_h) })}`;
    case "bbtgap": return k === "no_design" ? t("map.why.gap_nodesign") : k === "no_actual" ? t("map.why.gap_noactual", { d: fMin(s.bbt_design_min) })
      : t("map.why.gap", { a: fMin(s.battery?.display?.value), d: fMin(s.bbt_design_min), p: fPct(100 * s.bbt_gap_ratio, 0), b: s.battery_banks ?? "—", l: s.load_a ?? "—" });
    case "actiontype": return k === "NONE" ? `${t("atype.NONE")} · ${tv("status", s.bbt_status)}` : `${t(`atype.${k}`)}: ${tv("action", s.recommended_action)} — ${te(s.rule, "rule")} · BBT ${bbtTxt(s)}`;
    case "dq": return k === "complete" ? t("map.dq.complete") : t("map.why.dq", { f: t(`map.dq.${k}`) });
    default: return "";
  }
}
export const modeColor = (mode) => (s) => COLORS[mode][MAP_MODES[mode].key(s)] || "#55627A";
export const keyColor = (mode, k) => COLORS[mode]?.[k] || "#55627A";
export const modeLegend = (mode) => MAP_MODES[mode].keys.map((k) => ({ k, label: keyLabel(mode, k), c: keyColor(mode, k) }));
