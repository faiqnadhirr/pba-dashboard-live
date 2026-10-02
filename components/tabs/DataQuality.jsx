"use client";
import React, { useMemo } from "react";
import { Card, Note, DataTable, EvTag, fInt, fPct } from "@/components/ui";

const EVCOLS = [["dependency_children", "Dependency", (s) => (s.dependency_children != null ? "PROXY" : "UNAVAILABLE")],
  ["bbt_value_min", "BBT measured / estimated", (s) => s.bbt_value_evidence || "UNAVAILABLE"],
  ["eta_min", "Travel time", (s) => (s.eta_min != null ? "ESTIMATED" : "UNAVAILABLE")],
  ["pln_freq", "PLN outage", (s) => (s.pln_source ? "DERIVED" : "UNAVAILABLE")],
  ["km_assigned", "Distance to MBP", (s) => (s.km_assigned != null ? "DERIVED" : "UNAVAILABLE")],
  ["mbp_deployments", "Historical MBP", (s) => (s.in_ticket_file ? "DERIVED" : "UNAVAILABLE")],
  ["avail_wc_pct", "Availability", (s) => (s.avail_wc_pct != null ? "DERIVED" : "UNAVAILABLE")]];

export default function DataQuality({ scope, data }) {
  const m = data.meta;
  const ev = useMemo(() => EVCOLS.map(([k, label, f]) => {
    const c = {}; scope.forEach((s) => { const e = f(s); c[e] = (c[e] || 0) + 1; });
    return { field: label, ...c };
  }), [scope]);
  const miss = ["site_class", "lat", "hub_site", "battery_type", "battery_age_y", "load_a", "battery_banks", "bbt_measured_min", "bbt_lower_bound_min", "pln_source", "avail_wc_pct", "mbp_assigned", "eta_min"]
    .map((k) => ({ field: k, missing_pct: (100 * scope.filter((s) => s[k] == null).length) / Math.max(1, scope.length) }));
  const um = m.dq.unmatched.reduce((a, u) => { a[u.source] = (a[u.source] || 0) + 1; return a; }, {});
  const qa = m.qa;
  return (
    <div className="space-y-4">
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title="Sources" sub="Raw rows → clean rows at the correct grain (aggregated before any join).">
          <DataTable rows={m.dq.sources} pageSize={20} filename="pba_dq_sources.csv" columns={[
            { key: "source", label: "Source" }, { key: "grain", label: "Grain" },
            { key: "raw", label: "Raw rows", num: true, render: (r) => fInt(r.raw) }, { key: "clean", label: "Clean rows", num: true, render: (r) => fInt(r.clean) }]} />
        </Card>
        <Card title="Evidence per field (sites in scope)">
          <div className="overflow-x-auto"><table className="w-full text-[12.5px] tabular">
            <thead><tr className="text-slate"><th className="text-left py-1 border-b border-line">Field</th>{["ACTUAL", "DERIVED", "ESTIMATED", "PROXY", "UNAVAILABLE"].map((e) => <th key={e} className="text-right px-2 border-b border-line"><EvTag v={e} /></th>)}</tr></thead>
            <tbody>{ev.map((r) => <tr key={r.field} className="border-b border-line/60"><td className="py-1.5">{r.field}</td>{["ACTUAL", "DERIVED", "ESTIMATED", "PROXY", "UNAVAILABLE"].map((e) => <td key={e} className="text-right px-2">{r[e] ? fInt(r[e]) : "·"}</td>)}</tr>)}</tbody>
          </table></div>
        </Card>
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="Missing values (sites in scope)">
          <table className="w-full text-[12.5px] tabular"><tbody>{miss.map((r) => <tr key={r.field} className="border-b border-line/60"><td className="py-1">{r.field}</td><td className="text-right">{fPct(r.missing_pct, 1)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Unmatched identifiers">
          <table className="w-full text-[12.5px] tabular"><tbody>{Object.entries(um).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-1">{k}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
          <div className="text-[11.5px] text-mut mt-2">Ticket→MBP match rate {fPct(100 * qa.ticket_mbp_match_rate, 1)} · RH meter valid {fPct(100 * qa.ticket_rh_valid_rate, 1)}</div>
        </Card>
        <Card title="Pipeline corrections">
          <ul className="text-[12.5px] space-y-1.5 list-disc pl-4">
            <li>RAN durations are NE-summed → converted to wall-clock (÷ NE count, ≤ 24 h/day).</li>
            <li>{fInt(qa.pln_overlapping_events_merged)} overlapping PLN events merged → {fInt(qa.pln_merged_intervals)} outage intervals.</li>
            <li>{fInt(qa.bbt_event_full_dups)} duplicate BBT events and {fInt(qa.ticket_full_dups)} duplicate tickets removed.</li>
            <li>{fInt(qa.dapot_dup_ids)} duplicate site IDs in Dapot removed; {fInt(qa.site_bad_coords)} sites without valid coordinates.</li>
            <li>MBP coordinates: {Object.entries(m.dq.mbp_coords).map(([k, v]) => `${k} ${v}`).join(" · ")} (REPAIRED = missing decimal point).</li>
            <li>Small NOPs flagged: {Object.entries(qa.nop_small || {}).map(([k, v]) => `${k} (${v})`).join(", ") || "none"}.</li>
            <li>{fInt(qa.bbt_monthly_rejected_contradiction)} monthly-summary BBT values rejected: shorter than the outage the battery is proven (by events) to have survived.</li>
            <li>{fInt(qa.bbt_sites_outlived_outages)} sites: battery outlived most outages (KM median not reached) → treated as ESTIMATED, floored at the longest outage survived.</li>
          </ul>
        </Card>
      </div>
      <Card title="Unmatched list"><DataTable rows={m.dq.unmatched} pageSize={20} filename="pba_dq_unmatched.csv" columns={[{ key: "source", label: "Source" }, { key: "id", label: "ID" }, { key: "n", label: "Tickets", num: true, render: (r) => (r.n == null ? "" : fInt(r.n)) }]} /></Card>
      <Note>Data built {m.built_at} · scope {m.scope.area} {m.scope.period_start} → {m.scope.period_end}. To refresh: run <code>python engine/build.py --raw &lt;folder&gt;</code> and redeploy.</Note>
    </div>
  );
}
