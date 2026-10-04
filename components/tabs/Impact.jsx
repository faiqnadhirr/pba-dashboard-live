"use client";
import React, { useMemo, useState } from "react";
import { Card, DataTable, AvailTriple, LevelTag, StatusTag, Tag, BbtCell, bbtCsv, Gloss, fInt, fH, fPP, fPct, f2 } from "@/components/ui";
import { clusterTable, topWorstSites } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";

export const TrendTag = ({ r }) => (
  <Tag tone={r.trend === "Deteriorating" ? "crit" : r.trend === "Improving" ? "good" : r.trend === "Mixed" ? "warn" : "mut"} title={te(r.trend_why, "trend")}>
    {r.trend === "Deteriorating" ? "▼ " : r.trend === "Improving" ? "▲ " : r.trend === "Mixed" ? "◆ " : ""}{tv("trend", r.trend)}</Tag>
);
const Parts = ({ parts, prefix }) => (
  <span className="inline-flex gap-1 flex-wrap">{Object.entries(parts || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="text-[10.5px] bg-line rounded px-1">{t(`${prefix}.${k}`)} {f2(v)}</span>)}</span>
);

export default function Impact({ scope, cfg, setPick }) {
  const cl = useMemo(() => clusterTable(scope, cfg), [scope, cfg]);
  const ranked = cl.filter((c) => c.severity != null).sort((a, b) => b.severity - a.severity);
  const [sel, setSel] = useState(null);
  const top = useMemo(() => topWorstSites(scope, cfg, 15), [scope, cfg]);
  const drill = sel ? scope.filter((s) => s.cluster_to === sel).sort((a, b) => (b.ran_power_down_h || 0) - (a.ran_power_down_h || 0)) : [];
  const A = cfg.availability;
  const wts = (w, prefix) => Object.entries(w).map(([k, v]) => `${t(`${prefix}.${k}`)} ${fPct(v * 100, 0)}`).join(" · ");
  return (
    <div className="space-y-4">
      <Card title={<>{t("impact.cl.title")}<Gloss k="dark_site" /></>} sub={t("impact.cl.sub", { w: wts(cfg.worst_cluster_weights, "cw"), m: A.dark_min_months, h: A.dark_month_h, n: A.min_cluster_sites })}>
        <DataTable rows={ranked} pageSize={15} filename="pba_worst_clusters.csv" initialSort={{ key: "severity", dir: -1 }} onRowClick={(r) => setSel(r.cluster)}
          rowClass={(r) => (r.cluster === sel ? "bg-warn/20" : "")} columns={[
          { key: "severity", label: "col.severity", num: true, render: (r) => f2(r.severity), csv: (r) => r.severity.toFixed(3) },
          { key: "cluster", label: "col.cluster", render: (r) => <span className="font-semibold text-navy">{r.cluster}</span> }, { key: "nop", label: "col.nop" },
          { key: "sites", label: "col.sites", num: true, render: (r) => fInt(r.sites), csv: (r) => r.sites }, { key: "dark_sites", label: "col.sites_dark", num: true, render: (r) => fInt(r.dark_sites), csv: (r) => r.dark_sites },
          { key: "share_dark", label: "col.pct_affected", num: true, render: (r) => fPct(100 * r.share_dark, 0), csv: (r) => Math.round(100 * r.share_dark) },
          { key: "power_down_h", label: "col.power_downtime", num: true, render: (r) => fH(r.power_down_h), csv: (r) => r.power_down_h.toFixed(1) },
          { key: "gap_pp", label: "col.avail_triple", num: true, render: (r) => <AvailTriple a={r.avail} t={r.target} g={r.gap_pp} compact />, csv: (r) => `${r.avail.toFixed(2)} / ${r.target.toFixed(2)} / ${r.gap_pp.toFixed(2)}` },
          { key: "power_contrib_pp", label: "col.power_part", num: true, render: (r) => (r.gap_pp < 0 ? fPP(r.power_contrib_pp) : "·"), csv: (r) => (r.gap_pp < 0 ? r.power_contrib_pp.toFixed(3) : "") },
          { key: "p1p2_dark", label: "col.p1p2_dark", num: true },
          { key: "trend", label: "col.trend_q", render: (r) => <TrendTag r={r} />, csv: (r) => r.trend },
          { key: "parts", label: "col.severity_parts", render: (r) => <Parts parts={r.severity_parts} prefix="cw" />, csv: (r) => Object.entries(r.severity_parts).map(([k, v]) => `${t(`cw.${k}`)} ${v.toFixed(2)}`).join("; ") },
        ]} />
      </Card>
      {sel && (
        <Card title={t("impact.drill.title", { c: sel })} sub={t("impact.drill.sub")} right={<button onClick={() => setSel(null)} className="text-[12px] text-slate underline">{t("common.close")}</button>}>
          <DataTable rows={drill} pageSize={25} filename={`pba_cluster_${sel}.csv`.replace(/\s+/g, "_")} onRowClick={setPick} initialSort={{ key: "ran_power_down_h", dir: -1 }} columns={[
            { key: "site_id", label: "col.site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> }, { key: "site_name", label: "col.name" }, { key: "site_class", label: "col.class" },
            { key: "avail_delta_pp", label: "col.avail_triple", num: true, render: (r) => <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact />, csv: (r) => r.avail_delta_pp?.toFixed(2) },
            { key: "ran_power_down_h", label: "col.power_downtime", num: true, render: (r) => fH(r.ran_power_down_h || 0), csv: (r) => (r.ran_power_down_h || 0).toFixed(1) },
            { key: "dark_months", label: "col.dark_months", num: true, render: (r) => (r.dark ? <Tag tone="crit">● {r.dark_months}/6</Tag> : `${r.dark_months}/6`), csv: (r) => r.dark_months },
            { key: "bbt_value_min", label: "col.bbt", num: true, sortVal: (r) => r.battery.display.value, render: (r) => <BbtCell r={r} />, csv: bbtCsv },
            { key: "mbp_priority_level", label: "col.mbp_priority", render: (r) => <LevelTag kind="MBP" v={r.mbp_priority_level} />, csv: (r) => `MBP-${r.mbp_priority_level}` },
            { key: "resp", label: "col.power_responsibility", render: (r) => tv("resp", r.resp.primary) || "—", csv: (r) => tv("resp", r.resp.primary) },
          ]} />
        </Card>
      )}
      <Card title={t("impact.top.title")} sub={t("impact.top.sub", { w: wts(cfg.top15_weights, "sw") })}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] tabular">
            <thead><tr className="text-slate text-left">{["#", t("col.site"), t("col.avail_triple"), t("col.power_downtime"), "BBT", t("col.battery"), t("col.mbp_priority"), t("col.primary_driver"), t("col.power_responsibility"), t("col.score_parts")].map((h) => <th key={h} className="px-2 py-1.5 border-b border-line whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{top.map((s, i) => (
              <tr key={s.site_id} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setPick(s)} onClick={() => setPick(s)} className="border-b border-line/70 cursor-pointer hover:bg-s1/5 align-top focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
                <td className="px-2 py-1.5 font-semibold">{i + 1}</td>
                <td className="px-2 py-1.5"><span className="font-semibold text-navy">{s.site_id}</span><div className="text-[11px] text-mut">{s.site_name} · {s.site_class} · {s.nop}</div></td>
                <td className="px-2 py-1.5"><AvailTriple a={s.avail_wc_pct} t={s.ran_target_pct} g={s.avail_delta_pp} compact /></td>
                <td className="px-2 py-1.5">{fH(s.ran_power_down_h || 0)}</td>
                <td className="px-2 py-1.5 whitespace-nowrap"><BbtCell r={s} /></td>
                <td className="px-2 py-1.5"><StatusTag v={s.bbt_status} /></td>
                <td className="px-2 py-1.5"><LevelTag kind="MBP" v={s.mbp_priority_level} /></td>
                <td className="px-2 py-1.5 font-medium">{t(`sw.${s.primary_key}`)}<div className="text-[11px] text-mut">{t("impact.then", { d: t(`sw.${s.secondary_key}`) })}</div></td>
                <td className="px-2 py-1.5">{tv("resp", s.resp.primary) || "—"}<div className="text-[11px] text-mut">{s.resp.kind}</div></td>
                <td className="px-2 py-1.5"><Parts parts={s.worst_parts} prefix="sw" /></td>
              </tr>))}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
