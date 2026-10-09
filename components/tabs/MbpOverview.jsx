"use client";
// v3.7 — MBP management overview: how many MBPs each NOP has, what they cover (always against ALL sites in scope),
// how they perform (H1 tickets) — with the map as the hero. Every figure is computed per site / per base camp and summed.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, fInt, fPct, fNum, isNum } from "@/components/ui";
import { nopMbpSummary, PERF_KEYS } from "@/lib/mbpperf";
import { perfLegend, ontimeLegend, PerfTag, PERF_COLOR, PerfFormula } from "@/components/perfUi";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MbpOverview({ scope, active, classes, data, cfg, nop, setNop, mbpsScope, mbpStats, perf, setRadius, setPick, openMbp, navigate }) {
  const R = cfg.mbp.max_radius_km;
  const base = useMemo(() => active.filter((s) => !classes.length || classes.includes(s.site_class)), [active, classes]);
  const rows = useMemo(() => nopMbpSummary(base, data.mbps, perf), [base, data.mbps, perf]);
  const cur = useMemo(() => nopMbpSummary(scope, mbpsScope, perf), [scope, mbpsScope, perf]);
  const T = useMemo(() => cur.reduce((a, r) => { for (const k of ["mbp", "mbp_located", "sites", "within", "arrive", "p12", "p12_arrive", "beyond", "island", "jobs", "ontime", "judged", "busy_h"]) a[k] = (a[k] || 0) + r[k];
    for (const k of ["need", "area_pln", "nobat"]) a[k] = (a[k] || 0) + r[k];
    for (const k of PERF_KEYS) a.keys[k] = (a.keys[k] || 0) + r.keys[k]; return a; }, { keys: {} }), [cur]);
  const pc = (a, b) => (b ? fPct((100 * a) / b, 0) : "—");
  // v3.7 — base-camp colour: ideal utilisation (default) or on-time performance
  const [dim, setDim] = useState("util");
  const mbpKeyOf = useMemo(() => (dim === "util" ? (m) => perf.get(m.mbp_id)?.key || "none" : (m) => perf.get(m.mbp_id)?.ontime_key || "nodata"), [perf, dim]);
  const legend = useMemo(() => (dim === "util" ? perfLegend() : ontimeLegend()), [dim]);
  const RP = cfg.mbp.radius_presets || [20, 30, 40, 60, 120];
  const camps = useMemo(() => mbpsScope.map((m) => perf.get(m.mbp_id)).filter(Boolean), [mbpsScope, perf]);
  const under = camps.filter((p) => p.key === "under" || p.key === "none").sort((a, b) => a.jobs - b.jobs).slice(0, 8);
  const low = camps.filter((p) => p.key === "low").sort((a, b) => (a.resp ?? 9) - (b.resp ?? 9)).slice(0, 8);
  const high = camps.filter((p) => p.util_key === "high").sort((a, b) => b.busy - a.busy).slice(0, 8);
  const [mapMode, setMapMode] = useState("survival");
  const lbl = (m) => { const p = perf.get(m.mbp_id); return p ? `${t(`perf.key.${p.key}`)} · ${fInt(p.jobs)} job · ${t("perf.resp_short")} ${p.resp == null ? "—" : fPct(100 * p.resp, 0)} · ${p.ontime_rate == null ? "—" : fPct(100 * p.ontime_rate, 0)} ${t("perf.ontime_short")}` : ""; };
  const MiniList = ({ title, list, value, tone }) => (
    <Card title={title}>
      {!list.length ? <div className="text-mut text-[12.5px]">{t("mgmt.none")}</div> : <ul className="text-[12.5px] divide-y divide-line/70">
        {list.map((p) => <li key={p.mbp_id}><button onClick={() => openMbp(data.mbps.find((m) => m.mbp_id === p.mbp_id))} className="w-full flex items-center gap-2 py-1 text-left hover:bg-surface">
          <span className="w-2.5 h-2.5 rounded-sm border border-navy/30 inline-block shrink-0" style={{ background: PERF_COLOR[p.key] }} />
          <span className="truncate flex-1">{p.mbp_id}</span><span className={`tabular whitespace-nowrap ${tone}`}>{value(p)}</span></button></li>)}
      </ul>}
    </Card>
  );

  return (
    <div className="space-y-4">
      <Note>{t("mgmt.note", { r: R })}</Note>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <span className="text-slate">{t("mgmt.radius")}</span>
        <div className="flex rounded-md overflow-hidden border border-line" role="group" aria-label={t("mgmt.radius")}>
          {RP.map((km) => <button key={km} aria-pressed={R === km} onClick={() => setRadius(km)} className={`px-2.5 py-1 ${R === km ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{km} km</button>)}</div>
        <span className="text-mut text-[11.5px]">{t("mgmt.radius_tip")}</span>
        <span className="ml-auto text-slate">{t("mgmt.color_by")}</span>
        <div className="flex rounded-md overflow-hidden border border-line" role="group">{["util", "ontime"].map((d) =>
          <button key={d} aria-pressed={dim === d} onClick={() => setDim(d)} className={`px-2.5 py-1 ${dim === d ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`mgmt.dim.${d}`)}</button>)}</div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.mbp")} value={fInt(T.mbp)} sub={t("mgmt.kpi.mbp_sub", { l: fInt(T.mbp_located), s: fNum(T.mbp ? T.sites / T.mbp : null, 0) })} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.sites")} value={fInt(T.sites)} sub={t("mgmt.kpi.sites_sub", { p: fInt(T.p12), i: fInt(T.island) })} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.within", { r: R })} value={pc(T.within, T.sites)} sub={t("mgmt.kpi.of_total", { a: fInt(T.within), n: fInt(T.sites) })} tone={T.beyond ? "warn" : "good"} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.arrive")} value={pc(T.arrive, T.sites)} sub={t("mgmt.kpi.arrive_sub", { a: fInt(T.arrive), n: fInt(T.sites), p: pc(T.p12_arrive, T.p12) })} tone="warn" help={t("mgmt.kpi.arrive_help")} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.resp")} value={T.need >= 1 ? pc(T.area_pln, T.need) : "—"} sub={t("mgmt.kpi.resp_sub", { a: fInt(T.area_pln), n: fInt(T.need), j: fInt(T.jobs) })} help={t("mgmt.kpi.resp_help")} tone={T.area_pln / Math.max(1, T.need) >= 0.8 ? "good" : "warn"} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.ontime")} value={pc(T.ontime, T.judged)} sub={t("mgmt.kpi.ontime_sub", { a: fInt(T.ontime), n: fInt(T.judged) })} tone={T.ontime / Math.max(1, T.judged) >= 0.6 ? "good" : "crit"} help={t("mgmt.kpi.ontime_help")} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.status")} value={`${fInt((T.keys.under || 0) + (T.keys.none || 0))} · ${fInt(T.keys.low || 0)} · ${fInt(T.keys.high || 0)} · ${fInt(T.keys.over || 0)}`} sub={t("mgmt.kpi.status_sub")} />
      </div>
      <Card title={t("mgmt.map.title")} sub={t("mgmt.map.sub")}>
        <MapView sites={scope} mbps={mbpsScope} cfg={cfg} onRadius={setRadius} onPickSite={setPick} mbpStats={mbpStats} fitKey={nop + "mgmt"} height={640}
          mode={mapMode} onMode={setMapMode} modes={["survival", "priority", "design"]} mbpKeyOf={mbpKeyOf} mbpLegend={legend} mbpPerf={perf} onOpenMbp={openMbp} mbpLabel={lbl} />
      </Card>
      <div className="grid md:grid-cols-3 gap-4">
        <MiniList title={t("mgmt.list.under")} list={under} value={(p) => `${fInt(p.jobs)} job · ${fPct(100 * p.busy, 1)}`} tone="text-mut" />
        <MiniList title={t("mgmt.list.low")} list={low} value={(p) => `${t("perf.resp_short")} ${p.resp == null ? "—" : fPct(100 * p.resp, 0)} · ${p.ontime_rate == null ? "—" : fPct(100 * p.ontime_rate, 0)} ${t("perf.ontime_short")}`} tone="text-crit" />
        <MiniList title={t("mgmt.list.high")} list={high} value={(p) => `${fPct(100 * p.busy, 0)} ${t("perf.busy_short")}`} tone="text-[#6b4bd8]" />
      </div>
      <Card title={t("mgmt.nop.title")} sub={t("mgmt.nop.sub", { r: R })}>
        <DataTable rows={rows} pageSize={20} filename="pba_mbp_by_nop.csv" initialSort={{ key: "arrive_pct", dir: 1 }}
          rowClass={(r) => (r.nop === nop ? "bg-warn/10 font-semibold" : "")} onRowClick={(r) => setNop(r.nop === nop ? "All NOPs" : r.nop)}
          columns={[
            { key: "nop", label: "col.nop" }, { key: "mbp", label: "col.mbp_units", num: true },
            { key: "sites", label: "col.sites_scope", num: true }, { key: "sites_per_mbp", label: "col.sites_per_mbp", num: true, render: (r) => fNum(r.sites_per_mbp, 0), csv: (r) => r.sites_per_mbp?.toFixed(1) },
            { key: "within_pct", label: "col.within_of_total", num: true, render: (r) => `${fInt(r.within)} · ${pc(r.within, r.sites)}`, csv: (r) => r.within },
            { key: "arrive_pct", label: "col.arrive_of_total", num: true, render: (r) => `${fInt(r.arrive)} · ${pc(r.arrive, r.sites)}`, csv: (r) => r.arrive },
            { key: "p12_arrive_pct", label: "col.p12_arrive", num: true, render: (r) => `${fInt(r.p12_arrive)}/${fInt(r.p12)} · ${pc(r.p12_arrive, r.p12)}`, csv: (r) => r.p12_arrive },
            { key: "jobs", label: "col.jobs_h1", num: true },
            { key: "need", label: "col.need_events", num: true, render: (r) => fInt(r.need), csv: (r) => Math.round(r.need) },
            { key: "resp", label: "col.resp", num: true, sortVal: (r) => r.resp ?? -1, render: (r) => (r.resp == null ? "—" : <span className={r.resp < 0.5 ? "text-crit font-semibold" : r.resp >= 1.5 ? "text-[#2a78d6] font-semibold" : ""}>{fPct(100 * r.resp, 0)}</span>), csv: (r) => (r.resp == null ? "" : (100 * r.resp).toFixed(1)) },
            { key: "ontime_rate", label: "col.ontime_actual", num: true, render: (r) => (r.ontime_rate == null ? "—" : <span className={r.ontime_rate < 0.35 ? "text-crit font-semibold" : ""}>{fPct(100 * r.ontime_rate, 0)}</span>), csv: (r) => (r.ontime_rate == null ? "" : (100 * r.ontime_rate).toFixed(1)) },
            { key: "status", label: "col.mbp_status", sortVal: (r) => (r.keys.low || 0) + (r.keys.under || 0), render: (r) => <span className="inline-flex gap-1 flex-wrap">{PERF_KEYS.filter((k) => r.keys[k]).map((k) =>
              <span key={k} title={t(`perf.key.${k}`)} className="inline-flex items-center gap-0.5 tabular text-[11.5px]"><span className="w-2 h-2 rounded-sm inline-block border border-navy/30" style={{ background: PERF_COLOR[k] }} />{r.keys[k]}</span>)}</span>,
              csv: (r) => PERF_KEYS.filter((k) => r.keys[k]).map((k) => `${k}:${r.keys[k]}`).join(" ") },
          ]} />
        <div className="mt-2"><PerfFormula cfg={cfg} /></div>
      </Card>
    </div>
  );
}
