"use client";
import React, { useMemo, useState } from "react";
import { Card, Kpi, Note, DataTable, Chips, LevelTag, StatusTag, EvTag, Tag, fInt, fMin, fH, f1, f2, fPct, isNum } from "@/components/ui";

export default function BbsActions({ scope, cfg, setPick }) {
  const all = useMemo(() => scope.filter((s) => s.bbs_priority_level).sort((a, b) => b.bbs_priority_score - a.bbs_priority_score), [scope]);
  const [lv, setLv] = useState([]); const [st, setSt] = useState([]); const [ev, setEv] = useState([]); const [ac, setAc] = useState([]);
  const actions = useMemo(() => [...new Set(all.map((s) => s.recommended_action))].sort(), [all]);
  const rows = all.filter((s) => (!lv.length || lv.includes(s.bbs_priority_level)) && (!st.length || st.includes(s.bbt_status)) && (!ev.length || ev.includes(s.bbt_value_evidence)) && (!ac.length || ac.includes(s.recommended_action)));
  const c = (f) => rows.filter(f).length;
  const b = cfg.bbt;
  return (
    <div className="space-y-4">
      <Note>
        <b>Criteria</b> (vs design {b.design_minutes} min, editable in Config): Battery OK ≥ {b.ok_pct * 100}% · Degraded {b.degraded_pct * 100}–{b.ok_pct * 100}% · Critical &lt; {b.degraded_pct * 100}% · Dead ≤ {b.dead_max_minutes} min or “Tidak Ada Baterai”.
        Also listed: <b>hub sites that go dark before the MBP can arrive</b> (ETA &gt; BBT). <b>Priority</b> (P1 highest) = BBT gap vs design · historical PLN outage · site class · dependency · availability — then grouped into execution batches.
      </Note>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi label="Sites needing action" value={fInt(rows.length)} />
        <Kpi label="P1 · Batch 1" value={fInt(c((s) => s.bbs_priority_level === "P1"))} sub={cfg.action_batches.P1.split(" — ")[1]} tone="crit" />
        <Kpi label="P2 · Batch 2" value={fInt(c((s) => s.bbs_priority_level === "P2"))} sub={cfg.action_batches.P2.split(" — ")[1]} tone="warn" />
        <Kpi label="Replace / upgrade" value={fInt(c((s) => /replacement|upgrade/i.test(s.recommended_action)))} />
        <Kpi label="Inspect & verify (estimated BBT)" value={fInt(c((s) => s.recommended_action.startsWith("Inspect & verify")))} />
        <Kpi label="MBP standby candidates" value={fInt(c((s) => s.mbp_standby_flag === 1))} />
      </div>
      <Card title="Filters">
        <div className="flex flex-wrap gap-5">
          <Chips label="Priority" options={["P1", "P2", "P3", "P4"]} value={lv} onChange={setLv} />
          <Chips label="Battery status" options={["Dead", "Critical", "Degraded", "OK"]} value={st} onChange={setSt} />
          <Chips label="BBT evidence" options={["ACTUAL", "DERIVED", "ESTIMATED", "UNAVAILABLE"]} value={ev} onChange={setEv} />
          <Chips label="Action" options={actions} value={ac} onChange={setAc} />
        </div>
      </Card>
      <Card title="Action list — sorted by priority" sub="Click a row for the site detail. Inactive sites appear only when “Include inactive sites” is on (shown grey).">
        <DataTable rows={rows} onRowClick={setPick} filename="pba_bbs_action_list.csv" initialSort={{ key: "bbs_priority_score", dir: -1 }}
          rowClass={(r) => (r.site_active ? "" : "bg-line/50 text-mut")} columns={[
          { key: "bbs_priority_score", label: "Priority", num: true, render: (r) => <span className="inline-flex gap-1.5 items-center"><LevelTag v={r.bbs_priority_level} />{f2(r.bbs_priority_score)}</span>, csv: (r) => `${r.bbs_priority_level} ${f2(r.bbs_priority_score)}` },
          { key: "action_batch", label: "Batch", render: (r) => r.action_batch?.split(" — ")[0], csv: (r) => r.action_batch },
          { key: "site_id", label: "Site ID", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> }, { key: "site_name", label: "Site name" },
          { key: "nop", label: "NOP" }, { key: "site_class", label: "Class" },
          { key: "bbt_value_min", label: "BBT", num: true, render: (r) => <span className="inline-flex gap-1.5 items-center">{r.bbt_is_lower_bound ? "≥ " : ""}{fMin(r.bbt_value_min)}<EvTag v={r.bbt_value_evidence} /></span>, csv: (r) => (isNum(r.bbt_value_min) ? Math.round(r.bbt_value_min) : "") },
          { key: "bbt_value_evidence", label: "Evidence", csv: (r) => r.bbt_value_evidence, render: (r) => r.bbt_value_evidence === "ESTIMATED" ? <span className="text-[11px] text-mut">{r.bbt_est_confidence}</span> : "" },
          { key: "bbt_pct_design", label: "% design", num: true, render: (r) => (isNum(r.bbt_pct_design) ? `${r.bbt_pct_design}%` : "—") },
          { key: "bbt_status", label: "Battery status", render: (r) => <StatusTag v={r.bbt_status} /> },
          { key: "recommended_action", label: "Recommended action", render: (r) => <span className="font-semibold">{r.recommended_action}</span> },
          { key: "reason", label: "Why", wrap: true },
          { key: "pln_freq", label: "PLN outages", num: true, render: (r) => fInt(r.pln_freq) }, { key: "pln_total_h", label: "PLN hours", num: true, render: (r) => fH(r.pln_total_h) },
          { key: "dependency_children", label: "Children (PROXY)", num: true, render: (r) => (isNum(r.dependency_children) ? r.dependency_children : "—") },
          { key: "avail_wc_pct", label: "Availability", num: true, render: (r) => fPct(r.avail_wc_pct, 2) },
          { key: "battery_type", label: "Battery" }, { key: "battery_age_y", label: "Age (y)", num: true, render: (r) => f1(r.battery_age_y) },
          { key: "mbp_standby_flag", label: "MBP standby", render: (r) => (r.mbp_standby_flag ? <Tag tone="crit">yes</Tag> : ""), csv: (r) => (r.mbp_standby_flag ? "yes" : "") },
        ]} />
      </Card>
    </div>
  );
}
