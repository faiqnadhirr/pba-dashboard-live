"use client";
// v3.6 — MBP productivity per base camp (H1, from MBP tickets): tickets handled, PLN-off tickets in the camp's area, visit rate, RH.
import React, { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { Card, Kpi, Note, DataTable, EvTag, fInt, fH, fPct, fNum, isNum } from "@/components/ui";
import { t } from "@/lib/i18n";

const med = (v) => { const a = v.filter(isNum).sort((x, y) => x - y); if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const RANK = ["visit_rate", "plnoff_area", "prod_rh_total_h", "prod_rh_median_h", "prod_tickets"];

export default function Productivity({ scope, mbpsScope, setPick }) {
  const rows = useMemo(() => {
    const area = new Map();
    for (const s of scope) {
      if (!s.mbp_assigned) continue;
      const a = area.get(s.mbp_assigned) || area.set(s.mbp_assigned, { sites: 0, plnoff: 0, visit: 0, sites_pln: 0, sites_vis: 0 }).get(s.mbp_assigned);
      a.sites++; a.plnoff += s.tk_plnoff_n || 0; a.visit += s.tk_plnoff_visit_n || 0;
      if ((s.tk_plnoff_n || 0) > 0) { a.sites_pln++; if ((s.tk_plnoff_visit_n || 0) > 0) a.sites_vis++; }
    }
    return mbpsScope.map((m) => {
      const a = area.get(m.mbp_id) || { sites: 0, plnoff: 0, visit: 0, sites_pln: 0, sites_vis: 0 };
      return { ...m, area_sites: a.sites, plnoff_area: a.plnoff, visit_area: a.visit, visit_rate: a.plnoff ? a.visit / a.plnoff : null,
        site_visit_rate: a.sites_pln ? a.sites_vis / a.sites_pln : null, sites_pln: a.sites_pln,
        own_visit_rate: m.prod_tickets ? (m.prod_visits || 0) / m.prod_tickets : null, rh_per_ticket: m.prod_tickets ? (m.prod_rh_total_h || 0) / m.prod_tickets : null };
    }).filter((r) => r.prod_tickets > 0 || r.plnoff_area > 0);
  }, [scope, mbpsScope]);
  const [rk, setRk] = useState("visit_rate");
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const plnA = sum("plnoff_area"), visA = sum("visit_area");
  const active = rows.filter((r) => r.prod_tickets > 0);
  const chart = useMemo(() => [...rows].filter((r) => isNum(r[rk])).sort((a, b) => a[rk] - b[rk]).slice(0, 15)
    .map((r) => ({ id: r.mbp_id.split("-").slice(0, 2).join("-") + " " + (r.pic_name || "").split(" ")[0], v: rk === "visit_rate" ? 100 * r[rk] : r[rk] })), [rows, rk]);
  const medV = med(rows.map((r) => r[rk])), medShown = rk === "visit_rate" && isNum(medV) ? 100 * medV : medV;
  const fmt = (v) => (rk === "visit_rate" ? fPct(v, 0) : rk.includes("rh") ? fH(v) : fInt(v));

  return (
    <div className="space-y-4">
      <Note>{t("prod.note")}</Note>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi scope="filtered" fixed label={t("prod.kpi.camps")} value={fInt(active.length)} sub={t("prod.kpi.camps_sub", { n: fInt(rows.length) })} />
        <Kpi scope="filtered" fixed label={t("prod.kpi.tickets")} value={fInt(sum("prod_tickets"))} sub={t("prod.kpi.tickets_sub", { p: fInt(sum("prod_plnoff")) })} />
        <Kpi scope="filtered" fixed label={t("prod.kpi.visit")} value={plnA ? fPct((100 * visA) / plnA, 1) : "—"} sub={t("prod.kpi.visit_sub", { v: fInt(visA), n: fInt(plnA) })} help={t("prod.kpi.visit_help")} tone={visA / Math.max(1, plnA) >= 0.9 ? "good" : "warn"} />
        <Kpi scope="filtered" fixed label={t("prod.kpi.rh_total")} value={fH(sum("prod_rh_total_h"))} sub={t("prod.kpi.rh_total_sub", { m: fH(med(active.map((r) => r.prod_rh_total_h))) })} />
        <Kpi scope="filtered" fixed label={t("prod.kpi.rh_med")} value={fH(med(active.map((r) => r.prod_rh_median_h)))} sub={t("prod.kpi.rh_med_sub")} />
        <Kpi scope="filtered" fixed label={t("prod.kpi.resp")} value={fH(med(active.map((r) => r.prod_resp_median_h)))} sub={t("prod.kpi.resp_sub")} />
      </div>
      <Card title={t("prod.rank.title")} sub={t("prod.rank.sub")} right={
        <select aria-label={t("prod.rank.by")} value={rk} onChange={(e) => setRk(e.target.value)} className="border border-line rounded px-2 py-1 text-[12.5px] bg-white">
          {RANK.map((k) => <option key={k} value={k}>{t(`prod.rank.${k}`)}</option>)}</select>}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#E3E7ED" horizontal={false} />
            <XAxis type="number" tickFormatter={fmt} domain={rk === "visit_rate" ? [(m) => Math.max(0, Math.floor((m - 5) / 5) * 5), 100] : [0, "auto"]} allowDataOverflow tick={{ fontSize: 11, fill: "#6B7588" }} />
            <YAxis type="category" dataKey="id" width={170} interval={0} tick={{ fontSize: 10.5, fill: "#55627A" }} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            {isNum(medShown) && <ReferenceLine x={medShown} stroke="#2b2370" strokeDasharray="4 3" label={{ value: t("prod.rank.median"), fontSize: 10, position: "top" }} />}
            <Bar dataKey="v" name={t(`prod.rank.${rk}`)}>{chart.map((d, i) => <Cell key={i} fill={isNum(medShown) && d.v < medShown ? "#ec835a" : "#2b2370"} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="text-[11px] text-mut">{t("prod.rank.foot")}</div>
      </Card>
      <Card title={t("prod.table.title")} sub={t("prod.table.sub")}>
        <DataTable rows={rows} pageSize={30} filename="pba_mbp_productivity.csv" initialSort={{ key: "prod_tickets", dir: -1 }} columns={[
          { key: "mbp_id", label: "col.basecamp" }, { key: "pic_name", label: "col.pic" }, { key: "nop", label: "col.nop" },
          { key: "prod_tickets", label: "col.tickets_handled", num: true }, { key: "prod_plnoff", label: "col.plnoff_handled", num: true },
          { key: "own_visit_rate", label: "col.own_visit", num: true, render: (r) => (isNum(r.own_visit_rate) ? fPct(100 * r.own_visit_rate, 0) : "—"), csv: (r) => (isNum(r.own_visit_rate) ? (100 * r.own_visit_rate).toFixed(1) : "") },
          { key: "area_sites", label: "col.sites_assigned", num: true }, { key: "plnoff_area", label: "col.plnoff_area", num: true }, { key: "visit_area", label: "col.visit_area", num: true },
          { key: "visit_rate", label: "col.visit_rate", num: true, render: (r) => (isNum(r.visit_rate) ? <span className={r.visit_rate < 0.9 ? "text-crit font-semibold" : ""}>{fPct(100 * r.visit_rate, 0)}</span> : "—"), csv: (r) => (isNum(r.visit_rate) ? (100 * r.visit_rate).toFixed(1) : "") },
          { key: "site_visit_rate", label: "col.site_visit_rate", num: true, render: (r) => (isNum(r.site_visit_rate) ? fPct(100 * r.site_visit_rate, 0) : "—"), csv: (r) => (isNum(r.site_visit_rate) ? (100 * r.site_visit_rate).toFixed(1) : "") },
          { key: "prod_sites", label: "col.sites_served", num: true },
          { key: "prod_rh_total_h", label: "col.rh_total", num: true, render: (r) => fH(r.prod_rh_total_h), csv: (r) => r.prod_rh_total_h ?? "" },
          { key: "prod_rh_mean_h", label: "col.rh_mean", num: true, render: (r) => fH(r.prod_rh_mean_h), csv: (r) => r.prod_rh_mean_h ?? "" },
          { key: "prod_rh_median_h", label: "col.rh_median", num: true, render: (r) => fH(r.prod_rh_median_h), csv: (r) => r.prod_rh_median_h ?? "" },
          { key: "prod_resp_median_h", label: "col.resp_median", num: true, render: (r) => fH(r.prod_resp_median_h), csv: (r) => r.prod_resp_median_h ?? "" },
        ]} />
        <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("prod.foot")} <EvTag v="ACTUAL" /></div>
      </Card>
    </div>
  );
}
