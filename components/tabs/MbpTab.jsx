"use client";
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, Select, Tag, SITE14, fInt, fMin, fKm, fCoord, precisionNote, isNum } from "@/components/ui";
import { suggestBasecamps } from "@/lib/logic";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MbpTab({ scope, data, cfg, nop, mbpsScope, mbpStats, setRadius, setPick, part = "map" }) {
  const MAP = part === "map", LIST = part === "list";
  const R = cfg.mbp.max_radius_km;
  const [sel, setSel] = useState("ALL");
  const summary = useMemo(() => mbpsScope.map((m) => mbpStats.get(m.mbp_id)).filter(Boolean), [mbpsScope, mbpStats]);
  const opts = [{ value: "ALL", label: `All sites in scope (${scope.length.toLocaleString()})` },
    // B3 — base camps with no location or 0 assigned sites are not selectable (listed in Data quality)
    ...[...summary].filter((m) => m.coord_status !== "MISSING" && m.sites_covered > 0).sort((a, b) => b.sites_covered - a.sites_covered)
      .map((m) => ({ value: m.mbp_id, label: `${m.mbp_id} — ${m.sites_covered} sites` }))];
  const hidden = summary.filter((m) => m.coord_status === "MISSING" || m.sites_covered === 0).length;
  const cov = useMemo(() => (sel === "ALL" ? scope : scope.filter((s) => s.mbp_assigned === sel)).sort((a, b) => b.mbp_priority_score - a.mbp_priority_score), [scope, sel]);
  const camp = sel === "ALL" ? null : data.mbps.find((m) => m.mbp_id === sel);
  const sug = useMemo(() => suggestBasecamps(scope), [scope]);
  const covered = scope.filter((s) => s.covered).length;
  const inTime = scope.filter((s) => s.can_arrive_before_bbt).length;
  const avg = (f, L = cov) => { const v = L.map(f).filter(isNum); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };

  return (
    <div className="space-y-4">
      {MAP && <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Kpi scope="filtered" label="Sites within MBP radius" value={fInt(covered)} sub={`≥ 1 MBP within ${R} km · ${fInt(scope.length - covered)} beyond radius`} tone={scope.length - covered ? "warn" : "good"} />
        <Kpi scope="filtered" label="MBP arrives before BBT" value={fInt(inTime)} sub={`${Math.round((100 * inTime) / Math.max(1, scope.length))}% of sites in scope`} tone="good" />
        <Kpi scope="filtered" label="Dark before MBP arrives" value={fInt(scope.filter((s) => s.reach_risk).length)} sub={`dark site (≥ ${cfg.availability.dark_min_months} dark months) or battery ran out, and no MBP can arrive before BBT`} tone="crit" />
        <Kpi scope="filtered" label="Avg ETA (assigned)" value={fMin(avg((s) => s.eta_min, scope))} sub="ESTIMATED (speed model, not routing)" />
        <Kpi scope="filtered" label="MBP base camps" value={`${fInt(mbpsScope.filter((m) => isNum(m.lat)).length)} located`} sub={`of ${fInt(mbpsScope.length)} in ${nop === "All NOPs" ? "AREA1" : nop}`} />
        <Kpi scope="portfolio" label="Under-served base camps" value={fInt([...mbpStats.values()].filter((b) => b.load_signal === "Under-served").length)} sub={`≥ ${cfg.basecamp_signal.criteria_needed} of 4 transparent criteria`} />
      </div>}

      {MAP && <Card title="Map — sites and MBP base camps" sub="Click an MBP (truck) to see its coverage radius, the sites it serves and its workload. Click a site for availability, BBT, responsibility and MBP reach. The radius slider changes coverage everywhere (KPIs, tables, simulation).">
        <MapView sites={scope} mbps={mbpsScope} cfg={cfg} onRadius={setRadius} onPickSite={setPick} mbpStats={mbpStats} fitKey={nop} />
      </Card>}

      {LIST && <Card title="Site list — 14 mandatory columns" sub="Distance / travel time = to the assigned MBP (within radius, arrives before BBT where possible) or, if none is within radius, to the nearest MBP — see “Within radius”. ✖ red = no MBP can arrive before BBT. Island = straight-line km with sea access (indicative ETA).">
        <div className="flex flex-wrap items-end gap-4 mb-3">
          <div className="w-[440px] max-w-full"><Select label="Filter by assigned MBP" value={sel} onChange={setSel} options={opts} /></div>
          {hidden > 0 && <span className="text-[11.5px] text-mut">{hidden} base camp(s) with no location or no assigned site hidden — see Data quality.</span>}
          {camp && <div className="text-[12px] text-slate">Base camp {camp.mbp_id} · PIC {camp.pic_name || "—"}{camp.merged_from ? ` (merged: ${camp.merged_from})` : ""} · {camp.nop || "—"} · {camp.coord_status === "MISSING" ? "location UNAVAILABLE" : `${fCoord(camp.lat, 5)}, ${fCoord(camp.lon, 5)}`}
            {camp.coord_status === "REPAIRED" && <Tag tone="warn">coords repaired</Tag>} · H1 tickets {fInt(camp.mbp_tickets_h1)} · avg ETA {fMin(avg((s) => s.eta_min))}</div>}
        </div>
        <DataTable rows={cov} columns={SITE14()} onRowClick={setPick} initialSort={{ key: "mbp_priority_score", dir: -1 }}
          filename={`pba_coverage_${sel === "ALL" ? nop : sel}.csv`.replace(/\s+/g, "_")} rowClass={(r) => (r.site_active ? "" : "bg-line/50 text-mut")}
          extraCsv={[{ key: "assignment_basis", label: "Assignment basis" }, { key: "eta_confidence", label: "ETA confidence" }, { key: "dist_note", label: "Distance note" }, { key: "bbt_design_basis", label: "BBT design basis" }]} />
      </Card>}

      {MAP && <Card title="Base camp analysis (decision support)" sub={`Under-served = at least ${cfg.basecamp_signal.criteria_needed} of: MBP-P1/P2 sites ≥ ${cfg.basecamp_signal.p1p2_sites_min} · ≥ ${Math.round(cfg.basecamp_signal.reach_risk_share_min * 100)}% of its sites dark before MBP arrives · avg ETA ≥ ${cfg.basecamp_signal.avg_eta_min} min · workload ≥ p${Math.round(cfg.basecamp_signal.workload_quantile * 100)}. Thresholds editable in Config.`}>
        <DataTable rows={summary} filename="pba_basecamps.csv" initialSort={{ key: "p1_p2", dir: -1 }} pageSize={30}
          expand={(r) => <div className="text-[12px] text-slate"><b className="text-ink">Why “{r.load_signal}”:</b> {r.signal_why}</div>}
          columns={[
            { key: "mbp_id", label: "Base camp (record)" }, { key: "pic_name", label: "PIC (person)" }, { key: "nop", label: "NOP" },
            { key: "load_signal", label: "Signal", render: (r) => <Tag tone={r.load_signal === "Under-served" ? "crit" : r.load_signal.startsWith("No") ? "warn" : r.load_signal.startsWith("Possibly") ? "mut" : "good"}>{r.load_signal}</Tag> },
            { key: "crit", label: "Criteria met", num: true, sortVal: (r) => r.signal_criteria.length, render: (r) => `${r.signal_criteria.length}/4`, csv: (r) => r.signal_criteria.join("; ") },
            { key: "sites_covered", label: "Sites assigned", num: true }, { key: "p1_p2", label: "MBP-P1+P2", num: true },
            { key: "risk_share", label: "Dark before MBP", num: true, render: (r) => `${fInt(r.at_risk_sites)} (${Math.round(100 * r.risk_share)}%)` },
            { key: "avg_km", label: "Avg km", num: true, render: (r) => fKm(r.avg_km) }, { key: "avg_eta_min", label: "Avg ETA", num: true, render: (r) => fMin(r.avg_eta_min) },
            { key: "deployments_h1", label: "Workload (H1)", num: true, render: (r) => fInt(r.deployments_h1) },
            { key: "coord_status", label: "Location", render: (r) => (r.coord_status === "ACTUAL" ? "as recorded" : <Tag tone={r.coord_status === "MISSING" ? "crit" : "warn"}>{r.coord_status.toLowerCase()}</Tag>) },
          ]} />
      </Card>}

      {MAP && <Card title="Suggested location for an extra / relocated MBP" sub="Priority-weighted centre of P1/P2 sites that go dark before an MBP can arrive, snapped to the nearest real site (anchor). Coordinates shown at the precision of the source record.">
        <Note tone="warn">Decision support only — straight-line distance, no road routing. The centre point is a calculation, not a surveyed location; use the anchor site and validate with the field team.</Note>
        <div className="mt-3">
          <DataTable rows={sug} filename="pba_basecamp_suggestions.csv" pageSize={20} columns={[
            { key: "nop", label: "NOP" }, { key: "at_risk_priority_sites", label: "At-risk MBP-P1/P2 sites", num: true }, { key: "uncovered", label: "…beyond radius", num: true },
            { key: "anchor_site", label: "Anchor site" }, { key: "anchor_site_name", label: "Anchor name" },
            { key: "anchor_lat", label: "Anchor lat, lon", render: (r) => `${fCoord(r.anchor_lat, r.anchor_decimals)}, ${fCoord(r.anchor_lon, r.anchor_decimals)}`, csv: (r) => `${fCoord(r.anchor_lat, r.anchor_decimals)} ${fCoord(r.anchor_lon, r.anchor_decimals)}` },
            { key: "anchor_decimals", label: "Source precision", render: (r) => precisionNote(r.anchor_decimals) },
            { key: "anchor_km_from_centre", label: "Anchor ↔ centre", num: true, render: (r) => fKm(r.anchor_km_from_centre) },
            { key: "avg_eta_now_min", label: "Avg ETA now", num: true, render: (r) => fMin(r.avg_eta_now_min) },
          ]} />
        </div>
      </Card>}
    </div>
  );
}
