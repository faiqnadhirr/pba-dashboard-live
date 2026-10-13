"use client";
// v5.0 — MBP › Resource Planning: one workflow for placement questions, reusing the existing engines unchanged.
// vNext — transparent planning workflow:
//   1 choose the planning question (four cards, one purpose each)
//   2 confirm the baseline (NOP, snapshot period, units, current reach, historical on time, model validation, availability assumption)
//   3–6 the chosen tool: scenario inputs → result vs baseline → affected sites / units → CSV export (inside each tool)
// Tools (engines unchanged):
//   scenario  — manual sandbox (lib/mbpperf.js › reachOf + replayDelta): move / add / remove base camps
//   units     — additional-unit sizing (lib/logic.js › placementPlan): greedy next unit, marginal benefit, stop condition
//   backtest  — relocation analysis (lib/mbpperf.js › backtestMove): ranked candidate moves; "Open in sandbox" hands one move to the
//               sandbox above (same scenario engine — no second move calculation); nothing is executed or approved
//   outage    — outage dispatch scenario (lib/logic.js › simulate): every simulated site gets an outcome
// Every result is a planning estimate (straight-line × road factor, assumed speeds, mobilisation) — not an approved deployment,
// and MBP availability is not known in real time.
import React, { useState } from "react";
import dynamic from "next/dynamic";
import { fInt, fPct, InfoTip } from "@/components/ui";
import { kpiFor } from "@/lib/kpi";
import { basecampCounts } from "@/lib/basecamp";
import NopPicker from "@/components/NopPicker";
import { CalibBadge } from "@/components/tabs/SimMap";
import { t } from "@/lib/i18n";
const SimMap = dynamic(() => import("@/components/tabs/SimMap"), { ssr: false });
const Placement = dynamic(() => import("@/components/tabs/Placement"), { ssr: false });
const Backtest = dynamic(() => import("@/components/tabs/Backtest"), { ssr: false });
const SimTab = dynamic(() => import("@/components/tabs/SimTab"), { ssr: false });

export const PLAN_SUBS = ["scenario", "units", "backtest", "outage"];
const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));

function Baseline({ ctx }) {
  const { nop, K, bcScope, hasJobs, data } = ctx;
  const k = kpiFor(K, nop), r = K?.byNop.get(nop), C = basecampCounts(bcScope);
  const snap = data.meta.snapshot || {};
  const Item = ({ label, value, tip }) => <div className="min-w-0"><div className="text-[10.5px] uppercase tracking-wide text-slate font-semibold">{tip ? <InfoTip text={tip} label={label} /> : label}</div><div className="text-[14px] font-semibold text-ink tabular">{value}</div></div>;
  return (
    <section className="bg-white border border-line rounded-lg px-4 py-2.5" aria-label={t("plan.base.title")}>
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-[11px] font-semibold text-white bg-navy rounded px-1.5">2</span>
        <h2 className="text-[13.5px] font-semibold text-navy">{t("plan.base.title")}</h2>
        <b className="text-ink text-[13.5px]">{nop}</b>
        <button onClick={() => ctx.setNop("All NOPs")} className="text-s1 underline text-[12px]">{t("sim2.change_nop")}</button>
        <CalibBadge calib={r?.calib || null} hasJobs={hasJobs} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Item label={t("plan.base.period")} value={`${snap.period_start || "2026-01-01"} → ${snap.period_end || "2026-06-30"}`} tip={t("plan.base.period_tip")} />
        <Item label={t("plan.base.units")} value={`${fInt(C.total)}${C.by.noloc ? ` · ${fInt(C.by.noloc)} ${t("ov.noloc")}` : ""}`} />
        <Item label={t("plan.base.sites")} value={k ? `${fInt(k.sites)} · ${fInt(k.p12_eval)} P1/P2` : t("common.na")} />
        <Item label={t("plan.base.reach")} value={k?.p12_eval ? `${fInt(k.p12_reach)}/${fInt(k.p12_eval)} · ${pc(k.p12_reach_pct)}` : t("common.na")} tip={t("snap.reach.tip")} />
        <Item label={t("plan.base.ontime")} value={hasJobs && k?.jobs_ontime_pct != null ? `${pc(k.jobs_ontime_pct)} · n ${fInt(k.jobs_judged)}` : t("common.na")} tip={t("snap.ontime.tip")} />
        <Item label={t("plan.base.avail")} value={t("plan.base.avail_v")} tip={t("plan.base.avail_tip")} />
      </div>
    </section>
  );
}

export default function PlanTab(ctx) {
  const [sub, setSubS] = useState(() => { try { const v = window.__pbaPlan; if (v) { window.__pbaPlan = null; return v; } } catch {} return "scenario"; });
  const setSub = (v) => { setSubS(v); try { const q = new URLSearchParams(window.location.search); q.set("plan", v); window.history.replaceState({}, "", `?${q}`); } catch {} };
  // relocation analysis → sandbox hand-off (one scenario engine): { nop, mbp_id, lat, lon, label }
  const [pending, setPending] = useState(null);
  const openInSandbox = (mv) => { if (mv.nop && mv.nop !== ctx.nop) ctx.setNop(mv.nop); setPending({ ...mv, at: Date.now() }); setSub("scenario"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const c2 = { ...ctx, openInSandbox, pending, clearPending: () => setPending(null) };
  return (
    <div className="space-y-3">
      <section aria-label={t("plan.q.title")}>
        <div className="flex items-center gap-2 mb-1.5"><span className="text-[11px] font-semibold text-white bg-navy rounded px-1.5">1</span>
          <h2 className="text-[13.5px] font-semibold text-navy">{t("plan.q.title")}</h2>
          <span className="text-[11.5px] text-[#8a5a00] ml-auto">{t("plan.disclaimer_short")} <InfoTip text={t("plan.disclaimer", { rf: ctx.cfg.travel.road_factor, mob: ctx.cfg.travel.mobilization_minutes })} label="" /></span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2" role="tablist" aria-label={t("plan.steps")}>
          {PLAN_SUBS.map((k) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
            className={`text-left rounded-md border px-3 py-2 ${sub === k ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-slate"}`}>
            <div className={`text-[13px] font-semibold ${sub === k ? "text-white" : "text-navy"}`}>{t(`plan.q.${k}`)}</div>
            <div className={`text-[11.5px] leading-snug ${sub === k ? "text-white/80" : "text-slate"}`}>{t(`plan.q.${k}_sub`)}</div>
            <div className={`text-[10.5px] uppercase tracking-wide mt-1 ${sub === k ? "text-white/60" : "text-mut"}`}>{t(`plan.sub.${k}`)}</div>
          </button>)}
        </div>
      </section>
      {ctx.nop === "All NOPs" ? <NopPicker K={ctx.K} allNops={ctx.allNops} setNop={ctx.setNop} title={t("plan.pick")} sub={t("plan.pick_sub")} /> : <>
        <Baseline ctx={ctx} />
        <div className="flex items-center gap-2"><span className="text-[11px] font-semibold text-white bg-navy rounded px-1.5">3</span>
          <h2 className="text-[13.5px] font-semibold text-navy">{t(`plan.q.${sub}`)}</h2><span className="text-[12px] text-slate">{t(`plan.steps_hint.${sub}`)}</span></div>
        {sub === "scenario" && <SimMap {...c2} />}
        {sub === "units" && <Placement {...c2} />}
        {sub === "backtest" && <Backtest {...c2} />}
        {sub === "outage" && <SimTab {...c2} />}
      </>}
    </div>
  );
}
