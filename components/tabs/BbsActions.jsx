"use client";
import React, { useMemo, useState } from "react";
import { Card, Kpi, Note, DataTable, Chips, ActionLabel, LevelTag, BbtCell, bbtCsv, StatusTag, Tag, EvidenceTable, AvailTriple, Bar100, Gloss, fInt, fH, fPct, isNum } from "@/components/ui";
import { STATUS_ORDER } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { coverageGap } from "@/lib/view";

const LV = ["P1", "P2", "P3", "P4"];
const PROB = ["Dead", "Critical", "Degraded"];

export default function BbsActions({ scope, cfg, setPick, openDrill }) {
  const all = useMemo(() => scope.filter((s) => s.bbs_priority_level).sort((a, b) => b.bbs_priority_score - a.bbs_priority_score), [scope]);
  const [lv, setLv] = useState([]), [st, setSt] = useState([]), [ev, setEv] = useState([]), [ac, setAc] = useState([]);
  const actions = useMemo(() => [...new Set(all.map((s) => s.recommended_action))].sort(), [all]);
  const rows = all.filter((s) => (!lv.length || lv.includes(s.bbs_priority_level)) && (!st.length || st.includes(s.bbt_status))
    && (!ev.length || ev.includes(s.battery.source)) && (!ac.length || ac.includes(s.recommended_action)));
  const c = (f) => rows.filter(f).length;
  const b = cfg.bbt;
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
  // 2b: a row / segment of "Battery vs design" sets the Status + Status-basis chips of the action list below
  const EV_OF = { measured: ["ACTUAL", "DERIVED"], ticket: ["TICKET"], unverified: ["DERIVED-UNVERIFIED"], estimated: ["ESTIMATED"], none: ["UNAVAILABLE"] };
  const pickDist = (k, part) => { setSt([k]); setEv(part ? EV_OF[part] : []); setLv([]); setAc([]);
    setTimeout(() => document.getElementById("bbs-action-list")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

  return (
    <div className="space-y-4">
      <Note>
        <b>{t("bbs.note.criteria")}<Gloss k="bbt_design" /></b> {t("bbs.note.criteria_body", { d: b.design_minutes, ok: P(b.ok_pct), dg: P(b.degraded_pct), dead: b.dead_max_minutes })}
        {" "}<b>{t("bbs.note.precedence")}</b> {t("bbs.note.precedence_body")}
        {" "}<b>{t("bbs.note.priority")}</b> {t("bbs.note.priority_body", { f: cfg.severity_floor.measured_dead_critical })}
      </Note>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi scope="filtered" label={t("bbs.kpi.need")} value={fInt(rows.length)} sub={t("common.of_in_scope", { n: fInt(scope.length) })} />
        {LV.map((l, i) => <Kpi key={l} scope="filtered" onClick={() => openDrill(`bbs_${l}`)} label={t("bbs.kpi.batch", { p: `BBS-${l}`, n: i + 1 })} value={fInt(c((s) => s.bbs_priority_level === l))} sub={t(`batch.${l}.when`)} tone={["crit", "warn", "navy", "slate"][i]} />)}
        <Kpi scope="filtered" label={t("bbs.kpi.inspect")} value={fInt(c((s) => s.rule?.startsWith("R2")))} sub={t("bbs.kpi.inspect_sub", { n: fInt(c((s) => s.rule?.startsWith("R2b"))) })} tone="warn" help={t("gloss.derived_unverified")} />
      </div>

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

      <div id="bbs-action-list" className="scroll-mt-28"><Card title={t("bbs.list.title")} sub={t("bbs.list.sub")}>
        <div className="flex flex-wrap gap-4 mb-3">
          <Chips label={t("col.bbs_priority")} options={LV} value={lv} onChange={setLv} fmt={(o) => `BBS-${o}`} />
          <Chips label={t("bbs.f.status")} options={[...new Set([...PROB, ...st])]} value={st} onChange={setSt} fmt={(o) => tv("status", o)} />
          <Chips label={t("bbs.f.basis")} options={[...new Set([...sources, ...ev])]} value={ev} onChange={setEv} />
        </div>
        <div className="mb-3"><Chips label={t("col.action")} options={actions} value={ac} onChange={setAc} fmt={(o) => tv("action", o)} /></div>
        {!rows.length ? <Note>{t("bbs.list.none")}</Note> : (
          <DataTable rows={rows} filename="pba_bbs_action_list.csv" initialSort={{ key: "bbs_priority_score", dir: -1 }}
            expand={(r) => (
              <div className="space-y-2">
                {r.battery.conflict && <Note tone="warn"><b>{t("bbs.conflict")}:</b> {te(r.battery.conflict, "conflict")}</Note>}
                <div className="text-[12px] text-slate">{t("bbs.basis")}: <b className="text-ink">{te(r.battery.precedence, "prec")}</b> · {t("ev.rule")} {te(r.rule, "rule")} · {t(`batch.${r.bbs_priority_level}`)}{r.priority_floor ? ` · ${t("bbs.floor", { a: `BBS-${r.priority_floor}`, b: `BBS-${r.bbs_priority_level}` })}` : ""}</div>
                <EvidenceTable rows={r.evidence} action={r.recommended_action} />
                <button className="text-[12px] text-s1 underline" onClick={() => setPick(r)}>{t("common.open_detail")}</button>
              </div>
            )}
            columns={[
              { key: "site_id", label: "col.site", render: (r) => <span className="inline-block max-w-[230px] truncate align-bottom" title={r.site_name}><span className="font-semibold text-navy">{r.site_id}</span> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
              { key: "nop", label: "col.nop" },
              { key: "bbs_priority_score", label: "col.bbs_priority", num: true, render: (r) => <span title={t("bbs.cutoffs", { p1: cfg.bbs_priority_levels.P1, p2: cfg.bbs_priority_levels.P2, p3: cfg.bbs_priority_levels.P3, s: r.bbs_priority_score?.toFixed(3) })}><LevelTag kind="BBS" v={r.bbs_priority_level} /></span>, csv: (r) => `BBS-${r.bbs_priority_level} ${r.bbs_priority_score?.toFixed(3)}` },
              { key: "recommended_action", label: "col.action", wrap: true, render: (r) => <span className="font-medium"><ActionLabel r={r} />{r.mbp_standby_flag ? <> <Tag tone="warn">{t("bbs.standby")}</Tag></> : null}</span>, csv: (r) => r.recommended_action },
              { key: "bbt_value_min", label: "col.bbt", num: true, sortVal: (r) => r.battery.display.value, render: (r) => <BbtCell r={r} showStatus />, csv: (r) => `${bbtCsv(r)} ${r.bbt_status}` },
              { key: "ran_power_down_h", label: "col.power_downtime", num: true, render: (r) => fH(r.ran_power_down_h), csv: (r) => r.ran_power_down_h?.toFixed(1) },
              { key: "avail_delta_pp", label: "col.avail_triple", num: true, render: (r) => <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact />, csv: (r) => (isNum(r.avail_wc_pct) ? `${r.avail_wc_pct.toFixed(2)} / ${r.ran_target_pct.toFixed(2)} / ${r.avail_delta_pp.toFixed(2)}` : "") },
            ]}
            extraCsv={[
              { key: "site_name", label: "Site name" }, { key: "site_class", label: "Class" }, { key: "rule", label: "Rule" }, { key: "action_batch", label: "Batch" },
              { key: "precedence", label: "Status basis", csv: (r) => r.battery.precedence }, { key: "conflict", label: "Evidence conflict", csv: (r) => r.battery.conflict || "" },
              { key: "reason", label: "Why" }, { key: "pln_freq", label: "PLN outages", csv: (r) => (r.pln_known ? r.pln_freq : "") }, { key: "dependency_children", label: "Dependency (PROXY)" },
              { key: "eta_min", label: "MBP ETA (min)", csv: (r) => (isNum(r.eta_min) ? Math.round(r.eta_min) : "") }, { key: "can_arrive_before_bbt", label: "MBP arrives before BBT" }, { key: "coverage_gap", label: "coverage_gap", csv: (r) => String(coverageGap(r)) },
            ]} />
        )}
      </Card></div>
    </div>
  );
}
