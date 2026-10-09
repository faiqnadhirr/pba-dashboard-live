"use client";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Card, Kpi, Note, DataTable, Select, Slider, EvTag, fInt, fH, fPct, fPP, fNum, fCoord, precisionNote } from "@/components/ui";
import { placementPlan, basecampGravity } from "@/lib/logic";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

function Seg({ label, value, onChange, options }) {
  return (
    <div><div className="text-[11.5px] text-slate mb-1">{label}</div>
      <div className="flex rounded-md overflow-hidden border border-line" role="group" aria-label={label}>
        {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}
          className={`px-2.5 py-1.5 text-[12.5px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${value === v ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{l}</button>)}
      </div></div>
  );
}

export default function Placement({ model, data, cfg, nop: gNop, setPick, setRadius }) {
  const nops = useMemo(() => [...new Set(model.map((s) => s.nop).filter(Boolean))].sort(), [model]);
  const [nop, setNop] = useState(gNop !== "All NOPs" ? gNop : "NOP PALEMBANG");
  useEffect(() => { if (gNop !== "All NOPs") setNop(gNop); }, [gNop]);
  const [target, setTarget] = useState(Math.round((cfg.placement?.target_share ?? 0.9) * 100));
  // v3.6 — response target: "bbt" (arrive before battery runs out) or minutes (ops standard, ETA incl. mobilisation); scope P1/P2 or all active
  const RT = cfg.mbp.response_target_min ?? 30;
  const [resp, setResp] = useState(RT), [scopeMode, setScopeMode] = useState("p12");
  const deadline = resp === "bbt" ? null : resp;
  const maxCap = deadline == null ? 30 : 100;
  // separate "max additional" per mode: before-BBT keeps the Config default, minute targets start at 60 (30-min reach needs many more spots)
  const [maxB, setMaxB] = useState(cfg.placement?.max_new ?? 15), [maxD, setMaxD] = useState(cfg.placement?.max_new_deadline ?? 60);
  const maxNew = Math.min(deadline == null ? maxB : maxD, maxCap), setMaxNew = deadline == null ? setMaxB : setMaxD;
  const opt = useMemo(() => ({ target: target / 100, maxNew, deadline, scopeMode }), [target, maxNew, deadline, scopeMode]);
  const conc = useMemo(() => new Map((data.meta?.mbp?.concurrency || []).map((c) => [c.nop, c])), [data.meta]);
  const inNop = useMemo(() => model.filter((s) => s.nop === nop), [model, nop]);
  const plan = useMemo(() => placementPlan(inNop, data.mbps, cfg, opt), [inNop, data.mbps, cfg, opt]);
  const all = useMemo(() => nops.map((n) => { const p = placementPlan(model.filter((s) => s.nop === n), data.mbps, cfg, opt), c = conc.get(n);
    const p95 = c ? Math.ceil(c.p95) : null, reach = p.needed == null ? null : p.current + p.needed;
    return { nop: n, targets: p.targets, current: p.current, now: p.targets ? p.reachedNow / p.targets : null, needed: p.needed, max: p.reachable_max, island: p.island, battery: p.battery, relocation: p.relocation.length,
      conc_p95: p95, conc_max: c?.max ?? null, ideal: reach == null ? null : Math.max(reach, p95 || 0), ideal_driver: reach == null ? null : (p95 || 0) > reach ? "concurrency" : "reach" }; }),
  [nops, model, data.mbps, cfg, opt, conc]);
  const C = conc.get(nop), idealNop = plan.needed == null ? null : Math.max(plan.current + plan.needed, C ? Math.ceil(C.p95) : 0);
  // v3.6 — centre of gravity per base camp → kecamatan, scored at the response target (30 min when "before BBT" is selected)
  const gDl = deadline ?? RT;
  const grav = useMemo(() => basecampGravity(model, data.mbps, cfg, { deadline: gDl }), [model, data.mbps, cfg, gDl]);
  const gN = useMemo(() => grav.filter((g) => g.nop === nop), [grav, nop]);
  const gSum = (L, k) => L.reduce((a, g) => a + g[k], 0);
  const gExtra = gN.filter((g) => g.verdict !== "stay").map((g) => ({ mbp_id: `★ ${g.rec_kecamatan} (${g.mbp_id})`, lat: g.rec_lat, lon: g.rec_lon, nop, is_new: true }));
  const tgtLabel = deadline == null ? t("place.resp.bbt_short") : t("place.resp.min_short", { m: deadline });
  const extra = plan.added.map((a) => ({ mbp_id: `NEW-${a.n} @ ${a.anchor_site}`, lat: a.lat, lon: a.lon, nop, is_new: true }));
  const T = plan.targets || 1;
  const steps = plan.steps.map((s) => ({ ...s, pct: 100 * s.share, label: s.k === 0 ? t("place.now") : `+${s.k}` }));
  const lim = cfg.placement?.relocation_max_loss_pp ?? 0.5, maxR = cfg.placement?.relocation_max_candidates ?? 3;

  return (
    <div className="space-y-4">
      <Note tone="warn"><b>{t("place.note.title")}</b> {t("place.note.body", { r: cfg.mbp.max_radius_km, rf: fNum(cfg.travel.road_factor, 2), mob: cfg.travel.mobilization_minutes })} {t("place.note.v36", { mob: cfg.travel.mobilization_minutes })}</Note>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64"><Select label={t("filter.nop")} value={nop} onChange={setNop} options={nops} /></div>
        <Seg label={t("place.resp.label")} value={resp} onChange={setResp} options={[["bbt", t("place.resp.bbt")], [30, t("place.resp.min", { m: 30 })], [60, t("place.resp.min", { m: 60 })], [120, t("place.resp.min", { m: 120 })]]} />
        <Seg label={t("place.scope.label")} value={scopeMode} onChange={setScopeMode} options={[["p12", t("place.scope.p12")], ["all", t("place.scope.all")]]} />
        <div className="w-56"><Slider label={t("place.target2", { x: tgtLabel })} value={target} onChange={setTarget} min={50} max={100} step={5} fmt={(v) => fPct(v, 0)} /></div>
        <div className="w-48"><Slider label={t("place.max_new")} value={maxNew} onChange={setMaxNew} min={1} max={maxCap} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Kpi label={t(scopeMode === "all" ? "place.kpi.targets_all" : "place.kpi.targets")} value={fInt(plan.targets)} sub={t("place.kpi.targets_sub", { i: fInt(plan.island), b: fInt(plan.battery) })} />
        <Kpi label={t("place.kpi.now2", { x: tgtLabel })} value={plan.targets ? fPct((100 * plan.reachedNow) / T, 0) : "—"} sub={t("filter.scope_sites", { n: fInt(plan.reachedNow) })} tone={plan.reachedNow / T >= target / 100 ? "good" : "warn"} />
        <Kpi label={t("place.kpi.current")} value={fInt(plan.current)} sub={t("place.kpi.current_sub")} />
        <Kpi label={t("place.kpi.needed")} value={plan.needed == null ? `> ${maxNew}` : fInt(plan.needed)} sub={t("place.kpi.needed_sub", { p: fPct(target, 0) })} tone={plan.needed ? "crit" : "good"} />
        <Kpi label={t("place.kpi.fleet")} value={plan.needed == null ? `> ${plan.current + maxNew}` : fInt(plan.current + plan.needed)} sub={t("place.kpi.fleet_sub", { p: fPct(100 * (plan.reachable_max || 0), 0) })} />
        <Kpi label={t("place.kpi.ideal")} value={idealNop == null ? `> ${fInt(Math.max(plan.current + maxNew, C ? Math.ceil(C.p95) : 0))}` : fInt(idealNop)} help={t("place.kpi.ideal_help")}
          sub={C ? t("place.kpi.ideal_sub", { p: fInt(Math.ceil(C.p95)), m: fInt(C.max) }) : t("place.kpi.ideal_noconc")} tone={idealNop != null && idealNop > plan.current ? "warn" : "good"} />
        <Kpi label={t("place.kpi.reloc")} value={fInt(plan.relocation.length)} sub={t("place.kpi.reloc_sub", { n: maxR, pp: fNum(lim, 1) })} />
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
              <Line dataKey="pct" name={t("place.reached")} stroke="#2b2370" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <table className="w-full text-[12px] tabular mt-2">
            <thead><tr className="text-slate text-left">{["added", "reached", "share", "dark"].map((h) => <th key={h} className="py-1 border-b border-line">{t(`place.gain.${h}`)}</th>)}</tr></thead>
            <tbody>{steps.map((r) => <tr key={r.k} className={`border-b border-line/60 ${plan.needed === r.k ? "bg-good/10 font-semibold" : ""}`}><td className="py-1">{r.label}</td><td>{fInt(r.reached)}</td><td>{fPct(r.pct, 0)}</td><td>{fH(r.dark_h_avoided)}</td></tr>)}</tbody>
          </table>
          <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("place.all_estimated")} <EvTag v="ESTIMATED" /></div>
        </Card>
      </div>
      <Card title={t("place.new.title")} sub={t("place.new.sub")}>
        <DataTable rows={plan.added} pageSize={20} filename={`pba_placement_${nop}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => setPick(model.find((s) => s.site_id === r.anchor_site))} columns={[
          { key: "n", label: "#", num: true }, { key: "kecamatan", label: "col.kecamatan", render: (r) => r.kecamatan || "—" }, { key: "city", label: "col.city", render: (r) => r.city || "—" },
          { key: "anchor_site", label: "col.anchor_site" }, { key: "anchor_name", label: "col.name" }, { key: "cluster", label: "col.cluster" },
          { key: "lat", label: "col.latlon", render: (r) => `${fCoord(r.lat, r.decimals)}, ${fCoord(r.lon, r.decimals)}`, csv: (r) => `${fCoord(r.lat, r.decimals)} ${fCoord(r.lon, r.decimals)}` },
          { key: "decimals", label: "col.precision", render: (r) => precisionNote(r.decimals), csv: (r) => r.decimals },
          { key: "new_sites_reached", label: "col.new_reached", num: true }, { key: "dark_h_avoided", label: "col.dark_avoided", num: true, render: (r) => fH(r.dark_h_avoided), csv: (r) => r.dark_h_avoided.toFixed(1) },
        ]} />
      </Card>
      <Card title={t("place.cog.title")} sub={t("place.cog.sub", { m: gDl, w1: cfg.gravity?.w_pln ?? 0.35, w2: cfg.gravity?.w_bbt ?? 0.25, w3: cfg.gravity?.w_class ?? 0.15, w4: cfg.gravity?.w_repeat ?? 0.25 })}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Kpi label={t("place.cog.k_move", { nop })} value={`${fInt(gN.filter((g) => g.verdict === "move").length)} / ${fInt(gN.length)}`} sub={t("place.cog.k_move_sub", { f: fInt(gN.filter((g) => g.verdict === "fine_tune").length), s: fInt(gN.filter((g) => g.verdict === "stay").length) })} />
          <Kpi label={t("place.cog.k_reach", { m: gDl })} value={`${fInt(gSum(gN, "reach_now"))} → ${fInt(gSum(gN.map((g) => (g.verdict === "stay" ? { ...g, reach_rec: g.reach_now } : g)), "reach_rec"))}`} sub={t("place.cog.k_reach_sub", { n: fInt(gSum(gN, "sites")) })} tone={gN.some((g) => g.verdict !== "stay" && g.reach_rec > g.reach_now) ? "good" : "slate"} />
          <Kpi label={t("place.cog.k_area", { m: gDl })} value={`${fInt(gSum(grav, "reach_now"))} → ${fInt(gSum(grav.map((g) => (g.verdict === "stay" ? { ...g, reach_rec: g.reach_now } : g)), "reach_rec"))}`} sub={t("place.cog.k_area_sub", { n: fInt(grav.length), s: fInt(gSum(grav, "sites")) })} />
          <Kpi label={t("place.cog.k_shift")} value={gN.length ? `${fNum(gN.filter((g) => g.verdict !== "stay").reduce((a, g, _, L) => a + g.shift_km / L.length, 0), 1)} km` : "—"} sub={t("place.cog.k_shift_sub")} />
        </div>
        <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4">
          <MapView sites={inNop.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected)} mbps={data.mbps.filter((m) => m.nop === nop)} extraMbps={gExtra} cfg={cfg}
            onRadius={setRadius} onPickSite={setPick} fitKey={nop + "cog"} defaultMode="survival" height={400} />
          <DataTable rows={gN} pageSize={12} filename="pba_basecamp_gravity_kecamatan.csv" initialSort={{ key: "gain", dir: -1 }}
            onRowClick={(r) => setPick(model.find((s) => s.site_id === r.rec_site))}
            expand={(r) => <div className="text-[12px] text-slate">{t("place.cog.why", { c: `${fCoord(r.cog_lat, 4)}, ${fCoord(r.cog_lon, 4)}`, k: fNum(r.cog_km, 1), e1: fNum(r.eta_w_now, 0), e2: fNum(r.eta_w_rec, 0) })}
              {r.alternatives.length > 0 && <> · <b>{t("place.cog.alt")}:</b> {r.alternatives.map((a) => `${a.kecamatan} (${a.site}, ${fInt(a.reach)} site, ${fNum(a.km, 1)} km)`).join(" · ")}</>}</div>}
            columns={[
              { key: "mbp_id", label: "col.basecamp" }, { key: "kec_now", label: "col.kec_now", render: (r) => r.kec_now || "—" },
              { key: "verdict", label: "col.verdict", render: (r) => t(`place.cog.v.${r.verdict}`), csv: (r) => r.verdict },
              { key: "rec_kecamatan", label: "col.kec_rec", render: (r) => (r.verdict === "stay" ? <span className="text-mut">—</span> : <span>★ {r.rec_kecamatan}<span className="text-mut"> · {r.rec_city || ""}</span>{r.city_change && <span className="ml-1 text-[10.5px] text-[#8a5a00] bg-warn/15 rounded px-1" title={t("place.cog.city_change_tip")}>{t("place.cog.city_change")}</span>}</span>), csv: (r) => (r.verdict === "stay" ? "" : r.rec_kecamatan) },
              { key: "rec_site", label: "col.anchor_site", render: (r) => (r.verdict === "stay" ? "—" : r.rec_site), csv: (r) => (r.verdict === "stay" ? "" : r.rec_site) },
              { key: "rec_latlon", label: "col.latlon", render: (r) => `${fCoord(r.rec_lat, r.rec_decimals)}, ${fCoord(r.rec_lon, r.rec_decimals)}`, csv: (r) => `${fCoord(r.rec_lat, r.rec_decimals)} ${fCoord(r.rec_lon, r.rec_decimals)}` },
              { key: "shift_km", label: "col.shift_km", num: true, sortVal: (r) => (r.verdict === "stay" ? 0 : r.shift_km), render: (r) => (r.verdict === "stay" ? "—" : fNum(r.shift_km, 1)), csv: (r) => (r.verdict === "stay" ? "" : r.shift_km.toFixed(2)) },
              { key: "sites", label: "col.sites_assigned", num: true },
              { key: "reach_now", label: "col.reach_now_t", num: true, render: (r) => `${fInt(r.reach_now)} (${fPct(100 * r.wreach_now, 0)})`, csv: (r) => r.reach_now },
              { key: "reach_rec", label: "col.reach_rec_t", num: true, render: (r) => (r.verdict === "stay" ? "—" : `${fInt(r.reach_rec)} (${fPct(100 * r.wreach_rec, 0)})`), csv: (r) => (r.verdict === "stay" ? "" : r.reach_rec) },
              { key: "gain", label: "col.gain", num: true, sortVal: (r) => (r.verdict === "stay" ? -999 : r.reach_rec - r.reach_now), render: (r) => (r.verdict === "stay" ? "—" : r.reach_rec - r.reach_now > 0 ? `+${fInt(r.reach_rec - r.reach_now)}` : fInt(r.reach_rec - r.reach_now)), csv: (r) => (r.verdict === "stay" ? 0 : r.reach_rec - r.reach_now) },
              { key: "alts", label: "col.alternatives", render: (r) => r.alternatives.map((a) => a.kecamatan).join(" · ") || "—", csv: (r) => r.alternatives.map((a) => `${a.kecamatan} (${a.site})`).join("; ") },
            ]} />
        </div>
        <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("place.cog.foot")} <EvTag v="ESTIMATED" /></div>
      </Card>
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
          <DataTable rows={all} pageSize={20} filename="pba_fleet_size_all_nops.csv" initialSort={{ key: "needed", dir: -1 }} columns={[
            { key: "nop", label: "col.nop" }, { key: "targets", label: "col.p1p2_road", num: true }, { key: "current", label: "col.basecamps", num: true },
            { key: "now", label: "col.reached_now", num: true, render: (r) => (r.now == null ? "—" : fPct(100 * r.now, 0)), csv: (r) => (r.now == null ? "" : (100 * r.now).toFixed(1)) },
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
  );
}
