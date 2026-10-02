"use client";
import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LabelList } from "recharts";
import { Card, Kpi, Note, DataTable, LevelTag, fInt, fMin, fPct, fH, LEVEL, STATUS, EVID, isNum } from "@/components/ui";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const STATUSES = ["Dead", "Critical", "Degraded", "OK", "Unknown"];
const cnt = (a, f) => a.reduce((n, x) => n + (f(x) ? 1 : 0), 0);

export default function Overview({ scope, data, cfg, setPick }) {
  const m = data.meta;
  const k = useMemo(() => {
    const meas = (s) => s.bbt_value_evidence === "ACTUAL" || s.bbt_value_evidence === "DERIVED";
    return {
      n: scope.length, act: cnt(scope, (s) => s.bbt_value_evidence === "ACTUAL"), der: cnt(scope, (s) => s.bbt_value_evidence === "DERIVED"),
      est: cnt(scope, (s) => s.bbt_value_evidence === "ESTIMATED"), una: cnt(scope, (s) => s.bbt_value_evidence === "UNAVAILABLE"),
      measBad: cnt(scope, (s) => meas(s) && (s.bbt_status === "Dead" || s.bbt_status === "Critical")),
      estBad: cnt(scope, (s) => s.bbt_value_evidence === "ESTIMATED" && (s.bbt_status === "Dead" || s.bbt_status === "Critical")),
      design: cnt(scope, (s) => meas(s) && s.bbt_value_min >= cfg.bbt.design_minutes), measN: cnt(scope, meas),
      p12: cnt(scope, (s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2"),
      bbs: cnt(scope, (s) => s.bbs_priority_level != null), bbsP1: cnt(scope, (s) => s.bbs_priority_level === "P1"),
      reach: cnt(scope, (s) => s.reach_risk === 1), hubReach: cnt(scope, (s) => s.reach_risk === 1 && (s.dependency_children || 0) > 0),
      island: cnt(scope, (s) => s.is_island === 1),
      avail: (() => { const v = scope.filter((s) => isNum(s.avail_wc_pct)); return v.length ? v.reduce((a, s) => a + s.avail_wc_pct, 0) / v.length : null; })(),
      below: cnt(scope, (s) => (s.avail_gap_pp || 0) > 0),
    };
  }, [scope, cfg]);
  const statusData = STATUSES.map((st) => ({
    status: st,
    Measured: cnt(scope, (s) => s.bbt_status === st && (s.bbt_value_evidence === "ACTUAL" || s.bbt_value_evidence === "DERIVED")),
    Estimated: cnt(scope, (s) => s.bbt_status === st && s.bbt_value_evidence === "ESTIMATED"),
    "No BBT data": cnt(scope, (s) => s.bbt_status === st && s.bbt_value_evidence === "UNAVAILABLE"),
  }));
  const batches = Object.values(cfg.action_batches);
  const acts = [...new Set(scope.filter((s) => s.bbs_priority_level).map((s) => s.recommended_action))];
  const actRows = acts.map((a) => {
    const r = { action: a };
    batches.forEach((b) => (r[b] = cnt(scope, (s) => s.recommended_action === a && s.action_batch === b)));
    r.total = batches.reduce((x, b) => x + r[b], 0);
    return r;
  }).sort((a, b) => b.total - a.total);
  const nopRows = useMemo(() => {
    const g = new Map();
    for (const s of scope) {
      const r = g.get(s.nop) || { nop: s.nop, sites: 0, mbps: new Set(), p12: 0, bad: 0, est: 0, bbs: 0, reach: 0, pln: 0, dep: 0, bbt: [] };
      r.sites++; if (s.mbp_assigned) r.mbps.add(s.mbp_assigned); if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") r.p12++;
      if (s.bbt_status === "Dead" || s.bbt_status === "Critical") r.bad++; if (s.bbt_value_evidence === "ESTIMATED") r.est++;
      if (s.bbs_priority_level) r.bbs++; r.reach += s.reach_risk || 0; r.pln += s.pln_freq || 0; r.dep += s.mbp_deployments || 0;
      if (isNum(s.bbt_value_min) && s.bbt_value_evidence !== "ESTIMATED") r.bbt.push(s.bbt_value_min);
      g.set(s.nop, r);
    }
    return [...g.values()].map((r) => ({ ...r, mbps: r.mbps.size, med: r.bbt.length ? r.bbt.sort((a, b) => a - b)[Math.floor(r.bbt.length / 2)] : null }));
  }, [scope]);
  const top = useMemo(() => [...scope].sort((a, b) => b.mbp_priority_score - a.mbp_priority_score), [scope]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Sites in scope" value={fInt(k.n)} sub={`${fInt(k.island)} island sites`} />
        <Kpi label="BBT measured" value={fInt(k.act + k.der)} sub={`ACTUAL ${fInt(k.act)} · DERIVED ${fInt(k.der)}`} />
        <Kpi label="BBT estimated / none" value={`${fInt(k.est)} / ${fInt(k.una)}`} sub="ESTIMATED never counted as measured" tone="warn" />
        <Kpi label="Measured: Dead + Critical" value={fInt(k.measBad)} sub={`only ${fInt(k.design)} of ${fInt(k.measN)} meet the ${cfg.bbt.design_minutes}-min design`} tone="crit" />
        <Kpi label="BBS sites needing action" value={fInt(k.bbs)} sub={`${fInt(k.bbsP1)} at P1 (Batch 1)`} tone="crit" />
        <Kpi label="Hubs dark before MBP arrives" value={fInt(k.hubReach)} sub={`${fInt(k.reach)} sites total with ETA > BBT`} tone="crit" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="MBP priority P1 + P2" value={fInt(k.p12)} sub="class · dependency · outage · distance · ETA vs BBT · availability" />
        <Kpi label="Avg availability" value={fPct(k.avail, 2)} sub={`${fInt(k.below)} sites below target`} />
        <Kpi label="MBP base camps" value={`${fInt(m.mbp.basecamp_summary.filter((b) => b.coord_status !== "MISSING").length)} located`} sub={`of ${m.mbp.basecamp_summary.length} · ${m.dq.mbp_coords.MISSING || 0} without coordinates`} />
        <Kpi label="PLN outages (merged)" value={fInt(scope.reduce((a, s) => a + (s.pln_freq || 0), 0))} sub={`${fInt(m.qa.pln_overlapping_events_merged)} overlapping events merged`} />
        <Kpi label="MBP deployments H1" value={fInt(scope.reduce((a, s) => a + (s.mbp_deployments || 0), 0))} sub={`${fInt(scope.reduce((a, s) => a + (s.mbp_backup_h || 0), 0))} MBP run hours`} />
        <Kpi label="BBT estimator" value="Kaplan-Meier" sub={`MAE ${m.bbs.estimator_mae_min} min on unseen sites (time split)`} tone="slate" />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Battery status — measured vs estimated" sub={`vs ${cfg.bbt.design_minutes}-min design: OK ≥ ${cfg.bbt.ok_pct * 100}% · Degraded ${cfg.bbt.degraded_pct * 100}–${cfg.bbt.ok_pct * 100}% · Critical < ${cfg.bbt.degraded_pct * 100}% · Dead ≤ ${cfg.bbt.dead_max_minutes} min / no battery`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barGap={2}>
              <CartesianGrid stroke="#E3E7ED" vertical={false} />
              <XAxis dataKey="status" tick={{ fontSize: 12, fill: "#55627A" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B7588" }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip formatter={(v) => v.toLocaleString()} cursor={{ fill: "#1F2A4410" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Measured" fill={EVID.ACTUAL.c} radius={[4, 4, 0, 0]}><LabelList dataKey="Measured" position="top" fontSize={10} fill="#55627A" formatter={(v) => (v ? v.toLocaleString() : "")} /></Bar>
              <Bar dataKey="Estimated" fill={EVID.ESTIMATED.c} radius={[4, 4, 0, 0]} />
              <Bar dataKey="No BBT data" fill="#C9CFD9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <Note>Estimated values (comparable-site Kaplan-Meier, MAE ≈ {m.bbs.estimator_mae_min} min) are shown separately and only ever lead to “Inspect & verify”, never to a direct replacement.</Note>
        </Card>
        <Card title="BBS actions by execution batch" sub="Sites needing action = battery Dead/Critical/Degraded, or a hub that goes dark before the MBP can arrive">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] tabular">
              <thead><tr className="text-slate"><th className="text-left py-1.5 border-b border-line">Action</th>{batches.map((b) => <th key={b} className="text-right py-1.5 border-b border-line px-2 whitespace-nowrap">{b.split(" — ")[0]}<div className="text-[10.5px] font-normal text-mut">{b.split(" — ")[1]}</div></th>)}<th className="text-right border-b border-line px-2">Total</th></tr></thead>
              <tbody>{actRows.map((r) => (
                <tr key={r.action} className="border-b border-line/60"><td className="py-1.5 pr-2">{r.action}</td>{batches.map((b) => <td key={b} className="text-right px-2">{r[b] ? fInt(r[b]) : "·"}</td>)}<td className="text-right px-2 font-semibold">{fInt(r.total)}</td></tr>))}</tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Map — MBP priority" sub="Top sites by MBP priority (click a site for its detail)">
        <MapView sites={top} colorOf={(s) => LEVEL[s.mbp_priority_level].c} sizeOf={(s) => (s.mbp_priority_level === "P1" ? 6 : s.mbp_priority_level === "P2" ? 5 : 3.5)}
          mbps={data.mbps} onPick={setPick} fitKey="ov" legend={["P1", "P2", "P3", "P4"].map((l) => ({ label: l, c: LEVEL[l].c }))} />
      </Card>

      <Card title="Per NOP">
        <DataTable rows={nopRows} filename="pba_per_nop.csv" initialSort={{ key: "p12", dir: -1 }} pageSize={20} columns={[
          { key: "nop", label: "NOP" }, { key: "sites", label: "Sites", num: true, render: (r) => fInt(r.sites) },
          { key: "mbps", label: "MBPs (assigned)", num: true }, { key: "p12", label: "MBP P1+P2", num: true, render: (r) => fInt(r.p12) },
          { key: "bad", label: "Battery Dead+Critical", num: true, render: (r) => fInt(r.bad) }, { key: "est", label: "BBT estimated", num: true, render: (r) => fInt(r.est) },
          { key: "bbs", label: "BBS actions", num: true, render: (r) => fInt(r.bbs) }, { key: "reach", label: "ETA > BBT", num: true, render: (r) => fInt(r.reach) },
          { key: "med", label: "Median BBT (measured)", num: true, render: (r) => fMin(r.med) }, { key: "pln", label: "PLN outages", num: true, render: (r) => fInt(r.pln) },
          { key: "dep", label: "MBP deployments", num: true, render: (r) => fInt(r.dep) },
        ]} />
      </Card>
    </div>
  );
}
