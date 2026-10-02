"use client";
import React, { useMemo } from "react";
import { Card, Note, DataTable, Tag, fInt, fH, fPct, fPP } from "@/components/ui";
import { clusterTable } from "@/lib/logic";

export default function Trend({ scope, cfg }) {
  const cl = useMemo(() => clusterTable(scope, cfg), [scope, cfg]);
  const order = { Deteriorating: 0, Stable: 1, Improving: 2, "Insufficient data": 3 };
  const rows = [...cl].sort((a, b) => order[a.trend] - order[b.trend] || (a.delta_pp ?? 0) - (b.delta_pp ?? 0));
  const n = (t) => cl.filter((c) => c.trend === t).length;
  const A = cfg.availability;
  return (
    <div className="space-y-4">
      <Note>
        <b>Clusters getting worse</b> compares two measured periods: <b>Q1 (Jan–Mar)</b> vs <b>Q2 (Apr–Jun 2026)</b>, wall-clock availability from the RAN feed.
        Deteriorating = availability fell by ≥ {A.trend_pp} pp <i>or</i> dark sites rose by ≥ {A.trend_dark_sites}; Improving = the opposite; otherwise Stable.
        Clusters with fewer than {A.min_cluster_sites} sites having data in both periods are <b>Insufficient data</b>. No label is given without a temporal comparison.
        Note: power downtime peaked in May 2026 across AREA1, so most clusters show Q2 worse than Q1.
      </Note>
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Tag tone="crit">▼ Deteriorating {n("Deteriorating")}</Tag><Tag tone="mut">Stable {n("Stable")}</Tag><Tag tone="good">▲ Improving {n("Improving")}</Tag><Tag tone="mut">Insufficient data {n("Insufficient data")}</Tag>
      </div>
      <Card title="Clusters — Q1 vs Q2" sub="Sorted: deteriorating first, largest availability drop first.">
        <DataTable rows={rows} pageSize={40} filename="pba_cluster_trend.csv" columns={[
          { key: "cluster", label: "Cluster", render: (r) => <span className="font-semibold text-navy">{r.cluster}</span> }, { key: "nop", label: "NOP" }, { key: "sites", label: "Sites", num: true },
          { key: "trend", label: "Trend", render: (r) => <Tag tone={r.trend === "Deteriorating" ? "crit" : r.trend === "Improving" ? "good" : "mut"}>{r.trend === "Deteriorating" ? "▼ " : r.trend === "Improving" ? "▲ " : ""}{r.trend}</Tag> },
          { key: "q1_avail", label: "Previous availability (Q1)", num: true, render: (r) => fPct(r.q1_avail) },
          { key: "q2_avail", label: "Current availability (Q2)", num: true, render: (r) => fPct(r.q2_avail) },
          { key: "delta_pp", label: "Change", num: true, render: (r) => <span className={r.delta_pp < 0 ? "text-[#b42318] font-semibold" : ""}>{fPP(r.delta_pp)}</span> },
          { key: "q1_dark", label: "Dark sites Q1", num: true }, { key: "q2_dark", label: "Dark sites Q2", num: true },
          { key: "dark_change", label: "Change", num: true, sortVal: (r) => r.q2_dark - r.q1_dark, render: (r) => `${r.q2_dark - r.q1_dark > 0 ? "+" : ""}${r.q2_dark - r.q1_dark}`, csv: (r) => r.q2_dark - r.q1_dark },
          { key: "q1_power_h", label: "Power downtime Q1", num: true, render: (r) => fH(r.q1_power_h) }, { key: "q2_power_h", label: "Power downtime Q2", num: true, render: (r) => fH(r.q2_power_h) },
          { key: "trend_why", label: "Why", wrap: true },
        ]} />
      </Card>
    </div>
  );
}
