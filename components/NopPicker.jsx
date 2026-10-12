"use client";
// v4.0 — pick one NOP (simulation / fleet work per NOP): each card shows the units, P1/P2 reach and whether the model is calibrated there
import React from "react";
import { Card, fInt, fPct } from "@/components/ui";
import { t } from "@/lib/i18n";

export default function NopPicker({ K, allNops, setNop, title, sub }) {
  return (
    <Card title={title} sub={sub}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {allNops.map((n) => { const r = K?.byNop.get(n), c = r?.calib; return (
          <button key={n} onClick={() => setNop(n)} className="text-left border border-line rounded-md px-3 py-2 hover:border-navy hover:bg-surface">
            <div className="font-semibold text-ink text-[13px]">{n}</div>
            <div className="text-[11.5px] text-slate tabular">{t("pick.line", { u: fInt(r?.mbp), p: r?.p12_reach_pct == null ? t("common.na") : fPct(100 * r.p12_reach_pct, 0) })}</div>
            <div className={`text-[11.5px] font-semibold ${!c ? "text-mut" : c.ok ? "text-good" : "text-crit"}`}>{!c ? t("calib.na") : c.ok ? t("pick.calib_ok") : t("pick.calib_bad", { d: (c.diff_pp > 0 ? "+" : "−") + Math.abs(c.diff_pp).toFixed(1) })}</div>
          </button>); })}
      </div>
    </Card>
  );
}
