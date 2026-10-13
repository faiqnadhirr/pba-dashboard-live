"use client";
// v4.2 — MBP map screen: every base-camp number comes from basecamp_final (lib/basecamp.js) and every site number from the ONE KPI
// layer (lib/kpi.js). Header = Σ legend = Σ NOP table; recommendation lists contain selectable camps only; the rest goes to
// "Clean up first" with the reason.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, DataTable, fInt, fPct } from "@/components/ui";
import { kpiFor } from "@/lib/kpi";
import { basecampCounts, recommendable, needsCleanup, UNASSIGNED } from "@/lib/basecamp";
import { perfLegend, ontimeLegend, PERF_COLOR, PerfFormula } from "@/components/perfUi";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));
const MATCH_WARN = 0.9;

/** v5.0 — parts used by MBP › Fleet Performance: "summary" (one line), "lists" (idle / late / busy / clean up), "nop" (per-NOP table).
 *  The map moved to the fleet map + base-camp table workspace (FleetTab). part="all" keeps the v4.2 screen for ?full=1. */
export default function MbpOverview({ scope, data, cfg, nop, setNop, mbpsScope, mbpStats, perf, setRadius, setPick, openMbp, K, names, setNames, hasJobs, bcScope, part = "all", focus, setFocus }) {
  const show = (x) => part === "all" || part === x;
  const k = kpiFor(K, nop);
  const [dim, setDim] = useState("util");
  const C = useMemo(() => basecampCounts(bcScope), [bcScope]);
  const mbpKeyOf = useMemo(() => (dim === "util" ? (m) => perf.get(m.mbp_id)?.key || "none" : (m) => perf.get(m.mbp_id)?.ontime_key || "nodata"), [perf, dim]);
  const legend = useMemo(() => (dim === "util" ? perfLegend() : ontimeLegend()), [dim]);
  const legendCounts = useMemo(() => (dim === "util" ? C.by : null), [dim, C]);
  const nm = (p) => (names ? p.mbp_id : p.code);
  const under = recommendable(bcScope, "under").sort((a, b) => a.jobs - b.jobs);
  const low = recommendable(bcScope, "low").sort((a, b) => (a.ontime_rate ?? 9) - (b.ontime_rate ?? 9));
  const high = recommendable(bcScope, "high").sort((a, b) => b.busy - a.busy);
  const clean = needsCleanup(bcScope);
  const [mapMode, setMapMode] = useState("survival");
  const lbl = (m) => { const p = perf.get(m.mbp_id); return p ? `${nm(p)} · ${t(`perf.key.${p.key}`)} · ${fInt(p.jobs)} job · ${p.ontime_rate == null ? "—" : fPct(100 * p.ontime_rate, 0)} ${t("perf.ontime_short")}` : ""; };
  const open = (id) => (setFocus ? (setFocus({ site: null, mbp: id }), window.scrollTo({ top: 0, behavior: "smooth" })) : openMbp(data.mbps.find((m) => m.mbp_id === id)));
  const MiniList = ({ title, list, value, tone }) => (
    <Card title={`${title} (${fInt(list.length)})`}>
      {!list.length ? <div className="text-mut text-[12.5px]">{hasJobs ? t("mgmt.none") : t("common.na")}</div> : <ul className="text-[12.5px] divide-y divide-line/70">
        {list.slice(0, 6).map((p) => <li key={p.mbp_id}><button onClick={() => open(p.mbp_id)} className="w-full flex items-center gap-2 py-1 text-left hover:bg-surface">
          <span className="w-2.5 h-2.5 rounded-sm border border-navy/30 inline-block shrink-0" style={{ background: PERF_COLOR[p.status] }} />
          <span className="truncate flex-1">{nm(p)}</span><span className={`tabular whitespace-nowrap ${tone}`}>{value(p)}</span></button></li>)}
      </ul>}
    </Card>
  );
  if (!k) return null;
  const warnMatch = k.ticket_match_pct != null && k.ticket_match_pct < MATCH_WARN;
  return (
    <div className="space-y-4">
      {show("summary") && <><div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink bg-white border border-line rounded-md px-3 py-2">
        <span title={t("ov.units_tip")}><b className="tabular">{fInt(C.total)}</b> {t("ov.units")}{C.by.noloc ? <span className="text-mut"> ({fInt(C.by.noloc)} {t("ov.noloc")})</span> : null}</span>
        <span><b className="tabular">{fInt(k.sites)}</b> {t("ov.sites")} · <b className="tabular">{fInt(k.p12)}</b> {t("ov.p12")}</span>
        <span title={t("ov.reach_tip", { a: fInt(k.p12_reach_actual), e: fInt(k.p12_reach_estimated), d: fInt(k.p12_reach_derived), u: fInt(k.p12_unverified) })}>
          <b className="tabular">{k.p12_eval ? `${fInt(k.p12_reach)}/${fInt(k.p12_eval)} · ${pc(k.p12_reach_pct)}` : t("common.na")}</b> {t("ov.reach")}</span>
        <span title={t("mgmt.kpi.ontime_help")}><b className="tabular">{hasJobs ? pc(k.jobs_ontime_pct) : t("common.na")}</b> {t("ov.ontime")}{warnMatch && <b className="text-[#8a5a00]" title={t("ov.match_warn", { p: pc(k.ticket_match_pct, 1) })}> ⚠ {t("ov.match", { p: pc(k.ticket_match_pct, 1) })}</b>}</span>
        {hasJobs && <span>{["under", "high", "low"].map((s, i) => <React.Fragment key={s}>{i ? " · " : ""}<b className="tabular">{fInt(C.by[s] || 0)}</b> {t(`ov.st.${s}`)}</React.Fragment>)}</span>}
      </div>
      {k.p12_eval > 0 && <div className="text-[11.5px] text-mut -mt-2">{t("ov.reach_basis", { a: fInt(k.p12_reach_actual), e: fInt(k.p12_reach_estimated), d: fInt(k.p12_reach_derived), u: fInt(k.p12_unverified) })}</div>}</>}
      {part === "all" && <Card title={t("mgmt.map.title")} sub={t("mgmt.map.sub2")} right={<div className="flex items-center gap-2 text-[12px]">
        <span className="text-slate">{t("mgmt.color_by")}</span>
        <div className="flex rounded-md overflow-hidden border border-line" role="group">{["util", "ontime"].map((d) =>
          <button key={d} aria-pressed={dim === d} onClick={() => setDim(d)} className={`px-2 py-0.5 ${dim === d ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`mgmt.dim.${d}`)}</button>)}</div>
        <label className="inline-flex items-center gap-1 text-slate"><input type="checkbox" checked={names} onChange={(e) => setNames(e.target.checked)} className="accent-navy" />{t("mgmt.names")}</label></div>}>
        <MapView sites={scope} mbps={mbpsScope} cfg={cfg} onRadius={setRadius} onPickSite={setPick} mbpStats={mbpStats} fitKey={nop + "mgmt"} height={680}
          mode={mapMode} onMode={setMapMode} modes={["survival", "priority", "design"]} mbpKeyOf={mbpKeyOf} mbpLegend={legend} mbpPerf={perf} onOpenMbp={openMbp} mbpLabel={lbl}
          mbpCountsOverride={legendCounts} />
      </Card>}
      {show("lists") && <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        <MiniList title={t("mgmt.list.under")} list={under} value={(p) => `${fInt(p.jobs)} job · ${fPct(100 * p.busy, 1)}`} tone="text-mut" />
        <MiniList title={t("mgmt.list.low")} list={low} value={(p) => `${fPct(100 * p.ontime_rate, 0)} ${t("perf.ontime_short")} · n ${fInt(p.judged)}`} tone="text-crit" />
        <MiniList title={t("mgmt.list.high")} list={high} value={(p) => `${fPct(100 * p.busy, 0)} ${t("perf.busy_short")}`} tone="text-[#6b4bd8]" />
        <Card title={`${t("mgmt.list.clean")} (${fInt(clean.length)})`} sub={t("mgmt.list.clean_sub")}>
          {!clean.length ? <div className="text-mut text-[12.5px]">{t("mgmt.none")}</div> : <ul className="text-[12.5px] divide-y divide-line/70 max-h-[220px] overflow-y-auto">
            {clean.map((p) => <li key={p.mbp_id}><button onClick={() => open(p.mbp_id)} className="w-full flex items-center gap-2 py-1 text-left hover:bg-surface">
              <span className="truncate flex-1">{nm(p)}</span>
              <span className="text-[11px] text-[#8a5a00] text-right">{p.clean_reasons.map((r) => t(`clean.${r}`)).join(" · ")}</span></button></li>)}
          </ul>}
        </Card>
      </div>}
      {show("nop") && <Card title={t("mgmt.nop.title")} sub={t("mgmt.nop.sub3")}>
        <DataTable rows={K.nops} pageSize={25} filename="pba_mbp_by_nop.csv" initialSort={{ key: "area", dir: 1 }}
          rowClass={(r) => (r.nop === nop ? "bg-warn/10 font-semibold" : r.nop === UNASSIGNED ? "text-mut" : "")} onRowClick={(r) => r.nop !== UNASSIGNED && setNop(r.nop === nop ? "All NOPs" : r.nop)}
          columns={[
            { key: "area", label: "filter.area", sortVal: (r) => `${r.area || ""} ${r.nop === UNASSIGNED ? "~" : r.nop}`, render: (r) => r.area || "—", csv: (r) => r.area || "" },
            { key: "nop", label: "col.nop", render: (r) => (r.nop === UNASSIGNED ? t("ov.unassigned") : r.nop), csv: (r) => r.nop },
            { key: "mbp", label: "col.mbp_units", num: true },
            { key: "sites", label: "col.sites_scope", num: true },
            { key: "p12_reach_pct", label: "col.p12_arrive", num: true, sortVal: (r) => r.p12_reach_pct ?? -1, render: (r) => (r.p12_eval ? `${fInt(r.p12_reach)}/${fInt(r.p12_eval)} · ${pc(r.p12_reach_pct)}` : t("common.na")), csv: (r) => (r.p12_eval ? r.p12_reach : "") },
            { key: "p12_served_pct", label: "col.need_cov_p12", num: true, sortVal: (r) => r.p12_served_pct ?? -1, render: (r) => (r.need_p12 ? `${fInt(r.served_p12)}/${fInt(r.need_p12)} · ${pc(r.p12_served_pct)}` : t("common.na")), csv: (r) => (r.need_p12 ? r.served_p12 : "") },
            { key: "served_pct", label: "col.need_cov_all", num: true, sortVal: (r) => r.served_pct ?? -1, render: (r) => (r.need ? `${fInt(r.served)}/${fInt(r.need)} · ${pc(r.served_pct)}` : t("common.na")), csv: (r) => (r.need ? r.served : "") },
            { key: "jobs_ontime_pct", label: "col.ontime_actual", num: true, sortVal: (r) => r.jobs_ontime_pct ?? -1, render: (r) => (r.jobs_ontime_pct == null ? t("common.na") : <span className={r.jobs_ontime_pct < 0.35 ? "text-crit font-semibold" : ""}>{pc(r.jobs_ontime_pct)}</span>), csv: (r) => (r.jobs_ontime_pct == null ? "" : (100 * r.jobs_ontime_pct).toFixed(1)) },
            { key: "occupancy_median", label: "col.occupancy", num: true, sortVal: (r) => r.occupancy_median ?? -1, render: (r) => (r.occupancy_median == null ? t("common.na") : `${pc(r.occupancy_median)} · n ${fInt(r.occupancy_n)}`), csv: (r) => (r.occupancy_median == null ? "" : (100 * r.occupancy_median).toFixed(1)) },
            { key: "conc_p95", label: "col.peak_conc", num: true, sortVal: (r) => r.conc_p95 ?? -1, render: (r) => (r.conc_p95 == null ? t("common.na") : `${fInt(r.conc_p95)} / ${fInt(r.mbp)}`), csv: (r) => r.conc_p95 ?? "" },
            { key: "ticket_match_pct", label: "col.ticket_match", num: true, sortVal: (r) => r.ticket_match_pct ?? 2, render: (r) => (r.ticket_match_pct == null ? t("common.na") : <span className={r.ticket_match_pct < MATCH_WARN ? "text-[#8a5a00] font-semibold" : ""}>{r.ticket_match_pct < MATCH_WARN ? "⚠ " : ""}{pc(r.ticket_match_pct, 1)}</span>), csv: (r) => (r.ticket_match_pct == null ? "" : (100 * r.ticket_match_pct).toFixed(1)) },
            { key: "calib", label: "col.calib", sortVal: (r) => (r.calib ? (r.calib.ok ? 1 : 0) : -1), render: (r) => (!r.calib ? t("common.na") : <span className={r.calib.ok ? "text-good" : "text-crit font-semibold"}>{r.calib.ok ? "✔" : "✖"} {r.calib.diff_pp > 0 ? "+" : "−"}{Math.abs(r.calib.diff_pp).toFixed(1)} pp</span>), csv: (r) => (r.calib ? r.calib.diff_pp.toFixed(2) : "") },
          ]} />
        <div className="mt-2 text-[11.5px] text-mut">{t("mgmt.nop.totals", { u: fInt(K.nops.reduce((a, r) => a + r.mbp, 0)), l: fInt(C.total) })}</div>
        <div className="mt-1"><PerfFormula cfg={cfg} /></div>
      </Card>}
    </div>
  );
}
