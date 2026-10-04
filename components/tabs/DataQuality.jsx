"use client";
import React, { useMemo } from "react";
import { Card, Note, DataTable, EvTag, Tag, Gloss, fInt, fPct, fNum, precisionNote } from "@/components/ui";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { EVCOLS } from "@/lib/drill";

const EV = ["ACTUAL", "DERIVED", "ESTIMATED", "PROXY", "UNAVAILABLE"];
const pct = (n, d) => fPct((100 * n) / Math.max(1, d), 1);

export default function DataQuality({ scope, data, offairSites = [], mbpStats, cfg, setPick, openDrill }) {
  const snap = data.meta.snapshot || {}, mb = data.meta.mbp || {}, m = data.meta, qa = m.qa;
  const prec = useMemo(() => { const c = {}; scope.forEach((x) => { const d = x.lat == null ? "none" : x.coord_decimals ?? "none"; c[d] = (c[d] || 0) + 1; }); return Object.entries(c).sort((a, b) => String(b[0]).localeCompare(String(a[0]))); }, [scope]);
  const acc = useMemo(() => { const c = {}; scope.forEach((x) => { c[x.access_class] = (c[x.access_class] || 0) + 1; }); return c; }, [scope]);
  const dz = useMemo(() => { const c = { DERIVED: 0, ESTIMATED: 0, PROXY: 0 }; scope.forEach((x) => { c[x.bbt_design_evidence] = (c[x.bbt_design_evidence] || 0) + 1; }); return c; }, [scope]);
  const unk = useMemo(() => ({ pln: scope.filter((x) => !x.pln_known).length, hist: scope.filter((x) => !x.mbp_hist_known).length, o25: scope.filter((x) => !x.o25_known).length }), [scope]);
  const hiddenBc = useMemo(() => [...(mbpStats?.values() || [])].filter((b) => b.coord_status === "MISSING" || b.sites_covered === 0)
    .map((b) => ({ ...b, reason: b.coord_status === "MISSING" ? "no location" : "0 sites assigned" })), [mbpStats]);
  const unver = useMemo(() => scope.filter((x) => x.battery.unverified), [scope]);
  const picStat = (mb.pic_matches || []).reduce((a, r) => { const k = r.status + (r.confidence ? ` · ${r.confidence}` : ""); a[k] = (a[k] || 0) + 1; return a; }, {});
  const ev = useMemo(() => EVCOLS.map(([k, label, f]) => {
    const c = {}; scope.forEach((s) => { const e = f(s); c[e] = (c[e] || 0) + 1; });
    return { field: label, ...c };
  }), [scope]);
  const miss = ["site_class", "lat", "hub_site", "battery_type", "battery_age_y", "load_a", "battery_banks", "bbt_measured_min", "bbt_lower_bound_min", "pln_source", "avail_wc_pct", "mbp_assigned"]
    .map((k) => ({ field: k, missing_pct: (100 * scope.filter((s) => s[k] == null).length) / Math.max(1, scope.length) }));
  const um = m.dq.unmatched.reduce((a, u) => { a[u.source] = (a[u.source] || 0) + 1; return a; }, {});
  const cal = useMemo(() => { const r = scope.filter((x) => x.battery.source === "ACTUAL" && x.bbt_design_evidence === "DERIVED").map((x) => x.bbt_value_min / x.bbt_design_min).sort((a, b) => a - b);
    return { n: r.length, med: r.length ? r[Math.floor(r.length / 2)] : null, capped: scope.filter((x) => x.bbt_design_min >= (cfg.bbt.design_from_battery?.max_minutes ?? 480)).length }; }, [scope, cfg]);
  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title={t("dq.sources.title")} sub={t("dq.sources.sub")}>
          <DataTable rows={m.dq.sources} pageSize={20} filename="pba_dq_sources.csv" columns={[
            { key: "source", label: "dq.col.source" }, { key: "grain", label: "dq.col.grain" },
            { key: "raw", label: "dq.col.raw", num: true, render: (r) => fInt(r.raw), csv: (r) => r.raw }, { key: "clean", label: "dq.col.clean", num: true, render: (r) => fInt(r.clean), csv: (r) => r.clean }]} />
        </Card>
        <Card title={t("dq.evidence.title")}>
          <div className="overflow-x-auto"><table className="w-full text-[12.5px] tabular">
            <thead><tr className="text-slate"><th className="text-left py-1 border-b border-line">{t("dq.col.field")}</th>{EV.map((e) => <th key={e} className="text-right px-2 border-b border-line"><EvTag v={e} /></th>)}</tr></thead>
            <tbody>{ev.map((r) => <tr key={r.field} className="border-b border-line/60"><td className="py-1.5"><button onClick={() => openDrill(`field_${r.field}`)} title={t("drill.open")} className="text-left text-s1 hover:text-navy hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">{t(`dq.field.${r.field}`)} <span aria-hidden className="text-[11px]">↗</span></button></td>{EV.map((e) => <td key={e} className="text-right px-2">{r[e] ? fInt(r[e]) : "·"}</td>)}</tr>)}</tbody>
          </table></div>
        </Card>
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card title={t("dq.unknown.title")} sub={t("dq.unknown.sub", { n: fNum(cfg.unknown_handling?.neutral_rank ?? 0.5, 2) })}>
          <table className="w-full text-[12.5px] tabular"><tbody>
            <tr className="border-b border-line/60"><td className="py-1">{t("dq.unknown.pln")}</td><td className="text-right">{fInt(unk.pln)}</td><td className="text-right text-slate">{pct(unk.pln, scope.length)}</td></tr>
            <tr className="border-b border-line/60"><td className="py-1">{t("dq.unknown.hist")}</td><td className="text-right">{fInt(unk.hist)}</td><td className="text-right text-slate">{pct(unk.hist, scope.length)}</td></tr>
            <tr className="border-b border-line/60"><td className="py-1">{t("dq.unknown.o25")}</td><td className="text-right">{fInt(unk.o25)}</td><td className="text-right text-slate">{pct(unk.o25, scope.length)}</td></tr>
          </tbody></table>
        </Card>
        <Card title={t("dq.missing.title")}>
          <table className="w-full text-[12.5px] tabular"><tbody>{miss.map((r) => <tr key={r.field} className="border-b border-line/60"><td className="py-1"><code className="text-[11.5px]">{r.field}</code></td><td className="text-right">{fPct(r.missing_pct, 1)}</td></tr>)}</tbody></table>
        </Card>
        <Card title={t("dq.unmatched.title")}>
          <table className="w-full text-[12.5px] tabular"><tbody>{Object.entries(um).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-1">{k}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
          <div className="text-[11.5px] text-mut mt-2">{t("dq.unmatched.rates", { a: fPct(100 * qa.ticket_mbp_match_rate, 1), b: fPct(100 * qa.ticket_rh_valid_rate, 1) })}</div>
        </Card>
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card title={<>{t("dq.design.title")}<Gloss k="bbt_design" /></>} sub={t("dq.design.sub", { d: cfg.bbt.design_minutes })}>
          <table className="w-full text-[12.5px] tabular"><tbody>
            {["DERIVED", "ESTIMATED", "PROXY"].map((k) => <tr key={k} className="border-b border-line/60"><td className="py-1"><EvTag v={k} /> {t(`dq.design.${k}`)}</td><td className="text-right">{fInt(dz[k])}</td><td className="text-right text-slate">{pct(dz[k], scope.length)}</td></tr>)}
          </tbody></table>
          {cal.med != null && <div className="mt-2"><Note tone="warn">{t("dq.design.cal", { n: fInt(cal.n), p: fPct(cal.med * 100, 0), c: fInt(cal.capped), max: cfg.bbt.design_from_battery?.max_minutes ?? 480 })}</Note></div>}
        </Card>
        <Card title={<>{t("dq.unver.title")}<Gloss k="derived_unverified" /></>} sub={t("dq.unver.sub")}>
          <div className="text-[22px] font-bold text-navy">{fInt(unver.length)}</div>
          <div className="text-[11.5px] text-mut">{t("dq.unver.rule", { e: cfg.bbt.derived_support.min_exhaustion_events, h: cfg.bbt.derived_support.min_power_h, s: fPct(cfg.bbt.derived_support.min_share_of_pln * 100, 0) })}</div>
        </Card>
        <Card title={t("dq.sanity.title")} sub={t("dq.sanity.sub")}>
          <table className="w-full text-[12px]"><tbody>{(qa.build_sanity || []).map((c) => <tr key={c.check} className="border-b border-line/60"><td className="py-0.5">{c.ok ? "✔" : "✖"}</td><td className="py-0.5">{te(c.check, "sanity")}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <Card title={t("dq.offair.title", { n: fInt(offairSites.length) })} sub={t("dq.offair.sub", { a: fPct(cfg.offair.max_outage_share * 100, 0), b: fPct(cfg.offair.full_month_share * 100, 0), c: fPct(cfg.offair.no_alarm_min_share * 100, 0) })}>
        <DataTable rows={offairSites} pageSize={15} filename="pba_dq_suspected_offair.csv" onRowClick={setPick} initialSort={{ key: "ran_outage_h", dir: -1 }} columns={[
          { key: "site_id", label: "col.site" }, { key: "site_name", label: "col.name" }, { key: "nop", label: "col.nop" },
          { key: "ran_outage_h", label: "dq.col.downtime", num: true, render: (r) => `${fInt(r.ran_outage_h)} ${t("unit.h")} (${fPct((100 * r.ran_outage_h) / r.ran_hours, 0)})`, csv: (r) => r.ran_outage_h?.toFixed(1) },
          { key: "ran_power_down_h", label: "dq.col.power", num: true, render: (r) => `${fInt(r.ran_power_down_h)} ${t("unit.h")}`, csv: (r) => r.ran_power_down_h?.toFixed(1) },
          { key: "evt_total", label: "dq.col.alarms", num: true, render: (r) => fInt(r.evt_total || 0), csv: (r) => r.evt_total || 0 }, { key: "in_ticket_file", label: "dq.col.tickets", render: (r) => (r.in_ticket_file ? t("common.yes") : t("dq.none")), csv: (r) => (r.in_ticket_file ? "yes" : "none") },
          { key: "offair", label: "col.why", wrap: true, render: (r) => te(r.offair, "offair"), csv: (r) => r.offair },
        ]} />
      </Card>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title={t("dq.hidden.title", { n: hiddenBc.length })} sub={t("dq.hidden.sub")}>
          <DataTable rows={hiddenBc} pageSize={15} filename="pba_dq_basecamps_hidden.csv" columns={[{ key: "mbp_id", label: "col.basecamp" }, { key: "pic_name", label: "col.pic" }, { key: "nop", label: "col.nop" },
            { key: "reason", label: "dq.col.reason", render: (r) => t(r.coord_status === "MISSING" ? "dq.reason.noloc" : "dq.reason.nosites"), csv: (r) => r.reason }, { key: "deployments_h1", label: "dq.col.h1_tickets", num: true }]} />
        </Card>
        <Card title={t("dq.merge.title")} sub={t("dq.merge.sub", { a: qa.basecamp_merge?.applied ?? 0, b: qa.basecamp_merge?.basecamps_before, c: qa.basecamp_merge?.basecamps_after })}>
          <DataTable rows={data.mbps.filter((x) => x.merged_from)} pageSize={15} filename="pba_dq_basecamps_merged.csv" columns={[{ key: "mbp_id", label: "dq.col.kept" }, { key: "merged_from", label: "dq.col.merged_from" }, { key: "pic_name", label: "col.pic" }, { key: "nop", label: "col.nop" }]} />
        </Card>
      </div>
      <Card title={t("dq.snap.title")} sub={t("dq.snap.sub")}>
        <div className="text-[12.5px] mb-2">{t("dq.snap.line", { a: snap.period_start, b: snap.period_end, r: snap.refreshed_at })}</div>
        <DataTable rows={snap.sources || []} pageSize={20} filename="pba_dq_source_status.csv" columns={[
          { key: "source", label: "dq.col.source" }, { key: "files", label: "dq.col.files", num: true }, { key: "status", label: "dq.col.status", render: (r) => <Tag tone={r.status === "OK" ? "good" : "crit"}>{r.status === "OK" ? "✔ OK" : `✖ ${r.status}`}</Tag>, csv: (r) => r.status },
          { key: "latest_file_time", label: "dq.col.latest" }]} />
      </Card>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card title={t("dq.access.title")} sub={t("dq.access.sub")}>
          <table className="w-full text-[12.5px] tabular"><tbody>{Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-1">{tv("access", k)}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
          <div className="text-[11.5px] text-mut mt-2">{t("dq.access.note")}</div>
        </Card>
        <Card title={t("dq.coord.title")} sub={t("dq.coord.sub")}>
          <table className="w-full text-[12.5px] tabular"><tbody>{prec.map(([d, v]) => <tr key={d} className="border-b border-line/60"><td className="py-1">{d === "none" ? t("dq.coord.none") : t("dq.coord.decimals", { n: d })}</td><td className="text-slate">{d === "none" ? "" : precisionNote(+d)}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
        </Card>
        <Card title={t("dq.pic.title")} sub={t("dq.pic.sub")}>
          <table className="w-full text-[12.5px] tabular"><tbody>{Object.entries(picStat).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-1">{k}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
          <div className="text-[11.5px] text-mut mt-2">{t("dq.pic.rate", { a: fPct(100 * qa.ticket_mbp_match_rate, 1), b: fPct(100 * (qa.ticket_mbp_match_rate_exact || 0), 1) })}</div>
        </Card>
      </div>
      <Card title={t("dq.picd.title")} sub={t("dq.picd.sub")}>
        <DataTable rows={(mb.pic_matches || []).filter((r) => r.confidence !== "EXACT")} pageSize={25} filename="pba_dq_pic_matching.csv" initialSort={{ key: "status", dir: 1 }} columns={[
          { key: "pic", label: "dq.col.ticket_pic" }, { key: "nop", label: "col.nop" }, { key: "n", label: "dq.col.tickets", num: true },
          { key: "status", label: "dq.col.status", render: (r) => <Tag tone={r.status === "MATCHED" ? "good" : r.status === "NEEDS REVIEW" ? "warn" : "crit"}>{r.status}</Tag>, csv: (r) => r.status },
          { key: "confidence", label: "col.confidence" }, { key: "mbp_id", label: "dq.col.matched" }, { key: "basis", label: "col.basis", wrap: true, render: (r) => te(r.basis, "pic"), csv: (r) => r.basis }, { key: "candidates", label: "dq.col.candidates", wrap: true }]} />
      </Card>
      <Card title={t("dq.dup.title")} sub={t("dq.dup.sub")}>
        <DataTable rows={mb.duplicates || []} pageSize={25} filename="pba_dq_basecamp_duplicates.csv" initialSort={{ key: "similarity", dir: -1 }} columns={[
          { key: "mbp_a", label: "dq.col.camp_a" }, { key: "mbp_b", label: "dq.col.camp_b" }, { key: "nop_a", label: "dq.col.nop_a" }, { key: "nop_b", label: "dq.col.nop_b" },
          { key: "similarity", label: "dq.col.similarity", num: true, render: (r) => fNum(r.similarity, 2), csv: (r) => r.similarity }, { key: "km_apart", label: "dq.col.km_apart", num: true, render: (r) => (r.km_apart == null ? "—" : fNum(r.km_apart, 1)), csv: (r) => r.km_apart },
          { key: "status", label: "dq.col.assessment", wrap: true, render: (r) => te(r.status, "pic"), csv: (r) => r.status }]} />
      </Card>
      <Card title={t("dq.unmatchedl.title")}><DataTable rows={m.dq.unmatched} pageSize={20} filename="pba_dq_unmatched.csv" columns={[{ key: "source", label: "dq.col.source" }, { key: "id", label: "ID" }, { key: "n", label: "dq.col.tickets", num: true, render: (r) => (r.n == null ? "" : fInt(r.n)), csv: (r) => r.n }, { key: "note", label: "dq.col.note", wrap: true, render: (r) => te(r.note, "pic"), csv: (r) => r.note }]} /></Card>
      <Note>{t("dq.footer", { area: m.scope.area, a: m.scope.period_start, b: m.scope.period_end, r: snap.refreshed_at || m.built_at })}</Note>
    </div>
  );
}
