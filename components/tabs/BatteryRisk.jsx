"use client";
// v5.0 — BBS › Battery Risk: where the battery backup may not hold against the PLN outages the site sees.
// Map + table on the same sites (Workspace). Measured, estimated and design BBT stay separate; every BBT keeps its evidence label;
// thresholds are the 120-min management design (60 / 30 / 0 min = 50 / 25 / 0 %). Correlation analysis is a separate page and does
// not feed the estimator (Kaplan-Meier on comparable sites, see BBS › BBT estimate).
import React, { useMemo, useState } from "react";
import Workspace from "@/components/Workspace";
import { CondBadge, EvBadge } from "@/components/kit";
import { SiteBriefBbs } from "@/components/SiteBrief";
import { BbtCell, bbtCsv, EvTag, Meter, InfoTip, fInt, fH, fPct } from "@/components/ui";
import { siteScore, SC } from "@/lib/scorecards";
import { Tile, Fact, shareOf } from "@/components/Scorecards";
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
  const [sg, setSgS] = useState([]), [eg, setEgS] = useState([]), [pln, setPlnS] = useState(false), [sc, setScS] = useState(null);
  // a scorecard click shows exactly its counted sites: it replaces the group / PLN filters (and vice versa)
  const setSg = (v) => { setScS(null); setSgS(v); }, setEg = (v) => { setScS(null); setEgS(v); }, setPln = (v) => { setScS(null); setPlnS(v); };
  const setSc = (k) => { setSgS([]); setEgS([]); setPlnS(false); setScS(sc === k ? null : k); };
  const S = useMemo(() => siteScore(scope), [scope]);
  const okP = (s) => !pln || (s.pln_known && (s.pln_freq || 0) > 0);
  const rows = useMemo(() => scope.filter((s) => (sc ? SC[sc](s) : (!sg.length || sg.includes(statusGroup(s))) && (!eg.length || eg.includes(evGroup(s))) && okP(s))), [scope, sg, eg, pln, sc]); // eslint-disable-line
  const b = cfg.bbt, D = b.design_minutes;
  const cntSt = useMemo(() => groupCounts(scope.filter((s) => (!eg.length || eg.includes(evGroup(s))) && okP(s))).st, [scope, eg, pln]); // eslint-disable-line
  const cntEv = useMemo(() => groupCounts(scope.filter((s) => (!sg.length || sg.includes(statusGroup(s))) && okP(s))).ev, [scope, sg, pln]); // eslint-disable-line
  // detailed status counts inside each group (tooltip) — the original six statuses stay visible
  const detail = useMemo(() => { const c = {}; for (const s of scope) if ((!eg.length || eg.includes(evGroup(s))) && okP(s)) c[s.bbt_status || "Unknown"] = (c[s.bbt_status || "Unknown"] || 0) + 1; return c; }, [scope, eg, pln]); // eslint-disable-line
  const evDetail = useMemo(() => { const c = {}; for (const s of scope) if ((!sg.length || sg.includes(statusGroup(s))) && okP(s)) c[evLabel(s)] = (c[evLabel(s)] || 0) + 1; return c; }, [scope, sg, pln]); // eslint-disable-line
  const nSt = STATUS_GROUPS.reduce((a, k) => a + cntSt[k], 0), nEv = EV_GROUPS.reduce((a, k) => a + cntEv[k], 0);
  const active = sg.length || eg.length || pln || sc;
  const thr = { d: D, a: Math.round(D * b.ok_pct), c: Math.round(D * b.degraded_pct), z: b.dead_max_minutes };
  const inGroup = (g) => STATUS_ORDER.filter((k) => (STATUS_GROUP_OF[k] || "unk") === g);
  const cols = [
    { key: "site_id", label: "col.site", render: (r) => <span className="inline-block max-w-[220px] truncate align-bottom" title={`${r.site_name} · ${r.nop}`}><b className="text-navy">{r.site_id}</b> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
    { key: "bbt_status", label: "cond.col.condition", sortVal: (r) => STATUS_ORDER.indexOf(r.bbt_status), render: (r) => <CondBadge s={r} />, csv: (r) => r.bbt_status },
    { key: "bbt", label: "col.bbt", num: true, sortVal: (r) => r.battery?.display?.value ?? null, render: (r) => <BbtCell r={r} noEv />, csv: (r) => bbtCsv(r) },
    { key: "evidence", label: "cond.col.evidence", sortVal: (r) => EV_GROUPS.indexOf(evGroup(r)), render: (r) => <EvBadge s={r} />, csv: (r) => evLabel(r) },
    { key: "pln_total_h", label: "fa.col.pln", num: true, plain: true, sortVal: (r) => (r.pln_known ? r.pln_total_h : null), render: (r) => (r.pln_known ? <span className="tabular">{fInt(r.pln_freq)}× · {fH(r.pln_total_h)}</span> : <span className="text-mut">{t("common.na")}</span>), csv: (r) => (r.pln_known ? r.pln_total_h?.toFixed(1) : "") },
  ];
  const XCSV = [{ key: "site_name", label: "Site name" }, { key: "nop", label: "NOP" }, { key: "site_class", label: "Class" },
    { key: "cond_group", label: "Condition group", csv: (r) => ({ act: "needs action", warn: "below design", ok: "meets design", unk: "unknown" })[statusGroup(r)] },
    { key: "ev_group", label: "Evidence group", csv: (r) => evGroup(r) }, { key: "precedence", label: "Status basis", csv: (r) => r.battery?.precedence },
    { key: "bbt_design_min", label: "Site design BBT (min)" }, { key: "bbt_design_evidence", label: "Design evidence" }, { key: "bbt_design_basis", label: "Design basis" },
    { key: "pln_freq", label: "PLN outages", csv: (r) => (r.pln_known ? r.pln_freq : "") },
    { key: "bbs_priority_level", label: "BBS priority", csv: (r) => (r.bbs_priority_level ? `BBS-${r.bbs_priority_level}` : "") }, { key: "recommended_action", label: "Recommended action" },
    { key: "rule", label: "Rule" }, { key: "reason", label: "Why" }];
  return (
    <div className="space-y-3">
      <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("cond.title")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 className="text-[15px] font-semibold text-navy">{t("cond.title")}</h2>
          <span className="text-[12.5px] text-slate">{active ? t("cond.scope_f", { n: fInt(rows.length), N: fInt(scope.length) }) : t("cond.scope_all", { N: fInt(scope.length) })}</span>
          <label className="inline-flex items-center gap-1.5 text-[12px] text-slate"><input type="checkbox" checked={pln} onChange={(e) => setPln(e.target.checked)} className="accent-navy" />{t("risk.f.pln")}</label>
          {sc && <span className="inline-flex items-center gap-1 bg-navy/10 border border-navy/30 rounded-full pl-2.5 pr-1 py-0.5 text-[12px] text-navy">{t("sc.chip_active", { k: t(`sc.chip.${sc}`) })}<button onClick={() => setScS(null)} aria-label={t("ws.clear")} className="w-5 h-5 rounded-full hover:bg-navy/20 leading-none">×</button></span>}
          {active ? <button onClick={() => { setSgS([]); setEgS([]); setPlnS(false); setScS(null); }} className="text-s1 underline text-[12px]">{t("cond.reset")}</button> : null}
          <span className="ml-auto text-[11.5px] text-mut"><InfoTip text={t("cond.design_tip", { d: D })} label={t("risk.thresholds", thr)} /></span>
        </div>
        <Fact text={t("sc.b.fact", { a: fInt(S.st.act), n: fInt(S.n), p: shareOf(S.st.act, S.n), b: fInt(S.below), m: fInt(S.meas_n), q: shareOf(S.below, S.meas_n, 0), d: D })} />
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
        {/* scorecards 4–9 (lib/scorecards.js): every tile "X dari Y"; a click shows exactly the counted sites */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mt-3 pt-3 border-t border-line">
          <Tile label={t("sc.b.bbt")} tip={t("sc.b.bbt_tip")} na={S.bbt_med_meas == null} value={t("sc.min", { m: fInt(Math.round(S.bbt_med_meas ?? 0)) })}
            of={t("sc.b.bbt_of", { n: fInt(S.meas_n), d: D })} sub={t("sc.b.bbt_sub", { g: `${(S.bbt_med_meas ?? 0) < D ? "−" : "+"}${fInt(Math.abs(Math.round((S.bbt_med_meas ?? 0) - D)))}` })} tone={S.bbt_med_meas != null && S.bbt_med_meas < D ? "crit" : "ink"} />
          <Tile label={t("sc.b.below")} tip={t("sc.b.below_tip", { d: D })} value={fInt(S.below)} of={t("sc.of_meas", { n: fInt(S.meas_n), p: shareOf(S.below, S.meas_n, 0) })}
            sub={t("sc.b.below_sub", { l: fInt(S.lt30), n: fInt(S.meas_n), p: shareOf(S.lt30, S.meas_n, 0) })} onClick={() => setSc("below")} active={sc === "below"} />
          <Tile label={t("sc.b.expo")} tip={t("sc.b.expo_tip")} value={fInt(S.expo)} of={t("sc.of_meas", { n: fInt(S.expo_den), p: shareOf(S.expo, S.expo_den, 1) })}
            sub={t("sc.b.expo_sub", { a: fInt(S.expo_all), n: fInt(S.pln_bbt_n), x: fInt(S.no_pln), m: fInt(Math.round(S.outage_med ?? 0)) })} onClick={() => setSc("expo")} active={sc === "expo"} />
          <Tile label={t("sc.b.p12bad")} tip={t("sc.b.p12bad_tip")} value={fInt(S.p12bad)} of={t("sc.b.p12bad_of", { n: fInt(S.p12), p: shareOf(S.p12bad, S.p12) })}
            sub={t("sc.b.p12bad_sub", { m: fInt(S.p12bad_meas) })} onClick={() => setSc("p12bad")} active={sc === "p12bad"} />
          <Tile label={t("sc.dbl")} tip={t("sc.dbl_tip")} tone="crit" value={fInt(S.dbl)} of={t("sc.dbl_of", { n: fInt(S.p12_no), p: shareOf(S.dbl, S.p12_no, 0) })}
            sub={t("sc.dbl_sub", { m: fInt(S.dbl_meas) })} onClick={() => setSc("dbl")} active={sc === "dbl"} />
          <Tile label={t("sc.b.follow")} tip={t("sc.b.follow_tip")} value={fInt(S.bbs_p1)} of={t("sc.b.follow_of", { n: fInt(S.bbs_any) })}
            sub={t("sc.b.follow_sub", { r: fInt(S.replace), u: fInt(S.upgrade), d: fInt(S.data) })} onClick={() => ctx.navigate({ view: "bbs.actions" })} />
        </div>
        {S.hot.length > 0 && <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-slate">
          <span className="font-semibold"><InfoTip text={t("sc.b.hot_tip")} label={t(`sc.b.hot_${S.hot_by}`)} /></span>
          {S.hot.map((h) => S.hot_by === "nop" ? <button key={h.g} onClick={() => ctx.setNop(h.g)} className="hover:underline tabular" title={t("sc.b.hot_click")}>
            <b className="text-ink">{String(h.g).replace(/^NOP /, "")}</b> {t("sc.b.hot_v", { a: fInt(h.act), n: fInt(h.n), p: fPct(100 * h.share, 0) })}</button>
            : <span key={h.g} className="tabular"><b className="text-ink">{h.g}</b> {t("sc.b.hot_v", { a: fInt(h.act), n: fInt(h.n), p: fPct(100 * h.share, 0) })}</span>)}
        </div>}
      </section>
      <Workspace ctx={ctx} rows={rows} modes={["bbsgroup"]} defaultMode="bbsgroup" columns={cols} showMbpLayers={false}
        title={t("risk.title")} sub={t("risk.sub")} filename="pba_battery_condition.csv" initialSort={{ key: "bbt_status", dir: 1 }}
        detail={(s) => <SiteBriefBbs s={s} ctx={ctx} page="cond" />}
        tableTitle={t("cond.table.title", { n: fInt(rows.length) })} tableSub={t("cond.table_sub")} extraCsv={XCSV} />
    </div>
  );
}
