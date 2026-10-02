"use client";
import React, { useMemo, useState } from "react";
import { Card, Note, DataTable, AvailTriple, LevelTag, StatusTag, EvTag, Tag, BbtCell, bbtCsv, fInt, fH, fMin, fPP, f2, isNum } from "@/components/ui";
import { clusterTable, topWorstSites, RESP } from "@/lib/logic";

const CW = { share_dark: "% sites dark", power_downtime_per_site: "power downtime / site", availability_gap: "availability gap", p1p2_dark_share: "MBP-P1/P2 dark share" };
const SW = { availability_gap: "availability gap", power_downtime: "power downtime", bbt_risk: "battery risk", priority: "MBP priority", recurrence: "PLN recurrence", criticality: "site class" };
const Parts = ({ parts, labels }) => (
  <span className="inline-flex gap-1 flex-wrap">{Object.entries(parts || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="text-[10.5px] bg-line rounded px-1">{labels[k]} {v.toFixed(2)}</span>)}</span>
);

export default function Impact({ scope, cfg, setPick }) {
  const cl = useMemo(() => clusterTable(scope, cfg), [scope, cfg]);
  const ranked = cl.filter((c) => c.severity != null).sort((a, b) => b.severity - a.severity);
  const [sel, setSel] = useState(null);
  const top = useMemo(() => topWorstSites(scope, cfg, 15), [scope, cfg]);
  const drill = sel ? scope.filter((s) => s.cluster_to === sel).sort((a, b) => (b.ran_power_down_h || 0) - (a.ran_power_down_h || 0)) : [];
  const A = cfg.availability, darkDef = `≥ ${A.dark_min_months} of 6 months with ≥ ${A.dark_month_h} h power-caused downtime`;
  return (
    <div className="space-y-4">
      <Card title="Worst clusters — power sites dark" sub={`Severity, not volume: weighted percentile ranks of ${Object.entries(cfg.worst_cluster_weights).map(([k, v]) => `${CW[k]} ${Math.round(v * 100)}%`).join(" · ")}. A site is "dark (power)" when it has ${darkDef} (per month, not a 6-month total). Clusters < ${cfg.availability.min_cluster_sites} sites are excluded. Click a row to drill down.`}>
        <DataTable rows={ranked} pageSize={15} filename="pba_worst_clusters.csv" initialSort={{ key: "severity", dir: -1 }} onRowClick={(r) => setSel(r.cluster)}
          rowClass={(r) => (r.cluster === sel ? "bg-warn/20" : "")} columns={[
          { key: "severity", label: "Severity", num: true, render: (r) => f2(r.severity) },
          { key: "cluster", label: "Cluster", render: (r) => <span className="font-semibold text-navy">{r.cluster}</span> }, { key: "nop", label: "NOP" },
          { key: "sites", label: "Sites", num: true }, { key: "dark_sites", label: "Sites dark", num: true },
          { key: "share_dark", label: "% affected", num: true, render: (r) => `${Math.round(100 * r.share_dark)}%` },
          { key: "power_down_h", label: "Power downtime", num: true, render: (r) => fH(r.power_down_h) },
          { key: "gap_pp", label: "Availability · target · gap", num: true, render: (r) => <AvailTriple a={r.avail} t={r.target} g={r.gap_pp} compact />, csv: (r) => `${r.avail.toFixed(2)} / ${r.target.toFixed(2)} / ${r.gap_pp.toFixed(2)}` },
          { key: "power_contrib_pp", label: "…power part", num: true, render: (r) => (r.gap_pp < 0 ? fPP(r.power_contrib_pp) : "·") },
          { key: "p1p2_dark", label: "MBP-P1/P2 dark", num: true },
          { key: "trend", label: "Trend (Q1→Q2)", render: (r) => <Tag tone={r.trend === "Deteriorating" ? "crit" : r.trend === "Improving" ? "good" : r.trend === "Mixed" ? "warn" : "mut"} title={r.trend_why}>{r.trend === "Deteriorating" ? "▼ " : r.trend === "Improving" ? "▲ " : r.trend === "Mixed" ? "◆ " : ""}{r.trend}</Tag> },
          { key: "parts", label: "Severity components", render: (r) => <Parts parts={r.severity_parts} labels={CW} />, csv: (r) => Object.entries(r.severity_parts).map(([k, v]) => `${CW[k]} ${v.toFixed(2)}`).join("; ") },
        ]} />
      </Card>
      {sel && (
        <Card title={`Drill-down — ${sel}`} sub="Sites in this cluster, sorted by power downtime." right={<button onClick={() => setSel(null)} className="text-[12px] text-slate underline">close</button>}>
          <DataTable rows={drill} pageSize={25} filename={`pba_cluster_${sel}.csv`.replace(/\s+/g, "_")} onRowClick={setPick} initialSort={{ key: "ran_power_down_h", dir: -1 }} columns={[
            { key: "site_id", label: "Site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> }, { key: "site_name", label: "Name" }, { key: "site_class", label: "Class" },
            { key: "avail_delta_pp", label: "Availability · target · gap", num: true, render: (r) => <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact /> },
            { key: "ran_power_down_h", label: "Power downtime", num: true, render: (r) => fH(r.ran_power_down_h || 0), csv: (r) => (r.ran_power_down_h || 0).toFixed(1) },
            { key: "dark_months", label: "Dark months", num: true, render: (r) => (r.dark ? <Tag tone="crit">● {r.dark_months}/6</Tag> : `${r.dark_months}/6`), csv: (r) => r.dark_months },
            { key: "bbt_value_min", label: "BBT", num: true, sortVal: (r) => r.battery.display.value, render: (r) => <BbtCell r={r} />, csv: bbtCsv },
            { key: "mbp_priority_level", label: "MBP priority", render: (r) => <LevelTag kind="MBP" v={r.mbp_priority_level} /> },
            { key: "resp", label: "Power responsibility", render: (r) => RESP[r.resp.primary] || "—", csv: (r) => RESP[r.resp.primary] },
          ]} />
        </Card>
      )}
      <Card title="Top 15 worst sites" sub={`Operational shortlist (active sites with availability data). Score = weighted percentile ranks: ${Object.entries(cfg.top15_weights).map(([k, v]) => `${SW[k]} ${Math.round(v * 100)}%`).join(" · ")}. Each row shows its components and primary driver.`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular">
            <thead><tr className="text-slate text-left">{["#", "Site", "Availability · target · gap", "Power downtime", "BBT", "Battery", "MBP priority", "Primary driver", "Power responsibility", "Score components"].map((h) => <th key={h} className="px-2 py-1.5 border-b border-line whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{top.map((s, i) => (
              <tr key={s.site_id} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setPick(s)} onClick={() => setPick(s)} className="border-b border-line/70 cursor-pointer hover:bg-s1/5 align-top">
                <td className="px-2 py-1.5 font-semibold">{i + 1}</td>
                <td className="px-2 py-1.5"><span className="font-semibold text-navy">{s.site_id}</span><div className="text-[11px] text-mut">{s.site_name} · {s.site_class} · {s.nop}</div></td>
                <td className="px-2 py-1.5"><AvailTriple a={s.avail_wc_pct} t={s.ran_target_pct} g={s.avail_delta_pp} compact /></td>
                <td className="px-2 py-1.5">{fH(s.ran_power_down_h || 0)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap"><BbtCell r={s} /></td>
                <td className="px-2 py-1.5"><StatusTag v={s.bbt_status} /></td>
                <td className="px-2 py-1.5"><LevelTag kind="MBP" v={s.mbp_priority_level} /></td>
                <td className="px-2 py-1.5 font-medium">{s.primary_driver}<div className="text-[11px] text-mut">then {s.secondary_driver}</div></td>
                <td className="px-2 py-1.5">{RESP[s.resp.primary] || "—"}<div className="text-[11px] text-mut">{s.resp.kind}</div></td>
                <td className="px-2 py-1.5"><Parts parts={s.worst_parts} labels={SW} /></td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
