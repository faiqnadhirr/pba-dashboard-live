"use client";
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Card, Kpi, Note, DataTable, Select, Slider, EvTag, fInt, fH, fPct, fCoord, precisionNote } from "@/components/ui";
import { placementPlan } from "@/lib/logic";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Placement({ model, data, cfg, nop: gNop, setPick, setRadius }) {
  const nops = useMemo(() => [...new Set(model.map((s) => s.nop).filter(Boolean))].sort(), [model]);
  const [nop, setNop] = useState(gNop !== "All NOPs" ? gNop : "NOP PALEMBANG");
  const [target, setTarget] = useState(Math.round((cfg.placement?.target_share ?? 0.9) * 100));
  const [maxNew, setMaxNew] = useState(cfg.placement?.max_new ?? 15);
  const inNop = useMemo(() => model.filter((s) => s.nop === nop), [model, nop]);
  const plan = useMemo(() => placementPlan(inNop, data.mbps, cfg, { target: target / 100, maxNew }), [inNop, data.mbps, cfg, target, maxNew]);
  const all = useMemo(() => nops.map((n) => { const p = placementPlan(model.filter((s) => s.nop === n), data.mbps, cfg, { target: target / 100, maxNew });
    return { nop: n, targets: p.targets, current: p.current, now: p.targets ? p.reachedNow / p.targets : null, needed: p.needed, max: p.reachable_max, island: p.island, battery: p.battery, relocation: p.relocation.length }; }),
  [nops, model, data.mbps, cfg, target, maxNew]);
  const extra = plan.added.map((a) => ({ mbp_id: `NEW-${a.n} @ ${a.anchor_site}`, lat: a.lat, lon: a.lon, nop, is_new: true }));
  const T = plan.targets || 1;
  const steps = plan.steps.map((s) => ({ ...s, pct: 100 * s.share, label: s.k === 0 ? "now" : `+${s.k}` }));

  return (
    <div className="space-y-4">
      <Note tone="warn">
        <b>ESTIMATED — decision support.</b> Reach = straight-line km ≤ {cfg.mbp.max_radius_km} km radius and road ETA (km × {cfg.travel.road_factor} road factor ÷ speed + {cfg.travel.mobilization_minutes} min mobilisation) ≤ the site's BBT.
        New MBP locations are snapped to real MBP-P1/P2 sites (anchors), chosen greedily: each step adds the location that brings the most not-yet-reached MBP-P1/P2 sites within reach before BBT.
        Island sites (sea logistics) and sites whose battery is shorter than the mobilisation time (no MBP can ever arrive in time — battery action needed) are excluded from the denominator and shown separately.
        Dark hours avoided = battery-exhausted events (or dark months) × minutes the site would no longer be dark per event.
      </Note>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64"><Select label="NOP" value={nop} onChange={setNop} options={nops} /></div>
        <div className="w-64"><Slider label="Target: MBP-P1/P2 reached before BBT" value={target} onChange={setTarget} min={50} max={100} step={5} fmt={(v) => `${v}%`} /></div>
        <div className="w-56"><Slider label="Max additional MBPs" value={maxNew} onChange={setMaxNew} min={1} max={30} /></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="MBP-P1/P2 sites (road-reachable)" value={fInt(plan.targets)} sub={`+${fInt(plan.island)} island · ${fInt(plan.battery)} battery < mobilisation`} />
        <Kpi label="Reached before BBT now" value={plan.targets ? fPct((100 * plan.reachedNow) / T, 0) : "—"} sub={`${fInt(plan.reachedNow)} sites`} tone={plan.reachedNow / T >= target / 100 ? "good" : "warn"} />
        <Kpi label="Current base camps" value={fInt(plan.current)} sub="located, in this NOP" />
        <Kpi label="Additional MBPs needed" value={plan.needed == null ? `> ${maxNew}` : fInt(plan.needed)} sub={`to reach ${target}% · ESTIMATED`} tone={plan.needed ? "crit" : "good"} />
        <Kpi label="Fleet size (current + new)" value={plan.needed == null ? `> ${plan.current + maxNew}` : fInt(plan.current + plan.needed)} sub={`max reachable ${fPct(100 * (plan.reachable_max || 0), 0)}`} />
        <Kpi label="Relocation candidates" value={fInt(plan.relocation.length)} sub={`removal loses < ${cfg.placement?.relocation_max_loss_pp ?? 2} pp`} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        <Card title="Proposed MBP locations" sub="Existing base camps + proposed new MBPs (NEW-n). Sites coloured by whether an MBP arrives before BBT today.">
          <MapView sites={inNop.filter((s) => s.site_active === 1 && !s.offair && (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2"))}
            mbps={data.mbps.filter((m) => m.nop === nop)} extraMbps={extra} cfg={cfg} onRadius={setRadius} onPickSite={setPick} fitKey={nop} defaultMode="survival" height={420} />
        </Card>
        <Card title="Marginal gain" sub="Share of MBP-P1/P2 sites reached before BBT after adding 1, 2, 3 … MBPs.">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={steps} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#55627A" }} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#6B7588" }} width={40} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(0)}%`} />
              <ReferenceLine y={target} stroke="#d03b3b" strokeDasharray="4 3" label={{ value: `target ${target}%`, fontSize: 10, position: "insideBottomRight" }} />
              <Line dataKey="pct" name="Reached before BBT" stroke="#2b2370" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <table className="w-full text-[12px] tabular mt-2">
            <thead><tr className="text-slate text-left">{["MBPs added", "Reached", "Share", "Dark hours avoided (cum.)"].map((h) => <th key={h} className="py-1 border-b border-line">{h}</th>)}</tr></thead>
            <tbody>{steps.map((r) => <tr key={r.k} className={`border-b border-line/60 ${plan.needed === r.k ? "bg-good/10 font-semibold" : ""}`}><td className="py-1">{r.label}</td><td>{fInt(r.reached)}</td><td>{fPct(r.pct, 0)}</td><td>{fH(r.dark_h_avoided)}</td></tr>)}</tbody>
          </table>
          <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">All values <EvTag v="ESTIMATED" /></div>
        </Card>
      </div>
      <Card title="Proposed new MBP locations (anchor sites)" sub="Coordinates of the real anchor site, at source precision. Validate road access and a base-camp site with the field team.">
        <DataTable rows={plan.added} pageSize={20} filename={`pba_placement_${nop}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => setPick(model.find((s) => s.site_id === r.anchor_site))} columns={[
          { key: "n", label: "#", num: true }, { key: "anchor_site", label: "Anchor site" }, { key: "anchor_name", label: "Name" }, { key: "cluster", label: "Cluster" },
          { key: "lat", label: "Lat, lon", render: (r) => `${fCoord(r.lat, r.decimals)}, ${fCoord(r.lon, r.decimals)}`, csv: (r) => `${fCoord(r.lat, r.decimals)} ${fCoord(r.lon, r.decimals)}` },
          { key: "decimals", label: "Precision", render: (r) => precisionNote(r.decimals) },
          { key: "new_sites_reached", label: "New MBP-P1/P2 reached", num: true }, { key: "dark_h_avoided", label: "Dark hours avoided", num: true, render: (r) => fH(r.dark_h_avoided) },
        ]} />
      </Card>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Relocation candidates" sub={`Existing base camps whose removal (one at a time) loses < ${cfg.placement?.relocation_max_loss_pp ?? 2} pp of MBP-P1/P2 reach — candidates to move to a proposed location. Check workload before moving.`}>
          <DataTable rows={plan.relocation} pageSize={15} filename={`pba_relocation_${nop}.csv`.replace(/\s+/g, "_")} columns={[
            { key: "mbp_id", label: "Base camp" }, { key: "best_for", label: "MBP-P1/P2 sites it is fastest for", num: true },
            { key: "lost_if_removed", label: "Lost if removed", num: true }, { key: "loss_pp", label: "Loss", num: true, render: (r) => `${r.loss_pp.toFixed(1)} pp` },
          ]} />
        </Card>
        <Card title="All NOPs — fleet size summary" sub={`Same rule per NOP (target ${target}%, max +${maxNew}).`}>
          <DataTable rows={all} pageSize={20} filename="pba_fleet_size_all_nops.csv" initialSort={{ key: "needed", dir: -1 }} columns={[
            { key: "nop", label: "NOP" }, { key: "targets", label: "MBP-P1/P2 (road)", num: true }, { key: "current", label: "Base camps", num: true },
            { key: "now", label: "Reached now", num: true, render: (r) => (r.now == null ? "—" : fPct(100 * r.now, 0)) },
            { key: "needed", label: "Additional needed", num: true, sortVal: (r) => (r.needed == null ? 999 : r.needed), render: (r) => (r.needed == null ? `> ${maxNew}` : fInt(r.needed)), csv: (r) => (r.needed == null ? `>${maxNew}` : r.needed) },
            { key: "max", label: "Max reachable", num: true, render: (r) => fPct(100 * (r.max || 0), 0) },
            { key: "island", label: "Island (sea)", num: true }, { key: "battery", label: "Battery < mobilisation", num: true }, { key: "relocation", label: "Relocation candidates", num: true },
          ]} />
        </Card>
      </div>
    </div>
  );
}
