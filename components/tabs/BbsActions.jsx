"use client";
import React, { useMemo, useState } from "react";
import { Card, Kpi, Note, Method, DataTable, Chips, ActionLabel, LevelTag, BbtCell, bbtCsv, StatusTag, EvTag, Tag, EvidenceTable, AvailTriple, Bar100, Gloss, fInt, fMin, fH, fPct, isNum } from "@/components/ui";
import { STATUS_ORDER, ACTION_TYPES } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { coverageGap } from "@/lib/view";
import Workspace from "@/components/Workspace";
import { SiteBriefBbs } from "@/components/SiteBrief";

const LV = ["P1", "P2", "P3", "P4"];
const PROB = ["Dead", "Critical", "Degraded"];

// vNext — "Tindak Lanjut Lapangan / Field Actions": four concepts kept apart — BBS priority (P1–P4), battery condition (status),
// evidence (BBT source) and the recommended next field action (rule engine, unchanged). "Batch n" was 1:1 with BBS-Pn, so the main
// view shows the priority plus its suggested response window; the batch label stays in the CSV. No execution system is integrated,
// so the worklist says "Recommended next action", not "work status".
export default function BbsActions(props) {
  // v5.0 — the action list and the map are one workspace: chips / type tiles filter the records, the map shows exactly those
  const { scope: scopeAll, cfg, setPick, openDrill, period } = props;
  const scope = scopeAll;
  const fx = !!period && period.gran !== "h1";
  const [lv, setLv] = useState([]), [st, setSt] = useState([]), [ev, setEv] = useState([]), [ac, setAc] = useState([]), [at, setAt] = useState([]);
  // v3.7 — "collect data" sites (no BBT evidence) have no BBS priority; they join the list only when that action type is picked (field worklist)
  const all = useMemo(() => scope.filter((s) => s.bbs_priority_level || (at.includes("DATA") && s.action_type === "DATA"))
    .sort((a, b) => (b.bbs_priority_score ?? -1) - (a.bbs_priority_score ?? -1)), [scope, at]);
  const actions = useMemo(() => [...new Set(all.map((s) => s.recommended_action))].sort(), [all]);
  const rows = all.filter((s) => (!lv.length || lv.includes(s.bbs_priority_level)) && (!st.length || st.includes(s.bbt_status))
    && (!ev.length || ev.includes(s.battery.source)) && (!ac.length || ac.includes(s.recommended_action)) && (!at.length || at.includes(s.action_type)));
  const typeCount = useMemo(() => Object.fromEntries(ACTION_TYPES.map((k) => [k, scopeAll.filter((s) => s.action_type === k).length])), [scopeAll]);
  const pickType = (k) => { setAt(at.length === 1 && at[0] === k ? [] : [k]); setLv([]); setSt([]); setEv([]); setAc([]); };
  const c = (f) => rows.filter(f).length;
  const b = cfg.bbt;
  const EXPAND = (r) => (
              <div className="space-y-2">
                {r.battery.conflict && <Note tone="warn"><b>{t("bbs.conflict")}:</b> {te(r.battery.conflict, "conflict")}</Note>}
                <div className="text-[12px] text-slate">{t("bbs.basis")}: <b className="text-ink">{te(r.battery.precedence, "prec")}</b> · {t("ev.rule")} {te(r.rule, "rule")} · {t("fa.window")}: {t(`batch.${r.bbs_priority_level}.when`)}{r.priority_floor ? ` · ${t("bbs.floor", { a: `BBS-${r.priority_floor}`, b: `BBS-${r.bbs_priority_level}` })}` : ""}</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate">
                  <span>{t("col.bbt_gap")}: <b className="text-ink">{r.bbt_gap_ratio == null ? "—" : fPct(100 * r.bbt_gap_ratio, 0)}</b></span>
                  <span>{t("col.power_downtime")}: <b className="text-ink">{fH(r.ran_power_down_h)}</b></span>
                  <span>{t("col.avail_triple")}: <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact /></span></div>
                <EvidenceTable rows={r.evidence} action={r.recommended_action} />
                <button className="text-[12px] text-s1 underline" onClick={() => props.setPick(r)}>{t("common.open_detail")}</button>
              </div>
            );
  // worklist: 1 priority · 2 site · 3 condition · 4 evidence · 5 PLN exposure · 6 recommended next action · 7 reason
  const COLS = [
              { key: "bbs_priority_score", label: "col.bbs_priority", num: true, render: (r) => <span title={t("bbs.cutoffs", { p1: cfg.bbs_priority_levels.P1, p2: cfg.bbs_priority_levels.P2, p3: cfg.bbs_priority_levels.P3, s: r.bbs_priority_score?.toFixed(3) })}><LevelTag kind="BBS" v={r.bbs_priority_level} /></span>, csv: (r) => (r.bbs_priority_level ? `BBS-${r.bbs_priority_level} ${r.bbs_priority_score?.toFixed(3)}` : "") },
              { key: "site_id", label: "col.site", render: (r) => <span className="inline-block max-w-[210px] truncate align-bottom" title={`${r.site_name} · ${r.nop}`}><span className="font-semibold text-navy">{r.site_id}</span> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
              { key: "bbt_status", label: "fa.col.condition", sortVal: (r) => STATUS_ORDER.indexOf(r.bbt_status), render: (r) => <BbtCell r={r} statusFirst noEv />, csv: (r) => `${r.bbt_status} ${bbtCsv(r)}` },
              { key: "evidence", label: "fa.col.evidence", sortVal: (r) => r.battery?.display?.evidence || "UNAVAILABLE", render: (r) => <EvTag v={r.battery?.display?.evidence || "UNAVAILABLE"} />, csv: (r) => r.battery?.display?.evidence || "UNAVAILABLE" },
              { key: "pln_total_h", label: "fa.col.pln", num: true, plain: true, sortVal: (r) => (r.pln_known ? r.pln_total_h : null), render: (r) => (r.pln_known ? <span className="tabular">{fInt(r.pln_freq)}× · {fH(r.pln_total_h)}</span> : <span className="text-mut">{t("common.na")}</span>), csv: (r) => (r.pln_known ? `${r.pln_freq} / ${r.pln_total_h?.toFixed(1)} h` : "") },
              { key: "recommended_action", label: "fa.col.action", wrap: true, render: (r) => <span className="font-medium"><ActionLabel r={r} />{r.mbp_standby_flag ? <> <Tag tone="warn">{t("bbs.standby")}</Tag></> : null}</span>, csv: (r) => r.recommended_action },
              { key: "reason", label: "fa.col.reason", tdClass: "whitespace-normal", render: (r) => <span className="block line-clamp-2 min-w-[180px] max-w-[320px] text-[12px] text-slate">{te(r.rule, "rule") || "—"}</span>, csv: (r) => r.reason },
            ];
  const XCSV = [
              { key: "site_name", label: "Site name" }, { key: "nop", label: "NOP" }, { key: "site_class", label: "Class" }, { key: "rule", label: "Rule" }, { key: "action_batch", label: "Batch" },
              { key: "bbt_gap_ratio", label: "BBT vs design (%)", csv: (r) => (r.bbt_gap_ratio == null ? "" : (100 * r.bbt_gap_ratio).toFixed(0)) }, { key: "ran_power_down_h", label: "Power downtime (h)", csv: (r) => r.ran_power_down_h?.toFixed(1) ?? "" },
              { key: "avail_wc_pct", label: "Availability / target / gap", csv: (r) => (isNum(r.avail_wc_pct) ? `${r.avail_wc_pct.toFixed(2)} / ${r.ran_target_pct.toFixed(2)} / ${r.avail_delta_pp.toFixed(2)}` : "") },
              { key: "precedence", label: "Status basis", csv: (r) => r.battery.precedence }, { key: "conflict", label: "Evidence conflict", csv: (r) => r.battery.conflict || "" },
              { key: "reason", label: "Why" }, { key: "pln_freq", label: "PLN outages", csv: (r) => (r.pln_known ? r.pln_freq : "") }, { key: "dependency_children", label: "Dependency (PROXY)" },
              { key: "eta_min", label: "MBP ETA (min)", csv: (r) => (isNum(r.eta_min) ? Math.round(r.eta_min) : "") }, { key: "can_arrive_before_bbt", label: "MBP arrives before BBT" }, { key: "coverage_gap", label: "coverage_gap", csv: (r) => String(coverageGap(r)) },
            ];
  // battery vs design distribution (all sites in scope, measured vs estimated kept apart)
  const dist = useMemo(() => STATUS_ORDER.map((k) => ({
    k, measured: scope.filter((s) => s.bbt_status === k && s.battery.measured).length,
    estimated: scope.filter((s) => s.bbt_status === k && !s.battery.measured && s.battery.source === "ESTIMATED").length,
    ticket: scope.filter((s) => s.bbt_status === k && s.battery.source === "TICKET").length,
    unverified: scope.filter((s) => s.bbt_status === k && s.battery.unverified && s.battery.source !== "TICKET").length,
    none: scope.filter((s) => s.bbt_status === k && !s.battery.measured && !s.battery.unverified && !["ESTIMATED", "TICKET"].includes(s.battery.source)).length,
  })), [scope]);
  const sources = [...new Set(all.map((s) => s.battery.source))].sort();
  const P = (v) => fPct(v * 100, 0);
  // v3.6 — BBT gap: actual (measured) vs design from load × batteries
  const gap = useMemo(() => { const r = scope.map((s) => s.bbt_gap_ratio).filter((v) => v != null).sort((a, b) => a - b);
    return { n: r.length, med: r.length ? r[Math.floor(r.length / 2)] : null, lt50: r.filter((v) => v < 0.5).length }; }, [scope]);
  // 2b: a row / segment of "Battery vs design" sets the Status + Status-basis chips of the action list below
  const EV_OF = { measured: ["ACTUAL", "DERIVED"], ticket: ["TICKET"], unverified: ["DERIVED-UNVERIFIED"], estimated: ["ESTIMATED"], none: ["UNAVAILABLE"] };
  const pickDist = (k, part) => { setSt([k]); setEv(part ? EV_OF[part] : []); setLv([]); setAc([]);
    setTimeout(() => document.getElementById("bbs-action-list")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

  return (
    <div className="space-y-4">
      <Method title={t("fa.method")}>
        <b>{t("bbs.note.criteria")}<Gloss k="bbt_design" /></b> {t("bbs.note.criteria_body", { d: b.design_minutes, ok: P(b.ok_pct), dg: P(b.degraded_pct), dead: b.dead_max_minutes })}
        {" "}<b>{t("bbs.note.precedence")}</b> {t("bbs.note.precedence_body")}
        {" "}<b>{t("bbs.note.priority")}</b> {t("bbs.note.priority_body", { f: cfg.severity_floor.measured_dead_critical })}
        {" "}<b>{t("fa.safety")}</b> {t("fa.safety_body")}
      </Method>
      {/* vNext — one compact hero: BBS priority (P1–P4 + suggested window) and the six field actions; both filter map + worklist */}
      <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("atype.title")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 className="text-[15px] font-semibold text-navy">{t("atype.title")}</h2>
          <span className="text-[12.5px] text-slate">{t("fa.need", { n: fInt(rows.length), N: fInt(scope.length) })}</span>
          {(lv.length || st.length || ev.length || ac.length || at.length) ? <button onClick={() => { setLv([]); setSt([]); setEv([]); setAc([]); setAt([]); }} className="text-s1 underline text-[12px]">{t("cond.reset")}</button> : null}
          {fx && <span className="text-[10.5px] uppercase tracking-wide text-[#8a5a00] bg-warn/15 border border-warn/50 rounded px-1" title={t("per.fixed_tip")}>{t("per.full_badge")}</span>}
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
          <div>
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1">{t("col.bbs_priority")}</div>
            <div className="grid grid-cols-4 gap-1.5 mb-2">{LV.map((l) => { const on = lv.includes(l); return (
              <button key={l} onClick={() => setLv(on ? lv.filter((x) => x !== l) : [...lv, l])} aria-pressed={on} title={t("fa.window_sub", { w: t(`batch.${l}.when`) })}
                className={`text-left rounded-md border px-2 py-1.5 ${on ? "border-navy ring-1 ring-navy/40" : lv.length ? "border-line opacity-60" : "border-line hover:border-slate"}`}>
                <LevelTag kind="BBS" v={l} /><div className="text-[18px] font-bold tabular text-ink leading-tight mt-0.5">{fInt(all.filter((s) => s.bbs_priority_level === l).length)}</div>
                <div className="text-[10.5px] text-slate leading-tight">{t(`batch.${l}.when`)}</div></button>); })}</div>
          </div>
          <div className="xl:border-l xl:border-line xl:pl-5">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1">{t("fa.col.action")}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {ACTION_TYPES.filter((k) => k !== "NONE").map((k) => { const on = at.length === 1 && at[0] === k; return (
                <button key={k} onClick={() => pickType(k)} aria-pressed={on} title={t(`atype.${k}_sub`)}
                  className={`flex items-center gap-2 text-left border rounded-md px-2 py-1.5 bg-white ${on ? "border-navy ring-1 ring-navy/40" : at.length ? "border-line opacity-60" : "border-line hover:border-slate"}`}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block shrink-0" style={{ background: { REPLACE: "#b42318", UPGRADE: "#eb6834", SETTING: "#6b4bd8", TEST: "#2a78d6", DATA: "#1F2A44", MONITOR: "#9DB7DE" }[k] }} />
                  <span className="flex-1 min-w-0 text-[12px] text-ink leading-tight">{t(`atype.${k}`)}</span><b className="tabular text-[14px]">{fInt(typeCount[k])}</b></button>); })}
            </div>
            <div className="text-[11px] text-mut mt-1">{t("fa.types_note")}</div>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap gap-4 bg-white border border-line rounded-md px-3 py-2">
        <Chips label={t("fa.col.condition")} options={[...new Set([...PROB, ...st])]} value={st} onChange={setSt} fmt={(o) => tv("status", o)} />
        <Chips label={t("fa.col.evidence")} options={[...new Set([...sources, ...ev])]} value={ev} onChange={setEv} />
      </div>
      <details className="-mt-2"><summary className="cursor-pointer text-[12px] text-slate">{t("fa.more_filters")}{ac.length ? ` (${ac.length})` : ""}</summary>
        <div className="mt-1 bg-white border border-line rounded-md px-3 py-2"><Chips label={t("col.action")} options={actions} value={ac} onChange={setAc} fmt={(o) => tv("action", o)} /></div></details>
      <div id="bbs-action-list" className="scroll-mt-28">{!rows.length ? <Note>{t("bbs.list.none")}</Note> : (
        <Workspace ctx={props} rows={rows} modes={["batch", "actiontype", "bbsstatus", "bbtgap"]} defaultMode="batch" showMbpLayers={false}
          title={t("hero.bbs.title")} sub={t("hero.bbs.sub2")} tableTitle={t("fa.list.title", { n: fInt(rows.length) })} tableSub={t("fa.list.sub")} filename="pba_bbs_action_list.csv" initialSort={{ key: "bbs_priority_score", dir: -1 }}
          detail={(s) => <SiteBriefBbs s={s} ctx={props} />} expand={EXPAND} columns={COLS} extraCsv={XCSV} />)}</div>
      <details><summary className="cursor-pointer text-[13px] font-semibold text-navy py-1">{t("bbs.dist.title")}</summary>
      <Card title={t("bbs.dist.title")} sub={t("bbs.dist.sub")}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] tabular min-w-[620px]">
            <thead><tr className="text-slate text-left">{["status", "measured", "ticket", "unverified", "estimated", "none", "distribution"].map((h) => <th key={h} className="py-1 pr-2 border-b border-line">{t(`bbs.dist.${h}`)}</th>)}</tr></thead>
            <tbody>{dist.map((d) => { const tot = d.measured + d.ticket + d.unverified + d.estimated + d.none; return (
              <tr key={d.k} className="border-b border-line/60 cursor-pointer hover:bg-s1/5" title={t("chart.click_sites")} onClick={() => pickDist(d.k)}><td className="py-1 pr-2"><StatusTag v={d.k} /></td><td>{fInt(d.measured)}</td><td>{fInt(d.ticket)}</td><td>{fInt(d.unverified)}</td><td>{fInt(d.estimated)}</td><td>{fInt(d.none)}</td>
                <td className="w-[40%] py-1">{tot > 0 && <Bar100 height={10} legend={false} onSeg={(p) => pickDist(d.k, p.k)} parts={[["measured", "#2a78d6", d.measured], ["ticket", "#55627A", d.ticket], ["unverified", "#f3c3a5", d.unverified], ["estimated", "#eb6834", d.estimated], ["none", "#C9CFD9", d.none]].filter((p) => p[2]).map(([k, col, v]) => ({ k, label: t(`bbs.dist.${k}`).toLowerCase(), c: col, v, txt: fInt(v) }))} />}</td></tr>); })}</tbody>
          </table>
        </div>
      </Card>
      </details>


    </div>
  );
}
