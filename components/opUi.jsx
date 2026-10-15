"use client";
// Bucket 1 — display helpers for the operational base-camp status (lib/opstatus.js). The sentence is built only from existing fields.
import React from "react";
import { OP_KEYS, OP_COLOR, opStatus } from "@/lib/opstatus";
import { fInt, fPct, fNum } from "@/components/ui";
import { t } from "@/lib/i18n";

export const opLegend = () => OP_KEYS.map((k) => ({ k, c: OP_COLOR[k], label: t(`op.${k}`), tip: t(`op.tip.${k}`) }));
// OpTag = the kit badge (symbol + text + colour), kept under its old name for existing callers
export { OpBadge as OpTag } from "@/components/kit";
/** one sentence: why this base camp has its operational status (existing fields + Config thresholds only) */
export function opReason(b, cfg) {
  if (!b) return "";
  const c = cfg.mbp_perf || {}, o = opStatus(b, cfg);
  const v = { p: b.ontime_rate == null ? "—" : fPct(100 * b.ontime_rate, 0), n: fInt(b.judged), b: fPct(100 * (b.busy || 0), 1), j: fNum((b.jobs || 0) / 6, 1),
    low: Math.round(100 * (c.ontime_low ?? 0.35)), hb: Math.round(100 * (c.high_busy_min ?? 0.25)), min: c.min_jobs ?? 10,
    r: (b.clean_reasons || []).map((x) => t(`clean.${x}`)).join(", ") || "—" };
  const main = t(`op.why.${o.reason}`, v);
  return o.also.length ? `${main} ${o.also.map((a) => t(`op.also.${a}`, v)).join(" ")}` : main;
}
