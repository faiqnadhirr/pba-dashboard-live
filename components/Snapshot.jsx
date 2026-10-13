"use client";
// vNext — compact page heroes. Every number is read from the ONE KPI layer (lib/kpi.js › kpiFor) or basecamp_final
// (lib/basecamp.js › basecampCounts); nothing is recounted here. Three different questions are kept visibly apart:
//   · model reach   — priority sites the nearest base camp can reach before the battery runs out (ESTIMATED travel model)
//   · history       — Jan–Jun MBP jobs that arrived before the battery ran out (ACTUAL tickets)
//   · fleet status  — what the base camps did in Jan–Jun (one status per camp, basecamp_final)
// Missing data is N/A (never 0 %). Unverified BBT is a separate grey segment, not a failure.
import React from "react";
import { Meter, InfoTip, fInt, fPct, SEM } from "@/components/ui";
import { PERF_KEYS, PERF_COLOR } from "@/components/perfUi";
import { t } from "@/lib/i18n";
import { reachSplit } from "@/lib/kpi";

const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));

/** reached / not reached / not verified, over the evaluable priority sites (p12_eval) */
export function reachParts(k) {
  const { ok, unv, no } = reachSplit(k);
  return [{ k: "ok", label: t("snap.reach.ok"), v: ok, c: SEM.good }, { k: "no", label: t("snap.reach.no"), v: no, c: SEM.crit },
    { k: "unv", label: t("snap.reach.unv"), v: unv, c: SEM.unk, hollow: true }];
}

function Block({ title, tip, children, className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1"><InfoTip text={tip} label={title} /></div>
      {children}
    </div>
  );
}

export function ReachBlock({ k, partial }) {
  if (!k || !k.p12_eval) return <Block title={t("snap.reach.title")} tip={t("snap.reach.tip")}>
    <div className="text-[22px] font-bold text-mut">{t("common.na")}</div>
    <div className="text-[12px] text-slate">{partial ? t("snap.partial_na") : t("snap.reach.none")}</div></Block>;
  return (
    <Block title={t("snap.reach.title")} tip={t("snap.reach.tip_basis", { a: fInt(k.p12_reach_actual), e: fInt(k.p12_reach_estimated), d: fInt(k.p12_reach_derived), u: fInt(k.p12_unverified) })}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[28px] leading-none font-bold tabular text-ink">{fInt(k.p12_reach)}</span>
        <span className="text-[15px] text-slate tabular">/ {fInt(k.p12_eval)}</span>
        <span className="text-[15px] font-semibold tabular text-ink">· {pc(k.p12_reach_pct)}</span>
      </div>
      <div className="text-[12px] text-slate mb-1.5">{t("snap.reach.line")}</div>
      <Meter parts={reachParts(k)} total={k.p12_eval} height={12} />
    </Block>
  );
}

export function FleetSnapshot({ k, C, hasJobs, partial, onStatus, active = [] }) {
  if (!k) return null;
  const st = PERF_KEYS.map((x) => ({ k: x, label: t(`perf.key.${x}`), v: C.by[x] || 0, c: PERF_COLOR[x] === "#ffffff" ? "#F1F3F6" : PERF_COLOR[x] }));
  return (
    <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("snap.fleet.title")}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-slate mb-3">
        <h2 className="text-[15px] font-semibold text-navy mr-1">{t("snap.fleet.title")}</h2>
        <span><b className="text-ink tabular">{fInt(C.total)}</b> {t("ov.units")}{C.by.noloc ? <span className="text-mut"> · {fInt(C.by.noloc)} {t("ov.noloc")}</span> : null}</span>
        <span><b className="text-ink tabular">{fInt(k.sites)}</b> {t("ov.sites")}</span>
        <span><b className="text-ink tabular">{fInt(k.p12_eval || k.p12)}</b> {t("snap.p12")}</span>
        {partial && <span className="text-[11.5px] text-[#8a5a00] cursor-help" title={t("a4.note")}>{t("snap.partial_chip")} ⓘ</span>}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)_minmax(0,1.1fr)]">
        <ReachBlock k={k} partial={partial} />
        <Block title={t("snap.ontime.title")} tip={t("snap.ontime.tip")} className="lg:border-l lg:border-line lg:pl-5">
          {hasJobs && k.jobs_ontime_pct != null ? <>
            <div className="flex items-baseline gap-2"><span className="text-[28px] leading-none font-bold tabular text-ink">{pc(k.jobs_ontime_pct)}</span></div>
            <div className="text-[12px] text-slate mb-1.5">{t("snap.ontime.line", { a: fInt(k.jobs_ontime), n: fInt(k.jobs_judged) })}</div>
            <Meter showLegend={false} height={8} total={k.jobs_judged} parts={[{ k: "ok", label: t("snap.ontime.ok"), v: k.jobs_ontime, c: SEM.good }, { k: "late", label: t("snap.ontime.late"), v: Math.max(0, k.jobs_judged - k.jobs_ontime), c: SEM.crit }]} />
          </> : <><div className="text-[22px] font-bold text-mut">{t("common.na")}</div><div className="text-[12px] text-slate">{t("snap.no_jobs")}</div></>}
        </Block>
        <Block title={t("snap.status.title")} tip={t("snap.status.tip")} className="lg:border-l lg:border-line lg:pl-5">
          {hasJobs ? <>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-1.5 text-[13px]">
              {["under", "high", "low"].map((x) => <button key={x} onClick={() => onStatus?.(x)} aria-pressed={active.includes(x)}
                className={`inline-flex items-baseline gap-1 rounded px-1 -mx-1 ${active.includes(x) ? "bg-navy/10 ring-1 ring-navy/40" : "hover:bg-surface"}`}>
                <span className="w-2.5 h-2.5 rounded-sm inline-block self-center" style={{ background: PERF_COLOR[x] }} />
                <b className="text-[20px] tabular text-ink leading-none">{fInt(C.by[x] || 0)}</b> <span className="text-slate">{t(`ov.st.${x}`)}</span></button>)}
            </div>
            <Meter parts={st} total={C.total} onSeg={onStatus} active={active} height={10} showLegend={false} />
            <div className="text-[11px] text-mut mt-1">{t("snap.status.line", { n: fInt(C.total) })}</div>
          </> : <><div className="text-[22px] font-bold text-mut">{t("common.na")}</div><div className="text-[12px] text-slate">{t("snap.no_jobs")}</div></>}
        </Block>
      </div>
    </section>
  );
}

/** Coverage & Site Explorer hero: sites in scope + reach of the evaluable priority sites (same KPI layer) */
export function CoverageSnapshot({ k, shown, partial, eta, drill }) {
  if (!k) return null;
  return (
    <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("snap.cov.title")}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-slate mb-3">
        <h2 className="text-[15px] font-semibold text-navy mr-1">{t("snap.cov.title")}</h2>
        <span><b className="text-ink tabular text-[15px]">{fInt(k.sites)}</b> {t("ov.sites")}</span>
        <span><b className="text-ink tabular">{fInt(k.p12_eval)}</b> {t("snap.p12_eval")}</span>
        {drill && <span className="text-[11.5px] text-mut">{t("snap.cov.drill", { n: fInt(shown) })}</span>}
        <span className="ml-auto text-[12px]">{eta}</span>
        {partial && <span className="text-[11.5px] text-[#8a5a00] cursor-help" title={t("a4.note")}>{t("snap.partial_chip")} ⓘ</span>}
      </div>
      <div className="max-w-[760px]"><ReachBlock k={k} partial={partial} /></div>
    </section>
  );
}
