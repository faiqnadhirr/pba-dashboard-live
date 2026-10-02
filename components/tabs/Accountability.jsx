"use client";
import React, { useMemo } from "react";
import { Card, Kpi, Note, DataTable, Bar100, EvTag, fInt, fH, RESP_COLOR, isNum } from "@/components/ui";
import { aggregateResponsibility, RESP, RESP_POWER } from "@/lib/logic";

const ORDER = [...RESP_POWER, "utility_inferred", "unknown"];
const MAPPING = [
  ["PLN / Utility", "RC 1 = PLN Off and RC 2 = PLN off > 3 h / PLN off repeated / Trafo rusak / EAS", "OBSERVED"],
  ["Site / internal power system", "RC 2 = MCB KWH trip, KWH rusak, kabel power rusak; RC 1 = Rectifier; battery fuse (Sekering NH)", "OBSERVED"],
  ["Battery", "RC 1 = Baterai and RC 2 = Tidak Ada Baterai", "OBSERVED"],
  ["Generator", "RC 1 = Genset (rusak, overheat, BBM habis on Telkomsel genset)", "OBSERVED"],
  ["Vendor / maintenance (power lease)", "RC Owner = TI / TP, or RC 1 = Sewa Daya (BBM genset habis, genset tidak berfungsi, rectifier rusak)", "OBSERVED"],
  ["Operational / response", "RC 2 = Token listrik habis; RC 1 = Aktivitas Telkomsel", "OBSERVED"],
  ["PLN-triggered (inferred)", "No ticket root cause, but mains-fail alarms recorded at the site", "INFERRED"],
  ["Unknown", "Power downtime exists; no ticket and no alarm identifies the party", "UNKNOWN"],
];

export default function Accountability({ scope, setPick }) {
  const agg = useMemo(() => aggregateResponsibility(scope), [scope]);
  const obs = RESP_POWER.reduce((a, k) => a + agg.hours[k], 0), inf = agg.hours.utility_inferred, unk = agg.hours.unknown;
  const tot = agg.total || 1;
  const rows = useMemo(() => scope.filter((s) => (s.ran_power_down_h || 0) > 0).map((s) => ({ ...s, _pd_h: s.ran_power_down_h })), [scope]);
  const byNop = useMemo(() => {
    const m = new Map();
    scope.forEach((s) => { const g = m.get(s.nop) || [];  g.push(s); m.set(s.nop, g); });
    return [...m.entries()].map(([nop, g]) => { const a = aggregateResponsibility(g); return { nop, total: a.total, ...Object.fromEntries(ORDER.map((k) => [k, a.hours[k]])) }; });
  }, [scope]);
  return (
    <div className="space-y-4">
      <Note>
        <b>Power downtime — who is responsible?</b> Classification uses only recorded evidence. <b>OBSERVED</b> = the site's own MBP/power tickets record the root cause (RC Owner / RC 1 / RC 2).
        <b> INFERRED</b> = no ticket root cause, but mains-fail alarms show PLN triggered the outage (why the backup did not bridge it is not recorded).
        <b> UNKNOWN</b> = downtime exists but nothing identifies the party. A failed battery or a long PLN outage is never used on its own to assign blame.
        Hours are allocated to classes in proportion to each site's ticket root causes.
      </Note>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi scope="filtered" label="Power downtime" value={fH(agg.total)} sub={`${fInt(rows.length)} sites with power downtime (site-hours, wall-clock)`} />
        <Kpi scope="filtered" label="Observed responsibility" value={`${Math.round((100 * obs) / tot)}%`} sub={`${fH(obs)} with ticket root cause`} tone="good" />
        <Kpi scope="filtered" label="Inferred (PLN-triggered)" value={`${Math.round((100 * inf) / tot)}%`} sub={`${fH(inf)} — alarms, no root cause`} tone="warn" />
        <Kpi scope="filtered" label="Unknown" value={`${Math.round((100 * unk) / tot)}%`} sub={`${fH(unk)} — insufficient evidence`} tone="slate" />
      </div>
      <Card title="Power downtime by responsible party" sub="Share of power-caused downtime hours.">
        <Bar100 height={20} parts={ORDER.map((k) => ({ label: RESP[k], c: RESP_COLOR[k], v: agg.hours[k], txt: `${Math.round((100 * agg.hours[k]) / tot)}% · ${fH(agg.hours[k])}` }))} />
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <table className="w-full text-[12.5px] tabular">
            <thead><tr className="text-slate text-left"><th className="py-1 border-b border-line">Responsible party</th><th className="text-right border-b border-line">Hours</th><th className="text-right border-b border-line">Share</th><th className="text-right border-b border-line">Sites (primary)</th><th className="border-b border-line pl-2">Evidence</th></tr></thead>
            <tbody>{ORDER.map((k) => <tr key={k} className="border-b border-line/60"><td className="py-1"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: RESP_COLOR[k] }} />{RESP[k]}</td>
              <td className="text-right">{fH(agg.hours[k])}</td><td className="text-right">{Math.round((100 * agg.hours[k]) / tot)}%</td><td className="text-right">{fInt(agg.sites[k])}</td>
              <td className="pl-2"><EvTag v={k === "unknown" ? "UNKNOWN" : k === "utility_inferred" ? "INFERRED" : "OBSERVED"} /></td></tr>)}</tbody>
          </table>
          <div>
            <div className="text-[12.5px] font-semibold text-navy mb-1">Classification rules (deterministic)</div>
            <table className="w-full text-[11.5px]"><tbody>{MAPPING.map(([a, b, c]) => <tr key={a} className="border-b border-line/60 align-top"><td className="py-1 pr-2 font-medium whitespace-nowrap">{a}</td><td className="py-1 pr-2 text-slate">{b}</td><td className="py-1"><EvTag v={c} /></td></tr>)}</tbody></table>
          </div>
        </div>
      </Card>
      <Card title="By NOP" sub="Power downtime hours per responsible party.">
        <DataTable rows={byNop} pageSize={20} filename="pba_power_responsibility_by_nop.csv" initialSort={{ key: "total", dir: -1 }} columns={[
          { key: "nop", label: "NOP" }, { key: "total", label: "Power downtime", num: true, render: (r) => fH(r.total) },
          ...ORDER.map((k) => ({ key: k, label: RESP[k], num: true, render: (r) => (r.total ? `${Math.round((100 * r[k]) / r.total)}%` : "—"), csv: (r) => r[k]?.toFixed(1) })),
        ]} />
      </Card>
      <Card title="Sites — power downtime and responsibility" sub="Expand a row (▸) for the evidence. Click the site ID for the full site detail.">
        <DataTable rows={rows} filename="pba_power_responsibility_sites.csv" initialSort={{ key: "_pd_h", dir: -1 }}
          expand={(r) => <div className="text-[12px] text-slate"><b className="text-ink">Why:</b> {r.resp.why} <button className="ml-2 text-s1 underline" onClick={() => setPick(r)}>open site detail</button></div>}
          columns={[
            { key: "site_id", label: "Site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> }, { key: "site_name", label: "Name" }, { key: "nop", label: "NOP" },
            { key: "_pd_h", label: "Power downtime", num: true, render: (r) => fH(r._pd_h), csv: (r) => r._pd_h.toFixed(2) },
            { key: "resp_primary", label: "Responsibility", sortVal: (r) => r.resp.primary, render: (r) => RESP[r.resp.primary] || "—", csv: (r) => RESP[r.resp.primary] },
            { key: "resp_kind", label: "Basis", sortVal: (r) => r.resp.kind, render: (r) => <EvTag v={r.resp.kind} />, csv: (r) => r.resp.kind },
            { key: "resp_conf", label: "Confidence", render: (r) => r.resp.evidence, csv: (r) => r.resp.evidence },
            { key: "resp_n", label: "Power tickets", num: true, render: (r) => fInt(r.resp.n), csv: (r) => r.resp.n },
          ]} extraCsv={[{ key: "why", label: "Why", csv: (r) => r.resp.why }]} />
      </Card>
    </div>
  );
}
