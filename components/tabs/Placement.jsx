"use client";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Card, Kpi, Note, DataTable, Select, Slider, EvTag, fInt, fH, fPct, fPP, fNum, fCoord, precisionNote } from "@/components/ui";
import { placementPlan } from "@/lib/logic";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Placement({ model, data, cfg, nop: gNop, setPick, setRadius }) {
  const nops = useMemo(() => [...new Set(model.map((s) => s.nop).filter(Boolean))].sort(), [model]);
  const [nop, setNop] = useState(gNop !== "All NOPs" ? gNop : "NOP PALEMBANG");
  useEffect(() => { if (gNop !== "All NOPs") setNop(gNop); }, [gNop]);
  const [target, setTarget] = useState(Math.round((cfg.placement?.target_share ?? 0.9) * 100));
  const [maxNew, setMaxNew] = useState(cfg.placement?.max_new ?? 15);
  const inNop = useMemo(() => model.filter((s) => s.nop === nop), [model, nop]);
  const plan = useMemo(() => placementPlan(inNop, data.mbps, cfg, { target: target / 100, maxNew }), [inNop, data.mbps, cfg, target, maxNew]);
  const all = useMemo(() => nops.map((n) => { const p = placementPlan(model.filter((s) => s.nop === n), data.mbps, cfg, { target: target / 100, maxNew });
    return { nop: n, targets: p.targets, current: p.current, now: p.targets ? p.reachedNow / p.targets : null, needed: p.needed, max: p.reachable_max, island: p.island, battery: p.battery, relocation: p.relocation.length }; }),
  [nops, model, data.mbps, cfg, target, maxNew]);
  const extra = plan.added.map((a) => ({ mbp_id: `NEW-${a.n} @ ${a.anchor_site}`, lat: a.lat, lon: a.lon, nop, is_new: true }));
  const T = plan.targets || 1;
  const steps = plan.steps.map((s) => ({ ...s, pct: 100 * s.share, label: s.k === 0 ? t("place.now") : `+${s.k}` }));
  const lim = cfg.placement?.relocation_max_loss_pp ?? 0.5, maxR = cfg.placement?.relocation_max_candidates ?? 3;

  return (
    <div className="space-y-4">
      <Note tone="warn"><b>{t("place.note.title")}</b> {t("place.note.body", { r: cfg.mbp.max_radius_km, rf: fNum(cfg.travel.road_factor, 2), mob: cfg.travel.mobilization_minutes })}</Note>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64"><Select label={t("filter.nop")} value={nop} onChange={setNop} options={nops} /></div>
        <div className="w-64"><Slider label={t("place.target")} value={target} onChange={setTarget} min={50} max={100} step={5} fmt={(v) => fPct(v, 0)} /></div>
        <div className="w-56"><Slider label={t("place.max_new")} value={maxNew} onChange={setMaxNew} min={1} max={30} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label={t("place.kpi.targets")} value={fInt(plan.targets)} sub={t("place.kpi.targets_sub", { i: fInt(plan.island), b: fInt(plan.battery) })} />
        <Kpi label={t("place.kpi.now")} value={plan.targets ? fPct((100 * plan.reachedNow) / T, 0) : "—"} sub={t("filter.scope_sites", { n: fInt(plan.reachedNow) })} tone={plan.reachedNow / T >= target / 100 ? "good" : "warn"} />
        <Kpi label={t("place.kpi.current")} value={fInt(plan.current)} sub={t("place.kpi.current_sub")} />
        <Kpi label={t("place.kpi.needed")} value={plan.needed == null ? `> ${maxNew}` : fInt(plan.needed)} sub={t("place.kpi.needed_sub", { p: fPct(target, 0) })} tone={plan.needed ? "crit" : "good"} />
        <Kpi label={t("place.kpi.fleet")} value={plan.needed == null ? `> ${plan.current + maxNew}` : fInt(plan.current + plan.needed)} sub={t("place.kpi.fleet_sub", { p: fPct(100 * (plan.reachable_max || 0), 0) })} />
        <Kpi label={t("place.kpi.reloc")} value={fInt(plan.relocation.length)} sub={t("place.kpi.reloc_sub", { n: maxR, pp: fNum(lim, 1) })} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card title={t("place.map.title")} sub={t("place.map.sub")}>
          <MapView sites={inNop.filter((s) => s.site_active === 1 && !s.offair && (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2"))}
            mbps={data.mbps.filter((m) => m.nop === nop)} extraMbps={extra} cfg={cfg} onRadius={setRadius} onPickSite={setPick} fitKey={nop} defaultMode="survival" height={420} />
        </Card>
        <Card title={t("place.gain.title")} sub={t("place.gain.sub")}>
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
          { key: "n", label: "#", num: true }, { key: "anchor_site", label: "col.anchor_site" }, { key: "anchor_name", label: "col.name" }, { key: "cluster", label: "col.cluster" },
          { key: "lat", label: "col.latlon", render: (r) => `${fCoord(r.lat, r.decimals)}, ${fCoord(r.lon, r.decimals)}`, csv: (r) => `${fCoord(r.lat, r.decimals)} ${fCoord(r.lon, r.decimals)}` },
          { key: "decimals", label: "col.precision", render: (r) => precisionNote(r.decimals), csv: (r) => r.decimals },
          { key: "new_sites_reached", label: "col.new_reached", num: true }, { key: "dark_h_avoided", label: "col.dark_avoided", num: true, render: (r) => fH(r.dark_h_avoided), csv: (r) => r.dark_h_avoided.toFixed(1) },
        ]} />
      </Card>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title={t("place.reloc.title")} sub={t("place.reloc.sub", { n: maxR, pp: fNum(lim, 1) })}>
          <div className="mb-2"><Note tone="crit">{t("place.reloc.warn")}</Note></div>
          {!plan.relocation.length ? <div className="text-mut text-[12.5px]">{t("place.reloc.none", { pp: fNum(lim, 1) })}</div> : (
            <DataTable rows={plan.relocation} pageSize={15} filename={`pba_relocation_${nop}.csv`.replace(/\s+/g, "_")} columns={[
              { key: "order", label: "col.order", num: true }, { key: "mbp_id", label: "col.basecamp" }, { key: "best_for", label: "col.fastest_for", num: true },
              { key: "workload_h1", label: "col.workload", num: true },
              { key: "lost_cumulative", label: "col.lost_cumulative", num: true }, { key: "loss_pp", label: "col.loss_cumulative", num: true, render: (r) => fPP(-r.loss_pp, 1), csv: (r) => r.loss_pp.toFixed(2) },
            ]} />)}
        </Card>
        <Card title={t("place.all.title")} sub={t("place.all.sub", { p: fPct(target, 0), n: maxNew })}>
          <DataTable rows={all} pageSize={20} filename="pba_fleet_size_all_nops.csv" initialSort={{ key: "needed", dir: -1 }} columns={[
            { key: "nop", label: "col.nop" }, { key: "targets", label: "col.p1p2_road", num: true }, { key: "current", label: "col.basecamps", num: true },
            { key: "now", label: "col.reached_now", num: true, render: (r) => (r.now == null ? "—" : fPct(100 * r.now, 0)), csv: (r) => (r.now == null ? "" : (100 * r.now).toFixed(1)) },
            { key: "needed", label: "col.additional_needed", num: true, sortVal: (r) => (r.needed == null ? 999 : r.needed), render: (r) => (r.needed == null ? `> ${maxNew}` : fInt(r.needed)), csv: (r) => (r.needed == null ? `>${maxNew}` : r.needed) },
            { key: "max", label: "col.max_reachable", num: true, render: (r) => fPct(100 * (r.max || 0), 0), csv: (r) => (100 * (r.max || 0)).toFixed(1) },
            { key: "island", label: "col.island_sea", num: true }, { key: "battery", label: "col.battery_lt_mob", num: true }, { key: "relocation", label: "col.reloc_candidates", num: true },
          ]} />
        </Card>
      </div>
    </div>
  );
}
