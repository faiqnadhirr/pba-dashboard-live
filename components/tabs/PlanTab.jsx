"use client";
// v5.0 — MBP › Resource Planning: one workflow for placement questions, reusing the existing engines unchanged.
//   1 Scenario   — current placement as baseline, drag / add / remove base camps, sites that gain or lose reach, replay on actual jobs
//   2 Add units  — fleet size: how many extra units, where (greedy anchors), marginal dark hours, knee, cost per dark hour
//   3 Backtest   — relocation backtest of one base camp on the H1 jobs (gated by the model check)
//   4 Outage     — outage scenario: which MBP goes where when a set of sites loses PLN at the same time
// Every result is a planning estimate (straight-line × road factor, assumed speeds, mobilisation) — not an approved deployment.
import React, { useState } from "react";
import dynamic from "next/dynamic";
import { t } from "@/lib/i18n";
const SimMap = dynamic(() => import("@/components/tabs/SimMap"), { ssr: false });
const Placement = dynamic(() => import("@/components/tabs/Placement"), { ssr: false });
const Backtest = dynamic(() => import("@/components/tabs/Backtest"), { ssr: false });
const SimTab = dynamic(() => import("@/components/tabs/SimTab"), { ssr: false });

export const PLAN_SUBS = ["scenario", "units", "backtest", "outage"];

export default function PlanTab(ctx) {
  const [sub, setSubS] = useState(() => { try { const v = window.__pbaPlan; if (v) { window.__pbaPlan = null; return v; } } catch {} return "scenario"; });
  const setSub = (v) => { setSubS(v); try { const q = new URLSearchParams(window.location.search); q.set("plan", v); window.history.replaceState({}, "", `?${q}`); } catch {} };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md overflow-hidden border border-line" role="tablist" aria-label={t("plan.steps")}>
          {PLAN_SUBS.map((k, i) => <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
            className={`px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap ${sub === k ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{i + 1} · {t(`plan.sub.${k}`)}</button>)}
        </div>
        <span className="text-[12px] text-mut">{t(`plan.sub.${sub}_tip`)}</span>
      </div>
      <div className="text-[11.5px] text-[#8a5a00] bg-warn/10 border border-warn/40 rounded px-2 py-1">{t("plan.disclaimer", { rf: ctx.cfg.travel.road_factor, mob: ctx.cfg.travel.mobilization_minutes })}</div>
      {sub === "scenario" && <SimMap {...ctx} />}
      {sub === "units" && <Placement {...ctx} />}
      {sub === "backtest" && <Backtest {...ctx} />}
      {sub === "outage" && <SimTab {...ctx} />}
    </div>
  );
}
