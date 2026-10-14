"use client";
// Bucket 3 (2026-10-14) — "Base camp mana yang lebih baik dipindah?": ONE candidate list, built from the three existing engines
// (no new calculation, no new threshold):
//   backtest  lib/mbpperf.js › backtestMove — idle (selectable) base camps, best kecamatan by H1 jobs replayed; kept only when
//             gain ≥ mbp_perf.reloc_min_gain_jobs AND ≥ 1 % of judged jobs (same rule as the former sandbox suggestions); GATED by the
//             model validation (calibration ±5 pp) — when the model does not reproduce the actual on-time, no backtest candidate is shown.
//   demand    lib/logic.js › basecampGravity — demand centre vs recommended kecamatan (verdict move / fine_tune) with the feasibility checks
//             that were on MBP › History (real active site, not island / riverine, ≥ 4 coordinate decimals, same city).
//   freeable  lib/logic.js › placementPlan › relocation — units whose removal costs ≤ relocation_max_loss_pp of P1/P2 reach.
// One row per base camp + action; when two sources propose the same move, the backtest destination is kept and both sources are listed.
// "Uji" hands the move / removal to the shared sandbox — a model proposal, never executed or approved.
import React, { useMemo, useState } from "react";
import { Card, Note, DataTable, Tag, EvTag, fInt, fKm, fNum, fPct, isNum } from "@/components/ui";
import { backtestMove, campCode } from "@/lib/mbpperf";
import { basecampGravity, placementPlan } from "@/lib/logic";
import { opStatus } from "@/lib/opstatus";
import { OpTag } from "@/components/opUi";
import { t } from "@/lib/i18n";

export function moveCandidates({ model, active, data, cfg, nop, perf, tickets, bcScope, calib }) {
  const sitesN = model.filter((s) => s.nop === nop && s.site_active === 1 && !s.offair);
  const mbpsN = data.mbps.filter((m) => m.nop === nop && isNum(m.lat));
  const ids = new Set(sitesN.map((s) => s.site_id));
  const ticketsN = tickets.filter((k) => ids.has(k.site));
  const c = cfg.mbp_perf || {}, minG = c.reloc_min_gain_jobs ?? 10;
  const bc = new Map((bcScope || []).map((b) => [b.mbp_id, b]));
  const rows = new Map(), add = (r) => { const k = `${r.mbp_id}|${r.action}`, o = rows.get(k); if (!o) rows.set(k, r); else o.sources = [...new Set([...o.sources, ...r.sources])]; };
  let idleChecked = 0, worse = 0;
  // 1 backtest (gated by the model validation)
  if (calib?.ok && ticketsN.length) {
    const idle = mbpsN.filter((m) => { const b = bc.get(m.mbp_id) || perf.get(m.mbp_id); return b && (b.status ?? b.key) === "under" && b.selectable !== false; });
    idleChecked = idle.length;
    const judged = ticketsN.length;
    for (const m of idle) {
      const r = backtestMove(sitesN, mbpsN, ticketsN, cfg, m.mbp_id, { candidates: 6 }), x = r.results[0];
      const J = (r.base.total.ontime || 0) + (r.base.total.late || 0) || judged;
      if (x && x.ontime_gain >= minG && (100 * x.ontime_gain) / J >= 1)
        add({ mbp_id: m.mbp_id, action: "move", dest: x.kecamatan, city: x.city, site: x.site_id, lat: x.lat, lon: x.lon, km: x.shift_km, sources: ["backtest"], feasible: true,
          impact: t("mv.imp.backtest", { g: fInt(x.ontime_gain), j: fInt(J) }), sortv: 3e6 + x.ontime_gain });
    }
  }
  // 2 demand centre (feasibility explicit)
  const base = active.filter((s) => s.nop === nop), byId = new Map(base.map((s) => [s.site_id, s])), RT = cfg.mbp.response_target_min ?? 30;
  for (const g of basecampGravity(base, data.mbps.filter((m) => m.nop === nop), cfg, { deadline: RT })) {
    if (g.verdict === "stay") continue;
    // a demand-centre move that LOWERS the sites reached within the response target is not offered as a candidate (it stays visible,
    // with its numbers, in "Detail: demand centre"); counted so the list says how many were left out
    if (g.reach_rec < g.reach_now) { worse++; continue; }
    const a = byId.get(g.rec_site), feasible = !!a && a.site_active === 1 && a.access_class !== "island" && a.access_class !== "riverine" && (a.coord_decimals ?? 0) >= 4 && !g.city_change;
    add({ mbp_id: g.mbp_id, action: "move", dest: g.rec_kecamatan, city: g.rec_city, site: g.rec_site, lat: g.rec_lat, lon: g.rec_lon, km: g.shift_km, sources: ["demand"], feasible,
      impact: t("mv.imp.demand", { a: fInt(g.reach_now), b: fInt(g.reach_rec), m: RT }), sortv: 2e6 + (g.reach_rec - g.reach_now) });
  }
  // 3 units that can be freed (placement sizing at the Config defaults)
  const plan = placementPlan(model.filter((s) => s.nop === nop), data.mbps, cfg, {});   // same input as Units sizing (Placement.jsx)
  for (const r of plan.relocation) add({ mbp_id: r.mbp_id, action: "remove", dest: null, sources: ["freeable"], feasible: true,
    impact: t("mv.imp.freeable", { pp: fNum(r.loss_pp, 2), lim: fNum(cfg.placement?.relocation_max_loss_pp ?? 0.5, 1) }), sortv: 1e6 - r.order });
  const out = [...rows.values()].map((r) => { const b = bc.get(r.mbp_id) || perf.get(r.mbp_id); return { ...r, _op: b ? opStatus(b, cfg).op : "unrated" }; });
  return { rows: out.sort((a, b) => b.sortv - a.sortv), idleChecked, worse, gated: !calib?.ok };
}

export default function MoveCandidates(ctx) {
  const { nop, names, K, openInSandbox, hasJobs, openMbp, data } = ctx;
  const calib = K?.byNop.get(nop)?.calib || null;
  const { rows, idleChecked, worse, gated } = useMemo(() => moveCandidates({ ...ctx, calib }), [ctx.model, ctx.active, ctx.data, ctx.cfg, nop, ctx.perf, ctx.tickets, ctx.bcScope, calib]); // eslint-disable-line
  const [src, setSrc] = useState(null);
  const shown = src ? rows.filter((r) => r.sources.includes(src)) : rows;
  const cnt = (k) => rows.filter((r) => r.sources.includes(k)).length;
  const nm = (id) => (names ? id : campCode(id));
  const uji = (r) => openInSandbox(r.action === "remove" ? { kind: "remove", nop, mbp_id: r.mbp_id, label: nm(r.mbp_id) } : { kind: "move", nop, mbp_id: r.mbp_id, lat: r.lat, lon: r.lon, label: r.dest });
  return (
    <Card title={t("mv.title", { n: fInt(rows.length) })} sub={t("mv.sub")}>
      {!hasJobs ? <div className="mb-2"><Note tone="info">{t("mv.no_jobs")}</Note></div>
        : gated ? <div className="mb-2"><Note tone="warn">{t("mv.gated", { d: calib ? fNum(calib.diff_pp, 1) : "—" })}</Note></div>
        : <div className="text-[12px] text-slate mb-2">{t("mv.idle_checked", { n: fInt(idleChecked) })}</div>}
      <div className="flex flex-wrap gap-1.5 mb-2" role="group" aria-label={t("mv.src")}>
        {[null, "backtest", "demand", "freeable"].map((k) => <button key={k || "all"} aria-pressed={src === k} onClick={() => setSrc(k)}
          className={`px-2.5 py-0.5 rounded-full border text-[12px] ${src === k ? "bg-navy text-white border-navy" : "bg-white border-line hover:border-slate"}`} title={k ? t(`mv.src.${k}_tip`) : undefined}>
          {k ? t(`mv.src.${k}`) : t("mv.src.all")} <span className="tabular">({fInt(k ? cnt(k) : rows.length)})</span></button>)}
      </div>
      {!shown.length ? <div className="text-mut text-[12.5px]">{t("mv.none")}</div> :
        <DataTable rows={shown} pageSize={15} keyFn={(r) => `${r.mbp_id}|${r.action}`} filename={`pba_move_candidates_${String(nop).replace(/\s+/g, "_").toLowerCase()}.csv`} columns={[
          { key: "mbp_id", label: "col.basecamp", render: (r) => <button className="text-navy font-semibold hover:underline" onClick={() => openMbp?.(data.mbps.find((m) => m.mbp_id === r.mbp_id))}>{nm(r.mbp_id)}</button>, csv: (r) => r.mbp_id },
          { key: "_op", label: "col.op_status", render: (r) => <OpTag op={r._op} />, csv: (r) => r._op },
          { key: "action", label: "mv.col.proposal", render: (r) => (r.action === "remove" ? t("mv.act.remove") : <span>{t("mv.act.move")} <b>★ {r.dest}</b><span className="text-mut"> · {r.city || ""} · {fKm(r.km)}</span></span>),
            csv: (r) => (r.action === "remove" ? "free the unit" : `move to ${r.dest} (${r.site})`) },
          { key: "sources", label: "mv.col.source", render: (r) => <span className="inline-flex flex-wrap gap-1">{r.sources.map((x) => <Tag key={x}>{t(`mv.src.${x}`)}</Tag>)}</span>, csv: (r) => r.sources.join("+") },
          { key: "impact", label: "mv.col.impact", wrap: true },
          { key: "feasible", label: "mv.col.check", render: (r) => (r.feasible ? <Tag tone="good">{t("cog.feas.ok")}</Tag> : <Tag tone="warn">{t("cog.feas.check")}</Tag>), csv: (r) => (r.feasible ? "feasible" : "check on site") },
          { key: "_u", label: "mv.col.test", plain: true, sortVal: () => 0, render: (r) => <button onClick={() => uji(r)} className="px-2 py-0.5 rounded bg-s7 text-white text-[12px] whitespace-nowrap">{t("mv.test")}</button>, csv: () => "" },
        ]} />}
      {worse > 0 && <div className="mt-1 text-[11.5px] text-slate">{t("mv.worse", { n: fInt(worse) })}</div>}
      <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("mv.foot")} <EvTag v="ESTIMATED" /></div>
    </Card>
  );
}
