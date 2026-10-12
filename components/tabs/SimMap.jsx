"use client";
// v4.0 — interactive MBP simulation: drag a base camp on the map, add a unit (click the map) or remove one, and see the effect at once.
// Two numbers move, both shown against the baseline:
//  · REACH (capability, ESTIMATED): active sites whose fastest base camp arrives before the battery runs out (calibrated ETA ≤ BBT);
//  · H1 JOBS ON TIME (anchored on ACTUAL): the NOP's real MBP jobs replayed — untouched jobs keep their real arrival, only jobs of a moved /
//    removed / added camp change (lib/mbpperf.js › replayDelta). With no change it equals the actual, so the Δ is the effect of the change.
// When the model cannot reproduce the actual on-time of that NOP within ±5 pp (calibration), the screen says so and gives no relocation advice.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, fInt, fPct, fKm, isNum } from "@/components/ui";
import { reachOf, replayDelta, backtestMove, campCode } from "@/lib/mbpperf";
import { haversineKm } from "@/lib/logic";
import { perfLegend, PERF_COLOR } from "@/components/perfUi";
import NopPicker from "@/components/NopPicker";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const COL = { gain: "#2a78d6", ok: "#0ca30c", lost: "#eb6834", no: "#d03b3b", unk: "#A3ABB9" };
const pp = (a, b) => (isNum(a) && isNum(b) ? 100 * (a - b) : null);
const sign = (v, d = 0, u = "") => (!isNum(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d)}${u}`);

export default function SimMap({ data, cfg, model, active, nop, setNop, allNops, perf, K, tickets, setPick, openMbp, names }) {
  const sitesN = useMemo(() => active.filter((s) => s.nop === nop), [active, nop]);
  const mbpsN = useMemo(() => data.mbps.filter((m) => m.nop === nop && isNum(m.lat)), [data.mbps, nop]);
  const allN = useMemo(() => model.filter((s) => s.nop === nop), [model, nop]);
  const byId = useMemo(() => new Map(allN.map((s) => [s.site_id, s])), [allN]);
  const ticketsN = useMemo(() => tickets.filter((k) => byId.has(k.site)), [tickets, byId]);
  const [moves, setMoves] = useState(new Map()), [added, setAdded] = useState([]), [removed, setRemoved] = useState(new Set());
  const [adding, setAdding] = useState(false), [sugFor, setSugFor] = useState(null);
  const reset = () => { setMoves(new Map()); setAdded([]); setRemoved(new Set()); setSugFor(null); };
  React.useEffect(reset, [nop]); // eslint-disable-line
  const calib = K?.byNop.get(nop)?.calib || null;
  const hasJobs = ticketsN.length > 0;

  const camps = useMemo(() => [...mbpsN.filter((m) => !removed.has(m.mbp_id)).map((m) => (moves.has(m.mbp_id) ? { ...m, ...moves.get(m.mbp_id), moved: true } : m)),
    ...added.map((a) => ({ ...a, is_new: true, new_label: t("sim2.new_unit") }))], [mbpsN, moves, added, removed]);
  const base = useMemo(() => reachOf(sitesN, mbpsN, cfg), [sitesN, mbpsN, cfg]);
  const scen = useMemo(() => reachOf(sitesN, camps, cfg), [sitesN, camps, cfg]);
  const rb = useMemo(() => (hasJobs ? replayDelta(byId, mbpsN, ticketsN, cfg) : null), [hasJobs, byId, mbpsN, ticketsN, cfg]);
  const rs = useMemo(() => (hasJobs ? replayDelta(byId, mbpsN, ticketsN, cfg, { moves, added, removed }) : null), [hasJobs, byId, mbpsN, ticketsN, cfg, moves, added, removed]);
  const changed = moves.size + added.length + removed.size;

  const keyOf = (s) => (s.bbt_status === "Unknown" ? "unk" : scen.ok_ids.has(s.site_id) ? (base.ok_ids.has(s.site_id) ? "ok" : "gain") : base.ok_ids.has(s.site_id) ? "lost" : "no");
  const colorOf = (s) => COL[keyOf(s)];
  const legend = ["gain", "ok", "lost", "no", "unk"].map((k) => ({ k, c: COL[k], label: t(`sim2.leg.${k}`) }));
  const mbpKeyOf = (m) => (m.is_new ? "none" : perf.get(m.mbp_id)?.key || "none");
  const label = (m) => (names ? m.mbp_id : campCode(m.mbp_id));
  const onDrag = (m, lat, lon) => {
    if (m.is_new) setAdded((A) => A.map((a) => (a.mbp_id === m.mbp_id ? { ...a, lat, lon } : a)));
    else setMoves((M) => new Map(M).set(m.mbp_id, { lat, lon }));
  };
  const onMapClick = (lat, lon) => { if (!adding) return; setAdded((A) => [...A, { mbp_id: `NEW-${A.length + 1}`, lat, lon, nop }]); setAdding(false); };
  const cardExtra = (m, close) => (
    <div className="mt-2 flex gap-1.5">
      {(m.moved || moves.has(m.mbp_id)) && <button className="flex-1 border border-line rounded py-1 text-[12px]" onClick={() => { setMoves((M) => { const n = new Map(M); n.delete(m.mbp_id); return n; }); close(); }}>{t("sim2.undo_move")}</button>}
      <button className="flex-1 border border-crit/50 text-crit rounded py-1 text-[12px]" onClick={() => { if (m.is_new) setAdded((A) => A.filter((a) => a.mbp_id !== m.mbp_id)); else setRemoved((R) => new Set(R).add(m.mbp_id)); close(); }}>{t("sim2.remove")}</button>
    </div>);

  // relocation advice (only when the model reproduces the actual): idle camps first
  const idle = useMemo(() => mbpsN.map((m) => perf.get(m.mbp_id)).filter((p) => p && p.key === "under" && p.selectable).sort((a, b) => a.jobs - b.jobs), [mbpsN, perf]);
  const sug = useMemo(() => {
    if (!sugFor || !calib?.ok) return null;
    const r = backtestMove(sitesN, mbpsN, ticketsN, cfg, sugFor, { candidates: 8 });
    const c = cfg.mbp_perf || {}, minG = c.reloc_min_gain_jobs ?? 10, judged = (rb?.total.ontime || 0) + (rb?.total.late || 0);
    return { ...r, results: r.results.filter((x) => x.ontime_gain >= minG && judged && (100 * x.ontime_gain) / judged >= 1).slice(0, 3) };
  }, [sugFor, calib, sitesN, mbpsN, ticketsN, cfg, rb]);

  if (nop === "All NOPs") return <NopPicker K={K} allNops={allNops} setNop={setNop} title={t("sim2.pick")} sub={t("sim2.pick_sub")} />;
  const camRows = [...(rs?.per.values() || [])].filter((r) => moves.has(r.mbp_id) || r.mbp_id.startsWith("NEW-") || (rb?.per.get(r.mbp_id) && Math.abs(r.jobs - rb.per.get(r.mbp_id).jobs) >= 1))
    .map((r) => { const b = rb?.per.get(r.mbp_id); return { id: r.mbp_id, code: names ? r.mbp_id : campCode(r.mbp_id), jobs0: b?.jobs ?? 0, jobs1: r.jobs, busy0: b?.busy ?? 0, busy1: r.busy, ot0: b?.ontime_rate, ot1: r.ontime_rate,
      km: moves.has(r.mbp_id) ? haversineKm(mbpsN.find((m) => m.mbp_id === r.mbp_id).lat, mbpsN.find((m) => m.mbp_id === r.mbp_id).lon, moves.get(r.mbp_id).lat, moves.get(r.mbp_id).lon) : null,
      state: removed.has(r.mbp_id) ? "removed" : r.mbp_id.startsWith("NEW-") ? "added" : moves.has(r.mbp_id) ? "moved" : "absorbs" }; });
  for (const id of removed) if (!camRows.some((r) => r.id === id)) { const b = rb?.per.get(id); camRows.push({ id, code: names ? id : campCode(id), jobs0: b?.jobs ?? 0, jobs1: 0, busy0: b?.busy ?? 0, busy1: 0, ot0: b?.ontime_rate, ot1: null, km: null, state: "removed" }); }
  const T0 = rb?.total, T1 = rs?.total;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <b className="text-ink text-[14px]">{nop}</b>
        <button onClick={() => setNop("All NOPs")} className="text-s1 underline">{t("sim2.change_nop")}</button>
        <CalibBadge calib={calib} hasJobs={hasJobs} />
        <span className="ml-auto" />
        <button onClick={() => setAdding(!adding)} aria-pressed={adding} className={`px-2.5 py-1 rounded-md border ${adding ? "bg-[#4a3aa7] text-white border-[#4a3aa7]" : "bg-white border-line text-ink hover:border-slate"}`}>{adding ? t("sim2.adding") : t("sim2.add")}</button>
        <button onClick={reset} disabled={!changed} className="px-2.5 py-1 rounded-md border border-line bg-white disabled:opacity-40">{t("sim2.reset")}</button>
      </div>
      <Note>{t("sim2.how")}</Note>
      {changed > 0 && <div role="status" className="text-[12.5px] border-2 border-crit/60 bg-crit/5 rounded-md px-3 py-1.5">{t("sim2.whatif", { m: moves.size, a: added.length, r: removed.size })}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi fixed label={t("sim2.kpi.p12")} value={`${fInt(scen.p12ok)} / ${fInt(scen.p12)}`} sub={t("sim2.kpi.delta", { d: sign(scen.p12ok - base.p12ok), b: fInt(base.p12ok) })} tone={scen.p12ok > base.p12ok ? "good" : scen.p12ok < base.p12ok ? "crit" : "navy"} help={t("sim2.kpi.p12_help")} />
        <Kpi fixed label={t("sim2.kpi.all")} value={fPct(scen.n ? (100 * scen.ok) / scen.n : null, 1)} sub={t("sim2.kpi.delta", { d: sign(scen.ok - base.ok), b: fInt(base.ok) })} tone={scen.ok > base.ok ? "good" : scen.ok < base.ok ? "crit" : "navy"} />
        <Kpi fixed label={t("sim2.kpi.jobs")} value={T1?.ontime_rate == null ? t("common.na") : fPct(100 * T1.ontime_rate, 1)}
          sub={T1 ? t("sim2.kpi.jobs_sub", { d: sign(T1.ontime - T0.ontime), p: sign(pp(T1.ontime_rate, T0.ontime_rate), 1, " pp"), b: fPct(100 * T0.ontime_rate, 1) }) : t("sim2.no_jobs")}
          tone={T1 && T1.ontime > T0.ontime ? "good" : T1 && T1.ontime < T0.ontime ? "crit" : "navy"} help={t("sim2.kpi.jobs_help")} />
        <Kpi fixed label={t("sim2.kpi.units")} value={fInt(camps.length)} sub={t("sim2.kpi.units_sub", { b: fInt(mbpsN.length), c: fInt(T1?.changed ?? 0) })} />
      </div>
      <Card title={t("sim2.map.title")} sub={t("sim2.map.sub")}>
        <div className={adding ? "cursor-crosshair" : ""}>
          <MapView sites={sitesN} mbps={camps} cfg={cfg} onPickSite={setPick} fitKey={"sim2" + nop} fitOnce height={600} colorOverride={colorOf} keyOverride={keyOf} legendOverride={legend}
            hollowOverride={() => false} ttOverride={(s) => `${t(`sim2.leg.${keyOf(s)}`)} · BBT ${isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown" ? Math.round(s.bbt_effective_min) + " min" : "?"}`}
            draggableMbps onMbpDrag={onDrag} onMapClick={onMapClick} mbpCardExtra={cardExtra} mbpKeyOf={mbpKeyOf} mbpLegend={perfLegend()} mbpPerf={perf} onOpenMbp={openMbp}
            mbpLabel={(m) => label(m)} />
        </div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={t("sim2.camps.title")} sub={t("sim2.camps.sub")}>
          {!camRows.length ? <div className="text-mut text-[12.5px]">{t("sim2.camps.none")}</div> :
            <DataTable rows={camRows} pageSize={12} filename={`pba_simulation_${nop.replace(/\s+/g, "_").toLowerCase()}.csv`} columns={[
              { key: "code", label: "col.basecamp" }, { key: "state", label: "col.change", render: (r) => t(`sim2.state.${r.state}`), csv: (r) => r.state },
              { key: "km", label: "col.shift_km", num: true, render: (r) => fKm(r.km), csv: (r) => r.km?.toFixed(1) ?? "" },
              { key: "jobs1", label: "col.jobs_h1", num: true, render: (r) => `${fInt(r.jobs0)} → ${fInt(r.jobs1)}`, csv: (r) => r.jobs1 },
              { key: "busy1", label: "col.occupancy", num: true, render: (r) => `${fPct(100 * r.busy0, 1)} → ${fPct(100 * r.busy1, 1)}`, csv: (r) => (100 * r.busy1).toFixed(2) },
              { key: "ot1", label: "col.ontime_actual", num: true, render: (r) => `${r.ot0 == null ? "—" : fPct(100 * r.ot0, 0)} → ${r.ot1 == null ? "—" : fPct(100 * r.ot1, 0)}`, csv: (r) => (r.ot1 == null ? "" : (100 * r.ot1).toFixed(1)) }]} />}
        </Card>
        <Card title={t("sim2.sug.title")} sub={t("sim2.sug.sub")}>
          {!hasJobs ? <div className="text-mut text-[12.5px]">{t("sim2.no_jobs")}</div> : !calib?.ok ? <Note tone="warn">{t("sim2.sug.gated", { d: calib ? sign(calib.diff_pp, 1) : "—" })}</Note> : <>
            <div className="text-[12px] text-slate mb-1">{t("sim2.sug.idle", { n: idle.length })}</div>
            <div className="flex flex-wrap gap-1.5 mb-2">{idle.slice(0, 10).map((p) => <button key={p.mbp_id} onClick={() => setSugFor(p.mbp_id)} aria-pressed={sugFor === p.mbp_id}
              className={`px-2 py-0.5 rounded-full border text-[12px] ${sugFor === p.mbp_id ? "bg-navy text-white border-navy" : "bg-white border-line"}`}>
              <span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: PERF_COLOR[p.key] }} />{names ? p.mbp_id : p.code} · {fInt(p.jobs)} job</button>)}</div>
            {sugFor && sug && (!sug.results.length ? <div className="text-mut text-[12.5px]">{t("sim2.sug.none")}</div> : <ul className="divide-y divide-line/70 text-[12.5px]">
              {perf.get(sugFor)?.resp != null && perf.get(sugFor).resp < 0.5 && <li className="py-1 text-[#8a5a00]">⚠ {t("sim2.sug.home_warn")}</li>}
              {sug.results.map((x) => <li key={x.site_id} className="py-1.5 flex items-center gap-2">
                <span className="flex-1"><b>{x.kecamatan}</b> · {x.city} <span className="text-mut">({fKm(x.shift_km)})</span><br />
                  <span className="text-good">{t("sim2.sug.gain", { g: fInt(x.ontime_gain), j: fInt(x.me_jobs) })}</span></span>
                <button onClick={() => setMoves((M) => new Map(M).set(sugFor, { lat: x.lat, lon: x.lon }))} className="px-2 py-1 rounded bg-navy text-white text-[12px]">{t("sim2.sug.apply")}</button></li>)}
            </ul>)}
          </>}
        </Card>
      </div>
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
