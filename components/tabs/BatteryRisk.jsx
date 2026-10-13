"use client";
// v5.0 — BBS › Battery Risk: where the battery backup may not hold against the PLN outages the site sees.
// Map + table on the same sites (Workspace). Measured, estimated and design BBT stay separate; every BBT keeps its evidence label;
// thresholds are the 120-min management design (60 / 30 / 0 min = 50 / 25 / 0 %). Correlation analysis is a separate page and does
// not feed the estimator (Kaplan-Meier on comparable sites, see BBS › BBT estimate).
import React, { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import { SiteBriefBbs } from "@/components/SiteBrief";
import { BbtCell, bbtCsv, LevelTag, StatusTag, EvTag, ActionLabel, Meter, InfoTip, STATUS, EVID, fInt, fMin, fH, isNum } from "@/components/ui";
import { STATUS_ORDER } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";

// vNext — renamed "Kondisi Baterai / Battery Condition". Hero: battery status (scorecards + bar) and BBT evidence (separate bar) —
// two dimensions, never one chart. A click on a status / evidence segment sets the filter → counts, map markers and table rows follow.
// The five brief categories are always shown (0 = none in scope); TICKET only appears when the data has it (kept separate).
const EVS = ["ACTUAL", "DERIVED", "ESTIMATED", "DERIVED-UNVERIFIED", "UNAVAILABLE", "TICKET"];
const EV_BASE = new Set(["ACTUAL", "DERIVED", "ESTIMATED", "DERIVED-UNVERIFIED", "UNAVAILABLE"]);
const evOf = (s) => s.battery?.display?.evidence || "UNAVAILABLE";
const tog = (L, x) => (L.includes(x) ? L.filter((y) => y !== x) : [...L, x]);

export default function BatteryRisk(ctx) {
  const { scope, cfg } = ctx;
  const [st, setSt] = useState([]), [ev, setEv] = useState([]), [pln, setPln] = useState(false);
  const okP = (s) => !pln || (s.pln_known && (s.pln_freq || 0) > 0);
  const rows = useMemo(() => scope.filter((s) => (!st.length || st.includes(s.bbt_status)) && (!ev.length || ev.includes(evOf(s))) && okP(s)), [scope, st, ev, pln]); // eslint-disable-line
  const b = cfg.bbt, D = b.design_minutes;
  // each bar counts within the OTHER active filters (status bar follows the evidence filter and vice versa)
  const cntSt = useMemo(() => { const c = {}; for (const s of scope) if ((!ev.length || ev.includes(evOf(s))) && okP(s)) c[s.bbt_status || "Unknown"] = (c[s.bbt_status || "Unknown"] || 0) + 1; return c; }, [scope, ev, pln]); // eslint-disable-line
  const cnt = useMemo(() => { const c = {}; for (const s of scope) if ((!st.length || st.includes(s.bbt_status)) && okP(s)) c[evOf(s)] = (c[evOf(s)] || 0) + 1; return c; }, [scope, st, pln]); // eslint-disable-line
  const evShown = EVS.filter((e) => EV_BASE.has(e) || cnt[e]);
  const nSt = STATUS_ORDER.reduce((a, k) => a + (cntSt[k] || 0), 0), nEv = evShown.reduce((a, k) => a + (cnt[k] || 0), 0);
  const active = st.length || ev.length || pln;
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
      <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("cond.title")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 className="text-[15px] font-semibold text-navy">{t("cond.title")}</h2>
          <span className="text-[12.5px] text-slate">{active ? t("cond.scope_f", { n: fInt(rows.length), N: fInt(scope.length) }) : t("cond.scope_all", { N: fInt(scope.length) })}</span>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-slate"><input type="checkbox" checked={pln} onChange={(e) => setPln(e.target.checked)} className="accent-navy" />{t("risk.f.pln")}</label>
          {active ? <button onClick={() => { setSt([]); setEv([]); setPln(false); }} className="text-s1 underline text-[12px]">{t("cond.reset")}</button> : null}
          <span className="ml-auto text-[11.5px] text-mut"><InfoTip text={t("cond.design_tip", { d: D })} label={t("risk.thresholds", { d: D, a: Math.round(D * b.ok_pct), c: Math.round(D * b.degraded_pct), z: b.dead_max_minutes })} /></span>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1"><InfoTip text={t("cond.status_tip")} label={t("cond.status")} /></div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 mb-2">
              {STATUS_ORDER.map((k) => { const on = st.includes(k); return (
                <button key={k} onClick={() => setSt(tog(st, k))} aria-pressed={on} disabled={!cntSt[k] && !on} title={t(`cond.st_tip.${k}`, { d: D, a: Math.round(D * b.ok_pct), c: Math.round(D * b.degraded_pct), z: b.dead_max_minutes })}
                  className={`text-left rounded-md border px-2 py-1.5 bg-white ${on ? "border-navy ring-1 ring-navy/40" : st.length ? "border-line opacity-60" : "border-line hover:border-slate"} disabled:opacity-50 disabled:cursor-default`}>
                  <div className="flex items-start gap-1 text-[11px] text-slate leading-tight min-h-[26px]"><span className="w-2.5 h-2.5 mt-[1px] rounded-sm inline-block border border-navy/20 shrink-0" style={{ background: STATUS[k].c }} />{tv("status", k)}</div>
                  <div className="text-[18px] font-bold tabular text-ink leading-tight">{fInt(cntSt[k] || 0)}</div></button>); })}
            </div>
            <Meter parts={STATUS_ORDER.map((k) => ({ k, label: tv("status", k), v: cntSt[k] || 0, c: STATUS[k].c }))} total={nSt} onSeg={(k) => setSt(tog(st, k))} active={st} showLegend={false} height={10} />
          </div>
          <div className="xl:border-l xl:border-line xl:pl-5">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1"><InfoTip text={t("cond.ev_tip")} label={t("cond.ev")} /></div>
            <Meter parts={evShown.map((k) => ({ k, label: t(`cond.evl.${k}`), v: cnt[k] || 0, c: EVID[k].c, hollow: k === "DERIVED-UNVERIFIED" }))} total={nEv} onSeg={(k) => setEv(tog(ev, k))} active={ev} height={14} />
            <div className="text-[11px] text-mut mt-1.5">{t("cond.ev_note")}</div>
          </div>
        </div>
      </section>
      <Workspace ctx={ctx} rows={rows} modes={["bbsstatus", "bbtgap", "design", "batch"]} defaultMode="bbsstatus" columns={cols} showMbpLayers={false}
        title={t("risk.title")} sub={t("risk.sub")} filename="pba_battery_risk.csv" initialSort={{ key: "bbs_priority_score", dir: -1 }}
        detail={(s) => <SiteBriefBbs s={s} ctx={ctx} />} tableSub={t("risk.table_sub")}
        extraCsv={[{ key: "evidence", label: "BBT evidence", csv: (r) => r.battery?.display?.evidence || "UNAVAILABLE" }, { key: "precedence", label: "Status basis", csv: (r) => r.battery?.precedence },
          { key: "bbt_design_basis", label: "Design basis" }, { key: "rule", label: "Rule" }, { key: "reason", label: "Why" }]} />
    </div>
  );
}
