"use client";
// vNext — compact page heroes. Every number is read from the ONE KPI layer (lib/kpi.js › kpiFor) or basecamp_final
// (lib/basecamp.js › basecampCounts); nothing is recounted here. Three different questions are kept visibly apart:
//   · model reach   — priority sites the nearest base camp can reach before the battery runs out (ESTIMATED travel model)
//   · history       — Jan–Jun MBP jobs that arrived before the battery ran out (ACTUAL tickets)
//   · fleet status  — what the base camps did in Jan–Jun (one status per camp, basecamp_final)
// Missing data is N/A (never 0 %). Unverified BBT is a separate grey segment, not a failure.
import React from "react";
import { Meter, InfoTip, fInt, fPct, fNum, SEM } from "@/components/ui";
import { Tile, Fact, shareOf } from "@/components/Scorecards";
import { MONTHS } from "@/lib/mbpperf";
import { OP_KEYS, OP_COLOR } from "@/lib/opstatus";
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

export function ReachBlock({ k, partial, onReach, active = [] }) {
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
      <Meter parts={reachParts(k)} total={k.p12_eval} height={12} onSeg={onReach} active={active} />
      {onReach && <div className="text-[11px] text-mut mt-0.5">{t("snap.reach.click")}</div>}
    </Block>
  );
}

// Scorecards (2026-10-14) — Fleet snapshot = 8 tiles, every number "X dari Y". k = kpiFor (ONE KPI layer), C = opCounts() (basecamp_final),
// S = siteScore(scope) (lib/scorecards.js). Jobs tiles use the KPI layer's judged jobs (same set as jobs_ontime).
export function FleetSnapshot({ k, C, S, hasJobs, partial, onOp, active = [], onReach, onOntime, onDbl, dblActive = false }) {
  if (!k) return null;
  const st = OP_KEYS.map((x) => ({ k: x, label: t(`op.${x}`), v: C[x] || 0, c: OP_COLOR[x] }));
  const R = reachSplit(k), late = Math.max(0, (k.jobs_judged || 0) - (k.jobs_ontime || 0)), jobsOk = hasJobs && k.jobs_judged > 0;
  const fact = t("sc.f.fact", { a: fInt(R.ok), b: fInt(R.total), c: jobsOk ? fInt(k.jobs_ontime) : "—", d: jobsOk ? fInt(k.jobs_judged) : "—", e: fInt(S?.dbl ?? 0) });
  return (
    <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("snap.fleet.title")}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1">
        <h2 className="text-[15px] font-semibold text-navy">{t("snap.fleet.title")}</h2>
        <span className="text-[11.5px] text-mut">{t("sc.scope")}</span>
        {partial && <span className="text-[11.5px] text-[#8a5a00] cursor-help" title={t("a4.note")}>{t("snap.partial_chip")} ⓘ</span>}
      </div>
      <Fact text={fact} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Tile label={t("sc.f.units")} tip={t("sc.f.units_tip")} value={fInt(C.total)} of={t("sc.f.units_of", { l: fInt(k.mbp_located), n: fInt(C.total - (k.mbp_located || 0)) })} />
        <Tile label={t("sc.f.p12")} tip={t("sc.f.p12_tip")} value={fInt(k.p12)} of={t("sc.of_sites", { n: fInt(k.sites), p: shareOf(k.p12, k.sites) })}
          onClick={onReach ? () => onReach("ok+no+unv") : null} />
        <Tile label={t("sc.f.reach")} tip={t("snap.reach.tip_basis", { a: fInt(k.p12_reach_actual), e: fInt(k.p12_reach_estimated), d: fInt(k.p12_reach_derived), u: fInt(k.p12_unverified) })} ev="ESTIMATED"
          na={!R.total} value={fInt(R.ok)} of={t("sc.f.reach_of", { n: fInt(R.total), p: shareOf(R.ok, R.total) })}
          sub={t("sc.f.reach_sub", { no: fInt(R.no), u: fInt(R.unv) })}>
          {R.total > 0 && <div className="mt-1"><Meter parts={reachParts(k)} total={R.total} height={8} onSeg={onReach} active={active} showLegend={false} /></div>}
        </Tile>
        <Tile label={t("sc.f.ontime")} tip={t("snap.ontime.tip")} ev="ACTUAL" na={!jobsOk} value={fInt(k.jobs_ontime)}
          of={t("sc.f.ontime_of", { n: fInt(k.jobs_judged), p: shareOf(k.jobs_ontime, k.jobs_judged) })}
          sub={t("sc.f.ontime_sub", { j: fInt(k.jobs), x: fInt((k.jobs || 0) - (k.jobs_judged || 0)) })} onClick={jobsOk && onOntime ? onOntime : null} />
        <Tile label={t("sc.f.late")} tip={t("sc.f.late_tip")} na={!jobsOk || k.late_over_median == null} tone="crit"
          value={t("sc.min", { m: fInt(Math.round(k.late_over_median ?? 0)) })} of={t("sc.f.late_of", { n: fInt(k.late_over_n), l: fInt(late) })} sub={t("sc.f.late_sub")}
          onClick={jobsOk && onOntime ? onOntime : null} />
        <Tile label={t("sc.f.busy")} tip={t("sc.f.busy_tip")} na={!jobsOk || k.occupancy_median == null} value={fPct(100 * (k.occupancy_median || 0), 1)}
          of={t("sc.f.busy_of", { n: fInt(k.occupancy_n) })} sub={t("sc.f.busy_sub", { j: fNum((k.jobs || 0) / Math.max(1, C.total) / MONTHS, 0), a: fInt(k.jobs), u: fInt(C.total), m: MONTHS })} />
        <Tile label={t("snap.op.title")} tip={t("snap.op.tip")} value={null} className="md:col-span-1">
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-0.5 mb-1 text-[12px]">
            {OP_KEYS.map((x) => <button key={x} onClick={() => onOp?.(x)} aria-pressed={active.includes(x)} title={t(`op.tip.${x}`)}
              className={`inline-flex items-baseline gap-1 rounded px-1 -mx-1 text-left ${active.includes(x) ? "bg-navy/10 ring-1 ring-navy/40" : "hover:bg-surface"}`}>
              <span className="w-2 h-2 rounded-full inline-block self-center shrink-0" style={{ background: OP_COLOR[x] }} />
              <b className="text-[16px] tabular text-ink leading-none">{fInt(C[x] || 0)}</b> <span className="text-slate truncate">{t(`op.${x}`)}</span></button>)}
          </div>
          <Meter parts={st} total={C.total} onSeg={onOp} active={active} height={6} showLegend={false} />
          <div className="text-[11px] text-mut mt-0.5">{t("sc.f.status_of", { n: fInt(C.total), c: fInt(C.clean) })}</div>
        </Tile>
        <Tile label={t("sc.dbl")} tip={t("sc.dbl_tip")} tone="crit" na={!S || !S.p12_no && !S.dbl} value={fInt(S?.dbl ?? 0)}
          of={t("sc.dbl_of", { n: fInt(S?.p12_no ?? 0), p: shareOf(S?.dbl ?? 0, S?.p12_no ?? 0, 0) })} sub={t("sc.dbl_sub", { m: fInt(S?.dbl_meas ?? 0) })}
          onClick={onDbl} active={dblActive} />
      </div>
    </section>
  );
}

/** Coverage & Site Explorer hero: sites in scope + reach of the evaluable priority sites (same KPI layer) */
export function CoverageSnapshot({ k, shown, partial, eta, drill, onReach, active }) {
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
      <div className="max-w-[760px]"><ReachBlock k={k} partial={partial} onReach={onReach} active={active} /></div>
    </section>
  );
}
