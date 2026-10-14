"use client";
// v5.0 — BBS › Battery Risk: where the battery backup may not hold against the PLN outages the site sees.
// Map + table on the same sites (Workspace). Measured, estimated and design BBT stay separate; every BBT keeps its evidence label;
// thresholds are the 120-min management design (60 / 30 / 0 min = 50 / 25 / 0 %). Correlation analysis is a separate page and does
// not feed the estimator (Kaplan-Meier on comparable sites, see BBS › BBT estimate).
import React, { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import { SiteBriefBbs } from "@/components/SiteBrief";
import { BbtCell, bbtCsv, EvTag, Meter, InfoTip, fInt, fH } from "@/components/ui";
import { STATUS_GROUPS, STATUS_GROUP_OF, STATUS_GROUP_COLOR, statusGroup, EV_GROUPS, EV_GROUP_OF, EV_GROUP_COLOR, evGroup, evLabel, groupCounts } from "@/lib/bbsgroups";
import { STATUS_ORDER } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";

// Bucket 4 (2026-10-14) — Battery Condition: FOUR condition groups and FOUR evidence groups (lib/bbsgroups.js — display groups only;
// the detailed status and the original evidence label stay in the tooltip, the panel and the CSV). One map mode (condition group,
// hollow = not measured). Table: Site · Condition · BBT · Evidence · PLN exposure. "See follow-up" opens the site in Field Actions.
// A click on a group sets the filter → counts, map markers and table rows follow (each bar counts within the OTHER active filter).
const tog = (L, x) => (L.includes(x) ? L.filter((y) => y !== x) : [...L, x]);

export default function BatteryRisk(ctx) {
  const { scope, cfg } = ctx;
  const [sg, setSg] = useState([]), [eg, setEg] = useState([]), [pln, setPln] = useState(false);
  const okP = (s) => !pln || (s.pln_known && (s.pln_freq || 0) > 0);
  const rows = useMemo(() => scope.filter((s) => (!sg.length || sg.includes(statusGroup(s))) && (!eg.length || eg.includes(evGroup(s))) && okP(s)), [scope, sg, eg, pln]); // eslint-disable-line
  const b = cfg.bbt, D = b.design_minutes;
  const cntSt = useMemo(() => groupCounts(scope.filter((s) => (!eg.length || eg.includes(evGroup(s))) && okP(s))).st, [scope, eg, pln]); // eslint-disable-line
  const cntEv = useMemo(() => groupCounts(scope.filter((s) => (!sg.length || sg.includes(statusGroup(s))) && okP(s))).ev, [scope, sg, pln]); // eslint-disable-line
  // detailed status counts inside each group (tooltip) — the original six statuses stay visible
  const detail = useMemo(() => { const c = {}; for (const s of scope) if ((!eg.length || eg.includes(evGroup(s))) && okP(s)) c[s.bbt_status || "Unknown"] = (c[s.bbt_status || "Unknown"] || 0) + 1; return c; }, [scope, eg, pln]); // eslint-disable-line
  const evDetail = useMemo(() => { const c = {}; for (const s of scope) if ((!sg.length || sg.includes(statusGroup(s))) && okP(s)) c[evLabel(s)] = (c[evLabel(s)] || 0) + 1; return c; }, [scope, sg, pln]); // eslint-disable-line
  const nSt = STATUS_GROUPS.reduce((a, k) => a + cntSt[k], 0), nEv = EV_GROUPS.reduce((a, k) => a + cntEv[k], 0);
  const active = sg.length || eg.length || pln;
  const thr = { d: D, a: Math.round(D * b.ok_pct), c: Math.round(D * b.degraded_pct), z: b.dead_max_minutes };
  const inGroup = (g) => STATUS_ORDER.filter((k) => (STATUS_GROUP_OF[k] || "unk") === g);
  const cols = [
    { key: "site_id", label: "col.site", render: (r) => <span className="inline-block max-w-[220px] truncate align-bottom" title={`${r.site_name} · ${r.nop}`}><b className="text-navy">{r.site_id}</b> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
    { key: "bbt_status", label: "cond.col.condition", sortVal: (r) => STATUS_ORDER.indexOf(r.bbt_status), render: (r) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={tv("status", r.bbt_status)}>
      <span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/20" style={{ background: STATUS_GROUP_COLOR[statusGroup(r)] }} />{t(`sg.${statusGroup(r)}`).split(" (")[0]}<span className="text-mut text-[11px]">· {tv("status", r.bbt_status)}</span></span>, csv: (r) => r.bbt_status },
    { key: "bbt", label: "col.bbt", num: true, sortVal: (r) => r.battery?.display?.value ?? null, render: (r) => <BbtCell r={r} noEv />, csv: (r) => bbtCsv(r) },
    { key: "evidence", label: "cond.col.evidence", sortVal: (r) => EV_GROUPS.indexOf(evGroup(r)), render: (r) => <span className="inline-flex items-center gap-1 whitespace-nowrap" title={t(`cond.evl.${evLabel(r)}`)}>{t(`eg.${evGroup(r)}`)} <EvTag v={evLabel(r)} /></span>, csv: (r) => evLabel(r) },
    { key: "pln_total_h", label: "fa.col.pln", num: true, plain: true, sortVal: (r) => (r.pln_known ? r.pln_total_h : null), render: (r) => (r.pln_known ? <span className="tabular">{fInt(r.pln_freq)}× · {fH(r.pln_total_h)}</span> : <span className="text-mut">{t("common.na")}</span>), csv: (r) => (r.pln_known ? r.pln_total_h?.toFixed(1) : "") },
  ];
  const XCSV = [{ key: "site_name", label: "Site name" }, { key: "nop", label: "NOP" }, { key: "site_class", label: "Class" },
    { key: "cond_group", label: "Condition group", csv: (r) => ({ act: "needs action", warn: "below design", ok: "meets design", unk: "unknown" })[statusGroup(r)] },
    { key: "ev_group", label: "Evidence group", csv: (r) => evGroup(r) }, { key: "precedence", label: "Status basis", csv: (r) => r.battery?.precedence },
    { key: "bbt_design_min", label: "Site design BBT (min)" }, { key: "bbt_design_evidence", label: "Design evidence" }, { key: "bbt_design_basis", label: "Design basis" },
    { key: "pln_freq", label: "PLN outages", csv: (r) => (r.pln_known ? r.pln_freq : "") },
    { key: "bbs_priority_level", label: "BBS priority", csv: (r) => (r.bbs_priority_level ? `BBS-${r.bbs_priority_level}` : "") }, { key: "recommended_action", label: "Recommended action" },
    { key: "rule", label: "Rule" }, { key: "reason", label: "Why" }];
  const hasFollow = (s) => !!s.bbs_priority_level || s.action_type === "DATA";
  const follow = (s) => { ctx.setFocus?.({ ...ctx.focus, site: s.site_id }); ctx.navigate({ view: "bbs.actions" }); };
  return (
    <div className="space-y-3">
      <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("cond.title")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 className="text-[15px] font-semibold text-navy">{t("cond.title")}</h2>
          <span className="text-[12.5px] text-slate">{active ? t("cond.scope_f", { n: fInt(rows.length), N: fInt(scope.length) }) : t("cond.scope_all", { N: fInt(scope.length) })}</span>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-slate"><input type="checkbox" checked={pln} onChange={(e) => setPln(e.target.checked)} className="accent-navy" />{t("risk.f.pln")}</label>
          {active ? <button onClick={() => { setSg([]); setEg([]); setPln(false); }} className="text-s1 underline text-[12px]">{t("cond.reset")}</button> : null}
          <span className="ml-auto text-[11.5px] text-mut"><InfoTip text={t("cond.design_tip", { d: D })} label={t("risk.thresholds", thr)} /></span>
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1"><InfoTip text={t("cond.status_tip")} label={t("cond.status")} /></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mb-2">
              {STATUS_GROUPS.map((k) => { const on = sg.includes(k); return (
                <button key={k} onClick={() => setSg(tog(sg, k))} aria-pressed={on} disabled={!cntSt[k] && !on}
                  title={inGroup(k).map((x) => `${tv("status", x)} ${fInt(detail[x] || 0)} — ${t(`cond.st_tip.${x}`, thr)}`).join("\n")}
                  className={`text-left rounded-md border px-2 py-1.5 bg-white ${on ? "border-navy ring-1 ring-navy/40" : sg.length ? "border-line opacity-60" : "border-line hover:border-slate"} disabled:opacity-50 disabled:cursor-default`}>
                  <div className="flex items-start gap-1 text-[11.5px] text-slate leading-tight min-h-[28px]"><span className="w-2.5 h-2.5 mt-[1px] rounded-sm inline-block border border-navy/20 shrink-0" style={{ background: STATUS_GROUP_COLOR[k] }} />{t(`sg.${k}`)}</div>
                  <div className="text-[19px] font-bold tabular text-ink leading-tight">{fInt(cntSt[k])}</div>
                  {inGroup(k).length > 1 && <div className="text-[10.5px] text-mut leading-tight">{inGroup(k).map((x) => `${tv("status", x)} ${fInt(detail[x] || 0)}`).join(" · ")}</div>}</button>); })}
            </div>
            <Meter parts={STATUS_GROUPS.map((k) => ({ k, label: t(`sg.${k}`), v: cntSt[k], c: STATUS_GROUP_COLOR[k] }))} total={nSt} onSeg={(k) => setSg(tog(sg, k))} active={sg} showLegend={false} height={10} />
          </div>
          <div className="xl:border-l xl:border-line xl:pl-5">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1"><InfoTip text={t("cond.ev_tip")} label={t("cond.ev")} /></div>
            <Meter parts={EV_GROUPS.map((k) => ({ k, label: t(`eg.${k}`), v: cntEv[k], c: EV_GROUP_COLOR[k], hollow: k === "unverified" }))} total={nEv} onSeg={(k) => setEg(tog(eg, k))} active={eg} height={14} />
            <div className="text-[11px] text-mut mt-1.5">{EV_GROUPS.map((k) => `${t(`eg.${k}`)}: ${Object.entries(EV_GROUP_OF).filter(([, g]) => g === k).map(([e]) => `${e} ${fInt(evDetail[e] || 0)}`).filter((x) => !/ 0$/.test(x) || k !== "none").join(" + ")}`).join(" · ")}</div>
            <div className="text-[11px] text-mut mt-1">{t("cond.ev_note")}</div>
          </div>
        </div>
      </section>
      <Workspace ctx={ctx} rows={rows} modes={["bbsgroup"]} defaultMode="bbsgroup" columns={cols} showMbpLayers={false}
        title={t("risk.title")} sub={t("risk.sub")} filename="pba_battery_condition.csv" initialSort={{ key: "bbt_status", dir: 1 }}
        detail={(s) => <div className="space-y-2"><SiteBriefBbs s={s} ctx={ctx} />
          <button onClick={() => follow(s)} disabled={!hasFollow(s)} title={hasFollow(s) ? t("cond.follow_tip") : t("cond.follow_none")}
            className="w-full bg-navy text-white rounded py-1.5 text-[12.5px] disabled:opacity-40">{t("cond.follow")}</button></div>}
        tableTitle={t("cond.table.title", { n: fInt(rows.length) })} tableSub={t("cond.table_sub")} extraCsv={XCSV} />
    </div>
  );
}
