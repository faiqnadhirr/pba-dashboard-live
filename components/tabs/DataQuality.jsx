"use client";
import React, { useMemo } from "react";
import { Card, Note, DataTable, EvTag, Tag, fInt, fPct, precisionNote } from "@/components/ui";
import { ACCESS_LABEL } from "@/lib/logic";

const EVCOLS = [["dependency_children", "Dependency", (s) => (s.dependency_children != null ? "PROXY" : "UNAVAILABLE")],
  ["bbt_value_min", "BBT measured / estimated", (s) => s.bbt_value_evidence || "UNAVAILABLE"],
  ["eta_min", "Travel time", (s) => (s.eta_min != null ? "ESTIMATED" : "UNAVAILABLE")],
  ["pln_freq", "PLN outage", (s) => (s.pln_source ? "DERIVED" : "UNAVAILABLE")],
  ["km_assigned", "Distance to MBP", (s) => (s.km_assigned != null ? "DERIVED" : "UNAVAILABLE")],
  ["mbp_deployments", "Historical MBP", (s) => (s.in_ticket_file ? "DERIVED" : "UNAVAILABLE")],
  ["avail_wc_pct", "Availability", (s) => (s.avail_wc_pct != null ? "DERIVED" : "UNAVAILABLE")]];

export default function DataQuality({ scope, data, offairSites = [], mbpStats, cfg, setPick }) {
  const snap = data.meta.snapshot || {}, mb = data.meta.mbp || {};
  const prec = useMemo(() => { const c = {}; scope.forEach((x) => { const d = x.coord_decimals ?? "none"; c[d] = (c[d] || 0) + 1; }); return Object.entries(c).sort((a, b) => String(b[0]).localeCompare(String(a[0]))); }, [scope]);
  const acc = useMemo(() => { const c = {}; scope.forEach((x) => { c[x.access_class] = (c[x.access_class] || 0) + 1; }); return c; }, [scope]);
  const dz = useMemo(() => { const c = { DERIVED: 0, ESTIMATED: 0, PROXY: 0 }; scope.forEach((x) => { c[x.bbt_design_evidence] = (c[x.bbt_design_evidence] || 0) + 1; }); return c; }, [scope]);
  const hiddenBc = useMemo(() => [...(mbpStats?.values() || [])].filter((b) => b.coord_status === "MISSING" || b.sites_covered === 0)
    .map((b) => ({ ...b, reason: b.coord_status === "MISSING" ? "no location" : "0 sites assigned" })), [mbpStats]);
  const unver = useMemo(() => scope.filter((x) => x.battery.unverified), [scope]);
  const picStat = (mb.pic_matches || []).reduce((a, r) => { const k = r.status + (r.confidence ? ` · ${r.confidence}` : ""); a[k] = (a[k] || 0) + 1; return a; }, {});
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
      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="BBT design basis (sites in scope)" sub="Col 7 of the site list. Source files have no Ah capacity field: Ah per bank is an ASSUMPTION in Config.">
          <table className="w-full text-[12.5px] tabular"><tbody>
            <tr className="border-b border-line/60"><td className="py-1"><EvTag v="DERIVED" /> banks × assumed Ah × DoD ÷ NE load</td><td className="text-right">{fInt(dz.DERIVED)}</td><td className="text-right text-slate">{fPct((100 * dz.DERIVED) / Math.max(1, scope.length), 1)}</td></tr>
            <tr className="border-b border-line/60"><td className="py-1"><EvTag v="ESTIMATED" /> banks known, NE load = type median</td><td className="text-right">{fInt(dz.ESTIMATED)}</td><td className="text-right text-slate">{fPct((100 * dz.ESTIMATED) / Math.max(1, scope.length), 1)}</td></tr>
            <tr className="border-b border-line/60"><td className="py-1"><EvTag v="PROXY" /> fallback: class default (no banks)</td><td className="text-right">{fInt(dz.PROXY)}</td><td className="text-right font-semibold">{fPct((100 * dz.PROXY) / Math.max(1, scope.length), 1)}</td></tr>
          </tbody></table>
          {(() => { const r = scope.filter((x) => x.battery.source === "ACTUAL" && x.bbt_design_evidence === "DERIVED").map((x) => x.bbt_value_min / x.bbt_design_min).sort((a, b) => a - b);
            const med = r.length ? r[Math.floor(r.length / 2)] : null;
            return med != null && <div className="mt-2"><Note tone="warn">Calibration check: on {fInt(r.length)} sites with both a measured (ACTUAL) BBT and a computed design, measured BBT is a median <b>{Math.round(med * 100)}%</b> of the computed design. {med < 0.5 ? "That is far below what new batteries deliver — the assumed Ah per bank (or the meaning of 'Jumlah Bank') is probably wrong. Confirm the module rating before using the per-site design for criteria." : "Plausible for ageing batteries."}</Note></div>; })()}
          <div className="text-[11.5px] text-mut mt-2">Problem criteria use the {cfg.bbt.criteria_basis === "site" ? "per-site design" : `standard ${cfg.bbt.design_minutes}-min management design`} (Config → criteria basis).</div>
        </Card>
        <Card title="Derived BBT not supported by site evidence" sub="Monthly-summary BBT says Dead/Critical, but the site had little power downtime and few battery-exhausted events → treated as unverified (Inspect & verify, no priority floor).">
          <div className="text-[22px] font-bold text-navy">{fInt(unver.length)}</div>
          <div className="text-[11.5px] text-mut">Rule: supported if ≥ {cfg.bbt.derived_support.min_exhaustion_events} exhausted events, or power downtime ≥ {cfg.bbt.derived_support.min_power_h} h and ≥ {Math.round(cfg.bbt.derived_support.min_share_of_pln * 100)}% of PLN outage hours.</div>
        </Card>
        <Card title="Build sanity checks" sub="Run by engine/build.py on every refresh (build fails on error); rule tests run with npm test.">
          <table className="w-full text-[12px]"><tbody>{(data.meta.qa.build_sanity || []).map((c) => <tr key={c.check} className="border-b border-line/60"><td className="py-0.5">{c.ok ? "✔" : "✖"}</td><td className="py-0.5">{c.check}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <Card title={`Suspected off-air / dismantle / data issue (${offairSites.length})`} sub={`Downtime ≥ ${Math.round(cfg.offair.max_outage_share * 100)}% of the period, or a month ≥ ${Math.round(cfg.offair.full_month_share * 100)}% down, or downtime ≥ ${Math.round(cfg.offair.no_alarm_min_share * 100)}% with no battery alarms and no tickets. Excluded from all KPIs unless the header toggle is on.`}>
        <DataTable rows={offairSites} pageSize={15} filename="pba_dq_suspected_offair.csv" onRowClick={setPick} initialSort={{ key: "ran_outage_h", dir: -1 }} columns={[
          { key: "site_id", label: "Site" }, { key: "site_name", label: "Name" }, { key: "nop", label: "NOP" },
          { key: "ran_outage_h", label: "Downtime", num: true, render: (r) => `${fInt(r.ran_outage_h)} h (${Math.round((100 * r.ran_outage_h) / r.ran_hours)}%)` },
          { key: "ran_power_down_h", label: "…power", num: true, render: (r) => `${fInt(r.ran_power_down_h)} h` },
          { key: "evt_total", label: "Battery alarms", num: true, render: (r) => fInt(r.evt_total || 0) }, { key: "in_ticket_file", label: "Tickets", render: (r) => (r.in_ticket_file ? "yes" : "none") },
          { key: "offair", label: "Why", wrap: true },
        ]} />
      </Card>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title={`Base camps not selectable (${hiddenBc.length})`} sub="Hidden from the coverage dropdown: no coordinates, or no site assigned at the current radius.">
          <DataTable rows={hiddenBc} pageSize={15} filename="pba_dq_basecamps_hidden.csv" columns={[{ key: "mbp_id", label: "Base camp" }, { key: "pic_name", label: "PIC" }, { key: "nop", label: "NOP" }, { key: "reason", label: "Reason" }, { key: "deployments_h1", label: "H1 tickets", num: true }]} />
        </Card>
        <Card title="Base camp merge map" sub={`engine/config/basecamp_merge.csv — reviewable; default merges only "LIKELY SAME PERSON (≤ 20 km, same NOP)". Applied: ${data.meta.qa.basecamp_merge?.applied ?? 0} · base camps ${data.meta.qa.basecamp_merge?.basecamps_before} → ${data.meta.qa.basecamp_merge?.basecamps_after}.`}>
          <DataTable rows={data.mbps.filter((m) => m.merged_from)} pageSize={15} filename="pba_dq_basecamps_merged.csv" columns={[{ key: "mbp_id", label: "Kept record" }, { key: "merged_from", label: "Merged from" }, { key: "pic_name", label: "PIC (person)" }, { key: "nop", label: "NOP" }]} />
        </Card>
      </div>
      <Card title="Data snapshot — source status" sub="Static snapshot produced by the pipeline. Not real-time.">
        <div className="text-[12.5px] mb-2">Period <b>{snap.period_start} → {snap.period_end}</b> · Last pipeline refresh <b>{snap.refreshed_at}</b></div>
        <DataTable rows={snap.sources || []} pageSize={20} filename="pba_dq_source_status.csv" columns={[
          { key: "source", label: "Source" }, { key: "files", label: "Files", num: true }, { key: "status", label: "Status", render: (r) => <Tag tone={r.status === "OK" ? "good" : "crit"}>{r.status === "OK" ? "✔ OK" : `✖ ${r.status}`}</Tag> },
          { key: "latest_file_time", label: "Latest file time" }]} />
      </Card>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card title="Access class (sites in scope)" sub="From Dapot 'Kepulauan' and regency names — never inferred from a missing road ETA.">
          <table className="w-full text-[12.5px] tabular"><tbody>{Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-1">{ACCESS_LABEL[k] || k}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
          <div className="text-[11.5px] text-mut mt-2">Island = no road ETA (sea logistics). Riverine / delta and remote = road ETA × access multiplier (Config).</div>
        </Card>
        <Card title="Coordinate precision (sites in scope)" sub="Coordinates are displayed at the precision of the source record — never padded with false decimals.">
          <table className="w-full text-[12.5px] tabular"><tbody>{prec.map(([d, v]) => <tr key={d} className="border-b border-line/60"><td className="py-1">{d === "none" ? "no coordinates" : `${d} decimals`}</td><td className="text-slate">{d === "none" ? "" : precisionNote(+d)}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
        </Card>
        <Card title="Ticket PIC → MBP base camp matching" sub="Normalised + fuzzy matching. Uncertain matches are NOT merged — they are listed for review.">
          <table className="w-full text-[12.5px] tabular"><tbody>{Object.entries(picStat).map(([k, v]) => <tr key={k} className="border-b border-line/60"><td className="py-1">{k}</td><td className="text-right">{fInt(v)}</td></tr>)}</tbody></table>
          <div className="text-[11.5px] text-mut mt-2">Ticket rows matched: {fPct(100 * data.meta.qa.ticket_mbp_match_rate, 1)} (exact only: {fPct(100 * (data.meta.qa.ticket_mbp_match_rate_exact || 0), 1)}).</div>
        </Card>
      </div>
      <Card title="PIC matching detail" sub="EXACT = identical · HIGH = identical after removing prefixes/codes/spelling variants · MEDIUM = fuzzy ≥ 0.92, same NOP, unique · NEEDS REVIEW = ambiguous (not used).">
        <DataTable rows={(mb.pic_matches || []).filter((r) => r.confidence !== "EXACT")} pageSize={25} filename="pba_dq_pic_matching.csv" initialSort={{ key: "status", dir: 1 }} columns={[
          { key: "pic", label: "Ticket PIC" }, { key: "nop", label: "NOP" }, { key: "n", label: "Tickets", num: true },
          { key: "status", label: "Status", render: (r) => <Tag tone={r.status === "MATCHED" ? "good" : r.status === "NEEDS REVIEW" ? "warn" : "crit"}>{r.status}</Tag> },
          { key: "confidence", label: "Confidence" }, { key: "mbp_id", label: "Matched base camp" }, { key: "basis", label: "Basis", wrap: true }, { key: "candidates", label: "Candidates", wrap: true }]} />
      </Card>
      <Card title="Possible duplicate base camps" sub="Similar names in the base-camp master. Flagged for review — NOT merged automatically.">
        <DataTable rows={mb.duplicates || []} pageSize={25} filename="pba_dq_basecamp_duplicates.csv" initialSort={{ key: "similarity", dir: -1 }} columns={[
          { key: "mbp_a", label: "Base camp A" }, { key: "mbp_b", label: "Base camp B" }, { key: "nop_a", label: "NOP A" }, { key: "nop_b", label: "NOP B" },
          { key: "similarity", label: "Name similarity", num: true, render: (r) => r.similarity.toFixed(2) }, { key: "km_apart", label: "km apart", num: true, render: (r) => (r.km_apart == null ? "—" : r.km_apart.toFixed(1)) },
          { key: "status", label: "Assessment", wrap: true }]} />
      </Card>
      <Card title="Unmatched list"><DataTable rows={m.dq.unmatched} pageSize={20} filename="pba_dq_unmatched.csv" columns={[{ key: "source", label: "Source" }, { key: "id", label: "ID" }, { key: "n", label: "Tickets", num: true, render: (r) => (r.n == null ? "" : fInt(r.n)) }, { key: "note", label: "Note", wrap: true }]} /></Card>
      <Note>Data snapshot {m.scope.area} {m.scope.period_start} → {m.scope.period_end} · last pipeline refresh {snap.refreshed_at || m.built_at}. To refresh: run <code>python engine/build.py --raw &lt;folder&gt;</code> and redeploy. In OPERATIONAL mode this would be replaced by a scheduled pipeline / API (see README).</Note>
    </div>
  );
}
