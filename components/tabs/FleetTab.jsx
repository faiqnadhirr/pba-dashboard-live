"use client";
// v5.0 — MBP › Fleet Performance: how the existing fleet / base camps performed in Jan–Jun (ACTUAL tickets).
// One map + one base-camp table on the same camps: the status chips filter both; a camp row selects the camp on the map (its
// assigned sites stay bright, lines drawn) and a camp marker selects its row. Historical work (jobs, on time, working time) is kept
// apart from coverage (sites assigned) and from estimated need (long outages); "working time" = job hours ÷ hours in the period.
// vNext — Fleet Snapshot hero (model reach · historical on time · fleet status) before the map; the diagnostic tiles (long outages
// handled, working time, battery-vs-MBP work, model validation by NOP) moved to "Baseline & data confidence" below.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Panel, Seg, fInt, fPct, fMin } from "@/components/ui";
import { FleetSnapshot } from "@/components/Snapshot";
import { kpiFor } from "@/lib/kpi";
import Story from "@/components/tabs/Story";
import MbpOverview from "@/components/tabs/MbpOverview";
import Performance from "@/components/tabs/Performance";
import { PERF_KEYS } from "@/lib/mbpperf";
import { PERF_COLOR, perfLegend, ontimeLegend, PerfTag, DupBadge } from "@/components/perfUi";
import { basecampCounts } from "@/lib/basecamp";
import { enrichTickets, capability, CATEGORIES } from "@/lib/history";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-[560px] rounded-md border border-line bg-surface animate-pulse" /> });

export default function FleetTab(ctx) {
  const { scope, cfg, mbpsScope, perf, focus, setFocus, bcScope, hasJobs, names, openMbp, nop, setRadius, mbpStats } = ctx;
  const [hide, setHide] = useState([]), [view, setView] = useState("util"), [open, setOpen] = useState({ lists: true, nop: false, base: false });
  const dim = view === "ontime" ? "ontime" : "util";
  const k = kpiFor(ctx.K, nop);
  const partial = useMemo(() => scope.some((s) => ctx.coverage?.[s.area] === "PARTIAL"), [scope, ctx.coverage]);
  // hero status click = show only that status on the map and in the table (click again = all)
  const onStatus = (x) => setHide((H) => (H.length === PERF_KEYS.length - 1 && !H.includes(x) ? [] : PERF_KEYS.filter((y) => y !== x)));
  const onlyKey = hide.length === PERF_KEYS.length - 1 ? PERF_KEYS.filter((y) => !hide.includes(y)) : [];
  const neutral = view === "util" || view === "ontime";
  const C = useMemo(() => basecampCounts(bcScope), [bcScope]);
  const camps = useMemo(() => mbpsScope.filter((m) => !hide.includes(perf.get(m.mbp_id)?.key)), [mbpsScope, perf, hide]);
  const sel = focus.mbp ? perf.get(focus.mbp) : null;
  // vNext.2 — capability profile of the selected camp (same rule as the KPI layer + reported power-on outcome)
  const siteById = useMemo(() => new Map(ctx.model.map((s) => [s.site_id, s])), [ctx.model]);
  const capSel = useMemo(() => (focus.mbp ? capability(enrichTickets((ctx.data.tickets || []).filter((k) => k.mbp === focus.mbp), siteById), { minN: cfg.mbp_perf?.min_jobs ?? 10 })[0] || null : null), [focus.mbp, ctx.data.tickets, siteById, cfg]);
  const assigned = useMemo(() => (focus.mbp ? new Set(scope.filter((s) => s.mbp_assigned === focus.mbp).map((s) => s.site_id)) : null), [scope, focus.mbp]);
  const mbpKeyOf = useMemo(() => (dim === "util" ? (m) => perf.get(m.mbp_id)?.key || "none" : (m) => perf.get(m.mbp_id)?.ontime_key || "nodata"), [perf, dim]);
  const nm = (p) => (names ? p.mbp_id : p.code);
  const selectCamp = (id) => setFocus({ site: null, mbp: id || null });
  const mapBox = React.useRef(null);
  const fromTable = (id) => { selectCamp(id); if (!id) return; setTimeout(() => { const el = mapBox.current; if (!el) return; const b = el.getBoundingClientRect(); if (b.bottom < 120 || b.top > window.innerHeight - 120) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 0); };
  return (
    <div className="space-y-3">
      <FleetSnapshot k={k} C={C} hasJobs={hasJobs} partial={partial} onStatus={onStatus} active={onlyKey} />
      <div ref={mapBox} className="scroll-mt-32"><Card title={t("fl.map.title")} sub={t("fl.map.sub")} right={<div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-slate">{t("map.g.mode")}</span>
        <Seg value={view} onChange={setView} label={t("map.g.mode")} options={["util", "ontime", "coverage", "priority"].map((d) => [d, t(`fl.view.${d}`), t(`fl.view_tip.${d}`)])} />
        <label className="inline-flex items-center gap-1 text-slate"><input type="checkbox" checked={names} onChange={(e) => ctx.setNames(e.target.checked)} className="accent-navy" />{t("mgmt.names")}</label></div>}>
        <div className="flex flex-wrap items-center gap-2 text-[12px] mb-2" role="group" aria-label={t("perf.legend")}>
          <span className="text-slate">{dim === "util" ? `${t("fl.show")}:` : t("fl.show_filter")}</span>
          {PERF_KEYS.map((x) => { const on = !hide.includes(x); return (
            <button key={x} aria-pressed={on} onClick={() => setHide(on ? [...hide, x] : hide.filter((y) => y !== x))} title={t(`perf.key_tip.${x}`)}
              className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border ${on ? "bg-white border-slate/40" : "bg-surface border-line text-mut line-through"}`}>
              {dim === "util" && <span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/30" style={{ background: on ? PERF_COLOR[x] : "#C9CFD9" }} />}{t(`perf.key.${x}`)} <span className="tabular text-mut">{fInt(C.by[x] || 0)}</span></button>); })}
          {hide.length > 0 && <button className="text-s1 underline" onClick={() => setHide([])}>{t("map.leg_all")}</button>}
        </div>
        <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-3">
          <MapView sites={scope} mbps={camps} cfg={cfg} onRadius={setRadius} mbpStats={mbpStats} fitKey={nop + "fleet" + (ctx.area || "")} height={600}
            mode={view === "priority" ? "priority" : "survival"} modes={[view === "priority" ? "priority" : "survival"]} showCard={false}
            colorOverride={neutral ? () => "#B8C0CC" : undefined} keyOverride={neutral ? () => "site" : undefined} hollowOverride={neutral ? () => false : undefined}
            legendOverride={neutral ? [{ k: "site", c: "#B8C0CC", label: t("fl.sites_neutral") }] : undefined} ttOverride={neutral ? (s) => `${s.site_class} · MBP-${s.mbp_priority_level}` : undefined} selectedMbpId={focus.mbp} onSelectMbp={(m) => selectCamp(m?.mbp_id)}
            selectedSiteId={focus.site} onSelectSite={(s) => setFocus({ ...focus, site: s ? s.site_id : null })} campSiteIds={assigned}
            mbpKeyOf={mbpKeyOf} mbpLegend={dim === "util" ? perfLegend() : ontimeLegend()} mbpPerf={perf} onOpenMbp={openMbp} mbpCountsOverride={dim === "util" ? C.by : null} hideMbpLegend={dim === "util"}
            mbpLabel={(m) => { const p = perf.get(m.mbp_id); return p ? `${nm(p)} · ${t(`perf.key.${p.key}`)}` : ""; }} onPickSite={ctx.setPick} />
          <Panel title={sel ? <>🚚 {nm(sel)}<DupBadge p={sel} /></> : null} sub={sel ? `${sel.nop} · ${sel.area}` : null} onClose={() => selectCamp(null)} empty={t("fl.pick_hint")}>
            {sel && <>
              <div><PerfTag k={sel.key} /></div>
              {!sel.selectable && <div className="mt-1 text-[11.5px] text-[#8a5a00]">{t("fl.not_usable")}: {sel.clean_reasons.map((x) => t(`clean.${x}`)).join(" · ")}</div>}
              <table className="w-full mt-2"><tbody>
                {[[t("fl.sites"), fInt(sel.sites_assigned)], [t("perf.col.jobs"), hasJobs ? `${fInt(sel.jobs)} (${(sel.jobs / 6).toFixed(1)}/${t("perf.month_short")})` : t("common.na")],
                  [t("perf.col.ontime"), sel.ontime_rate == null ? (sel.judged ? `n ${fInt(sel.judged)} < ${cfg.mbp_perf?.min_jobs ?? 10}` : t("common.na")) : `${fPct(100 * sel.ontime_rate, 0)} · n ${fInt(sel.judged)}`],
                  [t("perf.col.busy"), hasJobs ? fPct(100 * (sel.busy || 0), 1) : t("common.na")], [t("perf.col.arr_median"), fMin(sel.arr_median)],
                  [t("col.need_cov"), sel.resp == null ? t("common.na") : `${fPct(100 * sel.resp, 0)} · ${fInt(sel.need_served)}/${fInt(sel.need)}`],
                  [t("perf.col.nobat"), fInt(sel.nobat || 0)],
                  [t("hist.col.pon"), !capSel ? t("common.na") : capSel.power_on_rate == null ? t("hist.few", { n: fInt(capSel.outcome_known) }) : `${fPct(100 * capSel.power_on_rate, 0)} · n ${fInt(capSel.outcome_known)}`],
                  [t("hist.col.nock"), capSel ? fInt(capSel.no_checkin) : t("common.na")],
                  [t("hist.col.cats"), capSel ? CATEGORIES.map((c) => `${t(`hist.cat_s.${c}`)} ${fInt(capSel[`rc_${c}`] || 0)}`).join(" · ") : t("common.na")]].map(([k, v]) => <tr key={k} className="border-b border-line/50"><td className="text-mut py-[2px]">{k}</td><td className="text-right font-medium">{v}</td></tr>)}
              </tbody></table>
              <div className="text-[11px] text-mut mt-1">{t("fl.defs")} {t("fl.defs_pon")}</div>
              <button onClick={() => ctx.navigate({ view: "mbp.history", camp: sel.mbp_id })} className="mt-1 text-s1 underline text-[12px]">{t("fl.to_history")}</button>
              <div className="flex gap-2 mt-2">
                <button onClick={() => ctx.navigate({ view: "mbp.explorer" })} className="flex-1 border border-navy text-navy rounded py-1 text-[12px]">{t("fl.to_sites")}</button>
                <button onClick={() => openMbp(ctx.data.mbps.find((m) => m.mbp_id === sel.mbp_id))} className="flex-1 bg-navy text-white rounded py-1 text-[12px]">{t("perf.card.open")}</button></div>
            </>}
          </Panel>
        </div>
      </Card></div>
      {hasJobs ? <Performance {...ctx} embedded hide={hide} setHide={setHide} selectedId={focus.mbp} onSelect={fromTable} /> : <Card title={t("perf.table.title")}><div className="text-mut text-[12.5px]">{t("perf.na")}</div></Card>}
      <details open={open.base} onToggle={(e) => setOpen({ ...open, base: e.currentTarget.open })}>
        <summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("fl.baseline")}</summary>
        <div className="mt-2 space-y-2"><div className="text-[12px] text-slate">{t("fl.baseline_sub")}</div><Story {...ctx} /></div></details>
      <details open={open.lists} onToggle={(e) => setOpen({ ...open, lists: e.currentTarget.open })} className="group">
        <summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("fl.lists")}</summary>
        <div className="mt-2"><MbpOverview {...ctx} part="lists" /></div></details>
      <details open={open.nop} onToggle={(e) => setOpen({ ...open, nop: e.currentTarget.open })}>
        <summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("fl.nop")}</summary>
        <div className="mt-2"><MbpOverview {...ctx} part="nop" /></div></details>
    </div>
  );
}
