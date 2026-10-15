"use client";
// Scorecards (2026-10-14) — one tile = big number + "dari <denominator> (<share>)" + one context line + evidence tag + definition
// tooltip. A clickable tile opens exactly the counted records (lib/scorecards.js › SC). Missing data → N/A, never 0.
import React from "react";
import { InfoTip, EvTag, Meter, fInt, fPct, fNum } from "@/components/ui";
import { t } from "@/lib/i18n";

export const shareOf = (a, b, d = 1) => (b ? fPct((100 * a) / b, d) : t("common.na"));

export function Tile({ label, tip, value, of, sub, ev, badge, onClick, active = false, tone = "ink", children, className = "", na = false }) {
  const Box = onClick ? "button" : "div";
  return (
    <Box onClick={onClick} aria-pressed={onClick ? active : undefined} title={onClick ? t("sc.click") : undefined}
      className={`flex flex-col justify-start items-stretch text-left min-w-0 rounded-md border px-3 py-2 bg-white ${active ? "border-navy ring-2 ring-navy/30" : "border-line"} ${onClick ? "hover:border-slate cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" : ""} ${className}`}>
      <div className="flex flex-wrap items-start gap-1.5 text-[10.5px] uppercase tracking-wide font-semibold text-slate leading-tight min-h-[26px]">
        <span className="flex-1 min-w-[110px]"><InfoTip text={tip} label={label} /></span>{ev && <span className="shrink-0 normal-case tracking-normal"><EvTag v={ev} /></span>}{badge && <span className="shrink-0 normal-case tracking-normal">{badge}</span>}</div>
      {(value != null || na) && <div className={`text-[24px] leading-tight font-bold tabular ${na ? "text-mut" : tone === "crit" ? "text-crit" : tone === "good" ? "text-good" : "text-ink"}`}>{na ? t("common.na") : value}</div>}
      {of && <div className="text-[12px] text-slate tabular leading-snug">{of}</div>}
      {sub && <div className="text-[11px] text-mut leading-snug mt-0.5">{sub}</div>}
      {children}
    </Box>
  );
}

/** one factual sentence (no recommendation) */
export const Fact = ({ text }) => <div className="text-[13px] text-ink mb-2.5 leading-snug" role="note">{text}</div>;

export { Meter, fInt, fNum };
