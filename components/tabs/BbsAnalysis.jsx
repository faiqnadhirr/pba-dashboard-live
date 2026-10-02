"use client";
import React, { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LineChart, Line, Legend, ReferenceLine } from "recharts";
import { Card, Note, DataTable, Select, fInt, fMin, f2, f1, fPct } from "@/components/ui";

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const FEAT = { site_class: "Site class", battery_type: "Battery type", nop: "NOP", vendor: "RAN vendor", type_site_g: "Site type", main_power_g: "Main power" };
const STRENGTH = { negligible: "#C9CFD9", weak: "#9DB7DE", moderate: "#4f8fdc", strong: "#1f5fae" };

export default function BbsAnalysis({ data, cfg }) {
  const b = data.meta.bbs;
  const [by, setBy] = useState("site_class");
  const corr = b.correlation.map((c) => ({ ...c, name: c.label + (c.required_by_management ? " ★" : "") }));
  const curves = b.km_curves.filter((c) => c.by === by && c.n >= 500).sort((a, b2) => b2.n - a.n).slice(0, 5);
  const ts = b.time_split;
  return (
    <div className="space-y-4">
      <Note>
        <b>How BBT is calculated.</b> Every mains-fail event is a battery test. If the battery ran out (LOW BATT / NE DOWN) we observe the true backup time.
        If PLN came back first (68% of events) we only know the battery lasted <i>at least</i> that long — a censored observation.
        Plain medians of the exhausted events are therefore biased low (in the test below: {ts.find((t) => t.method.startsWith("Naive"))?.bias_min} min).
        PBA uses <b>Kaplan-Meier</b>, which uses both kinds of observation: per site when it has its own events (ACTUAL), and comparable-site curves
        (class × battery type × NOP) for sites without measurement (ESTIMATED, floored at what the site already survived).
      </Note>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="1 · Correlation of BBT measured with each factor" sub="Spearman ρ across sites with measured BBT. ★ = requested by management (PLN outage frequency & duration).">
          <ResponsiveContainer width="100%" height={Math.max(260, corr.length * 24)}>
            <BarChart data={corr} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid stroke="#E3E7ED" horizontal={false} />
              <XAxis type="number" domain={[-0.6, 0.6]} tick={{ fontSize: 11, fill: "#6B7588" }} tickFormatter={(v) => v.toFixed(1)} />
              <YAxis type="category" dataKey="name" width={230} tick={{ fontSize: 11, fill: "#141821" }} />
              <ReferenceLine x={0} stroke="#55627A" />
              <Tooltip formatter={(v) => Number(v).toFixed(3)} labelFormatter={(l) => l} />
              <Bar dataKey="spearman" radius={[0, 4, 4, 0]}>{corr.map((c, i) => <Cell key={i} fill={STRENGTH[c.strength]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 text-[11px] text-slate mt-1">{Object.entries(STRENGTH).map(([k, c]) => <span key={k} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 inline-block rounded-sm" style={{ background: c }} />{k}</span>)}</div>
          <div className="mt-3"><Note tone="warn">The PLN-duration factors and BBT come from <b>the same event feed</b>: a long PLN outage is what lets a long battery run be observed. That makes part of this correlation mechanical (censoring), not causal — so PLN behaviour is used for <b>exposure / priority</b>, while BBT itself is estimated with Kaplan-Meier.</Note></div>
        </Card>
        <Card title="2 · Estimation algorithm — tested on unseen sites" sub="Learn from Jan–Apr events of 70% of sites; predict the May–Jun BBT of the other 30% (sites the model never saw).">
          <DataTable rows={ts} filename="pba_bbt_estimator_test.csv" pageSize={10} columns={[
            { key: "method", label: "Method", render: (r) => <span className={r.method.startsWith("KM comparable") ? "font-semibold text-navy" : ""}>{r.method}{r.method.startsWith("KM comparable") ? " ← used" : ""}</span> },
            { key: "n_test_sites", label: "Test sites", num: true, render: (r) => fInt(r.n_test_sites) },
            { key: "mae_min", label: "MAE", num: true, render: (r) => fMin(r.mae_min) },
            { key: "bias_min", label: "Bias", num: true, render: (r) => `${r.bias_min > 0 ? "+" : ""}${f1(r.bias_min)} min` },
            { key: "status_accuracy", label: "Status accuracy", num: true, render: (r) => fPct(100 * r.status_accuracy, 0) },
          ]} />
          <div className="text-[12px] text-slate mt-2 leading-relaxed">
            “Own-site history” is the best predictor (a site's own past events) — that is why measured sites use their own Kaplan-Meier value.
            For sites with no measurement, comparable-site KM is used: nearly unbiased, and it beats both the naive median and the gradient-boosting (AI) model.
            Each estimate shows a range of ± {data.meta.bbs.estimator_mae_min} min and a confidence (Medium-Low if the site already survived an outage, else Low).
          </div>
        </Card>
      </div>
      <Card title="3 · Battery survival curves (Kaplan-Meier)" sub="Share of batteries still supplying the site after t minutes of PLN outage. Median = where the curve crosses 50%."
        right={<Select value={by} onChange={setBy} options={[{ value: "site_class", label: "by site class" }, { value: "battery_type", label: "by battery type" }]} />}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#E3E7ED" />
            <XAxis type="number" dataKey="t" domain={[0, 180]} unit=" m" tick={{ fontSize: 11, fill: "#6B7588" }} allowDuplicatedCategory={false} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: "#6B7588" }} width={44} />
            <Tooltip formatter={(v) => `${(v * 100).toFixed(0)}%`} labelFormatter={(l) => `${Math.round(l)} min`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0.5} stroke="#55627A" strokeDasharray="4 3" />
            <ReferenceLine x={cfg.bbt.design_minutes} stroke="#1F2A44" strokeDasharray="4 3" label={{ value: "design", fontSize: 10, position: "insideTopLeft" }} />
            {curves.map((c, i) => (
              <Line key={c.group} data={[{ t: 0, s: 1 }, ...c.pts.map(([t, s]) => ({ t, s }))]} dataKey="s" name={`${c.group} (median ${c.median != null ? Math.round(c.median) + " min" : "> 180"})`}
                stroke={SERIES[i]} strokeWidth={2} dot={false} type="stepAfter" isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Median measured BBT by category" sub="Groups with ≥ 30 sites (plain medians of measured sites, for context).">
        <DataTable rows={b.category_medians} filename="pba_bbt_category_medians.csv" pageSize={15} columns={[
          { key: "feature", label: "Factor", render: (r) => FEAT[r.feature] || r.feature, csv: (r) => FEAT[r.feature] || r.feature }, { key: "value", label: "Value" }, { key: "n", label: "Sites", num: true, render: (r) => fInt(r.n) },
          { key: "median_bbt_min", label: "Median BBT", num: true, render: (r) => fMin(r.median_bbt_min) },
        ]} />
      </Card>
      <Card title="Correlation table" sub="All factors tested, with sample size and caveat.">
        <DataTable rows={b.correlation} filename="pba_bbt_correlation.csv" pageSize={25} columns={[
          { key: "label", label: "Factor" }, { key: "n", label: "Sites", num: true, render: (r) => fInt(r.n) },
          { key: "pearson", label: "Pearson r", num: true, render: (r) => f2(r.pearson) }, { key: "spearman", label: "Spearman ρ", num: true, render: (r) => f2(r.spearman) },
          { key: "strength", label: "Strength" }, { key: "required_by_management", label: "Requested", render: (r) => (r.required_by_management ? "★" : "") },
          { key: "caveat", label: "Caveat", wrap: true, render: (r) => r.caveat || "" },
        ]} />
      </Card>
    </div>
  );
}
