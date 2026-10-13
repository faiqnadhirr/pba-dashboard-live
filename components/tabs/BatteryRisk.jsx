"use client";
// v5.0 — BBS › Battery Risk: where the battery backup may not hold against the PLN outages the site sees.
// Map + table on the same sites (Workspace). Measured, estimated and design BBT stay separate; every BBT keeps its evidence label;
// thresholds are the 120-min management design (60 / 30 / 0 min = 50 / 25 / 0 %). Correlation analysis is a separate page and does
// not feed the estimator (Kaplan-Meier on comparable sites, see BBS › BBT estimate).
import React, { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import { SiteBriefBbs } from "@/components/SiteBrief";
import { Chips, BbtCell, bbtCsv, LevelTag, StatusTag, EvTag, ActionLabel, fInt, fMin, fH, isNum } from "@/components/ui";
import { STATUS_ORDER } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";

const EVS = ["ACTUAL", "DERIVED", "ESTIMATED", "TICKET", "DERIVED-UNVERIFIED", "UNAVAILABLE"];

export default function BatteryRisk(ctx) {
  const { scope, cfg } = ctx;
  const [st, setSt] = useState([]), [ev, setEv] = useState([]), [pln, setPln] = useState(false);
  const rows = useMemo(() => scope.filter((s) => (!st.length || st.includes(s.bbt_status)) && (!ev.length || ev.includes(s.battery?.display?.evidence || "UNAVAILABLE"))
    && (!pln || (s.pln_known && (s.pln_freq || 0) > 0))), [scope, st, ev, pln]);
  const b = cfg.bbt, D = b.design_minutes;
  const cnt = useMemo(() => { const c = {}; for (const s of scope) { const e = s.battery?.display?.evidence || "UNAVAILABLE"; c[e] = (c[e] || 0) + 1; } return c; }, [scope]);
  const cols = [
    { key: "site_id", label: "col.site", render: (r) => <span className="inline-block max-w-[220px] truncate align-bottom" title={r.site_name}><b className="text-navy">{r.site_id}</b> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
    { key: "nop", label: "col.nop", render: (r) => String(r.nop || "").replace(/^NOP /, ""), csv: (r) => r.nop }, { key: "site_class", label: "col.class" },
    { key: "bbt", label: "col.bbt", num: true, sortVal: (r) => r.battery?.display?.value ?? null, render: (r) => <BbtCell r={r} />, csv: (r) => bbtCsv(r) },
    { key: "bbt_status", label: "brief.status", sortVal: (r) => STATUS_ORDER.indexOf(r.bbt_status), render: (r) => <StatusTag v={r.bbt_status} />, csv: (r) => r.bbt_status },
    { key: "bbt_design_min", label: "brief.design_site", num: true, render: (r) => <span>{fMin(r.bbt_design_min)} <EvTag v={r.bbt_design_evidence} /></span>, csv: (r) => `${r.bbt_design_min} ${r.bbt_design_evidence}` },
    { key: "pln_freq", label: "col.s14.pln_freq", plain: true, num: true, sortVal: (r) => (r.pln_known ? r.pln_freq : null), render: (r) => (r.pln_known ? fInt(r.pln_freq) : <span className="text-mut">{t("common.na")}</span>), csv: (r) => (r.pln_known ? r.pln_freq : "") },
    { key: "pln_total_h", label: "drawer.pln_dur", plain: true, num: true, sortVal: (r) => (r.pln_known ? r.pln_total_h : null), render: (r) => (r.pln_known ? fH(r.pln_total_h) : <span className="text-mut">{t("common.na")}</span>), csv: (r) => (r.pln_known ? r.pln_total_h?.toFixed(1) : "") },
    { key: "bbs_priority_score", label: "col.bbs_priority", num: true, render: (r) => <LevelTag kind="BBS" v={r.bbs_priority_level} />, csv: (r) => (r.bbs_priority_level ? `BBS-${r.bbs_priority_level}` : "") },
    { key: "recommended_action", label: "col.action", tdClass: "whitespace-normal", render: (r) => <span className="block line-clamp-2 min-w-[140px] max-w-[220px]"><ActionLabel r={r} /></span>, csv: (r) => r.recommended_action },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4 bg-white border border-line rounded-md px-3 py-2">
        <Chips label={t("bbs.f.status")} options={STATUS_ORDER} value={st} onChange={setSt} fmt={(o) => tv("status", o)} />
        <Chips label={t("risk.f.evidence")} options={EVS.filter((e) => cnt[e])} value={ev} onChange={setEv} fmt={(o) => `${o} (${fInt(cnt[o] || 0)})`} />
        <label className="inline-flex items-center gap-1.5 text-[12px] text-slate pb-1"><input type="checkbox" checked={pln} onChange={(e) => setPln(e.target.checked)} className="accent-navy" />{t("risk.f.pln")}</label>
        <span className="text-[11.5px] text-mut pb-1">{t("risk.thresholds", { d: D, a: Math.round(D * b.ok_pct), c: Math.round(D * b.degraded_pct), z: b.dead_max_minutes })}</span>
      </div>
      <Workspace ctx={ctx} rows={rows} modes={["bbsstatus", "bbtgap", "batch", "design"]} defaultMode="bbsstatus" columns={cols} showMbpLayers={false}
        title={t("risk.title")} sub={t("risk.sub")} filename="pba_battery_risk.csv" initialSort={{ key: "bbs_priority_score", dir: -1 }}
        detail={(s) => <SiteBriefBbs s={s} ctx={ctx} />} tableSub={t("risk.table_sub")}
        extraCsv={[{ key: "evidence", label: "BBT evidence", csv: (r) => r.battery?.display?.evidence || "UNAVAILABLE" }, { key: "precedence", label: "Status basis", csv: (r) => r.battery?.precedence },
          { key: "bbt_design_basis", label: "Design basis" }, { key: "rule", label: "Rule" }, { key: "reason", label: "Why" }]} />
    </div>
  );
}
