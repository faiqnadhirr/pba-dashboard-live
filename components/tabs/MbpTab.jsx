"use client";
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, Select, Tag, Toggle, Bar100, Gloss, siteColumns, fInt, fH, fMin, fKm, fPct, fCoord, precisionNote, isNum } from "@/components/ui";
import { suggestBasecamps, coverageBreakdown } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { coverageGap } from "@/lib/view";
import { applySel, MAP_KEYS } from "@/lib/drill";
import { Go } from "@/lib/nav";
import { COLOR_MODES_LEGEND } from "@/lib/maplegend";
import { selLabel } from "@/components/DrillPanel";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const SEG = [["arrive", "#0ca30c"], ["late_dark", "#d03b3b"], ["late_other", "#ec835a"], ["bbt_unknown", "#A3ABB9"], ["beyond", "#7a1414"]];

export default function MbpTab({ scope, data, cfg, nop, mbpsScope, mbpStats, setRadius, setPick, part = "map", openDrill, sel: drillSel, setSel: setDrillSel, period }) {
  const fx = !!period && period.gran !== "h1";
  const MAP = part === "map", LIST = part === "list";
  const R = cfg.mbp.max_radius_km;
  const [sel, setSel] = useState("ALL");
  const [mode, setMode] = useState("compact");
  const [showComputed, setShowComputed] = useState(false);
  const summary = useMemo(() => mbpsScope.map((m) => mbpStats.get(m.mbp_id)).filter(Boolean), [mbpsScope, mbpStats]);
  const opts = [{ value: "ALL", label: t("mbp.all_sites", { n: fInt(scope.length) }) },
    // base camps with no location or 0 assigned sites are not selectable (listed in Data quality)
    ...[...summary].filter((m) => m.coord_status !== "MISSING" && m.sites_covered > 0).sort((a, b) => b.sites_covered - a.sites_covered)
      .map((m) => ({ value: m.mbp_id, label: t("mbp.camp_opt", { id: m.mbp_id, n: fInt(m.sites_covered) }) }))];
  const hidden = summary.filter((m) => m.coord_status === "MISSING" || m.sites_covered === 0).length;
  const cov = useMemo(() => (sel === "ALL" ? scope : scope.filter((s) => s.mbp_assigned === sel)).sort((a, b) => b.mbp_priority_score - a.mbp_priority_score), [scope, sel]);
  // 2a/2b: Site-list preset from the URL (?sel=…) — same filter as the drilldown panel / chart that opened it
  const DF = useMemo(() => applySel(cov, LIST ? drillSel : null), [cov, drillSel, LIST]);
  const listCols = useMemo(() => { const c = siteColumns(cfg, mode, { showComputed });
    return DF.weight ? [...c, { key: "_w", label: "col.drill_hours", num: true, sortVal: DF.weight, render: (r) => fH(DF.weight(r)), csv: (r) => DF.weight(r).toFixed(1) }] : c; }, [cfg, mode, showComputed, DF]);
  const camp = sel === "ALL" ? null : data.mbps.find((m) => m.mbp_id === sel);
  const sug = useMemo(() => suggestBasecamps(scope), [scope]);
  // v3.4 — map legend toggles drive the KPIs / breakdown of this tab (and "View N sites")
  const [mapMode, setMapMode] = useState("priority"), [mapHidden, setMapHidden] = useState([]);
  const vis = useMemo(() => (mapHidden.length ? scope.filter((s) => !mapHidden.includes(MAP_KEYS[mapMode](s))) : scope), [scope, mapMode, mapHidden]);
  const visKeys = COLOR_MODES_LEGEND[mapMode].filter((k) => !mapHidden.includes(k));
  const bd = useMemo(() => coverageBreakdown(vis), [vis]);
  const avg = (f, L = cov) => { const v = L.map(f).filter(isNum); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };
  const pc = (v) => fPct((100 * v) / Math.max(1, bd.total), 0);
  const B = cfg.basecamp_signal;

  return (
    <div className="space-y-4">
      {MAP && <>
        {mapHidden.length > 0 && <div role="status" className="flex flex-wrap items-center gap-2 text-[12.5px] border border-s1/40 bg-s1/5 rounded-md px-3 py-1.5">
          <b>{t("map.legfilter.title")}</b> {t("map.legfilter.body", { h: mapHidden.length, n: fInt(vis.length), N: fInt(scope.length) })}
          <Go to={{ view: "mbp.sitelist", sel: `map_${mapMode}~${visKeys.join("+")}` }}>{t("drill.view_sites", { n: fInt(vis.length) })}</Go>
          <button onClick={() => setMapHidden([])} className="ml-auto text-slate underline">{t("map.leg_all")}</button></div>}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          <Kpi scope="filtered" fixed={fx} onClick={() => openDrill("cov", "within")} label={t("mbp.kpi.within")} value={fInt(bd.within)} sub={t("mbp.kpi.within_sub", { r: R, n: fInt(bd.beyond) })} tone={bd.beyond ? "warn" : "good"} help={t("mbp.kpi.formula")} />
          <Kpi scope="filtered" fixed={fx} onClick={() => openDrill("cov", "arrive")} label={t("mbp.seg.arrive")} value={fInt(bd.arrive)} sub={t("mbp.kpi.pct_scope", { p: pc(bd.arrive) })} tone="good" help={t("mbp.kpi.formula")} />
          <Kpi scope="filtered" fixed={fx} onClick={() => openDrill("cov", "late_dark")} label={t("mbp.seg.late_dark")} value={fInt(bd.late_dark)} sub={t("mbp.kpi.late_dark_sub", { m: cfg.availability.dark_min_months })} tone="crit" help={t("mbp.kpi.formula")} />
          <Kpi scope="filtered" fixed={fx} onClick={() => openDrill("cov", "bbt_unknown")} label={t("mbp.seg.bbt_unknown")} value={fInt(bd.bbt_unknown)} sub={t("mbp.kpi.unknown_sub")} tone="slate" help={t("mbp.kpi.formula")} />
          <Kpi scope="filtered" label={t("mbp.kpi.avg_eta")} value={fMin(avg((s) => s.eta_min, vis))} sub={t("mbp.kpi.avg_eta_sub")} />
          <Kpi scope="portfolio" label={t("mbp.kpi.underserved")} value={fInt([...mbpStats.values()].filter((b) => b.load_signal === "Under-served").length)} sub={t("mbp.kpi.underserved_sub", { n: B.criteria_needed })} />
        </div>
        <Card title={t("mbp.bd.title")} sub={t("mbp.bd.sub")}>
          <Bar100 height={16} parts={SEG.map(([k, c]) => ({ label: t(`mbp.seg.${k}`), c, v: bd[k], txt: `${fInt(bd[k])} · ${pc(bd[k])}` }))} />
          <div className="text-[11.5px] text-mut mt-1.5 tabular">{t("mbp.bd.sum", { a: fInt(bd.arrive), d: fInt(bd.late_dark), o: fInt(bd.late_other), u: fInt(bd.bbt_unknown), b: fInt(bd.beyond), n: fInt(bd.total) })}</div>
        </Card>
        <Card title={t("mbp.map.title")} sub={t("mbp.map.sub")}>
          <MapView sites={scope} mbps={mbpsScope} cfg={cfg} onRadius={setRadius} onPickSite={setPick} mbpStats={mbpStats} fitKey={nop} mode={mapMode} onMode={setMapMode} hidden={mapHidden} onHidden={setMapHidden} height={560} />
        </Card>
      </>}

      {LIST && <Card title={t("mbp.list.title")} sub={t("mbp.list.sub")}>
        <div className="flex flex-wrap items-end gap-4 mb-3">
          <div className="flex rounded-md overflow-hidden border border-line self-end" role="group" aria-label={t("mbp.list.mode")}>
            {["compact", "detail"].map((m) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-[12.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${mode === m ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`mbp.list.${m}`)}</button>)}
          </div>
          <div className="w-[380px] max-w-full"><Select label={t("mbp.list.filter")} value={sel} onChange={setSel} options={opts} /></div>
          {mode === "detail" && <Toggle label={<>{t("mbp.list.show_computed")}<Gloss k="bbt_design" /></>} checked={showComputed} onChange={setShowComputed} />}
          {hidden > 0 && <span className="text-[11.5px] text-mut">{t("mbp.list.hidden", { n: hidden })}</span>}
        </div>
        {DF.known && <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px]" role="status">
          <span className="inline-flex items-center gap-1.5 bg-s1/10 border border-s1/40 text-navy rounded-full pl-3 pr-1 py-0.5">
            <b>{t("drill.chip.filter")}:</b> {selLabel(drillSel)} · {t("filter.scope_sites", { n: fInt(DF.rows.length) })}
            <button onClick={() => setDrillSel(null)} aria-label={t("drill.chip.clear")} title={t("drill.chip.clear")} className="w-5 h-5 rounded-full hover:bg-s1/20 leading-none">×</button>
          </span>
          {DF.weight && <span className="text-mut text-[11.5px]">{t("drill.chip.sorted")}</span>}
        </div>}
        {camp && <div className="text-[12px] text-slate mb-2">{t("mbp.list.camp", { id: camp.mbp_id, pic: camp.pic_name || "—", nop: camp.nop || "—", t: fInt(camp.mbp_tickets_h1), eta: fMin(avg((s) => s.eta_min)) })}
          {camp.merged_from ? ` · ${t("mbp.list.merged", { m: camp.merged_from })}` : ""} · {camp.coord_status === "MISSING" ? t("mbp.loc_unavailable") : `${fCoord(camp.lat, camp.coord_decimals)}, ${fCoord(camp.lon, camp.coord_decimals)} (${precisionNote(camp.coord_decimals)})`}
          {camp.coord_status === "REPAIRED" && <> <Tag tone="warn">{t("mbp.coords_repaired")}</Tag></>}</div>}
        {mode === "detail" && showComputed && <div className="mb-2"><Note tone="warn">{t("design.computed_note")}</Note></div>}
        <DataTable key={mode + showComputed + (drillSel || "")} rows={DF.rows} columns={listCols} onRowClick={setPick} initialSort={DF.weight ? { key: "_w", dir: -1 } : { key: "mbp_priority_score", dir: -1 }}
          filename={`pba_sites_${mode}_${sel === "ALL" ? nop : sel}.csv`.replace(/\s+/g, "_")} rowClass={(r) => (r.site_active ? "" : "bg-line/50 text-mut")}
          extraCsv={[{ key: "assignment_basis", label: "Assignment basis" }, { key: "eta_confidence", label: "ETA confidence" }, { key: "dist_note", label: "Distance note" },
            { key: "pln_known", label: "PLN data available", csv: (r) => (r.pln_known ? "yes" : "no") }, { key: "mbp_hist_known", label: "MBP history available", csv: (r) => (r.mbp_hist_known ? "yes" : "no") },
            { key: "bbt_design_min", label: "Computed design (unvalidated, min)" }, { key: "bbt_design_basis", label: "Computed design basis" },
            { key: "coverage_gap", label: "coverage_gap", csv: (r) => String(coverageGap(r)) }]} />
      </Card>}

      {MAP && <Card title={t("mbp.camp.title")} sub={t("mbp.camp.sub", { n: B.criteria_needed, p: B.p1p2_sites_min, r: fPct(B.reach_risk_share_min * 100, 0), e: B.avg_eta_min, w: Math.round(B.workload_quantile * 100) })}>
        <DataTable rows={summary} filename="pba_basecamps.csv" initialSort={{ key: "p1_p2", dir: -1 }} pageSize={30}
          expand={(r) => <div className="text-[12px] text-slate"><b className="text-ink">{t("mbp.camp.why", { s: tv("signal", r.load_signal) })}:</b> {te(r.signal_why, "signal")}</div>}
          columns={[
            { key: "mbp_id", label: "col.basecamp" }, { key: "pic_name", label: "col.pic" }, { key: "nop", label: "col.nop" },
            { key: "load_signal", label: "col.signal", render: (r) => <Tag tone={r.load_signal === "Under-served" ? "crit" : r.load_signal.startsWith("No") ? "warn" : r.load_signal.startsWith("Possibly") ? "mut" : "good"}>{tv("signal", r.load_signal)}</Tag>, csv: (r) => r.load_signal },
            { key: "crit", label: "col.criteria_met", num: true, sortVal: (r) => r.signal_criteria.length, render: (r) => `${r.signal_criteria.length}/4`, csv: (r) => r.signal_criteria.join("; ") },
            { key: "sites_covered", label: "col.sites_assigned", num: true, render: (r) => fInt(r.sites_covered), csv: (r) => r.sites_covered }, { key: "p1_p2", label: "col.p1p2", num: true },
            { key: "risk_share", label: "col.dark_before_mbp", num: true, render: (r) => `${fInt(r.at_risk_sites)} (${fPct(100 * r.risk_share, 0)})`, csv: (r) => r.at_risk_sites },
            { key: "avg_km", label: "col.avg_km", num: true, render: (r) => fKm(r.avg_km), csv: (r) => r.avg_km?.toFixed(1) }, { key: "avg_eta_min", label: "col.avg_eta", num: true, render: (r) => fMin(r.avg_eta_min), csv: (r) => r.avg_eta_min?.toFixed(0) },
            { key: "deployments_h1", label: "col.workload", num: true, render: (r) => fInt(r.deployments_h1), csv: (r) => r.deployments_h1 },
            { key: "coord_status", label: "col.location", render: (r) => (r.coord_status === "ACTUAL" ? t("mbp.as_recorded") : <Tag tone={r.coord_status === "MISSING" ? "crit" : "warn"}>{t(`mbp.coord.${r.coord_status}`)}</Tag>), csv: (r) => r.coord_status },
          ]} />
      </Card>}

      {MAP && <Card title={t("mbp.sug.title")} sub={t("mbp.sug.sub")}>
        <Note tone="warn">{t("mbp.sug.note")}</Note>
        <div className="mt-3">
          <DataTable rows={sug} filename="pba_basecamp_suggestions.csv" pageSize={20} columns={[
            { key: "nop", label: "col.nop" }, { key: "at_risk_priority_sites", label: "col.at_risk_p1p2", num: true }, { key: "uncovered", label: "col.beyond_radius", num: true },
            { key: "anchor_site", label: "col.anchor_site" }, { key: "anchor_site_name", label: "col.anchor_name" },
            { key: "anchor_lat", label: "col.anchor_latlon", render: (r) => `${fCoord(r.anchor_lat, r.anchor_decimals)}, ${fCoord(r.anchor_lon, r.anchor_decimals)}`, csv: (r) => `${fCoord(r.anchor_lat, r.anchor_decimals)} ${fCoord(r.anchor_lon, r.anchor_decimals)}` },
            { key: "anchor_decimals", label: "col.source_precision", render: (r) => precisionNote(r.anchor_decimals), csv: (r) => r.anchor_decimals },
            { key: "anchor_km_from_centre", label: "col.anchor_centre", num: true, render: (r) => fKm(r.anchor_km_from_centre), csv: (r) => r.anchor_km_from_centre?.toFixed(1) },
            { key: "avg_eta_now_min", label: "col.avg_eta_now", num: true, render: (r) => fMin(r.avg_eta_now_min), csv: (r) => r.avg_eta_now_min?.toFixed(0) },
          ]} />
        </div>
      </Card>}
    </div>
  );
}
