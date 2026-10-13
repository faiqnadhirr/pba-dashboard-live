"use client";
// vNext.2 — MBP › History & Patterns: what the fleet actually did in Jan–Jun 2026, from the timestamped MBP job tickets (ACTUAL).
// ONE record set (lib/history.js › filterTickets): header filters (Area / NOP / class) + this page's months, base camp, outage
// category and outcome → scorecards, timeline, hotspot map and capability table all read the same rows. Historical, never live.
// Second part: demand centre vs recommended location (lib/logic.js › basecampGravity, unchanged): a weighted statistical centre is
// NOT a location; the recommendation is a real, active, road-accessible anchor site with explicit feasibility checks.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Card, DataTable, Chips, Seg, InfoTip, Tag, EvTag, fInt, fPct, fMin, fH, fKm, isNum, SEM, SCN } from "@/components/ui";
import { enrichTickets, filterTickets, timeline, capability, hotspots, historyTotals, monthOf, OUTCOMES, CATEGORIES, T0 } from "@/lib/history";
import { basecampGravity } from "@/lib/logic";
import { campCode } from "@/lib/mbpperf";
import { t, locale } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-[480px] rounded-md border border-line bg-surface animate-pulse" /> });

export const OUT_COLOR = { power_on: SEM.good, connected_no_rh: "#8fd18f", pln_back: "#2a78d6", other_action: "#8A94A6", no_checkin: "#D5DAE2" };
const HOT = [["h1", 1, "#f6c58f"], ["h2", 2, "#ec835a"], ["h5", 5, "#d03b3b"], ["h10", 10, "#7a1414"]];
const hotKey = (n) => (n >= 10 ? "h10" : n >= 5 ? "h5" : n >= 2 ? "h2" : "h1");
const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));
const MONTH_IDX = [1, 2, 3, 4, 5, 6];

export default function HistoryTab(ctx) {
  const { scope, data, cfg, mbpsScope, nop, focus, setFocus, names, setPick, openMbp, model, classes } = ctx;
  const [mFrom, setMFrom] = useState(1), [mTo, setMTo] = useState(6), [cats, setCats] = useState([]), [outs, setOuts] = useState([]), [by, setBy] = useState("week");
  const [view, setView] = useState("history");
  const nm = (id) => (names ? id : campCode(id));
  // record set = jobs of the base camps in scope (Area + NOP of the CAMP — the same grouping as the KPI layer), at any site;
  // the header class filter applies to the job's site. Tickets at in-scope sites by a PIC outside the base-camp master are counted
  // separately (never silently mixed in).
  const byId = useMemo(() => new Map(model.map((s) => [s.site_id, s])), [model]);
  const camps = useMemo(() => new Set(mbpsScope.map((m) => m.mbp_id)), [mbpsScope]);
  const master = useMemo(() => new Set(data.mbps.map((m) => m.mbp_id)), [data.mbps]);
  const all = useMemo(() => enrichTickets((data.tickets || []).filter((k) => camps.has(k.mbp)), byId), [data.tickets, camps, byId]);
  const inScope = useMemo(() => new Set(scope.map((s) => s.site_id)), [scope]);
  const unknownPic = useMemo(() => (data.tickets || []).filter((k) => inScope.has(k.site) && !master.has(k.mbp)).length, [data.tickets, inScope, master]);
  const camp = focus.mbp && camps.has(focus.mbp) ? focus.mbp : null;
  const rows = useMemo(() => filterTickets(all, { months: [mFrom, mTo], camps: camp ? [camp] : null, classes, cats, outcomes: outs }), [all, mFrom, mTo, camp, classes, cats, outs]);
  const T = useMemo(() => historyTotals(rows), [rows]);
  // only the buckets inside the selected months are drawn (a week outside the filter is not shown as "0 jobs")
  const inMonths = (w) => { const m0 = monthOf(w * 7 * 1440), m1 = monthOf(Math.min(w * 7 * 1440 + 6 * 1440, 180 * 1440)); return m1 >= mFrom && m0 <= mTo; };
  const tl = useMemo(() => timeline(rows, by).filter((b) => (by === "month" ? b.k >= mFrom && b.k <= mTo : inMonths(b.k))), [rows, by, mFrom, mTo]); // eslint-disable-line
  const cap = useMemo(() => capability(rows, { minN: cfg.mbp_perf?.min_jobs ?? 10 }), [rows, cfg]);
  const hot = useMemo(() => hotspots(rows), [rows]);
  const hotSites = useMemo(() => hot.map((h) => ({ ...h.site, _jobs: h.jobs, _late: h.late, _pon: h.power_on })), [hot]);
  const fmtWeek = (w) => new Date(T0 + 7 * 3600e3 + w * 7 * 86400e3).toLocaleDateString(locale(), { day: "numeric", month: "short" });
  const chart = tl.map((b) => ({ ...b, label: by === "month" ? t(`month.${b.k - 1}`) : fmtWeek(b.k) }));
  const hasData = all.length > 0;
  const reset = () => { setMFrom(1); setMTo(6); setCats([]); setOuts([]); setFocus({ ...focus, mbp: null }); };
  const filtered = mFrom !== 1 || mTo !== 6 || cats.length || outs.length || camp;

  return (
    <div className="space-y-3">
      <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("hist.title")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 className="text-[15px] font-semibold text-navy">{t("hist.title")}</h2>
          <span className="text-[11px] uppercase tracking-wide font-semibold text-[#8a5a00] bg-warn/15 border border-warn/50 rounded px-1.5" title={t("hist.hist_tip")}>{t("hist.hist_badge")}</span>
          <Seg value={view} onChange={setView} label={t("hist.view")} options={[["history", t("hist.v.history")], ["cog", t("hist.v.cog")]]} />
          {filtered ? <button onClick={reset} className="text-s1 underline text-[12px]">{t("cond.reset")}</button> : null}
        </div>
        {view === "history" && <div className="flex flex-wrap items-end gap-4 text-[12px]">
          <label className="flex flex-col gap-1 text-mut">{t("hist.f.months")}
            <span className="flex items-center gap-1"><select value={mFrom} onChange={(e) => { const v = +e.target.value; setMFrom(v); if (v > mTo) setMTo(v); }} className="border border-line rounded px-1.5 py-1 text-ink">{MONTH_IDX.map((m) => <option key={m} value={m}>{t(`month.${m - 1}`)}</option>)}</select>–
              <select value={mTo} onChange={(e) => { const v = +e.target.value; setMTo(v); if (v < mFrom) setMFrom(v); }} className="border border-line rounded px-1.5 py-1 text-ink">{MONTH_IDX.map((m) => <option key={m} value={m}>{t(`month.${m - 1}`)}</option>)}</select> 2026</span></label>
          <label className="flex flex-col gap-1 text-mut">{t("hist.f.camp")}
            <select value={camp || ""} onChange={(e) => setFocus({ ...focus, mbp: e.target.value || null })} className="border border-line rounded px-1.5 py-1 text-ink max-w-[240px]">
              <option value="">{t("hist.f.all_camps", { n: fInt(camps.size) })}</option>
              {[...mbpsScope].sort((a, b) => a.mbp_id.localeCompare(b.mbp_id)).map((m) => <option key={m.mbp_id} value={m.mbp_id}>{nm(m.mbp_id)}</option>)}</select></label>
          <Chips label={t("hist.f.cat")} options={CATEGORIES} value={cats} onChange={setCats} fmt={(o) => t(`hist.cat.${o}`)} />
          <Chips label={t("hist.f.outcome")} options={OUTCOMES} value={outs} onChange={setOuts} fmt={(o) => t(`hist.out.${o}`)} />
          <span className="text-[11.5px] text-mut pb-1">{t("hist.f.header_note")}</span>
        </div>}
      </section>

      {view === "history" && (!hasData ? <Card title={t("hist.title")}><div className="text-mut text-[13px] py-6 text-center">{t("hist.none")}</div></Card> : <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {[[t("hist.k.jobs"), fInt(T.jobs), t("hist.k.jobs_sub", { a: t(`month.${mFrom - 1}`), b: t(`month.${mTo - 1}`) })],
            [t("hist.k.ontime"), pc(T.ontime_rate), t("hist.k.ontime_sub", { a: fInt(T.ontime), n: fInt(T.judged) }), t("snap.ontime.tip")],
            [t("hist.k.pon"), pc(T.power_on_rate), t("hist.k.pon_sub", { a: fInt(T.power_on), n: fInt(T.outcome_known) }), t("hist.k.pon_tip")],
            [t("hist.k.nock"), fInt(T.no_checkin), t("hist.k.nock_sub")],
            [t("hist.k.unj"), fInt(T.bbt_unknown + T.no_arrival), t("hist.k.unj_sub", { b: fInt(T.bbt_unknown), c: fInt(T.no_arrival), o: fInt(T.not_pln) })],
            [t("hist.k.pic"), fInt(unknownPic), t("hist.k.pic_sub")]].map(([l, v, s, tip]) =>
            <div key={l} className="bg-white border border-line rounded-md px-3 py-2"><div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate">{tip ? <InfoTip text={tip} label={l} /> : l}</div>
              <div className="text-[20px] font-bold tabular text-ink leading-tight">{v}</div><div className="text-[11px] text-slate leading-snug">{s}</div></div>)}
        </div>
        <Card title={t("hist.tl.title", { by: t(`hist.by.${by}`) })} sub={t("hist.tl.sub")} right={<Seg value={by} onChange={setBy} label={t("hist.tl.title")} options={[["week", t("hist.by.week")], ["month", t("hist.by.month")]]} />}>
          <div className="h-[230px]"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "#55627A" }} interval={by === "week" ? 2 : 0} />
              <YAxis tick={{ fontSize: 11, fill: "#6B7588" }} width={44} tickFormatter={(v) => fInt(v)} />
              <Tooltip formatter={(v, n) => [fInt(v), t(`hist.out.${n}`)]} labelFormatter={(l, p) => `${l} · ${fInt(p?.[0]?.payload?.n)} ${t("hist.tl.jobs")} · ${t("hist.k.ontime")} ${pc(p?.[0]?.payload?.ontime_rate)}`} />
              <Legend formatter={(n) => t(`hist.out.${n}`)} wrapperStyle={{ fontSize: 11.5 }} />
              {OUTCOMES.map((o) => <Bar key={o} dataKey={o} stackId="a" fill={OUT_COLOR[o]} isAnimationActive={false} />)}
            </BarChart></ResponsiveContainer></div>
          <div className="text-[11px] text-mut mt-1">{t("hist.tl.note")}</div>
        </Card>
        <Card title={t("hist.map.title")} sub={t("hist.map.sub")}>
          {!hotSites.length ? <div className="text-mut text-[12.5px]">{t("hist.none_f")}</div> :
            <MapView sites={hotSites} mbps={mbpsScope} cfg={cfg} fitKey={"hist" + nop + (camp || "")} height={480} showMbpLayers onPickSite={setPick}
              colorOverride={(s) => HOT.find(([k]) => k === hotKey(s._jobs))[2]} keyOverride={(s) => hotKey(s._jobs)} hollowOverride={() => false}
              legendOverride={HOT.map(([k, , c]) => ({ k, c, label: t(`hist.hot.${k}`) }))} ttOverride={(s) => t("hist.map.tt", { j: fInt(s._jobs), p: fInt(s._pon), l: fInt(s._late) })}
              selectedMbpId={camp} onSelectMbp={(m) => setFocus({ ...focus, mbp: m?.mbp_id || null })} selectedSiteId={focus.site} onSelectSite={(s) => setFocus({ ...focus, site: s ? s.site_id : null })}
              campSiteIds={null} mbpLabel={(m) => nm(m.mbp_id)} />}
          <div className="text-[11px] text-mut mt-1">{t("hist.map.note")}</div>
        </Card>
        <Card title={t("hist.cap.title", { n: fInt(cap.length) })} sub={t("hist.cap.sub", { n: cfg.mbp_perf?.min_jobs ?? 10 })}>
          <DataTable rows={cap} pageSize={25} filename="pba_mbp_capability_profile.csv" initialSort={{ key: "jobs", dir: -1 }} keyFn={(r) => r.mbp_id}
            selectedKey={camp} onSelect={(r) => setFocus({ ...focus, mbp: camp === r.mbp_id ? null : r.mbp_id })} maxH={520} columns={[
              { key: "mbp_id", label: "col.basecamp", render: (r) => <b className="text-navy">{nm(r.mbp_id)}</b>, csv: (r) => r.mbp_id },
              { key: "jobs", label: "hist.col.jobs", num: true }, { key: "sites", label: "hist.col.sites", num: true },
              { key: "ontime_rate", label: "hist.col.ontime", num: true, sortVal: (r) => r.ontime_rate ?? -1, render: (r) => (r.ontime_rate == null ? <span className="text-mut">{t("hist.few", { n: fInt(r.judged) })}</span> : `${pc(r.ontime_rate)} · n ${fInt(r.judged)}`), csv: (r) => (r.ontime_rate == null ? "" : (100 * r.ontime_rate).toFixed(1)) },
              { key: "power_on_rate", label: "hist.col.pon", num: true, sortVal: (r) => r.power_on_rate ?? -1, render: (r) => (r.power_on_rate == null ? <span className="text-mut">{t("hist.few", { n: fInt(r.outcome_known) })}</span> : `${pc(r.power_on_rate)} · n ${fInt(r.outcome_known)}`), csv: (r) => (r.power_on_rate == null ? "" : (100 * r.power_on_rate).toFixed(1)) },
              { key: "no_checkin", label: "hist.col.nock", num: true },
              { key: "rc_P", label: "hist.col.cats", plain: true, render: (r) => <span className="tabular text-[11.5px]">{CATEGORIES.map((c) => `${t(`hist.cat_s.${c}`)} ${fInt(r[`rc_${c}`] || 0)}`).join(" · ")}</span>, csv: (r) => CATEGORIES.map((c) => `${c}:${r[`rc_${c}`] || 0}`).join(" ") },
              { key: "arr_median", label: "hist.col.arr", num: true, render: (r) => fMin(r.arr_median), csv: (r) => (isNum(r.arr_median) ? Math.round(r.arr_median) : "") },
              { key: "rh_median", label: "hist.col.rh", num: true, render: (r) => <span>{isNum(r.rh_median) ? `${r.rh_median.toLocaleString(locale(), { maximumFractionDigits: 2 })} ${t("unit.h")}` : "—"}{r.rh_heap >= 0.25 && <span className="ml-1 text-[#8a5a00]" title={t("hist.rh_heap", { p: fPct(100 * r.rh_heap, 0) })}>⚠</span>}</span>, csv: (r) => (isNum(r.rh_median) ? r.rh_median.toFixed(2) : "") },
            ]} extraCsv={[{ key: "pln_back", label: "PLN back before connect" }, { key: "other_action", label: "Other resolution" }, { key: "connected_no_rh", label: "Connected, no running hours" }, { key: "rh_total", label: "Running hours total" }, { key: "rh_heap", label: "Share of running-hour entries 3.9-4.1 h", csv: (r) => (r.rh_heap == null ? "" : (100 * r.rh_heap).toFixed(0)) }]} />
          <div className="text-[11px] text-mut mt-1">{t("hist.cap.note")}</div>
        </Card>
      </>)}
      {view === "cog" && <CogView ctx={ctx} />}
    </div>
  );
}

/** demand centre vs recommended location — feasibility explicit; baseline comparison per base camp */
function CogView({ ctx }) {
  const { scope, cfg, mbpsScope, nop, names, setPick, focus, setFocus, active } = ctx;
  const RT = cfg.mbp.response_target_min ?? 30;
  const G = cfg.gravity || {};
  const nm = (id) => (names ? id : campCode(id));
  const base = useMemo(() => active.filter((s) => nop === "All NOPs" || s.nop === nop), [active, nop]);
  const rows = useMemo(() => (nop === "All NOPs" ? [] : basecampGravity(base, mbpsScope, cfg, { deadline: RT })), [base, mbpsScope, cfg, RT, nop]);
  const byId = useMemo(() => new Map(base.map((s) => [s.site_id, s])), [base]);
  const R = useMemo(() => rows.map((r) => { const a = byId.get(r.rec_site);
    const checks = { real: !!a && a.site_active === 1, access: a ? a.access_class : null, prec: a?.coord_decimals ?? null, city: !r.city_change };
    return { ...r, _a: a, checks, feasible: r.verdict === "stay" ? null : checks.real && checks.access !== "island" && (checks.prec ?? 0) >= 4 && checks.city && checks.access !== "riverine" }; }), [rows, byId]);
  const ex = useMemo(() => ({ island: base.filter((s) => s.access_class === "island").length, riverine: base.filter((s) => s.access_class === "riverine").length,
    noloc: base.filter((s) => !isNum(s.lat)).length, unassigned: base.filter((s) => isNum(s.lat) && s.access_class !== "island" && !s.mbp_assigned).length,
    campsNoloc: mbpsScope.filter((m) => !isNum(m.lat)).length, campsNoSites: mbpsScope.filter((m) => isNum(m.lat) && !rows.some((r) => r.mbp_id === m.mbp_id)).length,
    bbtUnknown: base.filter((s) => !isNum(s.bbt_effective_min) || s.bbt_status === "Unknown").length }), [base, mbpsScope, rows]);
  const sel = focus.mbp ? R.find((r) => r.mbp_id === focus.mbp) : null;
  const extra = useMemo(() => R.filter((r) => r.verdict !== "stay").map((r) => ({ mbp_id: `★ ${r.rec_kecamatan} (${nm(r.mbp_id)})`, lat: r.rec_lat, lon: r.rec_lon, nop, is_new: true, new_label: t("cog.rec") })), [R, nop]); // eslint-disable-line
  const cogSites = useMemo(() => base.filter((s) => isNum(s.lat)), [base]);
  if (nop === "All NOPs") return <Card title={t("cog.title")}><div className="text-mut text-[13px]">{t("cog.pick_nop")}</div></Card>;
  const moves = R.filter((r) => r.verdict !== "stay");
  return (
    <div className="space-y-3">
      <Card title={t("cog.title")} sub={t("cog.sub", { m: RT })}>
        <div className="grid md:grid-cols-2 gap-3 text-[12.5px]">
          <div><div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1">{t("cog.weights")}</div>
            <div className="text-slate">{t("cog.weights_body", { a: G.w_pln ?? 0.35, b: G.w_bbt ?? 0.25, c: G.w_class ?? 0.15, d: G.w_repeat ?? 0.25 })}</div>
            <div className="text-[11px] text-mut mt-1">{t("cog.weights_cfg")}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1">{t("cog.excl")}</div>
            <ul className="text-slate grid grid-cols-2 gap-x-3">{Object.entries(ex).map(([k, v]) => <li key={k}><b className="tabular text-ink">{fInt(v)}</b> {t(`cog.ex.${k}`)}</li>)}</ul></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {[[t("cog.k.camps"), fInt(R.length)], [t("cog.k.moves"), `${fInt(moves.length)} · ${fInt(moves.filter((r) => r.feasible).length)} ${t("cog.k.feasible")}`],
            [t("cog.k.reach", { m: RT }), `${fInt(R.reduce((a, r) => a + r.reach_now, 0))} → ${fInt(R.reduce((a, r) => a + (r.verdict === "stay" ? r.reach_now : r.reach_rec), 0))}`],
            [t("cog.k.eta"), moves.length ? fMin(moves.reduce((a, r) => a + r.eta_w_now, 0) / moves.length) + " → " + fMin(moves.reduce((a, r) => a + r.eta_w_rec, 0) / moves.length) : "—"]].map(([l, v]) =>
            <div key={l} className="border border-line rounded-md px-3 py-2"><div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate">{l}</div><div className="text-[17px] font-bold tabular text-ink">{v}</div></div>)}
        </div>
      </Card>
      <Card title={t("cog.map.title")} sub={t("cog.map.sub")}>
        <MapView sites={cogSites} mbps={mbpsScope} extraMbps={extra} cfg={cfg} fitKey={"cog" + nop} height={460} onPickSite={setPick}
          colorOverride={() => "#B8C0CC"} keyOverride={() => "site"} hollowOverride={() => false} legendOverride={[{ k: "site", c: "#B8C0CC", label: t("cog.map.site") }]} ttOverride={(s) => `${s.site_class} · ${s.kecamatan || ""}`}
          selectedMbpId={focus.mbp} onSelectMbp={(m) => setFocus({ ...focus, mbp: m && !m.is_new ? m.mbp_id : null })} mbpLabel={(m) => nm(m.mbp_id)} />
        {sel && <div className="mt-2 text-[12.5px] border border-line rounded-md px-3 py-2 bg-surface">
          <b>{nm(sel.mbp_id)}</b> · {t("cog.sel", { k: sel.cog_km.toFixed(1), rk: sel.rec_kecamatan, rc: sel.rec_city || "—", s: fKm(sel.shift_km), a: fInt(sel.reach_now), b: fInt(sel.reach_rec), n: fInt(sel.sites), m: RT })}</div>}
        <div className="text-[11px] text-mut mt-1">{t("cog.map.note")}</div>
      </Card>
      <Card title={t("cog.table.title", { n: fInt(R.length) })} sub={t("cog.table.sub")}>
        <DataTable rows={R} pageSize={25} filename={`pba_demand_centre_${String(nop).replace(/\s+/g, "_")}.csv`} initialSort={{ key: "gain", dir: -1 }} keyFn={(r) => r.mbp_id}
          selectedKey={focus.mbp} onSelect={(r) => setFocus({ ...focus, mbp: focus.mbp === r.mbp_id ? null : r.mbp_id })} maxH={520} columns={[
            { key: "mbp_id", label: "col.basecamp", render: (r) => <b className="text-navy">{nm(r.mbp_id)}</b>, csv: (r) => r.mbp_id },
            { key: "sites", label: "col.sites_assigned", num: true },
            { key: "cog_km", label: "cog.col.cog", num: true, render: (r) => fKm(r.cog_km), csv: (r) => r.cog_km.toFixed(1) },
            { key: "verdict", label: "col.verdict", render: (r) => t(`place.cog.v.${r.verdict}`), csv: (r) => r.verdict },
            { key: "rec_kecamatan", label: "cog.col.rec", render: (r) => (r.verdict === "stay" ? "—" : <span>★ {r.rec_kecamatan} <span className="text-mut">· {r.rec_city || ""} · {r.rec_site}</span></span>), csv: (r) => (r.verdict === "stay" ? "" : `${r.rec_kecamatan} ${r.rec_site}`) },
            { key: "feasible", label: "cog.col.feas", sortVal: (r) => (r.feasible == null ? 2 : r.feasible ? 1 : 0), render: (r) => (r.verdict === "stay" ? <span className="text-mut">—</span> :
              <span className="inline-flex flex-wrap gap-1">{r.feasible ? <Tag tone="good">{t("cog.feas.ok")}</Tag> : <Tag tone="warn">{t("cog.feas.check")}</Tag>}
                {r.checks.access === "riverine" && <Tag tone="warn">{t("cog.feas.river")}</Tag>}{(r.checks.prec ?? 0) < 4 && <Tag tone="warn">{t("cog.feas.prec", { d: r.checks.prec ?? "?" })}</Tag>}
                {!r.checks.city && <Tag tone="warn">{t("cog.feas.city")}</Tag>}</span>), csv: (r) => (r.verdict === "stay" ? "" : r.feasible ? "feasible" : `check:${[r.checks.access === "riverine" && "riverine", (r.checks.prec ?? 0) < 4 && "coord_precision", !r.checks.city && "city_change"].filter(Boolean).join("+")}`) },
            { key: "gain", label: "cog.col.reach", num: true, sortVal: (r) => (r.verdict === "stay" ? -999 : r.reach_rec - r.reach_now), render: (r) => (r.verdict === "stay" ? `${fInt(r.reach_now)}` : <span>{fInt(r.reach_now)} → {fInt(r.reach_rec)} <b className={r.reach_rec > r.reach_now ? "text-good" : r.reach_rec < r.reach_now ? "text-crit" : ""}>({r.reach_rec - r.reach_now >= 0 ? "+" : ""}{fInt(r.reach_rec - r.reach_now)})</b></span>), csv: (r) => (r.verdict === "stay" ? 0 : r.reach_rec - r.reach_now) },
            { key: "eta_w_now", label: "cog.col.eta", num: true, render: (r) => (r.verdict === "stay" ? fMin(r.eta_w_now) : `${fMin(r.eta_w_now)} → ${fMin(r.eta_w_rec)}`), csv: (r) => `${Math.round(r.eta_w_now)}->${Math.round(r.eta_w_rec)}` },
          ]} />
        <div className="text-[11px] text-mut mt-1 inline-flex items-center gap-1">{t("cog.table.note")} <EvTag v="ESTIMATED" /></div>
      </Card>
    </div>
  );
}
