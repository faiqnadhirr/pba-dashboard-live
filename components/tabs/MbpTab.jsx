"use client";
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, Select, Toggle, Slider, LevelTag, Tag, SITE14, fInt, fMin, fKm, fCoord, f2, LEVEL, isNum } from "@/components/ui";
import { basecampSummary, suggestBasecamps } from "@/lib/logic";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function MbpTab({ scope, scored, data, cfg, nop, setPick }) {
  const mbpsInScope = useMemo(() => data.mbps.filter((m) => nop === "All NOPs" || m.nop === nop), [data.mbps, nop]);
  const summary = useMemo(() => basecampSummary(scope, mbpsInScope), [scope, mbpsInScope]);
  const [sel, setSel] = useState("ALL");
  const [radius, setRadius] = useState(false);
  const [rkm, setRkm] = useState(30);
  const opts = [{ value: "ALL", label: `All base camps in scope (${mbpsInScope.length})` },
    ...[...summary].sort((a, b) => b.sites_covered - a.sites_covered).map((m) => ({ value: m.mbp_id, label: `${m.mbp_id} — ${m.sites_covered} sites${m.coord_status === "MISSING" ? " (no location)" : ""}` }))];
  const cov = useMemo(() => (sel === "ALL" ? scope : scope.filter((s) => s.mbp_assigned === sel)).sort((a, b) => b.mbp_priority_score - a.mbp_priority_score), [scope, sel]);
  const camp = sel === "ALL" ? null : data.mbps.find((m) => m.mbp_id === sel);
  const sug = useMemo(() => suggestBasecamps(scope), [scope]);
  const cols = SITE14(cfg.bbt.design_minutes);
  const avg = (f) => { const v = cov.map(f).filter(isNum); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null; };

  return (
    <div className="space-y-4">
      <Card title="Base camp & coverage area" sub="Coverage = MBP that historically served the site most (if located in the same NOP), else nearest MBP in the NOP (cross-NOP only when the NOP has no located MBP).">
        <div className="flex flex-wrap items-end gap-4 mb-3">
          <div className="w-[420px] max-w-full"><Select label="MBP base camp" value={sel} onChange={setSel} options={opts} /></div>
          <Toggle label="Show reach radius" checked={radius} onChange={setRadius} />
          {radius && <div className="w-48"><Slider label="Radius" value={rkm} onChange={setRkm} min={10} max={80} fmt={(v) => `${v} km`} /></div>}
        </div>
        {camp && <div className="text-[12px] text-slate mb-2">Base camp {camp.mbp_id} · NOP {camp.nop || "—"} · location {camp.coord_status === "MISSING" ? "UNAVAILABLE" : `${fCoord(camp.lat)}, ${fCoord(camp.lon)}`} {camp.coord_status === "REPAIRED" && <Tag tone="warn">coords repaired (decimal point)</Tag>} · H1 tickets {fInt(camp.mbp_tickets_h1)} · sites served {fInt(camp.mbp_sites_served)}</div>}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-3">
          <Kpi label="Sites covered" value={fInt(cov.length)} />
          <Kpi label="P1 + P2" value={fInt(cov.filter((s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2").length)} tone="crit" />
          <Kpi label="Dark before MBP (ETA > BBT)" value={fInt(cov.filter((s) => s.reach_risk === 1).length)} tone="crit" />
          <Kpi label="Avg distance" value={fKm(avg((s) => s.km_assigned))} />
          <Kpi label="Avg travel time" value={fMin(avg((s) => s.eta_min))} sub="ESTIMATED" />
          <Kpi label="MBP deployments H1" value={fInt(cov.reduce((a, s) => a + (s.mbp_deployments || 0), 0))} />
        </div>
        <MapView sites={cov} mbps={camp ? [camp] : mbpsInScope} radiusKm={radius ? rkm : null} onPick={setPick} fitKey={sel + nop}
          colorOf={(s) => LEVEL[s.mbp_priority_level].c} sizeOf={(s) => (s.reach_risk ? 5.5 : 4)}
          legend={["P1", "P2", "P3", "P4"].map((l) => ({ label: l, c: LEVEL[l].c }))} />
      </Card>

      <Card title="Coverage site list — 14 mandatory columns" sub="Sorted by priority. Click a row for full site detail. Travel time in red = MBP arrives after the battery runs out.">
        <DataTable rows={cov} columns={cols} onRowClick={setPick} initialSort={{ key: "mbp_priority_score", dir: -1 }}
          filename={`pba_coverage_${sel === "ALL" ? nop : sel}.csv`.replace(/\s+/g, "_")} rowClass={(r) => (r.site_active ? "" : "bg-line/50 text-mut")} />
      </Card>

      <Card title="Base camp analysis (decision support)" sub="Load and risk per MBP base camp, using the current priority settings.">
        <DataTable rows={summary} filename="pba_basecamps.csv" initialSort={{ key: "at_risk_sites", dir: -1 }} pageSize={25} columns={[
          { key: "mbp_id", label: "MBP" }, { key: "nop", label: "NOP" },
          { key: "coord_status", label: "Location", render: (r) => (r.coord_status === "ACTUAL" ? "ok" : <Tag tone={r.coord_status === "MISSING" ? "crit" : "warn"}>{r.coord_status.toLowerCase()}</Tag>) },
          { key: "sites_covered", label: "Sites covered", num: true }, { key: "p1_p2", label: "P1+P2", num: true },
          { key: "at_risk_sites", label: "ETA > BBT", num: true }, { key: "avg_km", label: "Avg km", num: true, render: (r) => fKm(r.avg_km) },
          { key: "max_km", label: "Max km", num: true, render: (r) => fKm(r.max_km) }, { key: "avg_eta_min", label: "Avg ETA", num: true, render: (r) => fMin(r.avg_eta_min) },
          { key: "deployments_h1", label: "Deployments H1", num: true, render: (r) => fInt(r.deployments_h1) },
          { key: "run_hours_h1", label: "Run hours H1", num: true, render: (r) => fInt(r.run_hours_h1) },
          { key: "load_signal", label: "Signal", render: (r) => <Tag tone={r.load_signal.startsWith("under") ? "crit" : r.load_signal.startsWith("no loc") ? "warn" : r.load_signal.startsWith("possibly") ? "mut" : "good"}>{r.load_signal}</Tag> },
        ]} />
      </Card>

      <Card title="Suggested location for an extra / relocated MBP" sub="Priority-weighted centre of P1/P2 sites that go dark before the MBP arrives, snapped to the nearest real site (anchor). Coordinates at 5 decimals (≈1 m).">
        <Note tone="warn">Decision support only: straight-line distance, no road routing. Validate the anchor site with the field team before relocating.</Note>
        <div className="mt-3">
          <DataTable rows={sug} filename="pba_basecamp_suggestions.csv" pageSize={20} columns={[
            { key: "nop", label: "NOP" }, { key: "at_risk_priority_sites", label: "At-risk P1/P2 sites", num: true },
            { key: "anchor_site", label: "Anchor site" }, { key: "anchor_site_name", label: "Anchor name" },
            { key: "anchor_lat", label: "Anchor lat", num: true, render: (r) => fCoord(r.anchor_lat) }, { key: "anchor_lon", label: "Anchor lon", num: true, render: (r) => fCoord(r.anchor_lon) },
            { key: "suggested_lat", label: "Centre lat", num: true, render: (r) => fCoord(r.suggested_lat) }, { key: "suggested_lon", label: "Centre lon", num: true, render: (r) => fCoord(r.suggested_lon) },
            { key: "anchor_km_from_centre", label: "Anchor ↔ centre", num: true, render: (r) => fKm(r.anchor_km_from_centre) },
            { key: "avg_eta_now_min", label: "Avg ETA now", num: true, render: (r) => fMin(r.avg_eta_now_min) },
          ]} />
        </div>
      </Card>
    </div>
  );
}
