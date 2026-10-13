"use client";
// v5.0 — compact record panel for the selected site (map + table workspaces): why it is prioritised and what the evidence is.
// Every value keeps its evidence label; missing ≠ zero (N/A). The full record stays in the site drawer.
import React, { useMemo, useState } from "react";
import { LevelTag, BbtCell, StatusTag, EvTag, ActionLabel, fInt, fH, fKm, fMin, isNum } from "@/components/ui";
import { dispatchFor } from "@/lib/dispatch";
import { campCode } from "@/lib/mbpperf";
import { t } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";

const NA = () => <span className="text-mut">{t("common.na")}</span>;
const Row = ({ k, v }) => <div className="flex justify-between gap-2 py-[2px] border-b border-line/50"><span className="text-mut">{k}</span><span className="text-right font-medium">{v}</span></div>;
const H = ({ children }) => <div className="mt-2 mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate">{children}</div>;

export function PriorityBlock({ s }) {
  return <>
    <H>{t("brief.priority")}</H>
    <div className="flex items-center gap-2"><LevelTag v={s.mbp_priority_level} /><span className="text-mut tabular">{isNum(s.mbp_priority_score) ? s.mbp_priority_score.toFixed(3) : ""}</span></div>
    <div className="text-[11.5px] text-slate mt-0.5">{t("brief.why")}: {te(s.mbp_priority_drivers, "drivers") || "—"}</div>
  </>;
}

export function BatteryBlock({ s, cfg }) {
  const b = cfg.bbt, D = b.design_minutes;
  return <>
    <H>{t("brief.battery")}</H>
    <Row k="BBT" v={<BbtCell r={s} />} />
    <Row k={t("brief.status")} v={<StatusTag v={s.bbt_status} />} />
    <Row k={t("brief.design_std")} v={<span>{fMin(D)} <span className="text-mut">({t("brief.mgmt_assumption")})</span></span>} />
    <Row k={t("brief.design_site")} v={<span>{fMin(s.bbt_design_min)} <EvTag v={s.bbt_design_evidence} /></span>} />
    <div className="text-[11px] text-mut mt-0.5">{t("brief.thresholds", { d: D, a: Math.round(D * b.ok_pct), c: Math.round(D * b.degraded_pct), z: b.dead_max_minutes })}</div>
    {s.battery?.conflict && <div className="text-[11px] text-[#8a5a00] bg-warn/10 rounded px-1.5 py-1 mt-1">{te(s.battery.conflict, "conflict")}</div>}
  </>;
}

export function ExposureBlock({ s }) {
  return <>
    <H>{t("brief.pln")}</H>
    <Row k={t("col.s14.pln_freq")} v={s.pln_known ? fInt(s.pln_freq) : <NA />} />
    <Row k={t("drawer.pln_dur")} v={s.pln_known ? fH(s.pln_total_h) : <NA />} />
    <Row k={t("col.power_downtime")} v={isNum(s.ran_power_down_h) ? fH(s.ran_power_down_h) : <NA />} />
    <Row k={t("col.s14.dependency")} v={isNum(s.dependency_children) ? <span>{fInt(s.dependency_children)} <EvTag v={isNum(s.dep_children_actual) ? "ACTUAL" : "PROXY"} /></span> : <NA />} />
    <Row k={t("col.s14.hist_mbp")} v={s.mbp_hist_known ? `${fInt(s.mbp_deployments)} · ${fH(s.mbp_backup_h)}` : <NA />} />
  </>;
}

export function CoverageBlock({ s, names }) {
  const id = s.dist_mbp;
  return <>
    <H>{t("brief.mbp")}</H>
    <Row k={s.mbp_assigned ? t("brief.assigned") : t("brief.nearest")} v={id ? (names ? id : campCode(id)) : <NA />} />
    <Row k={t("brief.dist_eta")} v={isNum(s.dist_km) ? `${fKm(s.dist_km)} · ${fMin(s.dist_eta_min)}` : <NA />} />
    <Row k={t("col.arrives_before_bbt")} v={s.bbt_status === "Unknown" ? t("eta.bbt_unknown_short") : s.can_arrive_before_bbt ? `✔ ${t("common.yes")}` : `✖ ${t("common.no")}`} />
    <div className="text-[11px] text-mut mt-0.5">{t("brief.eta_note")}</div>
  </>;
}

/** "which MBP goes?" for this site during a PLN outage — engine ranking, user-marked busy camps, explicit outcome */
export function DispatchPanel({ s, ctx }) {
  const [outH, setOutH] = useState(""), [busy, setBusy] = useState(() => new Set());
  const mbps = useMemo(() => ctx.data.mbps.filter((m) => m.area === s.area), [ctx.data.mbps, s.area]);
  const r = useMemo(() => dispatchFor(s, mbps, ctx.data.fam, ctx.cfg, { outageMin: outH === "" ? null : 60 * Number(outH), busy }), [s, mbps, ctx.data.fam, ctx.cfg, outH, busy]);
  const nm = (id) => (ctx.names ? id : ctx.perf?.get(id)?.code || campCode(id));
  const tone = { before: "text-good", no_need: "text-good", after: "text-crit", all_busy: "text-crit", none_in_range: "text-crit", unknown: "text-[#8a5a00]" }[r.outcome];
  return <>
    <H>{t("disp2.title")}</H>
    <label className="flex items-center gap-2 text-[12px] text-slate">{t("disp2.outage")}
      <input type="number" min="0" step="0.5" value={outH} onChange={(e) => setOutH(e.target.value)} placeholder={t("disp2.unknown")} className="w-20 border border-line rounded px-1.5 py-0.5 text-ink" /> {t("unit.h")}</label>
    <div className={`mt-1 font-semibold ${tone}`}>{t(`disp2.out.${r.outcome}`, { b: fMin(r.bbt), m: r.pick ? nm(r.pick.mbp_id) : "—", e: r.pick ? fMin(r.pick.eta_min) : "—" })}</div>
    {r.why && <div className="text-[11px] text-mut">{t(`disp2.why.${r.why}`)}</div>}
    {r.list.length > 0 && <table className="w-full text-[11.5px] tabular mt-1"><thead><tr className="text-slate text-left"><th>#</th><th>{t("col.basecamp")}</th><th className="text-right">km</th><th className="text-right">ETA</th><th className="text-right">{t("disp2.served")}</th><th title={t("disp2.busy_tip")}>{t("disp2.busy")}</th></tr></thead>
      <tbody>{r.list.slice(0, 6).map((x) => <tr key={x.mbp_id} className={`border-t border-line/50 ${x.chosen ? "bg-good/10 font-semibold" : x.busy ? "text-mut line-through" : ""}`}>
        <td>{x.rank}</td><td className="truncate max-w-[110px]" title={x.mbp_id}>{nm(x.mbp_id)}</td><td className="text-right">{x.km.toFixed(0)}</td>
        <td className={`text-right ${x.before === false ? "text-crit" : x.before ? "text-good" : ""}`}>{fMin(x.eta_min)}</td><td className="text-right">{fInt(x.served_n)}</td>
        <td><input type="checkbox" checked={busy.has(x.mbp_id)} onChange={() => setBusy((B) => { const n = new Set(B); n.has(x.mbp_id) ? n.delete(x.mbp_id) : n.add(x.mbp_id); return n; })} aria-label={t("disp2.busy")} /></td></tr>)}</tbody></table>}
    <div className="text-[11px] text-mut mt-1">{t("disp2.note", { mob: ctx.cfg.travel.mobilization_minutes })}</div>
  </>;
}

/** MBP view of a site: priority → coverage → dispatch → battery → exposure */
export function SiteBriefMbp({ s, ctx }) {
  return <div><PriorityBlock s={s} /><CoverageBlock s={s} names={ctx.names} /><DispatchPanel s={s} ctx={ctx} /><BatteryBlock s={s} cfg={ctx.cfg} /><ExposureBlock s={s} /></div>;
}
/** BBS view of a site: battery → action + reason → exposure → priority */
export function SiteBriefBbs({ s, ctx }) {
  return <div>
    <BatteryBlock s={s} cfg={ctx.cfg} />
    <H>{t("brief.action")}</H>
    <div className="font-semibold text-navy"><ActionLabel r={s} /></div>
    <div className="flex items-center gap-2 mt-0.5"><LevelTag kind="BBS" v={s.bbs_priority_level} /><span className="text-[11.5px] text-slate">{te(s.bbs_priority_drivers, "drivers") || ""}</span></div>
    {s.rule && s.rule !== "R0" && <div className="text-[11.5px] text-slate mt-0.5">{t("brief.reason")}: {te(s.rule, "rule")}</div>}
    <div className="text-[11px] text-mut mt-0.5">{t("bbs.basis")}: {te(s.battery?.precedence, "prec")}</div>
    <ExposureBlock s={s} /><PriorityBlock s={s} />
  </div>;
}
