"use client";
// v4.0 — base camps: one status per camp (idle / busy / late / watch / good), on time only from ≥ 10 judged jobs, need coverage from event pairs
// (≤ 100 %), base-camp code instead of the person's name unless "show names" is on. Compact table by default; "all columns" for analysts.
import React, { useMemo, useState } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { Card, Kpi, Note, DataTable, EvTag, fInt, fH, fPct, fNum, fMin, isNum } from "@/components/ui";
import { PERF_KEYS, campCode } from "@/lib/mbpperf";
import { kpiFor } from "@/lib/kpi";
import { PERF_COLOR, PerfTag, UtilTag, OntimeTag, PerfFormula } from "@/components/perfUi";
import { t } from "@/lib/i18n";

const med = (v) => { const a = v.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const pct = (v, d = 0) => (isNum(v) ? fPct(100 * v, d) : "—");

export default function Performance({ mbpsScope, perf, cfg, openMbp, data, K, nop, names, setNames }) {
  const rows = useMemo(() => mbpsScope.map((m) => perf.get(m.mbp_id)).filter(Boolean), [mbpsScope, perf]);
  const [hide, setHide] = useState([]), [all, setAll] = useState(false);
  const vis = rows.filter((r) => !hide.includes(r.key));
  const sum = (k, L = vis) => L.reduce((a, r) => a + (r[k] || 0), 0);
  const C = cfg.mbp_perf || {}, minN = C.min_jobs ?? 10;
  const k = kpiFor(K, nop);
  const pts = vis.filter((r) => r.ontime_rate != null).map((r) => ({ x: 100 * r.ontime_rate, y: 100 * r.busy, z: r.jobs, k: r.key, id: r.mbp_id, code: names ? r.mbp_id : r.code }));
  const flagged = vis.filter((r) => r.nobat_flag);
  const open = (id) => openMbp(data.mbps.find((m) => m.mbp_id === id));
  const counts = Object.fromEntries(PERF_KEYS.map((x) => [x, rows.filter((r) => r.key === x).length]));
  const nm = (r) => (names ? r.mbp_id : r.code || campCode(r.mbp_id));
  if (!(data.tickets || []).length) return <Note tone="warn">{t("perf.na")}</Note>;
  const base = [
    { key: "code", label: "col.basecamp", sortVal: (r) => nm(r), render: (r) => nm(r), csv: (r) => nm(r) }, { key: "nop", label: "col.nop" },
    { key: "key", label: "col.mbp_status", sortVal: (r) => PERF_KEYS.indexOf(r.key) * 1000 + (r.ontime_rate ?? 1) * 100, render: (r) => <PerfTag k={r.key} />, csv: (r) => r.key },
    { key: "jobs_month", label: "perf.col.jobs_month", num: true, render: (r) => fNum(r.jobs_month, 1), csv: (r) => r.jobs_month.toFixed(2) },
    { key: "busy", label: "perf.col.busy", num: true, render: (r) => pct(r.busy, 1), csv: (r) => (100 * r.busy).toFixed(2) },
    { key: "ontime_rate", label: "perf.col.ontime", num: true, sortVal: (r) => r.ontime_rate ?? -1, render: (r) => (r.ontime_rate == null ? <span className="text-mut" title={t("perf.min_n", { n: minN })}>n {fInt(r.judged)} &lt; {minN}</span> : `${pct(r.ontime_rate)} · n ${fInt(r.judged)}`), csv: (r) => (r.ontime_rate == null ? "" : (100 * r.ontime_rate).toFixed(1)) },
    { key: "resp", label: "col.need_cov", num: true, sortVal: (r) => r.resp ?? -1, render: (r) => (r.resp == null ? <span className="text-mut">n {fInt(r.need)} &lt; {minN}</span> : `${pct(r.resp)} · ${fInt(r.need_served)}/${fInt(r.need)}`), csv: (r) => (r.resp == null ? "" : (100 * r.resp).toFixed(1)) },
    { key: "nobat", label: "perf.col.nobat", num: true, render: (r) => (r.nobat ? <span className={r.nobat_flag ? "text-[#8a5a00] font-semibold" : ""}>{r.nobat_flag ? "⚑ " : ""}{fInt(r.nobat)}</span> : "0"), csv: (r) => `${r.nobat}${r.nobat_flag ? " FLAG" : ""}` },
  ];
  const extra = [
    { key: "score", label: "col.perf_score", num: true, sortVal: (r) => r.score ?? 999, render: (r) => (r.score == null ? "—" : `${r.score} · #${r.rank}`), csv: (r) => r.score ?? "" },
    { key: "jobs", label: "perf.col.jobs", num: true },
    { key: "util_key", label: "perf.col.util", render: (r) => <UtilTag k={r.util_key} />, csv: (r) => r.util_key },
    { key: "ontime_key", label: "perf.col.ontime_cls", render: (r) => <OntimeTag k={r.ontime_key} />, csv: (r) => r.ontime_key },
    { key: "busy_h_month", label: "perf.col.rh_month", num: true, render: (r) => fH(r.busy_h_month), csv: (r) => r.busy_h_month.toFixed(1) },
    { key: "late", label: "perf.col.late", num: true }, { key: "no_checkin", label: "perf.col.no_checkin", num: true },
    { key: "backup_rate", label: "perf.col.backup", num: true, render: (r) => pct(r.backup_rate), csv: (r) => (r.backup_rate == null ? "" : (100 * r.backup_rate).toFixed(1)) },
    { key: "p12_share", label: "perf.col.p12_share", num: true, render: (r) => pct(r.p12_share), csv: (r) => (r.p12_share == null ? "" : (100 * r.p12_share).toFixed(1)) },
    { key: "sites_served", label: "perf.col.sites_served", num: true },
    { key: "area_jobs", label: "perf.col.area_jobs", num: true },
    { key: "capture", label: "perf.col.capture", num: true, render: (r) => pct(r.capture), csv: (r) => (r.capture == null ? "" : (100 * r.capture).toFixed(1)) },
    { key: "arr_median", label: "perf.col.arr_median", num: true, render: (r) => fMin(r.arr_median), csv: (r) => r.arr_median ?? "" },
  ];

  return (
    <div className="space-y-4">
      <Note>{t("perf.note2", { n: minN })}</Note>
      <div className="flex flex-wrap items-center gap-2 text-[12px]" role="group" aria-label={t("perf.legend")}>
        <span className="text-slate">{t("perf.filter")}:</span>
        {PERF_KEYS.map((x) => { const on = !hide.includes(x); return (
          <button key={x} aria-pressed={on} onClick={() => setHide(on ? [...hide, x] : hide.filter((y) => y !== x))} title={t(`perf.key_tip.${x}`)}
            className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border ${on ? "bg-white border-slate/40" : "bg-surface border-line text-mut line-through"}`}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/30" style={{ background: on ? PERF_COLOR[x] : "#C9CFD9" }} />{t(`perf.key.${x}`)} <span className="tabular text-mut">{counts[x]}</span></button>); })}
        {hide.length > 0 && <button className="text-s1 underline" onClick={() => setHide([])}>{t("map.leg_all")}</button>}
        <label className="ml-auto inline-flex items-center gap-1 text-slate"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} className="accent-navy" />{t("mgmt.names")}</label>
      </div>
      {flagged.length > 0 && <Note tone="warn">⚑ {t("perf.nobat_note", { n: fInt(flagged.length), j: fInt(sum("nobat", flagged)), p: Math.round(100 * (C.nobat_flag_share ?? 0.3)) })}</Note>}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Kpi scope="filtered" fixed label={t("perf.kpi.camps")} value={fInt(vis.length)} sub={t("perf.kpi.camps_sub2", { i: fInt((counts.under || 0) + (counts.none || 0)), b: fInt(counts.high || 0), l: fInt(counts.low || 0) })} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.jobs")} value={fInt(sum("jobs"))} sub={t("perf.kpi.jobs_sub", { m: fNum(med(vis.map((r) => r.jobs_month)), 1) })} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.busy")} value={pct(k?.occupancy_median, 1)} sub={t("perf.kpi.busy_sub", { h: C.period_hours ?? 4344 })} help={t("perf.kpi.busy_help")} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.ontime")} value={pct(k?.jobs_ontime_pct)} sub={t("perf.kpi.ontime_sub", { a: fInt(k?.jobs_ontime), n: fInt(k?.jobs_judged) })} tone={(k?.jobs_ontime_pct ?? 0) >= (C.ontime_good ?? 0.6) ? "good" : "crit"} help={t("perf.kpi.ontime_help")} />
        <Kpi scope="filtered" fixed label={t("mgmt.kpi.need")} value={pct(k?.served_pct, 1)} sub={t("mgmt.kpi.need_sub", { a: fInt(k?.served), n: fInt(k?.need), x: fInt(k?.extra_jobs) })} help={t("mgmt.kpi.need_help")} tone="crit" />
      </div>
      <Card title={t("perf.table.title")} sub={t("perf.table.sub2")} right={<label className="inline-flex items-center gap-1 text-[12px] text-slate"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-navy" />{t("perf.all_cols")}</label>}>
        <DataTable rows={vis} pageSize={25} filename="pba_mbp_basecamps.csv" initialSort={{ key: "key", dir: 1 }} onRowClick={(r) => open(r.mbp_id)} columns={all ? [...base, ...extra] : base} />
      </Card>
      <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
        <Card title={t("perf.scatter.title2")} sub={t("perf.scatter.sub2", { n: minN })}>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="#E3E7ED" />
              <XAxis type="number" dataKey="x" name={t("perf.col.ontime")} unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "#6B7588" }} label={{ value: t("perf.scatter.x3"), position: "insideBottom", offset: -4, fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name={t("perf.col.busy")} unit="%" tick={{ fontSize: 11, fill: "#6B7588" }} width={44} />
              <ZAxis type="number" dataKey="z" range={[20, 260]} />
              <ReferenceLine y={100 * (C.under_busy_max ?? 0.03)} stroke="#A3ABB9" strokeDasharray="4 3" />
              <ReferenceLine y={100 * (C.high_busy_min ?? 0.25)} stroke="#6b4bd8" strokeDasharray="4 3" />
              <ReferenceLine x={100 * (C.ontime_low ?? 0.35)} stroke="#d03b3b" strokeDasharray="4 3" />
              <ReferenceLine x={100 * (C.ontime_good ?? 0.6)} stroke="#0ca30c" strokeDasharray="4 3" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => { const p = payload?.[0]?.payload; return p ? <div className="bg-white border border-line rounded px-2 py-1 text-[11.5px] shadow">
                <b>{p.code}</b><br />{t("perf.col.ontime")}: {fPct(p.x, 0)} · {t("perf.col.busy")}: {fPct(p.y, 1)} · {fInt(p.z)} job<br />{t(`perf.key.${p.k}`)}</div> : null; }} />
              <Scatter data={pts} onClick={(p) => open(p.id)} cursor="pointer">{pts.map((p, i) => <Cell key={i} fill={PERF_COLOR[p.k]} stroke="#1F2A44" strokeWidth={0.6} />)}</Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t("perf.formula.card")}>
          <PerfFormula cfg={cfg} />
          <div className="mt-2 text-[11px] text-mut inline-flex items-center gap-1">{t("perf.evidence")} <EvTag v="ACTUAL" /> + BBT <EvTag v="ESTIMATED" /></div>
        </Card>
      </div>
    </div>
  );
}
