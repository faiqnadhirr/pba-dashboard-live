"use client";
// v4.0 — MBP summary under the story: 5 KPIs (all from the ONE KPI layer), the map as hero, three short lists and one compact NOP table.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, DataTable, fInt, fPct } from "@/components/ui";
import { campCode } from "@/lib/mbpperf";
import { kpiFor } from "@/lib/kpi";
import { perfLegend, ontimeLegend, PERF_COLOR, PerfFormula } from "@/components/perfUi";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));

export default function MbpOverview({ scope, data, cfg, nop, setNop, mbpsScope, mbpStats, perf, setRadius, setPick, openMbp, K, names, setNames }) {
  const k = kpiFor(K, nop);
  const hasJobs = (data.tickets || []).length > 0;
  const [dim, setDim] = useState("util");
  const mbpKeyOf = useMemo(() => (dim === "util" ? (m) => perf.get(m.mbp_id)?.key || "none" : (m) => perf.get(m.mbp_id)?.ontime_key || "nodata"), [perf, dim]);
  const legend = useMemo(() => (dim === "util" ? perfLegend() : ontimeLegend()), [dim]);
  const camps = useMemo(() => mbpsScope.map((m) => perf.get(m.mbp_id)).filter(Boolean), [mbpsScope, perf]);
  const nm = (p) => (names ? p.mbp_id : p.code || campCode(p.mbp_id));
  const under = !hasJobs ? [] : camps.filter((p) => p.key === "under" || p.key === "none").sort((a, b) => a.jobs - b.jobs).slice(0, 6);
  const low = camps.filter((p) => p.key === "low").sort((a, b) => (a.ontime_rate ?? 9) - (b.ontime_rate ?? 9)).slice(0, 6);
  const high = camps.filter((p) => p.key === "high").sort((a, b) => b.busy - a.busy).slice(0, 6);
  const keys = useMemo(() => { const c = {}; for (const p of camps) c[p.key] = (c[p.key] || 0) + 1; return c; }, [camps]);
  const [mapMode, setMapMode] = useState("survival");
  const lbl = (m) => { const p = perf.get(m.mbp_id); return p ? `${nm(p)} · ${t(`perf.key.${p.key}`)} · ${fInt(p.jobs)} job · ${p.ontime_rate == null ? "—" : fPct(100 * p.ontime_rate, 0)} ${t("perf.ontime_short")}` : ""; };
  const MiniList = ({ title, list, value, tone }) => (
    <Card title={title}>
      {!list.length ? <div className="text-mut text-[12.5px]">{hasJobs ? t("mgmt.none") : t("common.na")}</div> : <ul className="text-[12.5px] divide-y divide-line/70">
        {list.map((p) => <li key={p.mbp_id}><button onClick={() => openMbp(data.mbps.find((m) => m.mbp_id === p.mbp_id))} className="w-full flex items-center gap-2 py-1 text-left hover:bg-surface">
          <span className="w-2.5 h-2.5 rounded-sm border border-navy/30 inline-block shrink-0" style={{ background: PERF_COLOR[p.key] }} />
          <span className="truncate flex-1">{nm(p)}</span><span className={`tabular whitespace-nowrap ${tone}`}>{value(p)}</span></button></li>)}
      </ul>}
    </Card>
  );
  if (!k) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.mbp")} value={fInt(k.mbp)} sub={t("mgmt.kpi.mbp_sub2", { l: fInt(k.mbp_located), s: fInt(k.sites) })} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.p12reach")} value={pc(k.p12_reach_pct)} sub={t("mgmt.kpi.p12reach_sub", { a: fInt(k.p12_reach), n: fInt(k.p12) })} tone="warn" help={t("mgmt.kpi.arrive_help")} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.need")} value={(data.events || []).length ? pc(k.served_pct) : t("common.na")} sub={t("mgmt.kpi.need_sub", { a: fInt(k.served), n: fInt(k.need), x: fInt(k.extra_jobs) })} tone="crit" help={t("mgmt.kpi.need_help")} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.ontime")} value={hasJobs ? pc(k.jobs_ontime_pct) : t("common.na")} sub={t("mgmt.kpi.ontime_sub", { a: fInt(k.jobs_ontime), n: fInt(k.jobs_judged) })} tone={k.jobs_ontime_pct >= 0.6 ? "good" : "crit"} help={t("mgmt.kpi.ontime_help")} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.occ")} value={hasJobs ? pc(k.occupancy_median) : t("common.na")} sub={t("mgmt.kpi.occ_sub", { i: fInt((keys.under || 0) + (keys.none || 0)), b: fInt(keys.high || 0) })} help={t("mgmt.kpi.occ_help")} />
      </div>
      <Card title={t("mgmt.map.title")} sub={t("mgmt.map.sub2")} right={<div className="flex items-center gap-2 text-[12px]">
        <span className="text-slate">{t("mgmt.color_by")}</span>
        <div className="flex rounded-md overflow-hidden border border-line" role="group">{["util", "ontime"].map((d) =>
          <button key={d} aria-pressed={dim === d} onClick={() => setDim(d)} className={`px-2 py-0.5 ${dim === d ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`mgmt.dim.${d}`)}</button>)}</div>
        <label className="inline-flex items-center gap-1 text-slate"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} className="accent-navy" />{t("mgmt.names")}</label></div>}>
        <MapView sites={scope} mbps={mbpsScope} cfg={cfg} onRadius={setRadius} onPickSite={setPick} mbpStats={mbpStats} fitKey={nop + "mgmt"} height={600}
          mode={mapMode} onMode={setMapMode} modes={["survival", "priority", "design"]} mbpKeyOf={mbpKeyOf} mbpLegend={legend} mbpPerf={perf} onOpenMbp={openMbp} mbpLabel={lbl} />
      </Card>
      <div className="grid md:grid-cols-3 gap-4">
        <MiniList title={t("mgmt.list.under")} list={under} value={(p) => `${fInt(p.jobs)} job · ${fPct(100 * p.busy, 1)}`} tone="text-mut" />
        <MiniList title={t("mgmt.list.low")} list={low} value={(p) => `${fPct(100 * p.ontime_rate, 0)} ${t("perf.ontime_short")} · n ${fInt(p.judged)}`} tone="text-crit" />
        <MiniList title={t("mgmt.list.high")} list={high} value={(p) => `${fPct(100 * p.busy, 0)} ${t("perf.busy_short")}`} tone="text-[#6b4bd8]" />
      </div>
      <Card title={t("mgmt.nop.title")} sub={t("mgmt.nop.sub2")}>
        <DataTable rows={K.nops.filter((r) => r.nop !== "—")} pageSize={20} filename="pba_mbp_by_nop.csv" initialSort={{ key: "p12_reach_pct", dir: 1 }}
          rowClass={(r) => (r.nop === nop ? "bg-warn/10 font-semibold" : "")} onRowClick={(r) => setNop(r.nop === nop ? "All NOPs" : r.nop)}
          columns={[
            { key: "nop", label: "col.nop" }, { key: "mbp", label: "col.mbp_units", num: true }, { key: "sites", label: "col.sites_scope", num: true },
            { key: "p12_reach_pct", label: "col.p12_arrive", num: true, sortVal: (r) => r.p12_reach_pct ?? -1, render: (r) => `${fInt(r.p12_reach)}/${fInt(r.p12)} · ${pc(r.p12_reach_pct)}`, csv: (r) => r.p12_reach },
            { key: "served_pct", label: "col.need_cov", num: true, sortVal: (r) => r.served_pct ?? -1, render: (r) => (r.need ? `${pc(r.served_pct)} · ${fInt(r.need)}` : t("common.na")), csv: (r) => (r.served_pct == null ? "" : (100 * r.served_pct).toFixed(1)) },
            { key: "jobs_ontime_pct", label: "col.ontime_actual", num: true, sortVal: (r) => r.jobs_ontime_pct ?? -1, render: (r) => (r.jobs_ontime_pct == null ? t("common.na") : <span className={r.jobs_ontime_pct < 0.35 ? "text-crit font-semibold" : ""}>{pc(r.jobs_ontime_pct)}</span>), csv: (r) => (r.jobs_ontime_pct == null ? "" : (100 * r.jobs_ontime_pct).toFixed(1)) },
            { key: "occupancy_median", label: "col.occupancy", num: true, sortVal: (r) => r.occupancy_median ?? -1, render: (r) => pc(r.occupancy_median), csv: (r) => (r.occupancy_median == null ? "" : (100 * r.occupancy_median).toFixed(1)) },
            { key: "conc_p95", label: "col.peak_conc", num: true, sortVal: (r) => r.conc_p95 ?? -1, render: (r) => (r.conc_p95 == null ? t("common.na") : `${fInt(r.conc_p95)} / ${fInt(r.mbp)}`), csv: (r) => r.conc_p95 ?? "" },
            { key: "calib", label: "col.calib", sortVal: (r) => (r.calib ? (r.calib.ok ? 1 : 0) : -1), render: (r) => (!r.calib ? t("common.na") : <span className={r.calib.ok ? "text-good" : "text-crit font-semibold"}>{r.calib.ok ? "✔" : "✖"} {r.calib.diff_pp > 0 ? "+" : "−"}{Math.abs(r.calib.diff_pp).toFixed(1)} pp</span>), csv: (r) => (r.calib ? r.calib.diff_pp.toFixed(2) : "") },
          ]} />
        <div className="mt-2"><PerfFormula cfg={cfg} /></div>
      </Card>
    </div>
  );
}
