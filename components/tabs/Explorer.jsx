"use client";
// v5.0 — MBP › Coverage & Site Explorer: the map-driven site workspace. Sites, base camps, coverage, ETA, priority and battery
// evidence on one map + one table (components/Workspace.jsx). Replaces the old coverage map + site list; the drill presets (?sel=…)
// from other pages still land here.
import React, { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import { SiteBriefMbp } from "@/components/SiteBrief";
import { siteColumns, fInt, fPct, fH, Toggle, Gloss, Note } from "@/components/ui";
import { applySel } from "@/lib/drill";
import { kpiFor } from "@/lib/kpi";
import { coverageGap } from "@/lib/view";
import { selLabel } from "@/components/DrillPanel";
import { perfLegend } from "@/components/perfUi";
import { t } from "@/lib/i18n";

export default function Explorer(ctx) {
  const { scope, cfg, sel: drillSel, setSel: setDrillSel, K, nop, perf, bcScope } = ctx;
  const [mode, setMode] = useState("compact"), [showComputed, setShowComputed] = useState(false);
  const DF = useMemo(() => applySel(scope, drillSel), [scope, drillSel]);
  const cols = useMemo(() => { const c = siteColumns(cfg, mode, { showComputed });
    return DF.weight ? [...c, { key: "_w", label: "col.drill_hours", num: true, sortVal: DF.weight, render: (r) => fH(DF.weight(r)), csv: (r) => DF.weight(r).toFixed(1) }] : c; }, [cfg, mode, showComputed, DF]);
  const k = kpiFor(K, nop);
  const counts = useMemo(() => { const c = {}; for (const b of bcScope) c[b.status] = (c[b.status] || 0) + 1; return c; }, [bcScope]);
  const T = cfg.travel;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] bg-white border border-line rounded-md px-3 py-2">
        <span><b className="tabular">{fInt(DF.rows.length)}</b> {t("ov.sites")}</span>
        {k && <span title={t("ov.reach_tip", { a: fInt(k.p12_reach_actual), e: fInt(k.p12_reach_estimated), d: fInt(k.p12_reach_derived), u: fInt(k.p12_unverified) })}>
          <b className="tabular">{k.p12_eval ? `${fInt(k.p12_reach)}/${fInt(k.p12_eval)} · ${fPct(100 * k.p12_reach_pct, 0)}` : t("common.na")}</b> {t("ov.reach")}</span>}
        <span className="text-[11.5px] text-mut">{t("ex.eta_note", { rf: T.road_factor, mob: T.mobilization_minutes, r: cfg.mbp.max_radius_km, cap: cfg.mbp.reach_cap_km ?? 250 })}</span>
      </div>
      {DF.known && <div className="flex flex-wrap items-center gap-2 text-[12.5px]" role="status">
        <span className="inline-flex items-center gap-1.5 bg-s1/10 border border-s1/40 text-navy rounded-full pl-3 pr-1 py-0.5">
          <b>{t("drill.chip.filter")}:</b> {selLabel(drillSel)} · {t("filter.scope_sites", { n: fInt(DF.rows.length) })}
          <button onClick={() => setDrillSel(null)} aria-label={t("drill.chip.clear")} className="w-5 h-5 rounded-full hover:bg-s1/20 leading-none">×</button></span></div>}
      <Workspace ctx={ctx} rows={DF.rows} modes={["survival", "priority", "design", "resp"]} defaultMode="survival" columns={cols}
        title={t("ex.title")} sub={t("ex.sub")} filename={`pba_sites_${String(nop).replace(/\s+/g, "_")}.csv`}
        initialSort={DF.weight ? { key: "_w", dir: -1 } : { key: "mbp_priority_score", dir: -1 }}
        mbpKeyOf={(m) => perf.get(m.mbp_id)?.key || "none"} mbpLegend={perfLegend()} mbpCountsOverride={counts}
        mbpLabel={(m) => { const p = perf.get(m.mbp_id); return p ? `${ctx.names ? p.mbp_id : p.code} · ${t(`perf.key.${p.key}`)} · ${fInt(p.sites_assigned)} site` : ""; }}
        detail={(s) => <SiteBriefMbp s={s} ctx={ctx} />}
        toolbar={<div className="flex items-center gap-2 text-[12px]">
          <div className="flex rounded-md overflow-hidden border border-line" role="group">{["compact", "detail"].map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
            className={`px-2 py-0.5 ${mode === m ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`mbp.list.${m}`)}</button>)}</div>
          {mode === "detail" && <Toggle label={<>{t("mbp.list.show_computed")}<Gloss k="bbt_design" /></>} checked={showComputed} onChange={setShowComputed} />}
          <label className="inline-flex items-center gap-1 text-slate"><input type="checkbox" checked={ctx.names} onChange={(e) => ctx.setNames(e.target.checked)} className="accent-navy" />{t("mgmt.names")}</label></div>}
        extraCsv={[{ key: "assignment_basis", label: "Assignment basis" }, { key: "eta_confidence", label: "ETA confidence" }, { key: "dist_note", label: "Distance note" },
          { key: "pln_known", label: "PLN data available", csv: (r) => (r.pln_known ? "yes" : "no") }, { key: "mbp_hist_known", label: "MBP history available", csv: (r) => (r.mbp_hist_known ? "yes" : "no") },
          { key: "bbt_design_min", label: "Computed design (unvalidated, min)" }, { key: "bbt_design_basis", label: "Computed design basis" }, { key: "coverage_gap", label: "coverage_gap", csv: (r) => String(coverageGap(r)) }]}
        tableSub={t("ex.table_sub")} />
      {mode === "detail" && showComputed && <Note tone="warn">{t("design.computed_note")}</Note>}
    </div>
  );
}
