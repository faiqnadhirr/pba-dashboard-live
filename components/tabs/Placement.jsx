"use client";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Card, Kpi, Note, Method, DataTable, Select, Slider, EvTag, fInt, fH, fPct, fPP, fNum, fCoord } from "@/components/ui";
import { placementPlan, sizingStop, bbtUnknown, isNum } from "@/lib/logic";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const fRp = (v) => (v >= 1e6 ? `Rp ${fNum(v / 1e6, 1)} jt` : `Rp ${fInt(v)}`);
function Seg({ label, value, onChange, options }) {
  return (
    <div><div className="text-[11.5px] text-slate mb-1">{label}</div>
      <div className="flex rounded-md overflow-hidden border border-line" role="group" aria-label={label}>
        {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}
          className={`px-2.5 py-1.5 text-[12.5px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${value === v ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{l}</button>)}
      </div></div>
  );
}

// vNext — additional-unit sizing for the planning NOP (baseline strip): baseline → target → next unit → marginal benefit → stop condition.
export default function Placement({ model, data, cfg, nop, setNop, setPick, setRadius, full, allNops, K, openInSandbox, navigate: ctxNav }) {
  const nops = allNops;
  const [target, setTarget] = useState(Math.round((cfg.placement?.target_share ?? 0.9) * 100));
  // v3.6 — response target: "bbt" (arrive before battery runs out) or minutes (ops standard, ETA incl. mobilisation); scope P1/P2 or all active
  const RT = cfg.mbp.response_target_min ?? 30;
  // v4.0 — default = before the battery runs out (BBT): a fixed 30-min target needs > 60 extra units in many NOPs and is not realistic
  const [resp, setResp] = useState("bbt"), [scopeMode, setScopeMode] = useState("p12");
  const deadline = resp === "bbt" ? null : resp;
  const maxCap = deadline == null ? 30 : 100;
  // separate "max additional" per mode: before-BBT keeps the Config default, minute targets start at 60 (30-min reach needs many more spots)
  const [maxB, setMaxB] = useState(cfg.placement?.max_new ?? 15), [maxD, setMaxD] = useState(cfg.placement?.max_new_deadline ?? 60);
  const maxNew = Math.min(deadline == null ? maxB : maxD, maxCap), setMaxNew = deadline == null ? setMaxB : setMaxD;
  const opt = useMemo(() => ({ target: target / 100, maxNew, deadline, scopeMode }), [target, maxNew, deadline, scopeMode]);
  // v4.2 (FIX-06) — busy at peak from the ONE KPI layer (distinct own base camps on a job at the same time, ≤ units)
  const conc = useMemo(() => new Map((K?.nops || []).filter((r) => r.conc_p95 != null).map((r) => [r.nop, { p95: r.conc_p95, max: r.conc_max }])), [K]);
  const inNop = useMemo(() => model.filter((s) => s.nop === nop), [model, nop]);
  const plan = useMemo(() => placementPlan(inNop, data.mbps, cfg, opt), [inNop, data.mbps, cfg, opt]);
  const all = useMemo(() => nops.map((n) => { const p = placementPlan(model.filter((s) => s.nop === n), data.mbps, cfg, opt), c = conc.get(n);
    const p95 = c ? Math.ceil(c.p95) : null, reach = p.needed == null ? null : p.current + p.needed;
    return { nop: n, knee: p.knee, knee_cost: p.steps[p.knee]?.cost_per_dark_h ?? null, targets: p.targets, current: p.current, now: p.targets ? p.reachedNow / p.targets : null, needed: p.needed, max: p.reachable_max, island: p.island, battery: p.battery, relocation: p.relocation.length,
      conc_p95: p95, conc_max: c?.max ?? null, ideal: reach == null ? null : Math.max(reach, p95 || 0), ideal_driver: reach == null ? null : (p95 || 0) > reach ? "concurrency" : "reach" }; }),
  [nops, model, data.mbps, cfg, opt, conc]);
  const C = conc.get(nop), idealNop = plan.needed == null ? null : Math.max(plan.current + plan.needed, C ? Math.ceil(C.p95) : 0);
  const tgtLabel = deadline == null ? t("place.resp.bbt_short") : t("place.resp.min_short", { m: deadline });
  const extra = plan.added.map((a) => ({ mbp_id: `NEW-${a.n} @ ${a.anchor_site}`, lat: a.lat, lon: a.lon, nop, is_new: true }));
  const T = plan.targets || 1;
  const steps = plan.steps.map((s) => ({ ...s, pct: 100 * s.share, label: s.k === 0 ? t("place.now") : `+${s.k}` }));
  const lim = cfg.placement?.relocation_max_loss_pp ?? 0.5, maxR = cfg.placement?.relocation_max_candidates ?? 3;
  // stop condition of the greedy sizing (placementPlan): target met · simulation limit reached · no candidate adds reach
  const stop = sizingStop(plan, maxNew);

  // Bucket 3 — the units question: two inputs (target share, max additional), one sentence, the curve with the knee marked,
  // exclusions next to the result, "Open in sandbox" (the proposed units handed to the shared sandbox). Everything else → Detail & assumptions.
  // presentation only: how many of the "battery shorter than mobilisation" exclusions have an UNKNOWN BBT (placementPlan treats the
  // effective BBT as given; an unknown BBT is not a measured short battery). Same filter as placementPlan › battery.
  const batUnk = inNop.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected && (scopeMode === "all" || s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2")
    && s.access_class !== "island" && isNum(s.lat) && (deadline == null ? s.bbt_effective_min : deadline) <= cfg.travel.mobilization_minutes && bbtUnknown(s)).length;
  const nSand = plan.needed == null ? plan.added.length : plan.needed;
  const toSandbox = () => openInSandbox?.({ kind: "add", nop, adds: plan.added.slice(0, nSand).map((a) => ({ lat: a.lat, lon: a.lon, label: a.kecamatan || a.anchor_site })) });
  const sentence = plan.needed == null ? t("place.one.not_met", { p: fPct(target, 0), x: tgtLabel, m: fInt(maxNew), r: fPct(100 * (plan.reachable_max || 0), 0), nop })
    : plan.needed === 0 ? t("place.one.met_now", { p: fPct(target, 0), x: tgtLabel, now: fPct((100 * plan.reachedNow) / T, 0), r: fInt(plan.reachedNow), n: fInt(plan.targets), nop })
    : t("place.one.need", { n: fInt(plan.needed), p: fPct(target, 0), x: tgtLabel, u: fInt(plan.current), f: fInt(plan.current + plan.needed), now: fPct((100 * plan.reachedNow) / T, 0), r: fInt(plan.reachedNow), t: fInt(plan.targets), nop });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-60"><Slider label={t("place.target2", { x: tgtLabel })} value={target} onChange={setTarget} min={50} max={100} step={5} fmt={(v) => fPct(v, 0)} /></div>
        <div className="w-52"><Slider label={t("place.max_new")} value={maxNew} onChange={setMaxNew} min={1} max={maxCap} /></div>
        <details className="text-[12px]"><summary className="cursor-pointer text-slate font-semibold">{t("place.advanced", { x: tgtLabel, s: t(`place.scope.${scopeMode}`) })}</summary>
          <div className="flex flex-wrap items-end gap-4 mt-2">
            <Seg label={t("place.resp.label")} value={resp} onChange={setResp} options={[["bbt", t("place.resp.bbt")], [30, t("place.resp.min", { m: 30 })], [60, t("place.resp.min", { m: 60 })], [120, t("place.resp.min", { m: 120 })]]} />
            <Seg label={t("place.scope.label")} value={scopeMode} onChange={setScopeMode} options={[["p12", t("place.scope.p12")], ["all", t("place.scope.all")]]} />
          </div></details>
      </div>
      <div className={`bg-white border rounded-lg px-4 py-3 ${plan.needed == null ? "border-warn" : "border-line"}`} role="status">
        <div className="flex flex-wrap items-start gap-3">
          <div className="text-[19px] font-bold text-ink tabular leading-tight">{plan.needed == null ? `> +${fInt(maxNew)}` : plan.needed === 0 ? "+0" : `+${fInt(plan.needed)}`}</div>
          <div className="flex-1 min-w-[240px] text-[13px] text-ink">{sentence}
            {plan.knee > 0 && <span className="text-slate"> {t("place.one.knee", { k: fInt(plan.knee), s: fPct(100 * plan.knee_share, 0) })}</span>}</div>
          {openInSandbox && plan.added.length > 0 && <button onClick={toSandbox} className="px-3 py-1.5 rounded bg-s7 text-white text-[12.5px] whitespace-nowrap" title={t("place.to_sandbox_tip")}>{t("place.to_sandbox", { n: fInt(nSand) })}</button>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate" aria-label={t("place.excl")}>
          <span className="font-semibold">{t("place.excl")}:</span>
          <span><b className="tabular text-ink">{fInt(plan.island)}</b> {t("place.excl.island")}</span>
          <span><b className="tabular text-ink">{fInt(plan.battery)}</b> {t("place.excl.battery", { mob: cfg.travel.mobilization_minutes })}{batUnk > 0 && <span className="text-[#8a5a00]" title={t("place.excl.battery_unk_tip")}> {t("place.excl.battery_unk", { n: fInt(batUnk) })}</span>}</span>
          <span className="text-mut">{t("place.excl.why")}</span>
        </div>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card title={t("place.map.title")} sub={t("place.map.sub")}>
          <MapView sites={inNop.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected && (scopeMode === "all" || s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2"))}
            mbps={data.mbps.filter((m) => m.nop === nop)} extraMbps={extra} cfg={cfg} onRadius={setRadius} onPickSite={setPick} fitKey={nop} defaultMode="survival" height={420} />
        </Card>
        <Card title={t("place.gain.title")} sub={t("place.gain.sub2", { x: tgtLabel })}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={steps} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#55627A" }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => fPct(v, 0)} tick={{ fontSize: 11, fill: "#6B7588" }} width={40} />
              <Tooltip formatter={(v) => fPct(Number(v), 0)} />
              <ReferenceLine y={target} stroke="#d03b3b" strokeDasharray="4 3" label={{ value: t("place.target_line", { p: fPct(target, 0) }), fontSize: 10, position: "insideBottomRight" }} />
              {plan.knee > 0 && <ReferenceLine x={`+${plan.knee}`} stroke="#0ca30c" strokeDasharray="3 3" label={{ value: t("place.knee_mark", { k: plan.knee }), fontSize: 10, position: "insideTopLeft", fill: "#0a7a0a" }} />}
              <Line dataKey="pct" name={t("place.reached")} stroke="#2b2370" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <table className="w-full text-[12px] tabular mt-2">
            <thead><tr className="text-slate text-left">{["added", "share", "mdark", "cost"].map((h) => <th key={h} className="py-1 border-b border-line">{t(`place.gain.${h}`)}</th>)}</tr></thead>
            <tbody>{steps.map((r) => <tr key={r.k} onClick={() => { const a = plan.added[r.k - 1]; if (a) setPick(model.find((s) => s.site_id === a.anchor_site)); }} title={r.k ? t("place.gain.row_tip") : undefined} className={`border-b border-line/60 ${r.k ? "cursor-pointer hover:bg-s1/5" : ""} ${plan.knee === r.k && r.k ? "bg-good/10 font-semibold" : r.k > plan.knee ? "text-mut" : ""}`}><td className="py-1">{r.label}{plan.knee === r.k && r.k ? " ◀" : ""}</td><td>{fPct(r.pct, 0)}</td><td>{r.k ? fH(r.marginal_dark_h) : "—"}</td><td>{r.cost_per_dark_h ? fRp(r.cost_per_dark_h) : "—"}</td></tr>)}</tbody>
          </table>
          <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("place.all_estimated")} <EvTag v="ESTIMATED" /></div>
          <div className="text-[11px] text-mut">{t("place.cost_note", { c: fRp(plan.unit_cost || 0) })}</div>
        </Card>
      </div>
      <Card title={t("place.new.title")} sub={t("place.new.sub")}>
        <DataTable rows={plan.added} pageSize={20} filename={`pba_placement_${nop}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => setPick(model.find((s) => s.site_id === r.anchor_site))} columns={[
          { key: "n", label: "#", num: true }, { key: "kecamatan", label: "col.kecamatan", render: (r) => r.kecamatan || "—" }, { key: "city", label: "col.city", render: (r) => r.city || "—" },
          { key: "anchor_site", label: "col.anchor_site" }, { key: "anchor_name", label: "col.name" }, { key: "cluster", label: "col.cluster" },
          { key: "lat", label: "col.latlon", render: (r) => `${fCoord(r.lat, r.decimals)}, ${fCoord(r.lon, r.decimals)}`, csv: (r) => `${fCoord(r.lat, r.decimals)} ${fCoord(r.lon, r.decimals)}` },
          { key: "new_sites_reached", label: "col.new_reached", num: true }, { key: "dark_h_avoided", label: "col.dark_avoided", num: true, render: (r) => fH(r.dark_h_avoided), csv: (r) => r.dark_h_avoided.toFixed(1) },
        ]} />
      </Card>
      <details className="bg-white border border-line rounded-lg px-4 py-2">
        <summary className="cursor-pointer text-[13px] font-semibold text-navy">{t("place.detail")}</summary>
        <div className="space-y-4 mt-3">
      <Method tone="warn" title={t("place.note.title")}>{t("place.note.body", { r: cfg.mbp.max_radius_km, rf: fNum(cfg.travel.road_factor, 2), mob: cfg.travel.mobilization_minutes })} {t("place.note.v36", { mob: cfg.travel.mobilization_minutes })}</Method>
      {/* vNext — the sizing as a sequence: baseline → target → result → why it stopped */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
        {[
          [t("place.seq.base"), plan.targets ? `${fPct((100 * plan.reachedNow) / T, 0)}` : "—", t("place.seq.base_sub", { r: fInt(plan.reachedNow), n: fInt(plan.targets), u: fInt(plan.current), i: fInt(plan.island), b: fInt(plan.battery) })],
          [t("place.seq.target"), fPct(target, 0), t("place.seq.target_sub", { x: tgtLabel, n: fInt(Math.ceil((target / 100) * plan.targets)) })],
          [t("place.seq.result"), plan.needed == null ? t("place.seq.not_met") : plan.needed === 0 ? t("place.seq.met_now") : `+${fInt(plan.needed)}`,
            plan.needed == null ? t("place.seq.result_nm", { m: fInt(maxNew), p: fPct(100 * (plan.reachable_max || 0), 0) }) : t("place.seq.result_sub", { f: fInt(plan.current + plan.needed), u: fInt(plan.current) })],
          [t("place.seq.stop"), t(`place.stop.${stop}`), t(`place.stop.${stop}_sub`, { m: fInt(maxNew), k: fInt(plan.steps.length - 1) })],
        ].map(([l, v, sub], i) => <div key={l} className={`border rounded-md px-3 py-2 bg-white ${i === 2 && plan.needed == null ? "border-warn" : "border-line"}`}>
          <div className="text-[10.5px] uppercase tracking-wide font-semibold text-slate"><span className="text-white bg-slate rounded px-1 mr-1">{i + 1}</span>{l}</div>
          <div className="text-[19px] font-bold text-ink tabular leading-tight">{v}</div><div className="text-[11.5px] text-slate leading-snug">{sub}</div></div>)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={t("place.kpi.knee")} value={`+${fInt(plan.knee)}`} sub={t("place.kpi.knee_sub", { s: Math.round(100 * plan.knee_share), c: plan.knee && plan.steps[plan.knee]?.cost_per_dark_h ? fRp(plan.steps[plan.knee].cost_per_dark_h) : "—" })} tone="good" help={t("place.kpi.knee_help")} />
        <Kpi label={t("place.kpi.ideal")} value={idealNop == null ? `> ${fInt(Math.max(plan.current + maxNew, C ? Math.ceil(C.p95) : 0))}` : fInt(idealNop)} help={t("place.kpi.ideal_help")}
          sub={C ? t("place.kpi.ideal_sub", { p: fInt(Math.ceil(C.p95)), m: fInt(C.max) }) : t("place.kpi.ideal_noconc")} tone={idealNop != null && idealNop > plan.current ? "warn" : "good"} />
        <Kpi label={t("place.kpi.reloc")} value={fInt(plan.relocation.length)} sub={t("place.kpi.reloc_sub", { n: maxR, pp: fNum(lim, 1) })} />
        <Kpi label={t("place.kpi.cost")} value={plan.unit_cost ? fRp(plan.unit_cost) : t("common.na")} sub={t("place.kpi.cost_sub")} tone="slate" help={t("place.cost_note", { c: fRp(plan.unit_cost || 0) })} />
      </div>
      <div className="grid gap-4">
        <Card title={t("place.reloc.title")} sub={t("place.reloc.sub", { n: maxR, pp: fNum(lim, 1) })}>
          <div className="mb-2"><Note tone="crit">{t("place.reloc.warn")}</Note></div>
          {!plan.relocation.length ? <div className="text-mut text-[12.5px]">{t("place.reloc.none", { pp: fNum(lim, 1) })}</div> : (
            <DataTable rows={plan.relocation} pageSize={15} filename={`pba_relocation_${nop}.csv`.replace(/\s+/g, "_")} columns={[
              { key: "order", label: "col.order", num: true }, { key: "mbp_id", label: "col.basecamp" }, { key: "best_for", label: "col.fastest_for", num: true },
              { key: "workload_h1", label: "col.workload", num: true },
              { key: "lost_cumulative", label: "col.lost_cumulative", num: true }, { key: "loss_pp", label: "col.loss_cumulative", num: true, render: (r) => fPP(-r.loss_pp, 1), csv: (r) => r.loss_pp.toFixed(2) },
            ]} />)}
        </Card>
        <Card title={t("place.all.title")} sub={`${t("place.all.sub", { p: fPct(target, 0), n: maxNew })} ${t("place.all.sub2", { x: tgtLabel })}`}>
          <DataTable rows={all} pageSize={20} filename="pba_fleet_size_all_nops.csv" initialSort={{ key: "knee", dir: -1 }} columns={[
            { key: "nop", label: "col.nop" }, { key: "targets", label: "col.p1p2_road", num: true }, { key: "current", label: "col.basecamps", num: true },
            { key: "now", label: "col.reached_now", num: true, render: (r) => (r.now == null ? "—" : fPct(100 * r.now, 0)), csv: (r) => (r.now == null ? "" : (100 * r.now).toFixed(1)) },
            { key: "knee", label: "col.knee", num: true, render: (r) => `+${fInt(r.knee)}${r.knee_cost ? ` · ${fRp(r.knee_cost)}/h` : ""}`, csv: (r) => r.knee },
            { key: "needed", label: "col.additional_needed", num: true, sortVal: (r) => (r.needed == null ? 999 : r.needed), render: (r) => (r.needed == null ? `> ${maxNew}` : fInt(r.needed)), csv: (r) => (r.needed == null ? `>${maxNew}` : r.needed) },
            { key: "max", label: "col.max_reachable", num: true, render: (r) => fPct(100 * (r.max || 0), 0), csv: (r) => (100 * (r.max || 0)).toFixed(1) },
            { key: "conc_p95", label: "col.conc_p95", num: true, render: (r) => (r.conc_p95 == null ? "—" : t("place.conc_cell", { p: fInt(r.conc_p95), m: fInt(r.conc_max) })), csv: (r) => r.conc_p95 ?? "" },
            { key: "ideal", label: "col.ideal_fleet", num: true, sortVal: (r) => r.ideal ?? 999, render: (r) => (r.ideal == null ? `> ${r.current + maxNew}` : <span title={t(`place.driver.${r.ideal_driver}`)}>{fInt(r.ideal)}{r.ideal_driver === "concurrency" ? " ⧗" : ""}</span>), csv: (r) => r.ideal ?? `>${r.current + maxNew}` },
            { key: "ideal_driver", label: "col.ideal_driver", render: (r) => (r.ideal_driver ? t(`place.driver.${r.ideal_driver}`) : "—"), csv: (r) => r.ideal_driver || "" },
            { key: "island", label: "col.island_sea", num: true }, { key: "battery", label: "col.battery_lt_mob", num: true }, { key: "relocation", label: "col.reloc_candidates", num: true },
          ]} />
        </Card>
      </div>
        </div>
      </details>
    </div>
  );
}
