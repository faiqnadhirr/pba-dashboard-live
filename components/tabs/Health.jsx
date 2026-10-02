"use client";
import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, Kpi, Note, DataTable, Bar100, AvailTriple, GapTag, fInt, fPct, fPP, fH, CAUSE_COLOR, isNum, MONTHS } from "@/components/ui";
import { aggregateAvailability, CAUSE } from "@/lib/logic";

const CAUSES = ["power", "transport", "ran", "other", "unknown"];

function groupAvail(sites, key) {
  const by = new Map();
  sites.forEach((s) => { const k = s[key] || "—"; (by.get(k) || by.set(k, []).get(k)).push(s); });
  return [...by.entries()].map(([k, g]) => {
    const a = aggregateAvailability(g);
    const row = { unit: k, sites: g.length, below: g.filter((s) => isNum(s.avail_delta_pp) && s.avail_delta_pp < 0).length, ...a };
    for (const c of CAUSES) row["c_" + c] = a.available ? a.contrib[c] ?? 0 : null;
    return row;
  }).filter((r) => r.available);
}

export default function Health({ scope, data, nop, inactive, cfg }) {
  const a = useMemo(() => aggregateAvailability(scope), [scope]);
  const byKey = nop === "All NOPs" ? "nop" : "cluster_to";
  const rows = useMemo(() => groupAvail(scope, byKey), [scope, byKey]);
  const below = scope.filter((s) => isNum(s.avail_delta_pp) && s.avail_delta_pp < 0).length;
  const monthly = useMemo(() => {
    const r = data.meta.monthly_nop.filter((m) => (nop === "All NOPs" || m.nop === nop) && (inactive || m.site_active === 1));
    const by = new Map();
    r.forEach((m) => { const g = by.get(m.ym) || { ym: m.ym, hours: 0, outage: 0, power: 0, target_h: 0 }; g.hours += m.hours; g.outage += m.outage; g.power += m.power; g.target_h += m.target_h; by.set(m.ym, g); });
    return [...by.values()].sort((x, y) => x.ym.localeCompare(y.ym)).map((g) => ({ month: MONTHS[+g.ym.slice(4) - 1], availability: 100 * (1 - g.outage / g.hours), target: g.target_h / g.hours, power_h: g.power }));
  }, [data, nop, inactive]);
  const measured = scope.filter((s) => s.battery.measured).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi scope="filtered" label="Availability" value={fPct(a.avail)} sub={`target ${fPct(a.target)} · ${a.sitesWithData?.toLocaleString()} sites with RAN data`} />
        <Kpi scope="filtered" label="Gap vs target" value={fPP(a.gap)} tone={a.gap < 0 ? "crit" : "good"} sub={a.gap < 0 ? "below target" : "meets target"} />
        <Kpi scope="filtered" label="…of which power" value={a.gap < 0 ? fPP(a.contrib.power) : "—"} tone="crit" sub={`power = ${Math.round(a.powerSharePct || 0)}% of all downtime`} />
        <Kpi scope="filtered" label="Sites below target" value={fInt(below)} sub={`of ${fInt(scope.length)} in scope`} tone="warn" />
        <Kpi scope="filtered" label="Network downtime" value={fH(a.outage)} sub="site-hours, wall-clock (RAN)" />
        <Kpi scope="filtered" label="BBT measured" value={fInt(measured)} sub="ACTUAL + DERIVED backed by site evidence (unverified derived values excluded)" />
      </div>

      <Card title="What causes the availability gap?" sub="Downtime by cause from the RAN availability feed (wall-clock, DERIVED). The gap vs target is attributed to causes in proportion to their share of downtime.">
        {!a.available ? <Note tone="warn">UNAVAILABLE — no RAN availability data for this scope.</Note> : a.gap >= 0 ? (
          <Note>Availability {fPct(a.avail)} meets the target {fPct(a.target)} — there is no gap to explain for this scope.</Note>
        ) : (
          <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
            <table className="text-[13px] tabular w-full">
              <tbody>
                <tr><td className="py-1 text-slate">Target</td><td className="text-right font-semibold">{fPct(a.target)}</td></tr>
                <tr><td className="py-1 text-slate">Actual</td><td className="text-right font-semibold">{fPct(a.avail)}</td></tr>
                <tr className="border-b border-line"><td className="py-1 text-slate">Gap</td><td className="text-right"><GapTag v={a.gap} /></td></tr>
                {CAUSES.map((c) => (
                  <tr key={c}><td className="py-1 pl-3"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: CAUSE_COLOR[c] }} />{CAUSE[c]}</td>
                    <td className="text-right">{fPP(a.contrib[c], 3)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-3">
              <Bar100 height={18} parts={CAUSES.map((c) => ({ label: CAUSE[c], c: CAUSE_COLOR[c], v: -(a.contrib[c] || 0), txt: fPP(a.contrib[c]) }))} />
              <div className="text-[12px] text-slate leading-relaxed">
                Unknown / unclassified = downtime the RAN feed does not attribute to power, transport, network or other.
                {a.overlap ? " In this scope the cause buckets overlap slightly (same minute counted in two buckets); they were scaled down proportionally so they sum to the observed downtime — so Unknown shows 0 here." : ""}
                {" "}Attribution is proportional, not causal: it says how much of the shortfall coincides with each recorded cause.
              </div>
              <Note>Power downtime here is network downtime caused by power (after battery / genset). Who is responsible for it is analysed in <b>2 · Accountability</b>.</Note>
            </div>
          </div>
        )}
      </Card>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Availability vs target by month" sub={`Wall-clock, ${nop}. Class filter not applied to the monthly series.`}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#55627A" }} />
              <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{ fontSize: 11, fill: "#6B7588" }} width={52} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)}%`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="availability" name="Availability" stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="target" name="Target" stroke="#55627A" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Power-caused downtime by month" sub="Site-hours, wall-clock. May 2026 is the peak of the period.">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#55627A" }} />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tick={{ fontSize: 11, fill: "#6B7588" }} width={44} />
              <Tooltip formatter={(v) => `${Math.round(v).toLocaleString()} h`} />
              <Bar dataKey="power_h" name="Power downtime (h)" fill="#d03b3b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title={`Availability vs target by ${byKey === "nop" ? "NOP" : "cluster (TO)"}`} sub="Gap contributions in pp (negative = below target). Click a column to sort.">
        <DataTable rows={rows} filename={`pba_availability_by_${byKey}.csv`} initialSort={{ key: "gap", dir: 1 }} pageSize={50} columns={[
          { key: "unit", label: byKey === "nop" ? "NOP" : "Cluster" }, { key: "sites", label: "Sites", num: true, render: (r) => fInt(r.sites) },
          { key: "gap", label: "Availability · target · gap", num: true, render: (r) => <AvailTriple a={r.avail} t={r.target} g={r.gap} compact />, csv: (r) => `${r.avail.toFixed(2)} / ${r.target.toFixed(2)} / ${r.gap.toFixed(2)}` },
          { key: "below", label: "Sites below target", num: true, render: (r) => fInt(r.below) },
          ...CAUSES.map((c) => ({ key: "c_" + c, label: CAUSE[c], num: true, render: (r) => (r.gap < 0 ? fPP(r["c_" + c]) : "·"), csv: (r) => (r.gap < 0 ? r["c_" + c]?.toFixed(3) : "") })),
          { key: "powerSharePct", label: "Power share of downtime", num: true, render: (r) => `${Math.round(r.powerSharePct)}%` },
        ]} />
      </Card>
    </div>
  );
}
