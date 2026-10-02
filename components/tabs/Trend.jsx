"use client";
import React, { useMemo } from "react";
import { Card, Note, DataTable, Tag, fInt, fH, fPct, fPP } from "@/components/ui";
import { clusterTable } from "@/lib/logic";

export default function Trend({ scope, cfg }) {
  const cl = useMemo(() => clusterTable(scope, cfg), [scope, cfg]);
  const order = { Deteriorating: 0, Mixed: 1, Stable: 2, Improving: 3, "Insufficient data": 4 };
  const vn = (t) => cl.filter((c) => c.vs_network === t).length;
  const rows = [...cl].sort((a, b) => order[a.trend] - order[b.trend] || (a.delta_pp ?? 0) - (b.delta_pp ?? 0));
  const n = (t) => cl.filter((c) => c.trend === t).length;
  const A = cfg.availability;
  return (
    <div className="space-y-4">
      <Note>
        <b>Clusters getting worse</b> compares <b>Q1 (Jan–Mar)</b> with <b>Q2 (Apr–Jun 2026)</b>. <b>Primary signal:</b> availability change (wall-clock, RAN) — ≤ −{A.trend_pp} pp = Deteriorating, ≥ +{A.trend_pp} pp = Improving.
        <b> Secondary signal:</b> change in the <i>share</i> of the cluster's sites that are dark (≥ {A.dark_quarter_min_months} of 3 months with ≥ {A.dark_month_h} h power downtime), threshold ±{A.trend_dark_share_pp} pp of sites.
        When the two signals point in different directions (or availability is stable but the dark share moves) the cluster is <b>Mixed</b>, with the reason. Fewer than {A.min_cluster_sites} sites with data in both quarters = <b>Insufficient data</b>. Thresholds are in Config.
      </Note>
      <Note tone="warn">
        Power downtime peaked in May 2026 across AREA1: the whole scope moved <b>{fPP(cl.network_delta_pp)}</b> from Q1 to Q2. Most clusters therefore really are worse in Q2.
        To separate local problems from that network-wide event, the <b>vs network</b> column compares each cluster's change with the scope's change (±{A.trend_pp} pp).
      </Note>
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Tag tone="crit">▼ Deteriorating {n("Deteriorating")}</Tag><Tag tone="warn">◆ Mixed {n("Mixed")}</Tag><Tag tone="mut">Stable {n("Stable")}</Tag><Tag tone="good">▲ Improving {n("Improving")}</Tag><Tag tone="mut">Insufficient data {n("Insufficient data")}</Tag>
        <span className="text-slate ml-2">vs network:</span><Tag tone="crit">worse {vn("Worse than network")}</Tag><Tag tone="mut">in line {vn("In line with network")}</Tag><Tag tone="good">better {vn("Better than network")}</Tag>
      </div>
      <Card title="Clusters — Q1 vs Q2" sub="Sorted: deteriorating first, largest availability drop first.">
        <DataTable rows={rows} pageSize={40} filename="pba_cluster_trend.csv" columns={[
          { key: "cluster", label: "Cluster", render: (r) => <span className="font-semibold text-navy">{r.cluster}</span> }, { key: "nop", label: "NOP" }, { key: "sites", label: "Sites", num: true },
          { key: "trend", label: "Trend", render: (r) => <Tag tone={r.trend === "Deteriorating" ? "crit" : r.trend === "Improving" ? "good" : r.trend === "Mixed" ? "warn" : "mut"}>{r.trend === "Deteriorating" ? "▼ " : r.trend === "Improving" ? "▲ " : r.trend === "Mixed" ? "◆ " : ""}{r.trend}</Tag> },
          { key: "vs_network", label: "vs network", sortVal: (r) => r.vs_network_pp, render: (r) => (r.vs_network ? <Tag tone={r.vs_network.startsWith("Worse") ? "crit" : r.vs_network.startsWith("Better") ? "good" : "mut"} title={`${fPP(r.vs_network_pp)} vs scope`}>{r.vs_network}</Tag> : "—"), csv: (r) => r.vs_network },
          { key: "q1_avail", label: "Previous availability (Q1)", num: true, render: (r) => fPct(r.q1_avail) },
          { key: "q2_avail", label: "Current availability (Q2)", num: true, render: (r) => fPct(r.q2_avail) },
          { key: "delta_pp", label: "Change", num: true, render: (r) => <span className={r.delta_pp < 0 ? "text-[#b42318] font-semibold" : ""}>{fPP(r.delta_pp)}</span> },
          { key: "q1_dark", label: "Dark sites Q1", num: true }, { key: "q2_dark", label: "Dark sites Q2", num: true },
          { key: "dark_share_delta_pp", label: "Dark share change", num: true, render: (r) => (r.dark_share_delta_pp == null ? "—" : `${r.dark_share_delta_pp > 0 ? "+" : ""}${r.dark_share_delta_pp.toFixed(1)} pp`), csv: (r) => r.dark_share_delta_pp?.toFixed(1) },
          { key: "q1_power_h", label: "Power downtime Q1", num: true, render: (r) => fH(r.q1_power_h) }, { key: "q2_power_h", label: "Power downtime Q2", num: true, render: (r) => fH(r.q2_power_h) },
          { key: "trend_why", label: "Why", wrap: true },
        ]} />
      </Card>
    </div>
  );
}
