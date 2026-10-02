"use client";
import React, { useMemo, useState } from "react";
import { Card, Kpi, Note, DataTable, Chips, LevelTag, BbtCell, bbtCsv, StatusTag, EvTag, Tag, EvidenceTable, AvailTriple, Bar100, STATUS, fInt, fMin, fH, fPct, isNum } from "@/components/ui";
import { STATUS_ORDER } from "@/lib/logic";

const LV = ["P1", "P2", "P3", "P4"];
const PROB = ["Dead", "Critical", "Degraded"];

export default function BbsActions({ scope, cfg, setPick }) {
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

  return (
    <div className="space-y-4">
      <Note>
        <b>Battery vs design</b> ({b.design_minutes} min, editable in Config): ✔ Meets design ≥ 100% · ◐ Below design {b.ok_pct * 100}–100% · ◆ Degraded {b.degraded_pct * 100}–{b.ok_pct * 100}% · ▲ Critical &lt; {b.degraded_pct * 100}% · ✖ Dead ≤ {b.dead_max_minutes} min.
        <b> Evidence precedence:</b> measured BBT &gt; validated inspection &gt; ticket &gt; derived &gt; estimate — an estimate can only trigger <i>Inspect &amp; verify</i>, never a replacement.
        <b> BBS priority</b> BBS-P1…P4 (separate from MBP-P1…P4) = BBT gap · PLN history · class · dependency · availability gap; measured Dead/Critical (ACTUAL, or DERIVED backed by site downtime) cannot be lower than BBS-{cfg.severity_floor.measured_dead_critical}. BBS-P1/P2 never get “Monitor”. A ticket-based status shows “no battery per ticket” instead of a number.
      </Note>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi scope="filtered" label="Sites needing action" value={fInt(rows.length)} sub={`of ${fInt(scope.length)} in scope`} />
        {LV.map((l, i) => <Kpi key={l} scope="filtered" label={`BBS-${l} · Batch ${i + 1}`} value={fInt(c((s) => s.bbs_priority_level === l))} sub={cfg.action_batches[l]?.split(" — ")[1]} tone={["crit", "warn", "navy", "slate"][i]} />)}
        <Kpi scope="filtered" label="Inspect & verify" value={fInt(c((s) => s.rule?.startsWith("R2")))} sub={`${fInt(c((s) => s.rule === "R2b" || s.rule?.startsWith("R2b")))} unverified derived · rest estimated`} tone="warn" />
      </div>

      <Card title="Battery vs design — evidence basis" sub="All sites in scope. Measured (ACTUAL/DERIVED) is kept apart from ESTIMATED and ticket-based status, so estimates never look like measurements.">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] tabular min-w-[620px]">
            <thead><tr className="text-slate text-left">{["Status", "Measured", "Ticket", "Derived — unverified", "Estimated", "No evidence", "Distribution"].map((h) => <th key={h} className="py-1 pr-2 border-b border-line">{h}</th>)}</tr></thead>
            <tbody>{dist.map((d) => { const tot = d.measured + d.ticket + d.unverified + d.estimated + d.none; return (
              <tr key={d.k} className="border-b border-line/60"><td className="py-1 pr-2"><StatusTag v={d.k} /></td><td>{fInt(d.measured)}</td><td>{fInt(d.ticket)}</td><td>{fInt(d.unverified)}</td><td>{fInt(d.estimated)}</td><td>{fInt(d.none)}</td>
                <td className="w-[40%] py-1">{tot > 0 && <Bar100 height={10} parts={[{ label: "measured", c: "#2a78d6", v: d.measured }, { label: "ticket", c: "#55627A", v: d.ticket }, { label: "unverified", c: "#f3c3a5", v: d.unverified }, { label: "estimated", c: "#eb6834", v: d.estimated }, { label: "none", c: "#C9CFD9", v: d.none }].filter((p) => p.v)} />}</td></tr>); })}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Action list" sub="Sorted by priority. Expand ▸ for Metric → Value → Threshold → Rule → Action. Click a site ID for full detail. CSV exports all filtered rows with the full explanation.">
        <div className="flex flex-wrap gap-4 mb-3">
          <Chips label="BBS priority" options={LV} value={lv} onChange={setLv} />
          <Chips label="Battery status" options={PROB} value={st} onChange={setSt} />
          <Chips label="Status basis" options={sources} value={ev} onChange={setEv} />
        </div>
        <div className="mb-3"><Chips label="Action" options={actions} value={ac} onChange={setAc} /></div>
        {!rows.length ? <Note>No sites match these filters.</Note> : (
          <DataTable rows={rows} filename="pba_bbs_action_list.csv" initialSort={{ key: "bbs_priority_score", dir: -1 }}
            expand={(r) => (
              <div className="space-y-2">
                {r.battery.conflict && <Note tone="warn"><b>Evidence conflict:</b> {r.battery.conflict}</Note>}
                <div className="text-[12px] text-slate">Status basis: <b className="text-ink">{r.battery.precedence}</b> · Rule {r.rule} · {r.action_batch}{r.priority_floor ? ` · score level ${r.priority_floor} raised to ${r.bbs_priority_level} (severity floor)` : ""}</div>
                <EvidenceTable rows={r.evidence} action={r.recommended_action} />
                <button className="text-[12px] text-s1 underline" onClick={() => setPick(r)}>open site detail</button>
              </div>
            )}
            columns={[
              { key: "site_id", label: "Site", render: (r) => <span><span className="font-semibold text-navy">{r.site_id}</span> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
              { key: "nop", label: "NOP" },
              { key: "avail_delta_pp", label: "Availability · target · gap", num: true, render: (r) => <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact />, csv: (r) => (isNum(r.avail_wc_pct) ? `${r.avail_wc_pct.toFixed(2)} / ${r.ran_target_pct.toFixed(2)} / ${r.avail_delta_pp.toFixed(2)}` : "") },
              { key: "bbt_value_min", label: "BBT", num: true, sortVal: (r) => r.battery.display.value, render: (r) => <BbtCell r={r} showStatus />, csv: (r) => `${bbtCsv(r)} ${r.bbt_status}` },
              { key: "ran_power_down_h", label: "Power downtime", num: true, render: (r) => fH(r.ran_power_down_h) },
              { key: "bbs_priority_score", label: "BBS priority", num: true, render: (r) => <LevelTag kind="BBS" v={r.bbs_priority_level} />, csv: (r) => `BBS-${r.bbs_priority_level} ${r.bbs_priority_score?.toFixed(3)}` },
              { key: "recommended_action", label: "Action", wrap: true, render: (r) => <span className="font-medium">{r.recommended_action}{r.mbp_standby_flag ? <> <Tag tone="warn">MBP standby</Tag></> : null}</span> },
            ]}
            extraCsv={[
              { key: "site_name", label: "Site name" }, { key: "site_class", label: "Class" }, { key: "rule", label: "Rule" }, { key: "action_batch", label: "Batch" },
              { key: "precedence", label: "Status basis", csv: (r) => r.battery.precedence }, { key: "conflict", label: "Evidence conflict", csv: (r) => r.battery.conflict || "" },
              { key: "reason", label: "Why" }, { key: "pln_freq", label: "PLN outages" }, { key: "dependency_children", label: "Dependency (PROXY)" },
              { key: "eta_min", label: "MBP ETA (min)", csv: (r) => (isNum(r.eta_min) ? Math.round(r.eta_min) : "") }, { key: "can_arrive_before_bbt", label: "MBP arrives before BBT" },
            ]} />
        )}
      </Card>
    </div>
  );
}
