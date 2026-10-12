"use client";
// v4.1 — four headline numbers above the map, in plain words. Each tile: the number, one line, and the detail in the ⓘ tooltip.
// All numbers come from the ONE KPI layer (lib/kpi.js). N/A = the data for this scope is not available yet.
import React from "react";
import { fInt, fPct } from "@/components/ui";
import { kpiFor } from "@/lib/kpi";
import { t } from "@/lib/i18n";

const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));

function Tile({ tone, title, big, line, tip, onClick }) {
  const c = { crit: "border-l-crit", warn: "border-l-[#eb6834]", good: "border-l-good", navy: "border-l-navy" }[tone];
  return (
    <button onClick={onClick} disabled={!onClick} title={tip}
      className={`text-left bg-white border border-line border-l-4 ${c} rounded-md px-3 py-2 hover:shadow disabled:hover:shadow-none disabled:cursor-default`}>
      <div className="text-[11.5px] font-semibold text-slate">{title} <span className="text-s1" aria-hidden>ⓘ</span></div>
      <div className="flex items-baseline gap-2"><span className="text-[24px] font-bold text-ink tabular leading-tight">{big}</span>
        <span className="text-[12px] text-slate leading-snug">{line}</span></div>
    </button>
  );
}

export default function Story({ K, nop, navigate, hasJobs }) {
  const k = kpiFor(K, nop);
  if (!k) return null;
  const hasEv = k.need > 0;
  const nops = K.nops.filter((r) => r.calib), bad = nops.filter((r) => !r.calib.ok);
  const kp = nop === "All NOPs" ? null : K.byNop.get(nop);
  const gaps = K.nops.filter((r) => r.tickets_unmatched > 100);
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        <Tile tone="crit" title={t("st.need")} big={hasEv ? pc(k.p12_served_pct) : t("common.na")}
          line={hasEv ? t("st.need_line", { s: fInt(k.served_p12), n: fInt(k.need_p12) }) : t("st.na")} tip={t("st.need_tip", { a: pc(k.served_pct) })}
          onClick={hasJobs ? () => navigate({ view: "mbp.performance" }) : null} />
        <Tile tone="warn" title={t("st.idle")} big={hasJobs ? pc(k.occupancy_median) : t("common.na")}
          line={hasJobs ? (kp?.conc_p95 != null ? t("st.idle_line_nop", { c: fInt(kp.conc_p95), u: fInt(kp.mbp) }) : t("st.idle_line", { u: fInt(k.occupancy_n) })) : t("st.na")} tip={t("st.idle_tip")} />
        <Tile tone="good" title={t("st.bat")} big={fInt(k.bbs_p1 + k.setting)}
          line={t("st.bat_line", { p1: fInt(k.bbs_p1), set: fInt(k.setting) })} tip={t("st.bat_tip", { rep: fInt(k.replace), up: fInt(k.upgrade) })}
          onClick={() => navigate({ view: "bbs.actions" })} />
        <Tile tone={!nops.length ? "navy" : kp ? (kp.calib?.ok ? "good" : "warn") : bad.length ? "warn" : "good"} title={t("st.cal")}
          big={kp ? (kp.calib ? (kp.calib.ok ? t("st.cal_ok") : t("st.cal_bad")) : t("common.na")) : nops.length ? `${fInt(nops.length - bad.length)}/${fInt(nops.length)}` : t("common.na")}
          line={kp ? (kp.calib ? t("st.cal_line_nop", { a: pc(kp.calib.actual), m: pc(kp.calib.model) }) : t("st.na")) : nops.length ? t("st.cal_line", { list: bad.map((r) => r.nop.replace("NOP ", "")).join(", ") || "—" }) : t("st.na")}
          tip={t("st.cal_tip")} />
      </div>
      {gaps.length > 0 && <div role="status" className="mt-2 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5">
        {t("st.gap", { list: gaps.map((r) => `${r.nop.replace("NOP ", "")} (${fInt(r.tickets_unmatched)})`).join(", ") })}</div>}
    </div>
  );
}
