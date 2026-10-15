"use client";
// v5.0 — MBP › Resource Planning: one workflow for placement questions, reusing the existing engines unchanged.
// Bucket 3 (2026-10-14) — three questions + ONE shared sandbox (engines unchanged):
//   units    "Butuh berapa unit tambahan?"            lib/logic.js › placementPlan (greedy next unit, knee, stop condition)
//   move     "Base camp mana yang lebih baik dipindah?" one candidate list (MoveCandidates.jsx): backtestMove (idle camps, gated by the
//            model validation) + basecampGravity (demand centre, moved here from MBP › History) + placementPlan › relocation (units that can be freed)
//   outage   "Kalau banyak site padam bersamaan?"     lib/logic.js › simulate (every simulated site gets an outcome; 5 outcome boxes)
//   sandbox  lib/mbpperf.js › reachOf + replayDelta — every question's proposal ("Uji" / "Open in sandbox") lands here; before → after
//            P1/P2 reach and replayed on-time (numerator / denominator). Nothing is executed or approved.
// Every result is a planning estimate (straight-line × road factor, assumed speeds, mobilisation) — not an approved deployment,
// and MBP availability is not known in real time.
import React, { useState } from "react";
import dynamic from "next/dynamic";
import { fInt, fPct, InfoTip } from "@/components/ui";
import { kpiFor } from "@/lib/kpi";
import { basecampCounts } from "@/lib/basecamp";
import NopPicker from "@/components/NopPicker";
import { CalibBadge, emptySandbox } from "@/components/tabs/SimMap";
import { ModeBadge } from "@/components/kit";
const EMPTY_SB = emptySandbox();
const Loading = () => <div role="status" className="h-40 rounded-lg border border-line bg-surface animate-pulse text-[12px] text-mut p-3">{t("common.loading")}</div>;
// what kind of numbers each question shows (labels only; components/kit.jsx › ModeBadge)
const MODES = { units: ["model"], move: ["replay", "model"], outage: ["scenario"], sandbox: ["model", "replay"] };
import { t } from "@/lib/i18n";
const SimMap = dynamic(() => import("@/components/tabs/SimMap"), { ssr: false, loading: () => <Loading /> });
const Placement = dynamic(() => import("@/components/tabs/Placement"), { ssr: false, loading: () => <Loading /> });
const Backtest = dynamic(() => import("@/components/tabs/Backtest"), { ssr: false, loading: () => <Loading /> });
const SimTab = dynamic(() => import("@/components/tabs/SimTab"), { ssr: false, loading: () => <Loading /> });
const MoveCandidates = dynamic(() => import("@/components/tabs/MoveCandidates"), { ssr: false, loading: () => <Loading /> });
const CogView = dynamic(() => import("@/components/tabs/HistoryTab").then((m) => m.CogView), { ssr: false });

// Bucket 3 (2026-10-14) — three planning questions + ONE shared sandbox. Old sub keys still resolve (scenario → sandbox, backtest → move).
export const PLAN_QS = ["units", "move", "outage"];
export const PLAN_SUBS = [...PLAN_QS, "sandbox"];
const ALIAS = { scenario: "sandbox", backtest: "move" };
export const planSub = (v) => (PLAN_SUBS.includes(ALIAS[v] || v) ? ALIAS[v] || v : "units");

// baseline strip: 4 items that are NOT sandbox measures (P1/P2 reach and replayed on-time are shown before → after in the sandbox)
function Baseline({ ctx }) {
  const { nop, K, bcScope, hasJobs, data } = ctx;
  const k = kpiFor(K, nop), r = K?.byNop.get(nop), C = basecampCounts(bcScope);
  const snap = data.meta.snapshot || {};
  const Item = ({ label, value, tip, go }) => <div className="min-w-0"><div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold">{tip ? <InfoTip text={tip} label={label} /> : label}</div>
    {go ? <button onClick={go} className="text-[14px] font-semibold text-ink tabular hover:underline text-left">{value} <span className="text-s1 text-[12px]">↗</span></button> : <div className="text-[14px] font-semibold text-ink tabular">{value}</div>}</div>;
  return (
    <section className="bg-white border border-line rounded-lg px-4 py-2.5" aria-label={t("plan.base.title")}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className="text-[13.5px] font-semibold text-navy">{t("plan.base.title")}</h2>
        <span className="text-[11.5px] text-mut" title={t("plan.base.period_tip")}>{`${snap.period_start || "2026-01-01"} → ${snap.period_end || "2026-06-30"}`}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Item label={t("plan.base.nop_units")} value={<span>{nop} · {fInt(C.total)} {t("plan.base.units_u")}{C.by.noloc ? <span className="text-mut font-normal"> · {fInt(C.by.noloc)} {t("ov.noloc")}</span> : ""}</span>} go={() => ctx.navigate({ view: "mbp.fleet" })} />
        <Item label={t("plan.base.sites")} value={k ? `${fInt(k.sites)} · ${fInt(k.p12_eval)} P1/P2` : t("common.na")} />
        <div className="min-w-0"><div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold"><InfoTip text={t("plan.base.valid_tip")} label={t("plan.base.valid")} /></div>
          <div className="mt-0.5"><CalibBadge calib={r?.calib || null} hasJobs={hasJobs} /></div></div>
        <Item label={t("plan.base.avail")} value={t("plan.base.avail_v")} tip={t("plan.base.avail_tip")} />
      </div>
    </section>
  );
}

export default function PlanTab(ctx) {
  const [sub, setSubS] = useState(() => { try { const v = window.__pbaPlan; if (v) { window.__pbaPlan = null; return planSub(v); } } catch {} return "units"; });
  const setSub = (v) => { v = planSub(v); setSubS(v); try { const q = new URLSearchParams(window.location.search); q.set("plan", v); window.history.replaceState({}, "", `?${q}`); } catch {} };
  // every question hands its proposal to the ONE sandbox: { kind: move | remove | add, nop, … }
  const [pending, setPending] = useState(null);
  const openInSandbox = (mv) => { if (mv.nop && mv.nop !== ctx.nop) ctx.setNop(mv.nop); setPending({ ...mv, at: Date.now() }); setSub("sandbox"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  // one scenario per NOP, kept while the user moves between questions / NOPs (only Reset or an explicit "replace" clears it)
  const [sbAll, setSbAll] = useState({});
  const sandbox = { get: (n) => sbAll[n] || EMPTY_SB, patch: (n, f) => setSbAll((A) => ({ ...A, [n]: f(A[n] || emptySandbox()) })) };
  const sbN = (() => { const x = sbAll[ctx.nop]; return x ? x.moves.size + x.added.length + x.removed.size : 0; })();
  const c2 = { ...ctx, openInSandbox, pending, clearPending: () => setPending(null), sandbox };
  const Q = ({ k, n }) => <button role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
    className={`text-left rounded-md border px-3 py-2 ${sub === k ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-slate"}`}>
    <div className={`text-[13px] font-semibold ${sub === k ? "text-white" : "text-navy"}`}>{n ? <span className={`mr-1 ${sub === k ? "text-white/70" : "text-mut"}`}>{n}</span> : null}{t(`plan.q.${k}`)}</div>
    <div className={`text-[11.5px] leading-snug ${sub === k ? "text-white/80" : "text-slate"}`}>{t(`plan.q.${k}_sub`)}</div>
    {k === "sandbox" && sbN > 0 && <div className={`mt-1 text-[11px] font-semibold ${sub === k ? "text-white" : "text-[#4a3aa7]"}`}>{t("plan.sb_changes", { n: sbN })}</div>}</button>;
  return (
    <div className="space-y-3">
      <section aria-label={t("plan.q.title")}>
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-[13.5px] font-semibold text-navy">{t("plan.q.title")}</h2>
          <span className="text-[11.5px] text-[#8a5a00] ml-auto">{t("plan.disclaimer_short")} <InfoTip text={t("plan.disclaimer", { rf: ctx.cfg.travel.road_factor, mob: ctx.cfg.travel.mobilization_minutes })} label="" /></span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_0.9fr] gap-2" role="tablist" aria-label={t("plan.steps")}>
          {PLAN_QS.map((k, i) => <Q key={k} k={k} n={i + 1} />)}
          <div className="xl:border-l xl:border-dashed xl:border-line xl:pl-2"><Q k="sandbox" /></div>
        </div>
      </section>
      {ctx.nop === "All NOPs" ? <NopPicker K={ctx.K} allNops={ctx.allNops} setNop={ctx.setNop} title={t("plan.pick")} sub={t("plan.pick_sub")} /> : <>
        <Baseline ctx={ctx} />
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[13.5px] font-semibold text-navy">{t(`plan.q.${sub}`)}</h2>{MODES[sub].map((m) => <ModeBadge key={m} kind={m} />)}<span className="text-[12px] text-slate">{t(`plan.steps_hint.${sub}`)}</span>
          <button onClick={() => ctx.setNop("All NOPs")} className="ml-auto text-s1 underline text-[12px]">{t("sim2.change_nop")}</button></div>
        {sub === "sandbox" && <SimMap {...c2} />}
        {sub === "units" && <Placement {...c2} />}
        {sub === "move" && <div className="space-y-3">
          <MoveCandidates {...c2} />
          <details className="bg-white border border-line rounded-lg px-4 py-2" open={!!ctx.sel && ctx.data.mbps.some((m) => m.mbp_id === ctx.sel)}>
            <summary className="cursor-pointer text-[13px] font-semibold text-navy">{t("plan.move.bt_detail")}</summary>
            <div className="mt-3"><Backtest {...c2} /></div></details>
          <details className="bg-white border border-line rounded-lg px-4 py-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-navy">{t("plan.move.cog_detail")}</summary>
            <div className="mt-3"><CogView ctx={c2} /></div></details>
        </div>}
        {sub === "outage" && <SimTab {...c2} />}
      </>}
    </div>
  );
}
