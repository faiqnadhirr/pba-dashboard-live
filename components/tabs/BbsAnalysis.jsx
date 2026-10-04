"use client";
import React, { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LineChart, Line, Legend, ReferenceLine } from "recharts";
import { Card, Note, DataTable, Select, Tag, Gloss, fInt, fMin, f2, f1, fPct } from "@/components/ui";
import { t, tv } from "@/lib/i18n";

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const STRENGTH = { negligible: "#C9CFD9", weak: "#9DB7DE", moderate: "#4f8fdc", strong: "#1f5fae" };

export default function BbsAnalysis({ data, cfg, part = "corr" }) {
  const C = part === "corr", E = part === "est";
  const b = data.meta.bbs;
  const [by, setBy] = useState("site_class");
  const corr = b.correlation.map((c) => ({ ...c, name: tv("feat", c.feature) + (c.required_by_management ? " ★" : "") }));
  const minN = Math.min(...b.correlation.map((c) => c.n));
  const curves = b.km_curves.filter((c) => c.by === by && c.n >= 500).sort((a, b2) => b2.n - a.n).slice(0, 5);
  const ts = b.time_split;
  return (
    <div className="space-y-4">
      {E && <Note><b>{t("est.how")}</b><Gloss k="kaplan_meier" /><Gloss k="censoring" /> {t("est.how_body", { bias: f1(ts.find((x) => x.method.startsWith("Naive"))?.bias_min) })}</Note>}
      {C && <Note tone="warn"><Tag tone="slate">{t("kpi.portfolio").toUpperCase()}</Tag> {t("corr.portfolio_note", { n: fInt(minN) })}</Note>}
      <div className="grid xl:grid-cols-2 gap-4">
        {C && <Card title={<>{t("corr.chart.title")}<Gloss k="spearman" /></>} sub={t("corr.chart.sub")}>
          <ResponsiveContainer width="100%" height={Math.max(260, corr.length * 24)}>
            <BarChart data={corr} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="#E3E7ED" horizontal={false} />
              <XAxis type="number" domain={[-0.6, 0.6]} tick={{ fontSize: 11, fill: "#6B7588" }} tickFormatter={(v) => f1(v)} />
              <YAxis type="category" dataKey="name" width={230} tick={{ fontSize: 11, fill: "#141821" }} />
              <ReferenceLine x={0} stroke="#55627A" />
              <Tooltip formatter={(v) => f2(Number(v))} labelFormatter={(l) => l} />
              <Bar dataKey="spearman" radius={[0, 4, 4, 0]}>{corr.map((c, i) => <Cell key={i} fill={STRENGTH[c.strength]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 text-[11px] text-slate mt-1">{Object.entries(STRENGTH).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ background: c }} />{tv("strength", k)}</span>)}</div>
          <div className="mt-3"><Note tone="warn">{t("corr.caveat")}</Note></div>
        </Card>}
        {C && <Card title={<>{t("corr.table.title")} <Tag tone="slate">{t("kpi.portfolio").toUpperCase()}</Tag></>} sub={t("corr.table.sub")}>
          <DataTable rows={b.correlation} filename="pba_bbt_correlation.csv" pageSize={25} columns={[
            { key: "label", label: "col.factor", wrap: true, render: (r) => <span className="block min-w-[120px] max-w-[190px]">{tv("feat", r.feature)}</span>, csv: (r) => r.label }, { key: "n", label: "col.n_sites", num: true, render: (r) => fInt(r.n), csv: (r) => r.n },
            { key: "pearson", label: "Pearson r", short: "r", num: true, render: (r) => f2(r.pearson) }, { key: "spearman", label: "Spearman ρ", short: "ρ", num: true, render: (r) => f2(r.spearman) },
            { key: "strength", label: "col.strength", render: (r) => tv("strength", r.strength), csv: (r) => r.strength }, { key: "required_by_management", label: "col.requested", short: "★", render: (r) => (r.required_by_management ? "★" : "") },
            { key: "caveat", label: "col.caveat", short: "⚠", render: (r) => (r.caveat ? <span title={t("corr.row_caveat")} aria-label={t("corr.row_caveat")} className="cursor-help text-[#8a5a00]">⚠</span> : ""), csv: (r) => r.caveat || "" },
          ]} />
        </Card>}
        {E && <Card title={t("est.test.title")} sub={t("est.test.sub")}>
          <DataTable rows={ts} filename="pba_bbt_estimator_test.csv" pageSize={10} columns={[
            { key: "method", label: "col.method", csv: (r) => r.method, render: (r) => <span className={r.method.startsWith("KM comparable") ? "font-semibold text-navy" : ""}>{tv("method", r.method)}{r.method.startsWith("KM comparable") ? ` ← ${t("est.used")}` : ""}</span> },
            { key: "n_test_sites", label: "col.test_sites", num: true, render: (r) => fInt(r.n_test_sites) },
            { key: "mae_min", label: "MAE", num: true, render: (r) => fMin(r.mae_min) },
            { key: "bias_min", label: "col.bias", num: true, render: (r) => `${r.bias_min > 0 ? "+" : ""}${f1(r.bias_min)} ${t("unit.min")}` },
            { key: "status_accuracy", label: "col.status_accuracy", num: true, render: (r) => fPct(100 * r.status_accuracy, 0) },
          ]} />
          <div className="text-[12px] text-slate mt-2 leading-relaxed">{t("est.test.expl", { mae: data.meta.bbs.estimator_mae_min })}</div>
        </Card>}
      </div>
      {E && <Card title={t("est.km.title")} sub={t("est.km.sub")}
        right={<Select value={by} onChange={setBy} options={[{ value: "site_class", label: t("est.by_class") }, { value: "battery_type", label: t("est.by_type") }]} />}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#E3E7ED" />
            <XAxis type="number" dataKey="t" domain={[0, 180]} unit={` ${t("unit.min")}`} tick={{ fontSize: 11, fill: "#6B7588" }} allowDuplicatedCategory={false} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => fPct(v * 100, 0)} tick={{ fontSize: 11, fill: "#6B7588" }} width={44} />
            <Tooltip formatter={(v) => fPct(v * 100, 0)} labelFormatter={(l) => fMin(l)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0.5} stroke="#55627A" strokeDasharray="4 3" />
            <ReferenceLine x={cfg.bbt.design_minutes} stroke="#1F2A44" strokeDasharray="4 3" label={{ value: t("est.design"), fontSize: 10, position: "insideTopLeft" }} />
            {curves.map((c, i) => (
              <Line key={c.group} data={[{ t: 0, s: 1 }, ...c.pts.map(([t, s]) => ({ t, s }))]} dataKey="s" name={t("est.curve_name", { g: c.group, m: c.median != null ? fMin(c.median) : "> 180" })}
                stroke={SERIES[i]} strokeWidth={2} dot={false} type="stepAfter" isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>}
      {C && <Card title={t("corr.cat.title")} sub={t("corr.cat.sub")}>
        <DataTable rows={b.category_medians} filename="pba_bbt_category_medians.csv" pageSize={15} columns={[
          { key: "feature", label: "col.factor", render: (r) => tv("feat", r.feature), csv: (r) => r.feature }, { key: "value", label: "col.value" }, { key: "n", label: "col.sites", num: true, render: (r) => fInt(r.n) },
          { key: "median_bbt_min", label: "col.median_bbt", num: true, render: (r) => fMin(r.median_bbt_min) },
        ]} />
      </Card>}
    </div>
  );
}
