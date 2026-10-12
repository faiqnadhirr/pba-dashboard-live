"use client";
// v4.0 — the landing story (management view): three facts that matter, each with the number, how it is counted and where to act,
// plus whether the travel model reproduces the actual (no recommendation is trusted before that). Numbers come from the ONE KPI layer.
import React from "react";
import { fInt, fPct } from "@/components/ui";
import { kpiFor } from "@/lib/kpi";
import { t } from "@/lib/i18n";

const pc = (v, d = 0) => (v == null ? t("common.na") : fPct(100 * v, d));

function StoryCard({ n, tone, title, big, body, how, cta, onCta }) {
  const c = { crit: "border-crit/50 bg-crit/[0.04]", warn: "border-[#eb6834]/50 bg-[#eb6834]/[0.05]", good: "border-good/50 bg-good/[0.05]", navy: "border-navy/30 bg-white" }[tone];
  return (
    <div className={`border-2 rounded-lg p-3 flex flex-col ${c}`}>
      <div className="text-[11.5px] font-semibold text-slate uppercase tracking-wide">{n} · {title}</div>
      <div className="text-[28px] font-bold text-ink leading-tight tabular mt-0.5">{big}</div>
      <div className="text-[13px] text-ink mt-1 leading-snug">{body}</div>
      <div className="text-[11.5px] text-mut mt-1.5 leading-snug">{how}</div>
      {onCta && <button onClick={onCta} className="mt-auto pt-2 self-start text-[12.5px] text-s1 font-semibold hover:underline">{cta} →</button>}
    </div>
  );
}

export default function Story({ K, nop, navigate, area, data }) {
  const k = kpiFor(K, nop);
  if (!k) return null;
  const hasJobs = (data.tickets || []).length > 0, hasEv = (data.events || []).length > 0;
  const nops = K.nops.filter((r) => r.calib);
  const bad = nops.filter((r) => !r.calib.ok);
  const peak = K.nops.filter((r) => r.mbp && r.conc_p95 != null);
  const peakShare = peak.length ? peak.reduce((a, r) => a + r.conc_p95 / r.mbp, 0) / peak.length : null;
  const kp = nop === "All NOPs" ? null : K.byNop.get(nop);
  return (
    <div className="mb-4">
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <StoryCard n="1" tone="crit" title={t("story.need.title")}
          big={hasEv ? pc(k.p12_served_pct) : t("common.na")}
          body={hasEv ? t("story.need.body", { s: fInt(k.served_p12), n: fInt(k.need_p12), a: pc(k.served_pct), j: pc(k.jobs_ontime_pct) }) : t("story.need.na")}
          how={t("story.need.how")} cta={t("story.need.cta")} onCta={hasJobs ? () => navigate({ view: "mbp.performance" }) : null} />
        <StoryCard n="2" tone="warn" title={t("story.idle.title")}
          big={hasJobs ? pc(k.occupancy_median) : t("common.na")}
          body={hasJobs ? t("story.idle.body", { u: fInt(k.mbp), o: pc(k.occupancy), p: kp?.conc_p95 != null ? t("story.idle.peak_nop", { c: fInt(kp.conc_p95), u: fInt(kp.mbp) }) : peakShare != null ? t("story.idle.peak_all", { s: pc(peakShare) }) : "" }) : t("story.idle.na", { u: fInt(k.mbp) })}
          how={t("story.idle.how")} cta={t("story.idle.cta")} onCta={() => navigate({ view: "mbp.simmap" })} />
        <StoryCard n="3" tone="good" title={t("story.bat.title")}
          big={fInt(k.bbs_p1)}
          body={t("story.bat.body", { p1: fInt(k.bbs_p1), set: fInt(k.setting), rep: fInt(k.replace), up: fInt(k.upgrade) })}
          how={t("story.bat.how")} cta={t("story.bat.cta")} onCta={() => navigate({ view: "bbs.actions" })} />
        <StoryCard n="4" tone={!nops.length ? "navy" : bad.length ? "warn" : "good"} title={t("story.cal.title")}
          big={nops.length ? `${fInt(nops.length - bad.length)}/${fInt(nops.length)}` : t("common.na")}
          body={!nops.length ? t("story.cal.na") : kp ? (kp.calib ? t(kp.calib.ok ? "story.cal.nop_ok" : "story.cal.nop_bad", { a: pc(kp.calib.actual), m: pc(kp.calib.model), d: Math.abs(kp.calib.diff_pp).toFixed(1) }) : t("story.cal.na"))
            : t("story.cal.body", { list: bad.map((r) => `${r.nop.replace("NOP ", "")} ${r.calib.diff_pp > 0 ? "+" : "−"}${Math.abs(r.calib.diff_pp).toFixed(1)}`).join(", ") || "—" })}
          how={t("story.cal.how")} />
      </div>
      {area === "1" && nop !== "All NOPs" && k.tickets_unmatched > 100 && <div role="status" className="mt-2 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5">{t("story.gap", { n: fInt(k.tickets_unmatched), nop })}</div>}
      {area === "1" && nop === "All NOPs" && K.nops.some((r) => r.tickets_unmatched > 100) && <div role="status" className="mt-2 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5">
        {t("story.gap_all", { list: K.nops.filter((r) => r.tickets_unmatched > 100).map((r) => `${r.nop} (${fInt(r.tickets_unmatched)})`).join(", ") })}</div>}
    </div>
  );
}
