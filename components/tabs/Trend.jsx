"use client";
import React, { useMemo, useState } from "react";
import { Card, Note, DataTable, Tag, Gloss, fInt, fH, fPct, fPP, fNum } from "@/components/ui";
import { clusterTable } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { TrendTag } from "@/components/tabs/Impact";

export default function Trend({ scope, cfg }) {
  const cl = useMemo(() => clusterTable(scope, cfg), [scope, cfg]);
  const order = { Deteriorating: 0, Mixed: 1, Stable: 2, Improving: 3, "Insufficient data": 4 };
  const vn = (x) => cl.filter((c) => c.vs_network === x).length;
  const rows = [...cl].sort((a, b) => order[a.trend] - order[b.trend] || (a.delta_pp ?? 0) - (b.delta_pp ?? 0));
  const n = (x) => cl.filter((c) => c.trend === x).length;
  const A = cfg.availability;
  const [only, setOnly] = useState(null);   // 2c: cluster picked in the dumbbell chart → table filtered to it
  const shown = only ? rows.filter((r) => r.cluster === only) : rows;
  return (
    <div className="space-y-4">
      <Note>{t("trend.note", { tp: fNum(A.trend_pp, 2), qm: A.dark_quarter_min_months, h: A.dark_month_h, ts: A.trend_dark_share_pp, min: A.min_cluster_sites })}<Gloss k="dark_site" /></Note>
      <Note tone="warn">{t("trend.network_note", { d: fPP(cl.network_delta_pp), tp: fNum(A.trend_pp, 2) })}</Note>
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Tag tone="crit">▼ {tv("trend", "Deteriorating")} {n("Deteriorating")}</Tag><Tag tone="warn">◆ {tv("trend", "Mixed")} {n("Mixed")}</Tag><Tag tone="mut">{tv("trend", "Stable")} {n("Stable")}</Tag>
        <Tag tone="good">▲ {tv("trend", "Improving")} {n("Improving")}</Tag><Tag tone="mut">{tv("trend", "Insufficient data")} {n("Insufficient data")}</Tag>
        <span className="text-slate ml-2">{t("trend.vs_network")}:</span><Tag tone="crit">{t("trend.worse")} {vn("Worse than network")}</Tag><Tag tone="mut">{t("trend.inline")} {vn("In line with network")}</Tag><Tag tone="good">{t("trend.better")} {vn("Better than network")}</Tag>
      </div>
      <Dumbbell rows={cl} only={only} onPick={(c) => setOnly(c === only ? null : c)} />
      <Card title={t("trend.table.title")} sub={t("trend.table.sub")}>
        {only && <div className="mb-2 text-[12.5px]" role="status"><span className="inline-flex items-center gap-1.5 bg-s1/10 border border-s1/40 text-navy rounded-full pl-3 pr-1 py-0.5">
          <b>{t("col.cluster")}:</b> {only}<button onClick={() => setOnly(null)} aria-label={t("drill.chip.clear")} title={t("drill.chip.clear")} className="w-5 h-5 rounded-full hover:bg-s1/20 leading-none">×</button></span></div>}
        <DataTable key={only || "all"} rows={shown} pageSize={40} filename="pba_cluster_trend.csv" columns={[
          { key: "cluster", label: "col.cluster", render: (r) => <span className="font-semibold text-navy">{r.cluster}</span> }, { key: "nop", label: "col.nop" }, { key: "sites", label: "col.sites", num: true, render: (r) => fInt(r.sites), csv: (r) => r.sites },
          { key: "trend", label: "col.trend", render: (r) => <TrendTag r={r} />, csv: (r) => r.trend },
          { key: "vs_network", label: "col.vs_network", sortVal: (r) => r.vs_network_pp, render: (r) => (r.vs_network ? <Tag tone={r.vs_network.startsWith("Worse") ? "crit" : r.vs_network.startsWith("Better") ? "good" : "mut"} title={`${fPP(r.vs_network_pp)}`}>{tv("vsnet", r.vs_network)}</Tag> : "—"), csv: (r) => r.vs_network },
          { key: "q1_avail", label: "col.q1_avail", num: true, render: (r) => fPct(r.q1_avail), csv: (r) => r.q1_avail?.toFixed(3) },
          { key: "q2_avail", label: "col.q2_avail", num: true, render: (r) => fPct(r.q2_avail), csv: (r) => r.q2_avail?.toFixed(3) },
          { key: "delta_pp", label: "col.change", num: true, render: (r) => <span className={r.delta_pp < 0 ? "text-[#b42318] font-semibold" : ""}>{fPP(r.delta_pp)}</span>, csv: (r) => r.delta_pp?.toFixed(3) },
          { key: "q1_dark", label: "col.dark_q1", num: true }, { key: "q2_dark", label: "col.dark_q2", num: true },
          { key: "dark_share_delta_pp", label: "col.dark_share_change", num: true, render: (r) => (r.dark_share_delta_pp == null ? "—" : fPP(r.dark_share_delta_pp, 1)), csv: (r) => r.dark_share_delta_pp?.toFixed(1) },
          { key: "q1_power_h", label: "col.power_q1", num: true, render: (r) => fH(r.q1_power_h), csv: (r) => r.q1_power_h.toFixed(1) }, { key: "q2_power_h", label: "col.power_q2", num: true, render: (r) => fH(r.q2_power_h), csv: (r) => r.q2_power_h.toFixed(1) },
          { key: "trend_why", label: "col.why", wrap: true, render: (r) => te(r.trend_why, "trend"), csv: (r) => r.trend_why },
        ]} />
      </Card>
    </div>
  );
}

/* 2c — Q1 vs Q2 dumbbell for the 15 clusters with the worst availability change (HTML, so it never overflows at 1366 px) */
const TCOL = { Deteriorating: "#b42318", Improving: "#066b06", Mixed: "#c98a00", Stable: "#8A94A6", "Insufficient data": "#C9CFD9" };
function Dumbbell({ rows, only, onPick }) {
  const top = useMemo(() => rows.filter((r) => r.delta_pp != null && r.q1_avail != null && r.q2_avail != null).sort((a, b) => a.delta_pp - b.delta_pp).slice(0, 15), [rows]);
  if (!top.length) return null;
  const vals = top.flatMap((r) => [r.q1_avail, r.q2_avail]);
  const step = 0.5, lo = Math.floor((Math.min(...vals) - 0.05) / step) * step, hi = Math.ceil((Math.max(...vals) + 0.05) / step) * step;
  const x = (v) => `${(100 * (v - lo)) / (hi - lo || 1)}%`;
  const ticks = []; for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return (
    <Card title={t("trend.db.title")} sub={t("trend.db.sub")}>
      <div className="flex flex-wrap gap-3 text-[11.5px] text-slate mb-2">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-slate inline-block bg-white" />Q1</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate inline-block" />Q2</span>
        {["Deteriorating", "Mixed", "Improving", "Stable"].map((k) => <span key={k} className="inline-flex items-center gap-1"><span className="w-3 h-1 inline-block rounded" style={{ background: TCOL[k] }} />{tv("trend", k)}</span>)}
        <span className="text-mut">· {t("trend.db.hint")}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,210px)_minmax(0,1fr)_76px] gap-x-3 text-[11.5px]">
        <div /><div className="relative h-4 text-mut">{ticks.map((v, i) => <span key={v} className={`absolute tabular ${i === ticks.length - 1 ? "-translate-x-full" : i === 0 ? "" : "-translate-x-1/2"}`} style={{ left: x(v) }}>{fPct(v, 1)}</span>)}</div><div className="text-right text-mut">{t("col.change")}</div>
        {top.map((r) => { const c = TCOL[r.trend] || "#8A94A6", a = Math.min(r.q1_avail, r.q2_avail), b = Math.max(r.q1_avail, r.q2_avail);
          const tip = `${r.cluster} (${r.nop}) · Q1 ${fPct(r.q1_avail)} → Q2 ${fPct(r.q2_avail)} · ${fPP(r.delta_pp)} · ${tv("trend", r.trend)} — ${t("trend.db.click")}`;
          return (
            <button key={r.cluster} onClick={() => onPick(r.cluster)} title={tip} aria-pressed={only === r.cluster}
              className={`col-span-3 grid grid-cols-subgrid items-center py-[3px] rounded hover:bg-s1/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${only === r.cluster ? "bg-s1/10" : ""} ${only && only !== r.cluster ? "opacity-50" : ""}`}>
              <span className="truncate text-left text-ink">{r.cluster} <span className="text-mut">· {r.nop.replace(/^NOP /, "")}</span></span>
              <span className="relative h-4 block">
                {ticks.map((v) => <span key={v} className="absolute top-0 bottom-0 border-l border-line/70" style={{ left: x(v) }} />)}
                <span className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded" style={{ left: x(a), width: `calc(${x(b)} - ${x(a)})`, background: c }} />
                <span className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-2" style={{ left: x(r.q1_avail), borderColor: c }} />
                <span className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: x(r.q2_avail), background: c }} />
              </span>
              <span className="text-right tabular font-semibold" style={{ color: r.delta_pp < 0 ? "#b42318" : "#066b06" }}>{fPP(r.delta_pp)}</span>
            </button>); })}
      </div>
    </Card>
  );
}
