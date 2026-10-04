"use client";
import React, { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, Kpi, Note, DataTable, Bar100, AvailTriple, GapTag, Gloss, fInt, fPct, fPP, fH, fNum, CAUSE_COLOR, isNum, monthName } from "@/components/ui";
import { t, tv } from "@/lib/i18n";
import { aggregateAvailability } from "@/lib/logic";

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

export default function Health({ scope, data, nop, inactive, cfg, openDrill, navigate, setNop }) {
  const a = useMemo(() => aggregateAvailability(scope), [scope]);
  const byKey = nop === "All NOPs" ? "nop" : "cluster_to";
  const rows = useMemo(() => groupAvail(scope, byKey), [scope, byKey]);
  const below = scope.filter((s) => isNum(s.avail_delta_pp) && s.avail_delta_pp < 0).length;
  const monthly = useMemo(() => {
    const r = data.meta.monthly_nop.filter((m) => (nop === "All NOPs" || m.nop === nop) && (inactive || m.site_active === 1));
    const by = new Map();
    r.forEach((m) => { const g = by.get(m.ym) || { ym: m.ym, hours: 0, outage: 0, power: 0, target_h: 0 }; g.hours += m.hours; g.outage += m.outage; g.power += m.power; g.target_h += m.target_h; by.set(m.ym, g); });
    return [...by.values()].sort((x, y) => x.ym.localeCompare(y.ym)).map((g) => ({ month: monthName(+g.ym.slice(4) - 1), availability: 100 * (1 - g.outage / g.hours), target: g.target_h / g.hours, power_h: g.power }));
  }, [data, nop, inactive]);
  const measured = scope.filter((s) => s.battery.measured).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi scope="filtered" label={t("health.kpi.avail")} value={fPct(a.avail)} sub={t("health.kpi.avail_sub", { t: fPct(a.target), n: fInt(a.sitesWithData) })} />
        <Kpi scope="filtered" label={t("health.kpi.gap")} help={t("gloss.pp")} value={fPP(a.gap)} tone={a.gap < 0 ? "crit" : "good"} sub={t(a.gap < 0 ? "health.below_target" : "health.meets_target")} />
        <Kpi scope="filtered" label={t("health.kpi.power")} value={a.gap < 0 ? fPP(a.contrib.power) : "—"} tone="crit" onClick={() => openDrill("power_down")} sub={t("health.kpi.power_sub", { p: fInt(a.powerSharePct || 0) })} />
        <Kpi scope="filtered" onClick={() => openDrill("below_target")} label={t("health.kpi.below")} value={fInt(below)} sub={t("common.of_in_scope", { n: fInt(scope.length) })} tone="warn" />
        <Kpi scope="filtered" onClick={() => openDrill("downtime")} label={t("health.kpi.downtime")} value={fH(a.outage)} sub={t("health.kpi.downtime_sub")} />
        <Kpi scope="filtered" onClick={() => openDrill("bbt_measured")} label={t("health.kpi.bbt")} help={t("gloss.bbt")} value={fInt(measured)} sub={t("health.kpi.bbt_sub")} />
      </div>

      <Card title={t("health.cause.title")} sub={t("health.cause.sub")}>
        {!a.available ? <Note tone="warn">{t("health.no_ran")}</Note> : a.gap >= 0 ? (
          <Note>{t("health.no_gap", { a: fPct(a.avail), t: fPct(a.target) })}</Note>
        ) : (
          <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
            <table className="text-[13px] tabular w-full">
              <tbody>
                <tr><td className="py-1 text-slate">{t("common.target")}</td><td className="text-right font-semibold">{fPct(a.target)}</td></tr>
                <tr><td className="py-1 text-slate">{t("common.actual")}</td><td className="text-right font-semibold">{fPct(a.avail)}</td></tr>
                <tr className="border-b border-line"><td className="py-1 text-slate">{t("common.gap")}</td><td className="text-right"><GapTag v={a.gap} /></td></tr>
                {CAUSES.map((c) => (
                  <tr key={c}><td className="py-1 pl-3"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: CAUSE_COLOR[c] }} />{tv("cause", c)}</td>
                    <td className="text-right">{fPP(a.contrib[c], 3)}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-3">
              <Bar100 height={18} onSeg={(p) => navigate({ view: "mbp.sitelist", sel: `cause~${p.k}` })} parts={CAUSES.map((c) => ({ k: c, label: tv("cause", c), c: CAUSE_COLOR[c], v: -(a.contrib[c] || 0), txt: fPP(a.contrib[c]) }))} />
              <div className="text-[12px] text-slate leading-relaxed">
                {t("health.cause.unknown_expl")}{a.overlap ? " " + t("health.cause.overlap") : ""} {t("health.cause.proportional")}
              </div>
              <Note>{t("health.cause.see_acc")}</Note>
            </div>
          </div>
        )}
      </Card>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card title={t("health.month.title")} sub={t("health.month.sub", { nop: nop === "All NOPs" ? t("filter.all_nops") : nop })}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#55627A" }} />
              <YAxis domain={["auto", "auto"]} tickFormatter={(v) => fPct(v, 1)} tick={{ fontSize: 11, fill: "#6B7588" }} width={52} />
              <Tooltip formatter={(v) => fPct(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="availability" name={t("health.kpi.avail")} stroke="#2a78d6" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="target" name={t("common.target")} stroke="#55627A" strokeWidth={2} strokeDasharray="5 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t("health.pmonth.title")} sub={t("health.pmonth.sub")}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#55627A" }} />
              <YAxis tickFormatter={(v) => (v >= 1000 ? `${fInt(v / 1000)}k` : fInt(v))} tick={{ fontSize: 11, fill: "#6B7588" }} width={44} />
              <Tooltip formatter={(v) => fH(v)} />
              <Bar dataKey="power_h" name={t("health.pmonth.series")} fill="#d03b3b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title={t(byKey === "nop" ? "health.by.nop" : "health.by.cluster")} sub={t("health.by.sub")}>
        <DataTable rows={rows} onRowClick={byKey === "nop" ? (r) => setNop(r.unit) : undefined} filename={`pba_availability_by_${byKey}.csv`} initialSort={{ key: "gap", dir: 1 }} pageSize={50} columns={[
          { key: "unit", label: byKey === "nop" ? "col.nop" : "col.cluster" }, { key: "sites", label: "col.sites", num: true, render: (r) => fInt(r.sites) },
          { key: "gap", label: "col.avail_triple", num: true, render: (r) => <AvailTriple a={r.avail} t={r.target} g={r.gap} compact />, csv: (r) => `${r.avail.toFixed(2)} / ${r.target.toFixed(2)} / ${r.gap.toFixed(2)}` },
          { key: "below", label: "col.sites_below", num: true, render: (r) => fInt(r.below) },
          ...CAUSES.map((c) => ({ key: "c_" + c, label: "cause." + c, num: true, render: (r) => (r.gap < 0 ? fPP(r["c_" + c]) : "·"), csv: (r) => (r.gap < 0 ? r["c_" + c]?.toFixed(3) : "") })),
          { key: "powerSharePct", label: "col.power_share", num: true, render: (r) => fPct(r.powerSharePct, 0), csv: (r) => Math.round(r.powerSharePct) },
        ]} />
      </Card>
    </div>
  );
}
