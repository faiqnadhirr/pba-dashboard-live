"use client";
import React, { useMemo } from "react";
import { Card, Kpi, Note, DataTable, Bar100, EvTag, fInt, fH, fPct, RESP_COLOR } from "@/components/ui";
import { aggregateResponsibility, RESP_POWER } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";

const ORDER = [...RESP_POWER, "utility_inferred", "unknown"];
// rule text names the ticket fields exactly as they appear in the source (RC 1 / RC 2 values stay in Indonesian)
const MAPPING = [["utility", "OBSERVED"], ["internal", "OBSERVED"], ["battery", "OBSERVED"], ["generator", "OBSERVED"], ["vendor", "OBSERVED"],
  ["operational", "OBSERVED"], ["utility_inferred", "INFERRED"], ["unknown", "UNKNOWN"]];
const pctOf = (v, tot) => fPct((100 * v) / (tot || 1), 0);

export default function Accountability({ scope, setPick, openDrill, navigate }) {
  const agg = useMemo(() => aggregateResponsibility(scope), [scope]);
  const obs = RESP_POWER.reduce((a, k) => a + agg.hours[k], 0), inf = agg.hours.utility_inferred, unk = agg.hours.unknown;
  const tot = agg.total || 1;
  const rows = useMemo(() => scope.filter((s) => (s.ran_power_down_h || 0) > 0).map((s) => ({ ...s, _pd_h: s.ran_power_down_h })), [scope]);
  const byNop = useMemo(() => {
    const m = new Map();
    scope.forEach((s) => { const g = m.get(s.nop) || []; g.push(s); m.set(s.nop, g); });
    return [...m.entries()].map(([nop, g]) => { const a = aggregateResponsibility(g); return { nop, total: a.total, ...Object.fromEntries(ORDER.map((k) => [k, a.hours[k]])) }; });
  }, [scope]);
  return (
    <div className="space-y-4">
      <Note>
        <b>{t("acc.note.title")}</b> {t("acc.note.body")}
      </Note>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi scope="filtered" onClick={() => openDrill("power_down")} label={t("acc.kpi.power")} value={fH(agg.total)} sub={t("acc.kpi.power_sub", { n: fInt(rows.length) })} />
        <Kpi scope="filtered" label={t("acc.kpi.observed")} value={pctOf(obs, tot)} sub={t("acc.kpi.observed_sub", { h: fH(obs) })} tone="good" />
        <Kpi scope="filtered" label={t("acc.kpi.inferred")} value={pctOf(inf, tot)} sub={t("acc.kpi.inferred_sub", { h: fH(inf) })} tone="warn" />
        <Kpi scope="filtered" label={t("acc.kpi.unknown")} value={pctOf(unk, tot)} sub={t("acc.kpi.unknown_sub", { h: fH(unk) })} tone="slate" />
      </div>
      <Card title={t("acc.party.title")} sub={t("acc.party.sub")}>
        <Bar100 height={20} onSeg={(p) => navigate({ view: "mbp.sitelist", sel: `resp~${p.k}` })} parts={ORDER.map((k) => ({ k, label: tv("resp", k), c: RESP_COLOR[k], v: agg.hours[k], txt: `${pctOf(agg.hours[k], tot)} · ${fH(agg.hours[k])}` }))} />
        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <table className="w-full text-[12.5px] tabular">
            <thead><tr className="text-slate text-left"><th className="py-1 border-b border-line">{t("acc.col.party")}</th><th className="text-right border-b border-line">{t("acc.col.hours")}</th><th className="text-right border-b border-line">{t("acc.col.share")}</th><th className="text-right border-b border-line">{t("acc.col.sites")}</th><th className="border-b border-line pl-2">{t("acc.col.evidence")}</th></tr></thead>
            <tbody>{ORDER.map((k) => <tr key={k} className="border-b border-line/60"><td className="py-1"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: RESP_COLOR[k] }} />{tv("resp", k)}</td>
              <td className="text-right">{fH(agg.hours[k])}</td><td className="text-right">{pctOf(agg.hours[k], tot)}</td><td className="text-right">{fInt(agg.sites[k])}</td>
              <td className="pl-2"><EvTag v={k === "unknown" ? "UNKNOWN" : k === "utility_inferred" ? "INFERRED" : "OBSERVED"} /></td></tr>)}</tbody>
          </table>
          <div>
            <div className="text-[12.5px] font-semibold text-navy mb-1">{t("acc.rules.title")}</div>
            <table className="w-full text-[11.5px]"><tbody>{MAPPING.map(([k, ev]) => <tr key={k} className="border-b border-line/60 align-top"><td className="py-1 pr-2 font-medium whitespace-nowrap">{tv("resp", k)}</td><td className="py-1 pr-2 text-slate">{t(`acc.rule.${k}`)}</td><td className="py-1"><EvTag v={ev} /></td></tr>)}</tbody></table>
          </div>
        </div>
      </Card>
      <Card title={t("acc.nop.title")} sub={t("acc.nop.sub")}>
        <DataTable rows={byNop} pageSize={20} filename="pba_power_responsibility_by_nop.csv" initialSort={{ key: "total", dir: -1 }} columns={[
          { key: "nop", label: "col.nop" }, { key: "total", label: "col.power_downtime", num: true, render: (r) => fH(r.total), csv: (r) => r.total.toFixed(1) },
          ...ORDER.map((k) => ({ key: k, label: "resp." + k, num: true, render: (r) => (r.total ? pctOf(r[k], r.total) : "—"), csv: (r) => r[k]?.toFixed(1) })),
        ]} />
      </Card>
      <Card title={t("acc.sites.title")} sub={t("acc.sites.sub")}>
        <DataTable rows={rows} filename="pba_power_responsibility_sites.csv" initialSort={{ key: "_pd_h", dir: -1 }}
          expand={(r) => <div className="text-[12px] text-slate"><b className="text-ink">{t("common.why")}:</b> {te(r.resp.why, "resp")} <button className="ml-2 text-s1 underline" onClick={() => setPick(r)}>{t("common.open_detail")}</button></div>}
          columns={[
            { key: "site_id", label: "col.site", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> }, { key: "site_name", label: "col.name" }, { key: "nop", label: "col.nop" },
            { key: "_pd_h", label: "col.power_downtime", num: true, render: (r) => fH(r._pd_h), csv: (r) => r._pd_h.toFixed(2) },
            { key: "resp_primary", label: "col.responsibility", sortVal: (r) => r.resp.primary, render: (r) => (r.resp.primary ? tv("resp", r.resp.primary) : "—"), csv: (r) => tv("resp", r.resp.primary) },
            { key: "resp_kind", label: "col.basis", sortVal: (r) => r.resp.kind, render: (r) => <EvTag v={r.resp.kind} />, csv: (r) => r.resp.kind },
            { key: "resp_conf", label: "col.confidence", render: (r) => r.resp.evidence, csv: (r) => r.resp.evidence },
            { key: "resp_n", label: "col.power_tickets", num: true, render: (r) => fInt(r.resp.n), csv: (r) => r.resp.n },
          ]} extraCsv={[{ key: "why", label: "Why", csv: (r) => r.resp.why }]} />
      </Card>
    </div>
  );
}
