"use client";
// v3.7 — display helpers for MBP performance / utilisation classes (keys come from lib/mbpperf.js)
import React from "react";
import { PERF_KEYS, UTIL_KEYS, ONTIME_KEYS } from "@/lib/mbpperf";
import { t } from "@/lib/i18n";

export const PERF_COLOR = { low: "#d03b3b", watch: "#fab219", good: "#0ca30c", high: "#6b4bd8", under: "#A3ABB9", nodata: "#ffffff", none: "#E3E7ED" };
export const UTIL_COLOR = { high: "#6b4bd8", normal: "#2a78d6", under: "#A3ABB9", none: "#E3E7ED" };
export const ONTIME_COLOR = { low: "#d03b3b", watch: "#fab219", good: "#0ca30c", nodata: "#ffffff" };

export const perfLegend = () => PERF_KEYS.map((k) => ({ k, c: PERF_COLOR[k], label: t(`perf.key.${k}`), tip: t(`perf.key_tip.${k}`) }));

const Chip = ({ c, children, title }) => (
  <span title={title} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2 py-[1px] text-[11.5px]">
    <span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/30" style={{ background: c }} />{children}</span>
);
export const PerfTag = ({ k }) => <Chip c={PERF_COLOR[k]} title={t(`perf.key_tip.${k}`)}>{t(`perf.key.${k}`)}</Chip>;
export const UtilTag = ({ k }) => <Chip c={UTIL_COLOR[k]} title={t(`perf.util_tip.${k}`)}>{t(`perf.util.${k}`)}</Chip>;
export const OntimeTag = ({ k }) => <Chip c={ONTIME_COLOR[k]} title={t(`perf.ontime_tip.${k}`)}>{t(`perf.ontime.${k}`)}</Chip>;
export { PERF_KEYS, UTIL_KEYS, ONTIME_KEYS };

/** the formula box shown on every MBP performance screen (thresholds from Config) */
export function PerfFormula({ cfg }) {
  const c = cfg.mbp_perf || {};
  return (
    <div className="text-[12px] text-slate leading-relaxed">
      <b className="text-ink">{t("perf.formula.title")}</b> {t("perf.formula.body", {
        h: c.period_hours ?? 4344, j: c.min_jobs ?? 10, ub: Math.round(100 * (c.under_busy_max ?? 0.03)), uj: c.under_jobs_month_max ?? 2,
        hb: Math.round(100 * (c.high_busy_min ?? 0.25)), og: Math.round(100 * (c.ontime_good ?? 0.6)), ol: Math.round(100 * (c.ontime_low ?? 0.35)) })}
    </div>
  );
}
