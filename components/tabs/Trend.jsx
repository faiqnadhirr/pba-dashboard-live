"use client";
import React, { useMemo } from "react";
import { Card, Note, DataTable, Tag, Gloss, fInt, fH, fPct, fPP, fNum } from "@/components/ui";
import { clusterTable } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { TrendTag } from "@/components/tabs/Impact";

export default function Trend({ scope, cfg }) {
  const cl = useMemo(() => clusterTable(scope, cfg), [scope, cfg]);
  const order = { Deteriorating: 0, Mixed: 1, Stable: 2, Improving: 3, "Insufficient data": 4 };
  const vn = (x) => cl.filter((c) => c.vs_network === x).length;
  const rows = [...cl].sort((a, b) => order[a.trend] - order[b.trend] || (a.delta_pp ?? 0) - (b.delta_pp ?? 0));
  const n = (x) => cl.filter((c) => c.trend === x).length;
  const A = cfg.availability;
  return (
    <div className="space-y-4">
      <Note>{t("trend.note", { tp: fNum(A.trend_pp, 2), qm: A.dark_quarter_min_months, h: A.dark_month_h, ts: A.trend_dark_share_pp, min: A.min_cluster_sites })}<Gloss k="dark_site" /></Note>
      <Note tone="warn">{t("trend.network_note", { d: fPP(cl.network_delta_pp), tp: fNum(A.trend_pp, 2) })}</Note>
      <div className="flex flex-wrap gap-2 text-[12.5px]">
        <Tag tone="crit">▼ {tv("trend", "Deteriorating")} {n("Deteriorating")}</Tag><Tag tone="warn">◆ {tv("trend", "Mixed")} {n("Mixed")}</Tag><Tag tone="mut">{tv("trend", "Stable")} {n("Stable")}</Tag>
        <Tag tone="good">▲ {tv("trend", "Improving")} {n("Improving")}</Tag><Tag tone="mut">{tv("trend", "Insufficient data")} {n("Insufficient data")}</Tag>
        <span className="text-slate ml-2">{t("trend.vs_network")}:</span><Tag tone="crit">{t("trend.worse")} {vn("Worse than network")}</Tag><Tag tone="mut">{t("trend.inline")} {vn("In line with network")}</Tag><Tag tone="good">{t("trend.better")} {vn("Better than network")}</Tag>
      </div>
      <Card title={t("trend.table.title")} sub={t("trend.table.sub")}>
        <DataTable rows={rows} pageSize={40} filename="pba_cluster_trend.csv" columns={[
          { key: "cluster", label: "col.cluster", render: (r) => <span className="font-semibold text-navy">{r.cluster}</span> }, { key: "nop", label: "col.nop" }, { key: "sites", label: "col.sites", num: true, render: (r) => fInt(r.sites), csv: (r) => r.sites },
          { key: "trend", label: "col.trend", render: (r) => <TrendTag r={r} />, csv: (r) => r.trend },
          { key: "vs_network", label: "col.vs_network", sortVal: (r) => r.vs_network_pp, render: (r) => (r.vs_network ? <Tag tone={r.vs_network.startsWith("Worse") ? "crit" : r.vs_network.startsWith("Better") ? "good" : "mut"} title={`${fPP(r.vs_network_pp)}`}>{tv("vsnet", r.vs_network)}</Tag> : "—"), csv: (r) => r.vs_network },
          { key: "q1_avail", label: "col.q1_avail", num: true, render: (r) => fPct(r.q1_avail), csv: (r) => r.q1_avail?.toFixed(3) },
          { key: "q2_avail", label: "col.q2_avail", num: true, render: (r) => fPct(r.q2_avail), csv: (r) => r.q2_avail?.toFixed(3) },
          { key: "delta_pp", label: "col.change", num: true, render: (r) => <span className={r.delta_pp < 0 ? "text-[#b42318] font-semibold" : ""}>{fPP(r.delta_pp)}</span>, csv: (r) => r.delta_pp?.toFixed(3) },
          { key: "q1_dark", label: "col.dark_q1", num: true }, { key: "q2_dark", label: "col.dark_q2", num: true },
          { key: "dark_share_delta_pp", label: "col.dark_share_change", num: true, render: (r) => (r.dark_share_delta_pp == null ? "—" : fPP(r.dark_share_delta_pp, 1)), csv: (r) => r.dark_share_delta_pp?.toFixed(1) },
          { key: "q1_power_h", label: "col.power_q1", num: true, render: (r) => fH(r.q1_power_h), csv: (r) => r.q1_power_h.toFixed(1) }, { key: "q2_power_h", label: "col.power_q2", num: true, render: (r) => fH(r.q2_power_h), csv: (r) => r.q2_power_h.toFixed(1) },
          { key: "trend_why", label: "col.why", wrap: true },
        ]} />
      </Card>
    </div>
  );
}
