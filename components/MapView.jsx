"use client";
import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const MAX_POINTS = 5000;

function Fit({ pts, sig }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity;
    for (const [a, b] of pts) { la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, b); lo1 = Math.max(lo1, b); }
    const fit = () => { map.invalidateSize(); map.fitBounds([[la0, lo0], [la1, lo1]], { padding: [20, 20], maxZoom: 11 }); };
    fit(); const t = setTimeout(fit, 250);
    return () => clearTimeout(t);
  }, [sig]); // eslint-disable-line
  return null;
}

/** Tiles that fail (offline / blocked) are detected automatically: markers keep working on a plain background. */

export default function MapView({ sites = [], colorOf, sizeOf, mbps = [], highlight = [], radiusKm = null, onPick, height = 460, legend = [], fitKey = "" }) {
  const [tileFail, setTileFail] = useState(0);
  const [tileOk, setTileOk] = useState(0);
  const pts = useMemo(() => sites.filter((s) => s.lat != null && s.lon != null).slice(0, MAX_POINTS), [sites]);
  const fitPts = useMemo(() => [...pts.map((s) => [s.lat, s.lon]), ...mbps.filter((m) => m.lat != null).map((m) => [m.lat, m.lon])], [pts, mbps]);
  const offline = tileFail > 3 && tileOk === 0;
  if (!fitPts.length) return <div className="text-mut text-sm p-6 border border-line rounded-md">No coordinates for this selection.</div>;
  return (
    <div className="relative">
      <div style={{ height }} className="rounded-md overflow-hidden border border-line">
        <MapContainer center={[0, 102]} zoom={6} zoomSnap={0.25} preferCanvas style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          {!offline && (
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap"
              eventHandlers={{ tileerror: () => setTileFail((n) => n + 1), tileload: () => setTileOk((n) => n + 1) }} />
          )}
          <Fit pts={fitPts} sig={fitKey + ":" + fitPts.length} />
          {radiusKm && mbps.filter((m) => m.lat != null).map((m) => (
            <Circle key={"r" + m.mbp_id} center={[m.lat, m.lon]} radius={radiusKm * 1000} pathOptions={{ color: "#2a78d6", weight: 1, fillOpacity: 0.04 }} />
          ))}
          {pts.map((s) => (
            <CircleMarker key={s.site_id} center={[s.lat, s.lon]} radius={sizeOf ? sizeOf(s) : 4}
              pathOptions={{ color: "#ffffff", weight: 0.6, fillColor: colorOf(s), fillOpacity: 0.9 }}
              eventHandlers={onPick ? { click: () => onPick(s) } : undefined}>
              <Tooltip direction="top"><b>{s.site_id}</b> · {s.site_name}<br />{s.site_class} · {s.mbp_priority_level} · BBT {s.bbt_value_min != null ? Math.round(s.bbt_value_min) + " min" : "—"}</Tooltip>
            </CircleMarker>
          ))}
          {mbps.filter((m) => m.lat != null).map((m) => (
            <CircleMarker key={"m" + m.mbp_id} center={[m.lat, m.lon]} radius={m.is_new ? 9 : mbps.length > 60 ? 4 : 7}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: m.is_new ? "#4a3aa7" : "#1F2A44", fillOpacity: 1 }}>
              <Tooltip direction="top"><b>{m.is_new ? "NEW " : ""}MBP</b> {m.mbp_id}{m.coord_status === "REPAIRED" ? " (coords repaired)" : ""}</Tooltip>
            </CircleMarker>
          ))}
          {highlight.map((h, i) => (
            <CircleMarker key={"h" + i} center={[h.lat, h.lon]} radius={11} pathOptions={{ color: "#141821", weight: 3, fillOpacity: 0 }}>
              <Tooltip permanent direction="right">{h.label}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11.5px] text-slate">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.c }} />{l.label}</span>
        ))}
        {mbps.length > 0 && <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block border-2 border-white" style={{ background: "#1F2A44", boxShadow: "0 0 0 1px #1F2A44" }} />MBP base camp</span>}
        {sites.length > MAX_POINTS && <span className="text-mut">showing top {MAX_POINTS.toLocaleString()} of {sites.length.toLocaleString()} sites (by current sort)</span>}
        {offline && <span className="text-[#9a6a00]">Basemap tiles unreachable (offline / blocked) — showing points on a plain background.</span>}
      </div>
    </div>
  );
}
