"use client";
// MBP › Fleet Performance — Bucket 1 (2026-10-14): one linear flow on ONE base-camp record set
//   snapshot (operational status counts) → map (mode Base camp | Site, + "Only P1/P2") → table tabs → selected row → panel (one reason).
// Operational status = lib/opstatus.js (pure mapping of the existing basecamp_final status; no new thresholds). The detailed
// dimensions (on time, working time, power-on, data cleanup) stay in the table, the panel and the CSV.
// Site mode colours the existing reach-before-BBT result (lib/coverage.js › reachTab); the radius control only appears there.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Panel, Seg, DataTable, Toggle, fInt, fPct, fMin, fNum } from "@/components/ui";
import { FleetSnapshot } from "@/components/Snapshot";
import { kpiFor } from "@/lib/kpi";
import { siteScore } from "@/lib/scorecards";
import Story from "@/components/tabs/Story";
import MbpOverview from "@/components/tabs/MbpOverview";
import Performance from "@/components/tabs/Performance";
import { PerfTag, DupBadge } from "@/components/perfUi";
import { OP_KEYS, OP_COLOR, opStatus, opCounts, needsClean } from "@/lib/opstatus";
import { OpTag, opReason, opLegend } from "@/components/opUi";
import { PanelHead, PanelLabel, Facts, NextActions, More } from "@/components/kit";
import { isP12 } from "@/lib/coverage";
import { enrichTickets, capability, CATEGORIES } from "@/lib/history";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-[560px] rounded-md border border-line bg-surface animate-pulse" /> });

export const FLEET_TABS = ["all", "check", "movable", "clean"];

export default function FleetTab(ctx) {
  const { scope, cfg, mbpsScope, perf, focus, setFocus, bcScope, hasJobs, names, openMbp, nop, setRadius, mbpStats } = ctx;
  const [mode, setMode] = useState("camp"), [p12, setP12] = useState(false), [tab, setTab] = useState("all"), [hide, setHide] = useState([]);
  const [open, setOpen] = useState({ base: false, nop: false, perf: false });
  const k = kpiFor(ctx.K, nop);
  const partial = useMemo(() => scope.some((s) => ctx.coverage?.[s.area] === "PARTIAL"), [scope, ctx.coverage]);
  // ONE record set: base camps in scope with their performance + operational status
  const rows = useMemo(() => bcScope.map((b) => { const p = perf.get(b.mbp_id) || b, o = opStatus(p, cfg); return { ...p, _op: o.op, _reason: o.reason, _clean: needsClean(p) }; }), [bcScope, perf, cfg]);
  const SS = useMemo(() => siteScore(scope), [scope]);   // scorecards (lib/scorecards.js)
  const OC = useMemo(() => opCounts(rows.map((r) => r), cfg), [rows, cfg]);
  // reported power-on per camp (lib/history.js — same as the History page), computed once for the camps in scope
  const siteById = useMemo(() => new Map(ctx.model.map((s) => [s.site_id, s])), [ctx.model]);
  const cap = useMemo(() => { const ids = new Set(bcScope.map((b) => b.mbp_id));
    return new Map(capability(enrichTickets((ctx.data.tickets || []).filter((x) => ids.has(x.mbp)), siteById), { minN: cfg.mbp_perf?.min_jobs ?? 10 }).map((c) => [c.mbp_id, c])); }, [bcScope, ctx.data.tickets, siteById, cfg]);
  const inTab = (r) => tab === "all" || (tab === "clean" ? r._clean : r._op === tab);
  const shownRows = useMemo(() => rows.filter((r) => inTab(r) && !hide.includes(r._op)), [rows, tab, hide]); // eslint-disable-line
  const shownIds = useMemo(() => new Set(shownRows.map((r) => r.mbp_id)), [shownRows]);
  const camps = useMemo(() => mbpsScope.filter((m) => shownIds.has(m.mbp_id)), [mbpsScope, shownIds]);
  const sites = useMemo(() => (p12 ? scope.filter(isP12) : scope), [scope, p12]);
  const sel = focus.mbp ? rows.find((r) => r.mbp_id === focus.mbp) || null : null;
  const capSel = sel ? cap.get(sel.mbp_id) || null : null;
  const assigned = useMemo(() => (focus.mbp ? new Set(scope.filter((s) => s.mbp_assigned === focus.mbp).map((s) => s.site_id)) : null), [scope, focus.mbp]);
  const nm = (p) => (names ? p.mbp_id : p.code);
  const selectCamp = (id) => setFocus({ site: null, mbp: id || null });
  const mapBox = React.useRef(null);
  const fromTable = (r) => { const id = focus.mbp === r.mbp_id ? null : r.mbp_id; selectCamp(id); if (!id) return;
    setTimeout(() => { const el = mapBox.current; if (!el) return; const b = el.getBoundingClientRect(); if (b.bottom < 120 || b.top > window.innerHeight - 120) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 0); };
  // snapshot click: Perlu dicek / Bisa dipindah open their tab; Aman / Belum bisa dinilai show only that status (click again = all)
  const onOp = (op) => { if (op === "check" || op === "movable") { setHide([]); setTab(tab === op ? "all" : op); return; }
    setTab("all"); setHide((H) => (H.length === OP_KEYS.length - 1 && !H.includes(op) ? [] : OP_KEYS.filter((x) => x !== op))); };
  const activeOps = tab === "check" || tab === "movable" ? [tab] : hide.length === OP_KEYS.length - 1 ? OP_KEYS.filter((x) => !hide.includes(x)) : [];
  const pon = (r) => { const c = cap.get(r.mbp_id); return !c ? null : c.power_on_rate; };
  const minN = cfg.mbp_perf?.min_jobs ?? 10;
  const cols = [
    { key: "code", label: "col.basecamp", sortVal: (r) => nm(r), render: (r) => <span>{nm(r)}<DupBadge p={r} /></span>, csv: (r) => r.mbp_id },
    { key: "_op", label: "op.col.status", sortVal: (r) => OP_KEYS.indexOf(r._op), render: (r) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><OpTag op={r._op} /><span className="text-[11px] text-slate">{t(`op.why_short.${r._reason}`)}</span></span>, csv: (r) => r._op },
    { key: "_reason", label: "op.col.reason", tdClass: "whitespace-normal", sortVal: (r) => r._reason, render: (r) => <span className="block min-w-[200px] max-w-[340px] text-[12px] text-slate">{tab === "clean" ? `${t("fl.not_usable")}: ${(r.clean_reasons || []).map((x) => t(`clean.${x}`)).join(" · ")}` : opReason(r, cfg)}</span>, csv: (r) => r._reason },
    { key: "jobs", label: "perf.col.jobs", num: true, render: (r) => (hasJobs ? fInt(r.jobs) : t("common.na")) },
    { key: "ontime_rate", label: "op.col.ontime", num: true, sortVal: (r) => r.ontime_rate ?? -1, render: (r) => (r.ontime_rate == null ? <span className="text-mut">{r.judged ? `n ${fInt(r.judged)} < ${minN}` : t("common.na")}</span> : `${fPct(100 * r.ontime_rate, 0)} · n ${fInt(r.judged)}`), csv: (r) => (r.ontime_rate == null ? "" : (100 * r.ontime_rate).toFixed(1)) },
    { key: "busy", label: "perf.col.busy", num: true, sortVal: (r) => r.busy ?? -1, render: (r) => (hasJobs && r.jobs ? fPct(100 * (r.busy || 0), 1) : t("common.na")), csv: (r) => (r.busy == null ? "" : (100 * r.busy).toFixed(2)) },
    { key: "pon", label: "op.col.pon", num: true, sortVal: (r) => pon(r) ?? -1, render: (r) => { const c = cap.get(r.mbp_id); return !c ? t("common.na") : c.power_on_rate == null ? <span className="text-mut">n {fInt(c.outcome_known)}</span> : `${fPct(100 * c.power_on_rate, 0)} · n ${fInt(c.outcome_known)}`; }, csv: (r) => (pon(r) == null ? "" : (100 * pon(r)).toFixed(1)) },
    { key: "sites_assigned", label: "fl.sites", num: true },
  ];
  const XCSV = [{ key: "nop", label: "NOP" }, { key: "area", label: "Area" }, { key: "status", label: "Detailed status (basecamp_final)", csv: (r) => r.status ?? r.key },
    { key: "selectable", label: "Selectable", csv: (r) => (r.selectable ? "yes" : "no") }, { key: "clean_reasons", label: "Clean-up reasons", csv: (r) => (r.clean_reasons || []).join(" ") },
    { key: "dup_state", label: "Duplicate review" }, { key: "judged", label: "Judged jobs" }, { key: "arr_median", label: "Median arrival (min)" },
    { key: "need", label: "Long outages (need)" }, { key: "need_served", label: "Need served" }, { key: "nobat", label: "No-battery tickets" }];
  return (
    <div className="space-y-3">
      <FleetSnapshot k={k} C={OC} S={SS} hasJobs={hasJobs} partial={partial} onOp={onOp} active={activeOps}
        onDbl={() => ctx.navigate({ view: "mbp.explorer", sel: "sc~dbl" })}
        onReach={(x) => ctx.navigate({ view: "mbp.explorer", sel: `reach_p12~${x}` })} onOntime={() => ctx.navigate({ view: "mbp.history" })} />
      <div ref={mapBox} className="scroll-mt-32"><Card title={t("fl.map.title")} sub={t(mode === "camp" ? "fl.map.sub_camp" : "fl.map.sub_site")} right={<div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-slate">{t("map.g.mode")}</span>
        <Seg value={mode} onChange={setMode} label={t("map.g.mode")} options={[["camp", t("fl.m.camp"), t("fl.m.camp_tip")], ["site", t("fl.m.site"), t("fl.m.site_tip")]]} />
        <Toggle label={t("fl.p12")} checked={p12} onChange={setP12} />
        <label className="inline-flex items-center gap-1 text-slate"><input type="checkbox" checked={names} onChange={(e) => ctx.setNames(e.target.checked)} className="accent-navy" />{t("mgmt.names")}</label></div>}>
        {mode === "camp" && <div className="flex flex-wrap items-center gap-2 text-[12px] mb-2" role="group" aria-label={t("op.legend")}>
          <span className="text-slate">{t("op.legend")}:</span>
          {opLegend().map((l) => { const on = !hide.includes(l.k); return (
            <button key={l.k} aria-pressed={on} title={l.tip} onClick={() => setHide(on ? [...hide, l.k] : hide.filter((y) => y !== l.k))}
              className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border ${on ? "bg-white border-slate/40" : "bg-surface border-line text-mut line-through"}`}>
              <span className="w-2.5 h-2.5 rounded-full inline-block border border-navy/30" style={{ background: on ? l.c : "#E3E7ED" }} />{l.label} <span className="tabular text-mut">{fInt(OC[l.k])}</span></button>); })}
          {hide.length > 0 && <button className="text-s1 underline" onClick={() => setHide([])}>{t("map.leg_all")}</button>}
          <span className="text-mut">· {t("fl.camp_noloc", { n: fInt(rows.filter((r) => r.status === "noloc").length) })}</span>
        </div>}
        <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-3">
          {mode === "camp" ? <MapView sites={sites} mbps={camps} cfg={cfg} mbpStats={mbpStats} fitKey={nop + "fleet" + (ctx.area || "")} height={600} showCard={false} showRadius={false}
            colorOverride={() => "#C4CAD4"} keyOverride={() => "site"} hollowOverride={() => false} legendOverride={[{ k: "site", c: "#C4CAD4", label: t("fl.sites_neutral2") }]}
            ttOverride={(s) => `${s.site_class} · MBP-${s.mbp_priority_level}`} selectedMbpId={focus.mbp} onSelectMbp={(m) => selectCamp(m?.mbp_id)}
            selectedSiteId={focus.site} onSelectSite={(s) => setFocus({ ...focus, site: s ? s.site_id : null })} campSiteIds={assigned}
            mbpKeyOf={(m) => rows.find((r) => r.mbp_id === m.mbp_id)?._op || "unrated"} mbpLegend={opLegend()} hideMbpLegend mbpPerf={perf} onOpenMbp={openMbp}
            mbpLabel={(m) => { const r = rows.find((x) => x.mbp_id === m.mbp_id); return r ? `${nm(r)} · ${t(`op.${r._op}`)}` : ""; }} onPickSite={ctx.setPick} />
            : <MapView sites={sites} mbps={camps} cfg={cfg} onRadius={setRadius} mbpStats={mbpStats} fitKey={nop + "fleet" + (ctx.area || "")} height={600} showCard={false}
              mode="reach3" modes={["reach3"]} selectedMbpId={focus.mbp} onSelectMbp={(m) => selectCamp(m?.mbp_id)} selectedSiteId={focus.site}
              onSelectSite={(s) => setFocus({ ...focus, site: s ? s.site_id : null })} campSiteIds={assigned} mbpPerf={perf} onOpenMbp={openMbp}
              mbpLabel={(m) => nm(rows.find((x) => x.mbp_id === m.mbp_id) || { mbp_id: m.mbp_id, code: m.mbp_id })} onPickSite={ctx.setPick} />}
          <Panel title={sel ? <>🚚 {nm(sel)}<DupBadge p={sel} /></> : null} sub={sel ? `${sel.nop || "—"} · ${sel.area}` : null} onClose={() => selectCamp(null)} empty={t("fl.pick_hint")}>
            {sel && <>
              <PanelHead badges={<><OpTag op={sel._op} />{sel._op === "check" && <span className="text-[11.5px] text-slate">{t(`op.why_short.${sel._reason}`)}</span>}</>} why={opReason(sel, cfg)}>
                {sel.nobat_flag && <div className="text-[11.5px] text-[#8a5a00] bg-warn/15 rounded px-1.5 py-0.5">⚑ {t("perf.nobat_flag", { n: fInt(sel.nobat), p: fPct(100 * (sel.nobat_share || 0), 0) })}</div>}
                {sel._clean && <div className="text-[11.5px] text-[#8a5a00]">{t("fl.not_usable")}: {(sel.clean_reasons || []).map((x) => t(`clean.${x}`)).join(" · ")}</div>}
              </PanelHead>
              <PanelLabel>{t("fl.panel.facts")}</PanelLabel>
              <Facts rows={[[t("fl.sites"), fInt(sel.sites_assigned)], [t("perf.col.jobs"), hasJobs ? `${fInt(sel.jobs)} (${fNum((sel.jobs || 0) / 6, 1)}/${t("perf.month_short")})` : t("common.na")],
                [t("op.col.ontime"), sel.ontime_rate == null ? (sel.judged ? `n ${fInt(sel.judged)} < ${minN}` : t("common.na")) : `${fPct(100 * sel.ontime_rate, 0)} · n ${fInt(sel.judged)}`],
                [t("perf.col.busy"), hasJobs && sel.jobs ? fPct(100 * (sel.busy || 0), 1) : t("common.na")],
                [t("op.col.pon"), !capSel ? t("common.na") : capSel.power_on_rate == null ? t("hist.few", { n: fInt(capSel.outcome_known) }) : `${fPct(100 * capSel.power_on_rate, 0)} · n ${fInt(capSel.outcome_known)}`]]} />
              <More title={t("fl.more_detail")}>
                <Facts rows={[[t("fl.detailed_status"), <PerfTag key="p" k={sel.status ?? sel.key} />], [t("perf.col.arr_median"), fMin(sel.arr_median)],
                  [t("col.need_cov"), sel.resp == null ? t("common.na") : `${fPct(100 * sel.resp, 0)} · ${fInt(sel.need_served)}/${fInt(sel.need)}`],
                  [t("hist.col.nock"), capSel ? fInt(capSel.no_checkin) : t("common.na")], [t("perf.col.nobat"), fInt(sel.nobat || 0)],
                  [t("hist.col.cats"), capSel ? CATEGORIES.map((c) => `${t(`hist.cat_s.${c}`)} ${fInt(capSel[`rc_${c}`] || 0)}`).join(" · ") : t("common.na")]]} />
                <div className="text-[11px] text-mut mt-1">{t("fl.defs")} {t("fl.defs_pon")}</div></More>
              <NextActions items={[
                mode === "camp" && { label: t("fl.act.sites"), title: t("fl.act.sites_tip"), onClick: () => setMode("site") },
                (sel._op === "movable" || sel._op === "check") && sel.nop && !sel._clean && { label: t("fl.act.plan"), title: t("fl.act.plan_tip"), onClick: () => { try { window.__pbaPlan = "move"; } catch {} ctx.navigate({ view: "mbp.plan", nop: sel.nop }); } },
                hasJobs && { label: t("fl.to_history2"), title: t("fl.act.hist_tip"), onClick: () => ctx.navigate({ view: "mbp.history" }) },
                { label: t("perf.card.open"), onClick: () => openMbp(ctx.data.mbps.find((m) => m.mbp_id === sel.mbp_id)) }]} />
            </>}
          </Panel>
        </div>
      </Card></div>
      <Card title={t("fl.table.title", { n: fInt(shownRows.length) })} sub={t(`fl.tab_sub.${tab}`)}>
        <div className="flex flex-wrap items-center gap-2 mb-2" role="tablist" aria-label={t("fl.table.tabs")}>
          {FLEET_TABS.map((x) => { const n = x === "all" ? rows.length : x === "clean" ? OC.clean : OC[x]; return (
            <button key={x} role="tab" aria-selected={tab === x} onClick={() => { setTab(x); setHide([]); }}
              className={`px-3 py-1 rounded-md border text-[12.5px] ${tab === x ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`}>
              {x !== "all" && x !== "clean" && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle border border-white/60" style={{ background: OP_COLOR[x] }} />}{t(`fl.tab.${x}`)} <span className="tabular opacity-80">{fInt(n)}</span></button>); })}
          {hide.length > 0 && <span className="text-[12px] text-slate">{t("fl.legend_active")} <button className="text-s1 underline" onClick={() => setHide([])}>{t("map.leg_all")}</button></span>}
        </div>
        {!shownRows.length ? <div className="py-6 text-center text-mut text-[13px]">{t("ws.empty")}</div> :
          <DataTable rows={shownRows} columns={cols} extraCsv={XCSV} filename={`pba_basecamps_${tab}.csv`} pageSize={50} keyFn={(r) => r.mbp_id}
            initialSort={{ key: "_op", dir: 1 }} selectedKey={focus.mbp} onSelect={fromTable} maxH={560} />}
      </Card>
      <details open={open.base} onToggle={(e) => setOpen({ ...open, base: e.currentTarget.open })}>
        <summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("fl.baseline")}</summary>
        <div className="mt-2 space-y-2"><div className="text-[12px] text-slate">{t("fl.baseline_sub")}</div><Story {...ctx} /></div></details>
      <details open={open.perf} onToggle={(e) => setOpen({ ...open, perf: e.currentTarget.open })}>
        <summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("fl.perf_detail")}</summary>
        <div className="mt-2">{open.perf && (hasJobs ? <Performance {...ctx} embedded selectedId={focus.mbp} onSelect={(id) => selectCamp(id)} /> : <div className="text-mut text-[12.5px]">{t("perf.na")}</div>)}</div></details>
      <details open={open.nop} onToggle={(e) => setOpen({ ...open, nop: e.currentTarget.open })}>
        <summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("fl.nop")}</summary>
        <div className="mt-2">{open.nop && <MbpOverview {...ctx} part="nop" />}</div></details>
    </div>
  );
}
