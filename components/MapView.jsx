"use client";
import React, { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LEVEL_KIND, STATUS, fInt, fKm, fMin, fPct, fPP, isNum } from "./ui";
import { ACCESS_LABEL, RESP } from "@/lib/logic";

const MAX_POINTS = 4000;
const TRUCK = (sel, isNew) => L.divIcon({
  className: "", iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:6px;background:${isNew ? "#4a3aa7" : sel ? "#eda100" : "#1F2A44"};border:2px solid #fff;box-shadow:0 0 0 1px #1F2A44;display:flex;align-items:center;justify-content:center" aria-label="MBP base camp">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="17" r="1.8" fill="#fff"/><circle cx="17" cy="17" r="1.8" fill="#fff"/></svg></div>`,
});
const CLUSTER = (n, c) => L.divIcon({
  className: "", iconSize: [34, 34], iconAnchor: [17, 17],
  html: `<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid ${c};display:flex;align-items:center;justify-content:center;font:600 11px Inter,system-ui;color:#141821" aria-label="${n} sites">${n > 999 ? Math.round(n / 100) / 10 + "k" : n}</div>`,
});

function Fit({ pts, sig }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    let a0 = Infinity, a1 = -Infinity, o0 = Infinity, o1 = -Infinity;
    for (const [a, b] of pts) { a0 = Math.min(a0, a); a1 = Math.max(a1, a); o0 = Math.min(o0, b); o1 = Math.max(o1, b); }
    const fit = () => { map.invalidateSize(); map.fitBounds([[a0, o0], [a1, o1]], { padding: [20, 20], maxZoom: 11 }); };
    fit(); const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
  }, [sig]); // eslint-disable-line
  return null;
}
function ViewWatch({ onView }) {
  const map = useMapEvents({ zoomend: () => onView(map), moveend: () => onView(map) });
  useEffect(() => { onView(map); }, []); // eslint-disable-line
  return null;
}

export const COLOR_MODES = {
  priority: { label: "MBP priority", of: (s) => LEVEL_KIND.MBP[s.mbp_priority_level]?.c, legend: ["P1", "P2", "P3", "P4"].map((k) => ({ label: `${LEVEL_KIND.MBP[k].i} MBP-${k}`, c: LEVEL_KIND.MBP[k].c })) },
  design: { label: "Battery vs design", of: (s) => STATUS[s.bbt_status]?.c, legend: Object.entries(STATUS).map(([k, v]) => ({ label: `${v.i} ${k}`, c: v.c })) },
  survival: { label: "MBP arrives before BBT?", of: (s) => (!s.covered ? "#7a1414" : s.can_arrive_before_bbt ? "#0ca30c" : "#ec835a"),
    legend: [{ label: "✔ arrives in time", c: "#0ca30c" }, { label: "▲ arrives after battery runs out", c: "#ec835a" }, { label: "✖ no MBP within radius", c: "#7a1414" }] },
};

export default function MapView({ sites = [], mbps = [], cfg, onRadius, onPickSite, mbpStats, fitKey = "", height = 520, colorOverride, legendOverride, defaultMode = "priority", extraMbps = [], compact = false }) {
  const [tileFail, setTileFail] = useState(0), [tileOk, setTileOk] = useState(0);
  const [showSites, setShowSites] = useState(true), [showMbps, setShowMbps] = useState(true), [coverage, setCoverage] = useState(true);
  const [mode, setMode] = useState(defaultMode);
  const [selMbp, setSelMbp] = useState(null), [selSite, setSelSite] = useState(null);
  const [view, setView] = useState({ zoom: 6, b: null });
  const R = cfg.mbp.max_radius_km;
  const colorOf = colorOverride || COLOR_MODES[mode].of;
  const located = useMemo(() => sites.filter((s) => isNum(s.lat) && isNum(s.lon)), [sites]);
  const mbpsLoc = useMemo(() => [...mbps, ...extraMbps].filter((m) => isNum(m.lat)), [mbps, extraMbps]);
  const fitPts = useMemo(() => [...located.map((s) => [s.lat, s.lon]), ...mbpsLoc.map((m) => [m.lat, m.lon])], [located, mbpsLoc]);
  const onView = (map) => { const b = map.getBounds(); setView({ zoom: map.getZoom(), b: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] }); };
  const clustered = view.zoom < 9 && located.length > 300;
  const inView = useMemo(() => {
    if (!view.b) return located.slice(0, MAX_POINTS);
    const [s0, w0, n0, e0] = view.b, pad = 0.2;
    return located.filter((s) => s.lat >= s0 - pad && s.lat <= n0 + pad && s.lon >= w0 - pad && s.lon <= e0 + pad);
  }, [located, view]);
  const clusters = useMemo(() => {
    if (!clustered) return [];
    const cell = 1.6 / 2 ** (view.zoom - 5), g = new Map();
    for (const s of inView) {
      const k = `${Math.floor(s.lat / cell)}:${Math.floor(s.lon / cell)}`;
      const c = g.get(k) || { n: 0, lat: 0, lon: 0, worst: "P4", unc: 0 };
      c.n++; c.lat += s.lat; c.lon += s.lon; if (!s.covered) c.unc++;
      if ((s.mbp_priority_level || "P4") < c.worst) c.worst = s.mbp_priority_level;
      g.set(k, c);
    }
    return [...g.values()].map((c) => ({ ...c, lat: c.lat / c.n, lon: c.lon / c.n }));
  }, [clustered, inView, view.zoom]);
  const pts = clustered ? [] : inView.slice(0, MAX_POINTS);
  const mbpSites = useMemo(() => (selMbp ? located.filter((s) => s.mbp_assigned === selMbp.mbp_id) : []), [selMbp, located]);
  const inRadiusOfSel = useMemo(() => (selMbp ? new Set(located.filter((s) => s.coverage?.inRadius?.some((x) => x.mbp_id === selMbp.mbp_id)).map((s) => s.site_id)) : null), [selMbp, located]);
  const offline = tileFail > 3 && tileOk === 0;
  const st = selMbp && mbpStats ? mbpStats.get(selMbp.mbp_id) : null;
  const legend = legendOverride || COLOR_MODES[mode].legend;
  if (!fitPts.length) return <div className="text-mut text-sm p-6 border border-line rounded-md">No coordinates for this selection.</div>;

  return (
    <div>
      {!compact && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-2 text-[12px]" role="toolbar" aria-label="Map layers">
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} className="accent-navy" />
            <span className="inline-block w-3 h-3 rounded-full border-2 border-white" style={{ background: "#55627A", boxShadow: "0 0 0 1px #55627A" }} aria-hidden /> Sites</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showMbps} onChange={(e) => setShowMbps(e.target.checked)} className="accent-navy" />
            <span className="inline-flex w-4 h-4 rounded bg-navy items-center justify-center text-white text-[9px]" aria-hidden>🚚</span> MBP base camps</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={coverage} onChange={(e) => setCoverage(e.target.checked)} className="accent-navy" /> Coverage layer</label>
          <label className="flex items-center gap-2 text-mut">Coverage radius
            <input type="range" min={20} max={200} step={5} value={R} onChange={(e) => onRadius?.(Number(e.target.value))} className="accent-navy w-36" aria-label="MBP coverage radius km" />
            <span className="text-ink font-semibold tabular w-14">{R} km</span></label>
          {!colorOverride && <label className="flex items-center gap-2 text-mut">Colour sites by
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="border border-line rounded px-1.5 py-1 text-ink">{Object.entries(COLOR_MODES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>}
        </div>
      )}
      <div className="relative">
        <div style={{ height }} className="rounded-md overflow-hidden border border-line">
          <MapContainer center={[0, 102]} zoom={6} zoomSnap={0.25} preferCanvas style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            {!offline && <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap"
              eventHandlers={{ tileerror: () => setTileFail((n) => n + 1), tileload: () => setTileOk((n) => n + 1) }} />}
            <Fit pts={fitPts} sig={fitKey + ":" + fitPts.length} />
            <ViewWatch onView={onView} />
            {selMbp && coverage && <Circle center={[selMbp.lat, selMbp.lon]} radius={R * 1000} pathOptions={{ color: "#eda100", weight: 2, dashArray: "6 6", fillOpacity: 0.05 }} />}
            {showSites && clustered && clusters.map((c, i) => (
              <Marker key={"c" + i} position={[c.lat, c.lon]} icon={CLUSTER(c.n, LEVEL_KIND.MBP[c.worst]?.c || "#55627A")}>
                <Tooltip direction="top">{c.n} sites · worst MBP-{c.worst}{c.unc ? ` · ${c.unc} beyond MBP radius` : ""}<br />zoom in for detail</Tooltip>
              </Marker>
            ))}
            {selMbp && coverage && !clustered && mbpSites.slice(0, 400).map((s) => (
              <Polyline key={"l" + s.site_id} positions={[[selMbp.lat, selMbp.lon], [s.lat, s.lon]]} pathOptions={{ color: "#eda100", weight: 1, opacity: 0.6 }} />
            ))}
            {showSites && pts.map((s) => {
              const c = colorOf(s) || "#55627A", cov = s.covered, dim = inRadiusOfSel && !inRadiusOfSel.has(s.site_id);
              return (
                <CircleMarker key={s.site_id} center={[s.lat, s.lon]} radius={s.mbp_priority_level === "P1" ? 6 : 4.5}
                  pathOptions={{ color: cov ? "#ffffff" : c, weight: cov ? 0.8 : 2.2, fillColor: cov ? c : "#ffffff", fillOpacity: dim ? 0.15 : 0.95, opacity: dim ? 0.3 : 1 }}
                  eventHandlers={{ click: () => { setSelSite(s); setSelMbp(null); } }}>
                  <Tooltip direction="top"><b>{s.site_id}</b> · {s.site_name}<br />MBP-{s.mbp_priority_level} · {s.bbt_status} · {cov ? `MBP ${s.mbp_assigned}` : `nearest MBP ${s.nearest_mbp || "—"} ${s.nearest_mbp_km ? Math.round(s.nearest_mbp_km) + " km" : ""} (beyond radius)`}</Tooltip>
                </CircleMarker>
              );
            })}
            {showMbps && mbpsLoc.map((m) => (
              <Marker key={"m" + m.mbp_id} position={[m.lat, m.lon]} icon={TRUCK(selMbp?.mbp_id === m.mbp_id, m.is_new)} keyboard
                eventHandlers={{ click: () => { setSelMbp(m); setSelSite(null); } }}>
                <Tooltip direction="top"><b>{m.is_new ? "NEW (scenario) " : ""}MBP</b> {m.mbp_id}</Tooltip>
              </Marker>
            ))}
            {selSite && <CircleMarker center={[selSite.lat, selSite.lon]} radius={12} pathOptions={{ color: "#141821", weight: 3, fillOpacity: 0 }} />}
          </MapContainer>
        </div>
        {(selMbp || selSite) && (
          <div className="absolute top-2 right-2 z-[400] w-[300px] bg-white/95 border border-line rounded-lg shadow p-3 text-[12px]" role="dialog" aria-label="Selection details">
            <button onClick={() => { setSelMbp(null); setSelSite(null); }} className="absolute top-1.5 right-2 text-slate text-[16px]" aria-label="Close">×</button>
            {selMbp && (
              <div>
                <div className="font-semibold text-navy text-[13px] pr-4">🚚 {selMbp.mbp_id}</div>
                <div className="text-mut mb-1">Base camp · NOP {selMbp.nop || "—"} · location {selMbp.coord_status === "REPAIRED" ? "repaired" : selMbp.is_new ? "scenario" : "as recorded"}</div>
                <div className="text-[11px] text-[#8a5a00] mb-1">Radius = operational coverage assumption ({R} km), not a fixed boundary — MBPs move.</div>
                {st ? (
                  <table className="w-full"><tbody>
                    {[["Sites assigned", fInt(st.sites_covered)], ["MBP-P1/P2 assigned", fInt(st.p1_p2)], ["Sites within radius", fInt(inRadiusOfSel?.size)],
                      ["Avg distance", fKm(st.avg_km)], ["Avg ETA (ESTIMATED)", fMin(st.avg_eta_min)], ["Dark before MBP", `${fInt(st.at_risk_sites)} (${Math.round(100 * st.risk_share)}%)`],
                      ["Workload (H1 deployments)", fInt(st.deployments_h1)], ["Signal", st.load_signal]].map(([k, v]) => <tr key={k}><td className="text-mut py-0.5">{k}</td><td className="text-right font-medium">{v}</td></tr>)}
                  </tbody></table>) : <div className="text-mut">No statistics (scenario MBP).</div>}
                {st && <div className="text-[11px] text-slate mt-1">{st.signal_why}</div>}
              </div>
            )}
            {selSite && (
              <div>
                <div className="font-semibold text-navy text-[13px] pr-4">● {selSite.site_id} · {selSite.site_name}</div>
                <div className="text-mut mb-1">{selSite.site_class} · {selSite.nop} · {ACCESS_LABEL[selSite.access_class]}</div>
                <table className="w-full"><tbody>
                  {[["Availability", fPct(selSite.avail_wc_pct)], ["Target", fPct(selSite.ran_target_pct)], ["Gap", fPP(selSite.avail_delta_pp)],
                    ["BBT", selSite.battery?.display?.text || `${fMin(selSite.battery?.display?.value)} · ${selSite.battery?.display?.evidence}`], ["Battery vs design", selSite.bbt_status],
                    ["Power downtime", isNum(selSite.ran_power_down_h) ? `${fInt(selSite.ran_power_down_h * 60)} min` : "—"], ["Responsible (power)", selSite.resp?.primary ? `${RESP[selSite.resp.primary]} (${selSite.resp.kind})` : "—"],
                    ["MBP (assigned / nearest)", `${selSite.dist_mbp || "—"}${selSite.within_radius ? "" : " — beyond radius"}`], ["Distance · ETA", `${fKm(selSite.dist_km)} · ${fMin(selSite.dist_eta_min)}${selSite.access_class === "island" ? " (sea access)" : ""}`],
                    ["Inside MBP coverage", selSite.covered ? `yes (${selSite.mbps_in_radius} MBP ≤ ${R} km)` : `no — nearest ${fKm(selSite.nearest_mbp_km)}`],
                    ["Arrives before BBT", selSite.can_arrive_before_bbt ? "✔ yes" : "✖ no"]].map(([k, v]) => <tr key={k}><td className="text-mut py-0.5 pr-2">{k}</td><td className="text-right font-medium">{v}</td></tr>)}
                </tbody></table>
                {onPickSite && <button onClick={() => onPickSite(selSite)} className="mt-2 w-full bg-navy text-white rounded py-1 text-[12px]">Open site detail</button>}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11.5px] text-slate">
        {legend.map((l) => <span key={l.label} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.c }} />{l.label}</span>)}
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block border-2" style={{ borderColor: "#55627A", background: "#fff" }} /> hollow ring = no MBP within {R} km</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex w-4 h-4 rounded bg-navy items-center justify-center text-white text-[9px]">🚚</span> MBP base camp (click: radius + covered sites)</span>
        {clustered && <span className="text-mut">sites grouped — zoom in for individual sites</span>}
        {!clustered && inView.length > MAX_POINTS && <span className="text-mut">showing {MAX_POINTS.toLocaleString()} of {inView.length.toLocaleString()} sites in view — zoom in</span>}
        {offline && <span className="text-[#8a5a00]">Basemap tiles unreachable — points shown on a plain background.</span>}
      </div>
    </div>
  );
}
