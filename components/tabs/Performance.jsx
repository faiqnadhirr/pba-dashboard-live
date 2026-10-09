"use client";
// v3.7 — MBP performance & utilisation per base camp (ACTUAL H1 PLN-off job tickets; on-time judged against each site's BBT).
import React, { useMemo, useState } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { Card, Kpi, Note, DataTable, EvTag, fInt, fH, fPct, fNum, fMin, isNum } from "@/components/ui";
import { PERF_KEYS } from "@/lib/mbpperf";
import { PERF_COLOR, PerfTag, UtilTag, OntimeTag, RespTag, PerfFormula } from "@/components/perfUi";
import { t } from "@/lib/i18n";

const med = (v) => { const a = v.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const pct = (v, d = 0) => (isNum(v) ? fPct(100 * v, d) : "—");

export default function Performance({ mbpsScope, perf, cfg, openMbp, data }) {
  const rows = useMemo(() => mbpsScope.map((m) => perf.get(m.mbp_id)).filter(Boolean), [mbpsScope, perf]);
  const [hide, setHide] = useState([]);
  const vis = rows.filter((r) => !hide.includes(r.key));
  const sum = (k, L = vis) => L.reduce((a, r) => a + (r[k] || 0), 0);
  const judged = sum("ontime") + sum("late");
  const C = cfg.mbp_perf || {};
  const pts = vis.filter((r) => r.jobs > 0 && r.resp != null).map((r) => ({ x: Math.min(200, 100 * r.resp), y: 100 * r.busy, z: r.jobs, k: r.key, id: r.mbp_id, raw: r.resp }));
  const need = sum("need"), areaPln = sum("area_pln_jobs"), flagged = vis.filter((r) => r.nobat_flag);
  const open = (id) => openMbp(data.mbps.find((m) => m.mbp_id === id));
  const counts = Object.fromEntries(PERF_KEYS.map((k) => [k, rows.filter((r) => r.key === k).length]));

  return (
    <div className="space-y-4">
      <Note>{t("perf.note")}</Note>
      <div className="flex flex-wrap items-center gap-2 text-[12px]" role="group" aria-label={t("perf.legend")}>
        <span className="text-slate">{t("perf.filter")}:</span>
        {PERF_KEYS.map((k) => { const on = !hide.includes(k); return (
          <button key={k} aria-pressed={on} onClick={() => setHide(on ? [...hide, k] : hide.filter((x) => x !== k))} title={t(`perf.key_tip.${k}`)}
            className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border ${on ? "bg-white border-slate/40" : "bg-surface border-line text-mut line-through"}`}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/30" style={{ background: on ? PERF_COLOR[k] : "#C9CFD9" }} />{t(`perf.key.${k}`)} <span className="tabular text-mut">{counts[k]}</span></button>); })}
        {hide.length > 0 && <button className="text-s1 underline" onClick={() => setHide([])}>{t("map.leg_all")}</button>}
      </div>
      {flagged.length > 0 && <Note tone="warn">⚑ {t("perf.nobat_note", { n: fInt(flagged.length), j: fInt(sum("nobat", flagged)), p: Math.round(100 * (C.nobat_flag_share ?? 0.3)) })}</Note>}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi scope="filtered" fixed label={t("perf.kpi.camps")} value={fInt(vis.length)} sub={t("perf.kpi.camps_sub", { n: fInt(vis.filter((r) => r.jobs > 0).length) })} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.jobs")} value={fInt(sum("jobs"))} sub={t("perf.kpi.jobs_sub", { m: fNum(med(vis.map((r) => r.jobs_month)), 1) })} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.resp")} value={need >= 1 ? fPct((100 * areaPln) / need, 0) : "—"} sub={t("perf.kpi.resp_sub", { a: fInt(areaPln), n: fInt(need) })} help={t("perf.kpi.resp_help")} tone={areaPln / Math.max(1, need) >= (C.resp_good ?? 0.8) ? "good" : "warn"} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.busy")} value={pct(med(vis.filter((r) => r.jobs).map((r) => r.busy)), 1)} sub={t("perf.kpi.busy_sub", { h: C.period_hours ?? 4344 })} help={t("perf.kpi.busy_help")} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.ontime")} value={judged ? fPct((100 * sum("ontime")) / judged, 0) : "—"} sub={t("perf.kpi.ontime_sub", { a: fInt(sum("ontime")), n: fInt(judged) })} tone={sum("ontime") / Math.max(1, judged) >= (C.ontime_good ?? 0.6) ? "good" : "crit"} help={t("perf.kpi.ontime_help")} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.backup")} value={sum("jobs") ? fPct((100 * sum("genset")) / sum("jobs"), 0) : "—"} sub={t("perf.kpi.backup_sub", { p: fInt(sum("pln_back")), n: fInt(sum("no_checkin")) })} />
        <Kpi scope="filtered" fixed label={t("perf.kpi.nobat")} value={fInt(flagged.length)} sub={t("perf.kpi.nobat_sub", { j: fInt(sum("nobat")) })} tone={flagged.length ? "warn" : "good"} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
        <Card title={t("perf.scatter.title")} sub={t("perf.scatter.sub")}>
          <ResponsiveContainer width="100%" height={340}>
            <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid stroke="#E3E7ED" />
              <XAxis type="number" dataKey="x" name={t("perf.col.resp")} unit="%" domain={[0, 200]} tick={{ fontSize: 11, fill: "#6B7588" }} label={{ value: t("perf.scatter.x2"), position: "insideBottom", offset: -4, fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name={t("perf.col.busy")} unit="%" tick={{ fontSize: 11, fill: "#6B7588" }} width={44} />
              <ZAxis type="number" dataKey="z" range={[20, 260]} />
              <ReferenceLine y={100 * (C.under_busy_max ?? 0.03)} stroke="#A3ABB9" strokeDasharray="4 3" />
              <ReferenceLine y={100 * (C.high_busy_min ?? 0.25)} stroke="#6b4bd8" strokeDasharray="4 3" />
              <ReferenceLine x={100 * (C.resp_low ?? 0.5)} stroke="#d03b3b" strokeDasharray="4 3" />
              <ReferenceLine x={100 * (C.resp_good ?? 0.8)} stroke="#0ca30c" strokeDasharray="4 3" />
              <ReferenceLine x={100 * (C.resp_over ?? 1.5)} stroke="#2a78d6" strokeDasharray="4 3" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ payload }) => { const p = payload?.[0]?.payload; return p ? <div className="bg-white border border-line rounded px-2 py-1 text-[11.5px] shadow">
                <b>{p.id}</b><br />{t("perf.col.resp")}: {fPct(100 * p.raw, 0)} · {t("perf.col.busy")}: {fPct(p.y, 1)} · {fInt(p.z)} job<br />{t(`perf.key.${p.k}`)}</div> : null; }} />
              <Scatter data={pts} onClick={(p) => open(p.id)} cursor="pointer">{pts.map((p, i) => <Cell key={i} fill={PERF_COLOR[p.k]} stroke="#1F2A44" strokeWidth={0.6} />)}</Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <div className="text-[11px] text-mut">{t("perf.scatter.foot")}</div>
        </Card>
        <Card title={t("perf.formula.card")}>
          <PerfFormula cfg={cfg} />
          <ul className="mt-2 text-[12px] text-slate space-y-1 list-disc pl-4">
            {["k1", "k2", "k3", "k4"].map((k) => <li key={k}>{t(`perf.explain.${k}`)}</li>)}
          </ul>
          <div className="mt-2 text-[11px] text-mut inline-flex items-center gap-1">{t("perf.evidence")} <EvTag v="ACTUAL" /> + BBT <EvTag v="ESTIMATED" /></div>
        </Card>
      </div>
      <Card title={t("perf.table.title")} sub={t("perf.table.sub")}>
        <DataTable rows={vis} pageSize={30} filename="pba_mbp_performance.csv" initialSort={{ key: "score", dir: 1 }} onRowClick={(r) => open(r.mbp_id)} columns={[
          { key: "mbp_id", label: "col.basecamp" }, { key: "nop", label: "col.nop" },
          { key: "key", label: "col.mbp_status", render: (r) => <PerfTag k={r.key} />, csv: (r) => r.key },
          { key: "score", label: "col.perf_score", num: true, sortVal: (r) => r.score ?? 999, render: (r) => (r.score == null ? "—" : `${r.score} · #${r.rank}`), csv: (r) => r.score ?? "" },
          { key: "need_month", label: "perf.col.need_month", num: true, render: (r) => fNum(r.need_month, 1), csv: (r) => r.need_month.toFixed(2) },
          { key: "resp", label: "perf.col.resp", num: true, sortVal: (r) => r.resp ?? -1, render: (r) => (r.resp == null ? "—" : <RespTag k={r.resp_key} v={fPct(100 * r.resp, 0)} />), csv: (r) => (r.resp == null ? "" : (100 * r.resp).toFixed(1)) },
          { key: "jobs", label: "perf.col.jobs", num: true }, { key: "jobs_month", label: "perf.col.jobs_month", num: true, render: (r) => fNum(r.jobs_month, 1), csv: (r) => r.jobs_month.toFixed(2) },
          { key: "busy", label: "perf.col.busy", num: true, render: (r) => <span className="inline-flex items-center gap-1">{pct(r.busy, 1)} <UtilTag k={r.util_key} /></span>, csv: (r) => (100 * r.busy).toFixed(2) },
          { key: "busy_h_month", label: "perf.col.rh_month", num: true, render: (r) => fH(r.busy_h_month), csv: (r) => r.busy_h_month.toFixed(1) },
          { key: "ontime_rate", label: "perf.col.ontime", num: true, sortVal: (r) => r.ontime_rate ?? -1, render: (r) => <span className="inline-flex items-center gap-1">{pct(r.ontime_rate)} <OntimeTag k={r.ontime_key} /></span>, csv: (r) => (r.ontime_rate == null ? "" : (100 * r.ontime_rate).toFixed(1)) },
          { key: "late", label: "perf.col.late", num: true }, { key: "no_checkin", label: "perf.col.no_checkin", num: true },
          { key: "backup_rate", label: "perf.col.backup", num: true, render: (r) => pct(r.backup_rate), csv: (r) => (r.backup_rate == null ? "" : (100 * r.backup_rate).toFixed(1)) },
          { key: "p12_share", label: "perf.col.p12_share", num: true, render: (r) => pct(r.p12_share), csv: (r) => (r.p12_share == null ? "" : (100 * r.p12_share).toFixed(1)) },
          { key: "hiclass_share", label: "perf.col.hiclass", num: true, render: (r) => pct(r.hiclass_share), csv: (r) => (r.hiclass_share == null ? "" : (100 * r.hiclass_share).toFixed(1)) },
          { key: "sites_served", label: "perf.col.sites_served", num: true },
          { key: "in_radius", label: "perf.col.in_radius", num: true, render: (r) => `${fInt(r.in_radius)} (${fInt(r.in_radius_p12)})`, csv: (r) => r.in_radius },
          { key: "area_jobs", label: "perf.col.area_jobs", num: true },
          { key: "capture", label: "perf.col.capture", num: true, render: (r) => pct(r.capture), csv: (r) => (r.capture == null ? "" : (100 * r.capture).toFixed(1)) },
          { key: "arr_median", label: "perf.col.arr_median", num: true, render: (r) => fMin(r.arr_median), csv: (r) => r.arr_median ?? "" },
          { key: "nobat", label: "perf.col.nobat", num: true, render: (r) => (r.nobat ? <span className={r.nobat_flag ? "text-[#8a5a00] font-semibold" : ""}>{r.nobat_flag ? "⚑ " : ""}{fInt(r.nobat)}</span> : "0"), csv: (r) => `${r.nobat}${r.nobat_flag ? " FLAG" : ""}` },
        ]} />
      </Card>
    </div>
  );
}
