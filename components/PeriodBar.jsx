"use client";
// v3.4 — period buttons (Daily · Weekly · Monthly · Quarter · H1 · Custom) with ◀ ▶ stepper. The period lives in the URL (?per=).
import React from "react";
import { t } from "@/lib/i18n";
import { monthName } from "./ui";
import { GRANS, parsePeriod, withGran, step, dateOf, isoOf, fromIso, FIRST, LAST, Y } from "@/lib/period";

const dm = (i) => { const { m, d } = dateOf(i); return `${d} ${monthName(m - 1)}`; };
/** human label of a period, locale-aware */
export function periodLabel(P) {
  const { m: ma } = dateOf(P.a), { m: mb } = dateOf(P.b);
  if (P.gran === "h1") return t("per.lbl.h1", { y: Y });
  if (P.gran === "q") return t("per.lbl.q", { q: P.key.slice(2), y: Y, a: monthName(ma - 1), b: monthName(mb - 1) });
  if (P.gran === "m") return `${monthName(ma - 1)} ${Y}`;
  if (P.gran === "d") return `${dm(P.a)} ${Y}`;
  return ma === mb ? `${dateOf(P.a).d}–${dateOf(P.b).d} ${monthName(ma - 1)} ${Y}` : `${dm(P.a)} – ${dm(P.b)} ${Y}`;
}

export default function PeriodBar({ per, setPer, loading, error }) {
  const P = parsePeriod(per);
  const prev = step(P, -1), next = step(P, 1);
  const btn = (on) => `px-2 py-[3px] rounded-md border text-[12px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${on ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`;
  const arrow = "w-6 h-6 rounded-md border border-line bg-white text-slate hover:border-slate disabled:opacity-30 leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1";
  const setRange = (a, b) => { const x = fromIso(a), y = fromIso(b); if (x != null && y != null) setPer(`r:${isoOf(Math.min(x, y)).replace(/-/g, "")}-${isoOf(Math.max(x, y)).replace(/-/g, "")}`); };
  return (
    <div className="flex items-center gap-2 min-w-0" role="group" aria-label={t("per.label")}>
      <span className="text-[11px] uppercase tracking-wide text-mut font-semibold" title={t("per.tip")}>{t("per.label")}<span className="normal-case text-s1 ml-0.5 cursor-help">ⓘ</span></span>
      <div className="flex items-center gap-1">
        {GRANS.map((g) => <button key={g} aria-pressed={P.gran === g} onClick={() => setPer(withGran(P, g).key)} className={btn(P.gran === g)}>{t(`per.g.${g}`)}</button>)}
      </div>
      {P.gran !== "h1" && P.gran !== "r" && (
        <div className="flex items-center gap-1">
          <button className={arrow} disabled={!prev} onClick={() => prev && setPer(prev.key)} aria-label={t("per.prev")} title={t("per.prev")}>◀</button>
          <span className="text-[12.5px] font-semibold text-navy tabular whitespace-nowrap min-w-[120px] text-center">{periodLabel(P)}</span>
          <button className={arrow} disabled={!next} onClick={() => next && setPer(next.key)} aria-label={t("per.next")} title={t("per.next")}>▶</button>
        </div>)}
      {P.gran === "r" && (
        <div className="flex items-center gap-1 text-[12px]">
          <input type="date" aria-label={t("per.from")} value={isoOf(P.a)} min={isoOf(FIRST)} max={isoOf(LAST)} onChange={(e) => setRange(e.target.value, isoOf(P.b))}
            className="border border-line rounded-md px-1.5 py-[2px] bg-white text-ink tabular" />
          <span className="text-mut">→</span>
          <input type="date" aria-label={t("per.to")} value={isoOf(P.b)} min={isoOf(FIRST)} max={isoOf(LAST)} onChange={(e) => setRange(isoOf(P.a), e.target.value)}
            className="border border-line rounded-md px-1.5 py-[2px] bg-white text-ink tabular" />
          <span className="text-mut whitespace-nowrap">{t("per.days", { n: P.b - P.a + 1 })}</span>
        </div>)}
      {loading && <span className="text-[11.5px] text-s1 whitespace-nowrap" role="status">{t("per.loading")}</span>}
      {error && <span className="text-[11.5px] text-[#b42318] whitespace-nowrap" role="alert" title={error}>{t("per.error")}</span>}
    </div>
  );
}
