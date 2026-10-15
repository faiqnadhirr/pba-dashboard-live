"use client";
// v4.0 — interactive MBP simulation: drag a base camp on the map, add a unit (click the map) or remove one, and see the effect at once.
// Two numbers move, both shown against the baseline:
//  · REACH (capability, ESTIMATED): active sites whose fastest base camp arrives before the battery runs out (calibrated ETA ≤ BBT);
//  · H1 JOBS ON TIME (anchored on ACTUAL): the NOP's real MBP jobs replayed — untouched jobs keep their real arrival, only jobs of a moved /
//    removed / added camp change (lib/mbpperf.js › replayDelta). With no change it equals the actual, so the Δ is the effect of the change.
// When the model cannot reproduce the actual on-time of that NOP within ±5 pp (calibration), the screen says so and gives no relocation advice.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, Method, DataTable, Tag, fInt, fPct, fKm, fMin, isNum, SCN } from "@/components/ui";
import { reachOf, replayDelta, campCode } from "@/lib/mbpperf";
import { haversineKm, bbtUnknown, REACH_EVIDENCE } from "@/lib/logic";
import NopPicker from "@/components/NopPicker";
import { Tile } from "@/components/Scorecards";
import { emptySandbox, applyProposal } from "@/lib/sandbox";
import { ModeBadge } from "@/components/kit";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// vNext — scenario palette (separate from the status palettes): green = better than baseline, red = worse, purple = new unit,
// grey = unchanged (two greys, always with the text label) or cannot be evaluated (hollow)
const COL = { gain: SCN.gain, ok: SCN.same_ok, lost: SCN.lost, no: SCN.same_no, unk: SCN.unk };
const pp = (a, b) => (isNum(a) && isNum(b) ? 100 * (a - b) : null);
const sign = (v, d = 0, u = "") => (!isNum(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}${u}`);

export { emptySandbox };

export default function SimMap({ data, cfg, model, active, nop, setNop, allNops, perf, K, tickets, setPick, openMbp, names, focus, setFocus, pending, clearPending, sandbox }) {
  const sitesN = useMemo(() => active.filter((s) => s.nop === nop), [active, nop]);
  const mbpsN = useMemo(() => data.mbps.filter((m) => m.nop === nop && isNum(m.lat)), [data.mbps, nop]);
  const allN = useMemo(() => model.filter((s) => s.nop === nop), [model, nop]);
  const byId = useMemo(() => new Map(allN.map((s) => [s.site_id, s])), [allN]);
  const ticketsN = useMemo(() => tickets.filter((k) => byId.has(k.site)), [tickets, byId]);
  // 2026-10-15 — the scenario lives in PlanTab, one per NOP (sandbox.get / sandbox.patch): switching to another planning question or
  // another NOP and back keeps the user's changes. Only "Reset" (or the user's choice on a hand-over) clears them.
  const SB = sandbox.get(nop), { moves, added, removed, fromModel } = SB;
  const upd = (k) => (v) => sandbox.patch(nop, (o) => ({ ...o, [k]: typeof v === "function" ? v(o[k]) : v }));
  const setMoves = upd("moves"), setAdded = upd("added"), setRemoved = upd("removed");
  const [adding, setAdding] = useState(false), [tab, setTab] = useState("sites"), [ask, setAsk] = useState(null);
  const reset = () => { sandbox.patch(nop, () => emptySandbox()); setAsk(null); };
  // every planning question hands its proposal to THIS sandbox (kind move | remove | add), marked "model proposal" (never executed).
  // Empty sandbox → applied at once; sandbox with the user's own changes → the user chooses: replace, add to it, or cancel.
  const apply = (p, how) => sandbox.patch(nop, (o) => applyProposal(o, p, how, nop));   // lib/sandbox.js
  const valid = (p) => (p.kind === "add" ? !!p.adds?.length : mbpsN.some((m) => m.mbp_id === p.mbp_id));
  React.useEffect(() => {
    if (!pending || pending.nop !== nop) return;
    if (valid(pending)) { if (moves.size + added.length + removed.size > 0) setAsk(pending); else apply(pending, "replace"); }
    clearPending?.();
  }, [nop, pending]); // eslint-disable-line
  const calib = K?.byNop.get(nop)?.calib || null;
  const hasJobs = ticketsN.length > 0;

  const camps = useMemo(() => [...mbpsN.filter((m) => !removed.has(m.mbp_id)).map((m) => (moves.has(m.mbp_id) ? { ...m, ...moves.get(m.mbp_id), moved: true } : m)),
    ...added.map((a) => ({ ...a, is_new: true, new_label: t("sim2.new_unit") }))], [mbpsN, moves, added, removed]);
  // camps of the neighbouring NOPs (same AREA) can reach border sites: they stay in the pool, unchanged, so the baseline equals the KPI layer
  const others = useMemo(() => { const a = mbpsN[0]?.area; return data.mbps.filter((m) => m.nop !== nop && isNum(m.lat) && (!a || m.area === a)); }, [data.mbps, nop, mbpsN]);
  const base = useMemo(() => reachOf(sitesN, [...mbpsN, ...others], cfg), [sitesN, mbpsN, others, cfg]);
  const scen = useMemo(() => reachOf(sitesN, [...camps, ...others], cfg), [sitesN, camps, others, cfg]);
  const [allSites, setAllSites] = useState(false);
  const siteRows = useMemo(() => sitesN.filter((s) => isNum(s.lat)).map((s) => ({ ...s, _k: keyOfS(s), _e0: base.eta.get(s.site_id) ?? null, _e1: scen.eta.get(s.site_id) ?? null }))
    .filter((r) => allSites || r._k === "gain" || r._k === "lost" || (isNum(r._e0) && isNum(r._e1) && Math.abs(r._e1 - r._e0) >= 1)), [sitesN, base, scen, allSites]); // eslint-disable-line
  const rb = useMemo(() => (hasJobs ? replayDelta(byId, mbpsN, ticketsN, cfg) : null), [hasJobs, byId, mbpsN, ticketsN, cfg]);
  const rs = useMemo(() => (hasJobs ? replayDelta(byId, mbpsN, ticketsN, cfg, { moves, added, removed }) : null), [hasJobs, byId, mbpsN, ticketsN, cfg, moves, added, removed]);
  const changed = moves.size + added.length + removed.size;
  const focusSite = focus?.site ? sitesN.find((x) => x.site_id === focus.site) || null : null;   // selection carried over from another page

  function keyOfS(s) { return bbtUnknown(s) || !REACH_EVIDENCE.has(s.battery?.display?.evidence) ? "unk" : scen.ok_ids.has(s.site_id) ? (base.ok_ids.has(s.site_id) ? "ok" : "gain") : base.ok_ids.has(s.site_id) ? "lost" : "no"; }
  const keyOf = keyOfS;
  const colorOf = (s) => COL[keyOf(s)];
  const legend = ["gain", "ok", "lost", "no", "unk"].map((k) => ({ k, c: COL[k], label: t(`sim2.leg.${k}`) }));
  const mbpKeyOf = (m) => (m.is_new ? "none" : perf.get(m.mbp_id)?.key || "none");
  const label = (m) => (names ? m.mbp_id : campCode(m.mbp_id));
  const onDrag = (m, lat, lon) => {
    if (m.is_new) setAdded((A) => A.map((a) => (a.mbp_id === m.mbp_id ? { ...a, lat, lon } : a)));
    else setMoves((M) => new Map(M).set(m.mbp_id, { lat, lon, origin: "user" }));
  };
  const onMapClick = (lat, lon) => { if (!adding) return; setAdded((A) => [...A, { mbp_id: `NEW-${A.length + 1}`, lat, lon, nop }]); setAdding(false); };
  const cardExtra = (m, close) => (
    <div className="mt-2 flex gap-1.5">
      {(m.moved || moves.has(m.mbp_id)) && <button className="flex-1 border border-line rounded py-1 text-[12px]" onClick={() => { setMoves((M) => { const n = new Map(M); n.delete(m.mbp_id); return n; }); close(); }}>{t("sim2.undo_move")}</button>}
      <button className="flex-1 border border-crit/50 text-crit rounded py-1 text-[12px]" onClick={() => { if (m.is_new) setAdded((A) => A.filter((a) => a.mbp_id !== m.mbp_id)); else setRemoved((R) => new Set(R).add(m.mbp_id)); close(); }}>{t("sim2.remove")}</button>
    </div>);

  if (nop === "All NOPs") return <NopPicker K={K} allNops={allNops} setNop={setNop} title={t("sim2.pick")} sub={t("sim2.pick_sub")} />;
  const camRows = [...(rs?.per.values() || [])].filter((r) => moves.has(r.mbp_id) || r.mbp_id.startsWith("NEW-") || (rb?.per.get(r.mbp_id) && Math.abs(r.jobs - rb.per.get(r.mbp_id).jobs) >= 1))
    .map((r) => { const b = rb?.per.get(r.mbp_id); return { id: r.mbp_id, code: names ? r.mbp_id : campCode(r.mbp_id), jobs0: b?.jobs ?? 0, jobs1: r.jobs, busy0: b?.busy ?? 0, busy1: r.busy, ot0: b?.ontime_rate, ot1: r.ontime_rate,
      km: moves.has(r.mbp_id) ? haversineKm(mbpsN.find((m) => m.mbp_id === r.mbp_id).lat, mbpsN.find((m) => m.mbp_id === r.mbp_id).lon, moves.get(r.mbp_id).lat, moves.get(r.mbp_id).lon) : null,
      state: removed.has(r.mbp_id) ? "removed" : r.mbp_id.startsWith("NEW-") ? "added" : moves.has(r.mbp_id) ? "moved" : "absorbs",
      origin: moves.get(r.mbp_id)?.origin === "model" || fromModel.has(r.mbp_id) ? "model" : moves.has(r.mbp_id) || removed.has(r.mbp_id) || r.mbp_id.startsWith("NEW-") ? "user" : "" }; });
  for (const id of removed) if (!camRows.some((r) => r.id === id)) { const b = rb?.per.get(id); camRows.push({ id, code: names ? id : campCode(id), jobs0: b?.jobs ?? 0, jobs1: 0, busy0: b?.busy ?? 0, busy1: 0, ot0: b?.ontime_rate, ot1: null, km: null, state: "removed", origin: fromModel.has(id) ? "model" : "user" }); }
  const T0 = rb?.total, T1 = rs?.total;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="ml-auto" />
        <button onClick={() => setAdding(!adding)} aria-pressed={adding} className={`px-2.5 py-1 rounded-md border ${adding ? "bg-[#4a3aa7] text-white border-[#4a3aa7]" : "bg-white border-line text-ink hover:border-slate"}`}>{adding ? t("sim2.adding") : t("sim2.add")}</button>
        <button onClick={reset} disabled={!changed} className="px-2.5 py-1 rounded-md border border-line bg-white disabled:opacity-40">{t("sim2.reset")}</button>
      </div>
      {ask && <div role="alertdialog" aria-label={t("sb.ask.title")} className="border-2 border-[#4a3aa7]/60 bg-[#4a3aa7]/[0.05] rounded-md px-3 py-2 text-[12.5px]">
        <div className="font-semibold text-ink">{t("sb.ask.title")}</div>
        <div className="text-slate">{t("sb.ask.body", { n: fInt(changed), p: ask.kind === "add" ? t("sb.ask.add", { n: fInt(ask.adds.length) }) : ask.kind === "remove" ? t("sb.ask.remove", { c: label({ mbp_id: ask.mbp_id }) }) : t("sb.ask.move", { c: label({ mbp_id: ask.mbp_id }), k: ask.label || "—" }) })}</div>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <button onClick={() => { apply(ask, "replace"); setAsk(null); }} className="px-2.5 py-1 rounded bg-navy text-white">{t("sb.ask.replace")}</button>
          <button onClick={() => { apply(ask, "merge"); setAsk(null); }} className="px-2.5 py-1 rounded border border-navy text-navy bg-white">{t("sb.ask.merge")}</button>
          <button onClick={() => setAsk(null)} className="px-2.5 py-1 rounded border border-line bg-white text-slate">{t("sb.ask.cancel")}</button></div></div>}
      <Method title={t("sim2.how_title")}>{t("sim2.how")}</Method>
      {changed > 0 && <div role="status" className="text-[12.5px] border-2 border-s7/50 bg-s7/5 rounded-md px-3 py-1.5">{t("sim2.whatif", { m: moves.size, a: added.length, r: removed.size })}
        {" · "}{t("sim2.origin_line", { u: fInt(changed - [...moves.values()].filter((v) => v.origin === "model").length - [...fromModel].filter((id) => removed.has(id) || added.some((a) => a.mbp_id === id)).length), s: fInt([...moves.values()].filter((v) => v.origin === "model").length + [...fromModel].filter((id) => removed.has(id) || added.some((a) => a.mbp_id === id)).length) })}</div>}
      {/* Bucket 3 — two measures only, before → after with numerator / denominator */}
      <div className="grid md:grid-cols-2 gap-3">
        <Tile label={t("sb.m.reach")} tip={t("sim2.kpi.p12_help")} badge={<ModeBadge kind="model" />} tone={scen.p12ok > base.p12ok ? "good" : scen.p12ok < base.p12ok ? "crit" : "ink"}
          value={`${fInt(base.p12ok)}/${fInt(base.p12)} → ${fInt(scen.p12ok)}/${fInt(scen.p12)}`}
          of={t("sb.m.reach_sub", { d: sign(scen.p12ok - base.p12ok), a: fPct(base.p12 ? (100 * base.p12ok) / base.p12 : null, 1), b: fPct(scen.p12 ? (100 * scen.p12ok) / scen.p12 : null, 1) })} />
        <Tile label={t("sb.m.ontime")} tip={t("sim2.kpi.jobs_help")} badge={<ModeBadge kind="replay" />} na={!T1} tone={T1 && T1.ontime > T0.ontime ? "good" : T1 && T1.ontime < T0.ontime ? "crit" : "ink"}
          value={T1 ? `${fInt(T0.ontime)}/${fInt(T0.ontime + T0.late)} → ${fInt(T1.ontime)}/${fInt(T1.ontime + T1.late)}` : null}
          of={T1 ? t("sb.m.ontime_sub", { d: sign(T1.ontime - T0.ontime), p: sign(pp(T1.ontime_rate, T0.ontime_rate), 1, " pp"), a: fPct(100 * T0.ontime_rate, 1), b: fPct(100 * T1.ontime_rate, 1) }) : t("sim2.no_jobs")} />
      </div>
      <div className="text-[12px] text-slate">{t("sb.units_line", { b: fInt(mbpsN.length), a: fInt(camps.length), c: fInt(T1?.changed ?? 0) })}</div>
      {focusSite && <div role="status" className="text-[12.5px] bg-warn/10 border border-warn/40 rounded-md px-3 py-1.5 flex flex-wrap items-center gap-2">
        <b>{focusSite.site_id}</b> {focusSite.site_name} · MBP-{focusSite.mbp_priority_level} · <span>{t(`sim2.leg.${keyOf(focusSite)}`)}</span>
        <span className="text-slate">ETA {fMin(base.eta.get(focusSite.site_id))} → {fMin(scen.eta.get(focusSite.site_id))} · BBT {fMin(focusSite.bbt_effective_min)}</span>
        <button onClick={() => setFocus?.({ ...focus, site: null })} className="ml-auto text-s1 underline">{t("ws.clear_sel")}</button></div>}
      <Card title={t("sim2.map.title")} sub={t("sim2.map.sub")}>
        <div className={adding ? "cursor-crosshair" : ""}>
          <MapView sites={sitesN} mbps={camps} cfg={cfg} onPickSite={setPick} fitKey={"sim2" + nop} fitOnce height={600} colorOverride={colorOf} keyOverride={keyOf} legendOverride={legend}
            hollowOverride={(s) => keyOf(s) === "unk"} ttOverride={(s) => `${t(`sim2.leg.${keyOf(s)}`)} · BBT ${isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown" ? Math.round(s.bbt_effective_min) + " min" : "?"}`}
            draggableMbps onMbpDrag={onDrag} onMapClick={onMapClick} mbpCardExtra={cardExtra} mbpPerf={perf} onOpenMbp={openMbp}
            mbpLabel={(m) => label(m)} selectedSiteId={focus?.site ?? null} onSelectSite={(x) => setFocus?.({ ...focus, site: x ? x.site_id : null })} />
        </div>
      </Card>
      <div className="flex gap-1 border-b border-line" role="tablist" aria-label={t("sb.tabs")}>
        {[["sites", siteRows.length], ["camps", camRows.length]].map(([k, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
          className={`px-3 py-1.5 text-[12.5px] -mb-px border-b-2 ${tab === k ? "border-navy text-navy font-semibold" : "border-transparent text-slate hover:text-navy"}`}>{t(`sb.tab.${k}`)} <span className="tabular">({fInt(n)})</span></button>)}
      </div>
      {tab === "sites" && <>
      <Card title={t("sim2.sites.title", { n: fInt(siteRows.length) })} sub={t("sim2.sites.sub")} right={<label className="inline-flex items-center gap-1 text-[12px] text-slate">
        <input type="checkbox" checked={allSites} onChange={(e) => setAllSites(e.target.checked)} className="accent-navy" />{t("sim2.sites.all")}</label>}>
        {!siteRows.length ? <div className="text-mut text-[12.5px]">{t("sim2.sites.none")}</div> :
          <DataTable rows={siteRows} pageSize={15} filename={`pba_scenario_sites_${nop.replace(/\s+/g, "_").toLowerCase()}.csv`} initialSort={{ key: "_k", dir: 1 }}
            selectedKey={focus?.site ?? null} onSelect={(x) => setFocus?.({ ...focus, site: focus?.site === x.site_id ? null : x.site_id })} maxH={420} columns={[
              { key: "_k", label: "col.change", sortVal: (x) => ["gain", "lost", "no", "ok", "unk"].indexOf(x._k), render: (x) => <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COL[x._k] }} />{t(`sim2.leg.${x._k}`)}</span>, csv: (x) => x._k },
              { key: "site_id", label: "col.site" }, { key: "site_name", label: "col.name", wrap: true }, { key: "site_class", label: "col.class" },
              { key: "mbp_priority_level", label: "col.mbp_priority", render: (x) => `MBP-${x.mbp_priority_level}` },
              { key: "bbt_effective_min", label: "col.bbt", num: true, sortVal: (x) => (bbtUnknown(x) ? null : x.bbt_effective_min), render: (x) => (bbtUnknown(x) ? t("common.na") : fMin(x.bbt_effective_min)), csv: (x) => (bbtUnknown(x) ? "" : Math.round(x.bbt_effective_min)) },
              { key: "_e0", label: "col.eta_before", num: true, render: (x) => fMin(x._e0), csv: (x) => (isNum(x._e0) ? Math.round(x._e0) : "") },
              { key: "_e1", label: "col.eta_after", num: true, render: (x) => fMin(x._e1), csv: (x) => (isNum(x._e1) ? Math.round(x._e1) : "") },
              { key: "_d", label: "col.eta_delta", num: true, sortVal: (x) => (isNum(x._e0) && isNum(x._e1) ? x._e1 - x._e0 : null), render: (x) => (isNum(x._e0) && isNum(x._e1) ? sign(x._e1 - x._e0, 0, " min") : "—"), csv: (x) => (isNum(x._e0) && isNum(x._e1) ? Math.round(x._e1 - x._e0) : "") }]} />}
        <div className="text-[11px] text-mut mt-1">{t("sim2.sites.note", { rf: cfg.travel.road_factor, mob: cfg.travel.mobilization_minutes })}</div>
      </Card>
      </>}
      {tab === "camps" && <>
        <Card title={t("sim2.camps.title")} sub={t("sim2.camps.sub")}>
          {!camRows.length ? <div className="text-mut text-[12.5px]">{t("sim2.camps.none")}</div> :
            <DataTable rows={camRows} pageSize={12} filename={`pba_simulation_${nop.replace(/\s+/g, "_").toLowerCase()}.csv`} columns={[
              { key: "code", label: "col.basecamp" }, { key: "state", label: "col.change", render: (r) => t(`sim2.state.${r.state}`), csv: (r) => r.state },
              { key: "origin", label: "col.scn_origin", render: (r) => (r.origin === "model" ? <Tag tone="warn">{t("sim2.origin.model")}</Tag> : r.origin === "user" ? <Tag>{t("sim2.origin.user")}</Tag> : "—"), csv: (r) => r.origin },
              { key: "km", label: "col.shift_km", num: true, render: (r) => fKm(r.km), csv: (r) => r.km?.toFixed(1) ?? "" },
              { key: "jobs1", label: "col.jobs_h1", num: true, render: (r) => `${fInt(r.jobs0)} → ${fInt(r.jobs1)}`, csv: (r) => r.jobs1 },
              { key: "busy1", label: "col.occupancy", num: true, render: (r) => `${fPct(100 * r.busy0, 1)} → ${fPct(100 * r.busy1, 1)}`, csv: (r) => (100 * r.busy1).toFixed(2) },
              { key: "ot1", label: "col.ontime_actual", num: true, render: (r) => `${r.ot0 == null ? "—" : fPct(100 * r.ot0, 0)} → ${r.ot1 == null ? "—" : fPct(100 * r.ot1, 0)}`, csv: (r) => (r.ot1 == null ? "" : (100 * r.ot1).toFixed(1)) }]} />}
        </Card>
      </>}
    </div>
  );
}

export function CalibBadge({ calib, hasJobs }) {
  if (!hasJobs) return <span className="px-2 py-[2px] rounded-full bg-surface border border-line text-[11.5px] text-mut">{t("calib.na")}</span>;
  if (!calib) return null;
  return <span title={t("calib.tip", { a: fPct(100 * calib.actual, 1), m: fPct(100 * calib.model, 1), n: fInt(calib.n) })}
    className={`px-2 py-[2px] rounded-full text-[11.5px] font-semibold ${calib.ok ? "bg-good/15 text-good" : "bg-crit/10 text-crit"}`}>
    {t(calib.ok ? "calib.ok" : "calib.bad", { d: sign(calib.diff_pp, 1), a: fPct(100 * calib.actual, 0), m: fPct(100 * calib.model, 0) })}</span>;
}
