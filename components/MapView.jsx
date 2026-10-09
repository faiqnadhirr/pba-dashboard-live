"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LEVEL_KIND, STATUS, fInt, fKm, fMin, fPct, fPP, fH, isNum } from "./ui";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { MAP_MODES } from "@/lib/mapmodes";
import { rollup } from "@/lib/rollup";
import { modeColor, modeLegend, siteWhy, keyColor } from "./mapModes";
import RollupPanel from "./RollupPanel";

// far zoom: a small square per base camp so the trucks do not cover the sites; full truck icon from zoom 8
// v3.7 — base camps can carry a performance colour (fill) — the dark outline keeps them distinct from site dots
const CAMP_DOT = (sel, isNew, col) => L.divIcon({ className: "", iconSize: [col ? 14 : 10, col ? 14 : 10], iconAnchor: [col ? 7 : 5, col ? 7 : 5],
  html: `<div style="width:${col ? 14 : 10}px;height:${col ? 14 : 10}px;border-radius:3px;background:${isNew ? "#4a3aa7" : sel ? "#eda100" : col || "#1F2A44"};border:${col ? 2 : 1.5}px solid #fff;box-shadow:0 0 0 1.5px #1F2A44"></div>` });
const TRUCK = (sel, isNew, col) => L.divIcon({
  className: "", iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:6px;background:${isNew ? "#4a3aa7" : sel ? "#eda100" : col || "#1F2A44"};border:2px solid #fff;box-shadow:0 0 0 1px #1F2A44;display:flex;align-items:center;justify-content:center" aria-label="MBP base camp">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="17" r="1.8" fill="#fff"/><circle cx="17" cy="17" r="1.8" fill="#fff"/></svg></div>`,
});

function Fit({ pts, sig }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    // fit to the 0.5–99.5 percentile box so a few far-away points do not shrink the hero map
    const la = pts.map((p) => p[0]).sort((x, y) => x - y), lo = pts.map((p) => p[1]).sort((x, y) => x - y);
    const q = (v, f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))];
    const tail = pts.length > 200 ? 0.005 : 0;
    const a0 = q(la, tail), a1 = q(la, 1 - tail), o0 = q(lo, tail), o1 = q(lo, 1 - tail);
    const fit = () => { map.invalidateSize(); map.fitBounds([[a0, o0], [a1, o1]], { padding: [12, 12], maxZoom: 11 }); };
    fit(); const tm = setTimeout(fit, 250);
    return () => clearTimeout(tm);
  }, [sig]); // eslint-disable-line
  return null;
}
function ZoomWatch({ onZoom }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, []); // eslint-disable-line
  return null;
}

/* v3.5 — pie bubble for a roll-up unit (cluster / NOP): slices = site categories in legend order, size ∝ √sites */
const PIE = (u, keys, colorOfKey, label, center) => {
  const d = Math.round((u.level === "nop" ? 24 : 16) + Math.min(u.level === "nop" ? 26 : 20, Math.sqrt(u.n) * 0.8)), r = d / 2, cx = r, cy = r;
  let a0 = -Math.PI / 2, paths = "";
  for (const k of keys) { const v = u.counts[k] || 0; if (!v) continue; const a1 = a0 + (2 * Math.PI * v) / u.n;
    if (v === u.n) paths += `<circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="${colorOfKey(k)}"/>`;
    else paths += `<path d="M${cx},${cy} L${cx + (r - 1) * Math.cos(a0)},${cy + (r - 1) * Math.sin(a0)} A${r - 1},${r - 1} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${cx + (r - 1) * Math.cos(a1)},${cy + (r - 1) * Math.sin(a1)} Z" fill="${colorOfKey(k)}"/>`;
    a0 = a1; }
  return L.divIcon({ className: "", iconSize: [d, d + 14], iconAnchor: [r, r],
    html: `<div style="position:relative;width:${d}px"><svg width="${d}" height="${d}" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">${paths}<circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${Math.max(7, r * 0.42)}" fill="#fff"/><text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#141821" font-family="Inter,system-ui">${center}</text></svg>`
      + (label ? `<div style="position:absolute;left:50%;top:${d}px;transform:translateX(-50%);white-space:nowrap;font:600 10.5px Inter,system-ui;color:#141821;text-shadow:0 0 3px #fff,0 0 3px #fff">${label}</div>` : "") + `</div>` });
};
const PRIO_Z = { P4: 0, P3: 1, P2: 2, P1: 3 };

/**
 * All sites are drawn on ONE canvas layer (no clustering, no "zoom in to click"): ~20k points stay fast, and a 7-px click
 * tolerance makes every dot clickable at AREA zoom. Dot size grows with power downtime (site went dark on power).
 */
function SiteLayer({ sites, colorOf, sizeOf, hollowOf, inRadiusOfSel, onPick, zoom, ttLine }) {
  const map = useMap();
  const layer = useRef(null);
  const renderer = useMemo(() => L.canvas({ tolerance: 7, padding: 0.3 }), []);
  useEffect(() => {
    const g = L.layerGroup();
    const base = zoom <= 6 ? 2.6 : zoom <= 7 ? 3.2 : zoom <= 8 ? 4 : zoom <= 10 ? 5 : 6;
    // draw low priority first so P1 sits on top
    const order = [...sites].sort((a, b) => (PRIO_Z[a.mbp_priority_level] ?? 0) - (PRIO_Z[b.mbp_priority_level] ?? 0));
    for (const s of order) {
      const c = colorOf(s) || "#55627A", cov = !hollowOf(s), dim = inRadiusOfSel && !inRadiusOfSel.has(s.site_id);
      const m = L.circleMarker([s.lat, s.lon], { renderer, radius: base + sizeOf(s) * (zoom <= 7 ? 3 : 4), color: cov ? "#ffffff" : c, weight: cov ? 0.6 : 1.8,
        fillColor: cov ? c : "#ffffff", fillOpacity: dim ? 0.12 : 0.9, opacity: dim ? 0.25 : 1, bubblingMouseEvents: false });
      m.on("click", () => onPick(s));
      m.on("mouseover", () => {
        if (!m.getTooltip()) m.bindTooltip(`<b>${s.site_id}</b> · ${s.site_name || ""}<br/>${ttLine(s)}<br/><span style="color:#55627A">${t("map.tt_click")}</span>`, { direction: "top", offset: [0, -4] });
        m.openTooltip();
      });
      g.addLayer(m);
    }
    g.addTo(map); layer.current = g;
    return () => { g.remove(); };
  }, [sites, colorOf, sizeOf, hollowOf, inRadiusOfSel, zoom, map, renderer]); // eslint-disable-line
  return null;
}

export default function MapView({ sites = [], mbps = [], cfg, onRadius, onPickSite, mbpStats, fitKey = "", height = 520, colorOverride, legendOverride, keyOverride,
  defaultMode = "priority", extraMbps = [], compact = false, mode: modeProp, onMode, hidden: hiddenProp, onHidden, modes = ["priority", "design", "survival"],
  defaultLevel = "site", onFilterNop, periodText, showMbpLayers = true, mbpKeyOf, mbpLegend, mbpPerf, onOpenMbp, mbpLabel }) {
  const [mbpHidden, setMbpHidden] = useState([]);
  const [tileFail, setTileFail] = useState(0), [tileOk, setTileOk] = useState(0);
  const [showSites, setShowSites] = useState(true), [showMbps, setShowMbps] = useState(true), [coverage, setCoverage] = useState(false);
  const [modeL, setModeL] = useState(defaultMode), [hiddenL, setHiddenL] = useState([]);
  // mode / hidden categories can be controlled by the parent (so KPIs and lists follow the legend)
  const mode = modeProp ?? modeL, hidden = hiddenProp ?? hiddenL;
  const setMode = (m) => { (onMode || setModeL)(m); (onHidden || setHiddenL)([]); };
  const toggle = (k) => (onHidden || setHiddenL)(hidden.includes(k) ? hidden.filter((x) => x !== k) : [...hidden, k]);
  const [selMbp, setSelMbp] = useState(null), [selSite, setSelSite] = useState(null);
  const [zoom, setZoom] = useState(6);
  const R = cfg.mbp.max_radius_km;
  const MM = colorOverride ? null : MAP_MODES[mode];
  const colorOf = useMemo(() => colorOverride || modeColor(mode), [colorOverride, mode]);
  const keyOf = keyOverride || (MM ? MM.key : null);
  const legend = legendOverride || modeLegend(mode);
  const hollowOf = useMemo(() => (MM ? MM.hollow || (() => false) : (s) => !s.covered), [MM]);
  const ttLine = useMemo(() => (MM ? (s) => siteWhy(mode, s) : (s) => `MBP-${s.mbp_priority_level} · ${tv("status", s.bbt_status)}`), [MM, mode]);
  // v3.5 — roll-up level: site dots, or one pie bubble per cluster / NOP (every bubble = its sites)
  const [level, setLevel] = useState(defaultLevel), [unit, setUnit] = useState(null);
  const canRoll = !!MM && !compact;
  const located = useMemo(() => sites.filter((s) => isNum(s.lat) && isNum(s.lon)), [sites]);
  const shown = useMemo(() => (keyOf && hidden.length ? located.filter((s) => !hidden.includes(keyOf(s))) : located), [located, keyOf, hidden]);
  const counts = useMemo(() => { const c = {}; if (keyOf) located.forEach((s) => { const k = keyOf(s); c[k] = (c[k] || 0) + 1; }); return c; }, [located, keyOf]);
  const mbpsAll = useMemo(() => [...mbps, ...extraMbps].filter((m) => isNum(m.lat)), [mbps, extraMbps]);
  const mbpsLoc = useMemo(() => (mbpKeyOf && mbpHidden.length ? mbpsAll.filter((m) => m.is_new || !mbpHidden.includes(mbpKeyOf(m))) : mbpsAll), [mbpsAll, mbpKeyOf, mbpHidden]);
  const mbpCounts = useMemo(() => { const c = {}; if (mbpKeyOf) mbpsAll.forEach((m) => { if (!m.is_new) { const k = mbpKeyOf(m); c[k] = (c[k] || 0) + 1; } }); return c; }, [mbpsAll, mbpKeyOf]);
  const mbpCol = (m) => (mbpKeyOf && mbpLegend ? mbpLegend.find((l) => l.k === mbpKeyOf(m))?.c : null);
  const fitPts = useMemo(() => [...located.map((s) => [s.lat, s.lon]), ...mbpsAll.map((m) => [m.lat, m.lon])], [located, mbpsAll]);
  // dot size = power downtime (sqrt scale, p95 = full size)
    const sizeFn = MM?.size || ((s) => s.ran_power_down_h);
  const p95s = useMemo(() => { const v = located.map((s) => sizeFn(s) || 0).sort((a, b) => a - b); return v[Math.floor(v.length * 0.95)] || 1; }, [located, mode]); // eslint-disable-line
  const sizeOf = useMemo(() => (MM && !MM.size ? () => 0.25 : (s) => Math.sqrt(Math.min(1, (sizeFn(s) || 0) / p95s))), [p95s, MM]); // eslint-disable-line
  const visAll = useMemo(() => (keyOf && hidden.length ? sites.filter((s) => !hidden.includes(keyOf(s))) : sites), [sites, keyOf, hidden]);
  const units = useMemo(() => (canRoll && level !== "site" ? rollup(shown, level, mode).filter((u) => u.lat != null) : []), [canRoll, level, shown, mode]);
  const mbpSites = useMemo(() => (selMbp ? located.filter((s) => s.mbp_assigned === selMbp.mbp_id) : []), [selMbp, located]);
  const inRadiusOfSel = useMemo(() => (selMbp ? new Set(located.filter((s) => s.coverage?.inRadius?.some((x) => x.mbp_id === selMbp.mbp_id)).map((s) => s.site_id)) : null), [selMbp, located]);
  const offline = tileFail > 3 && tileOk === 0;
  const st = selMbp && mbpStats ? mbpStats.get(selMbp.mbp_id) : null;
  const pick = useMemo(() => (s) => { setSelSite(s); setSelMbp(null); }, []);
  if (!fitPts.length) return <div className="text-mut text-sm p-6 border border-line rounded-md">{t("map.no_coords")}</div>;
  const chip = (on) => `inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border text-[11.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${on ? "bg-white border-slate/40 text-ink hover:border-slate" : "bg-surface border-line text-mut line-through decoration-1"}`;

  return (
    <div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 text-[12px]" role="toolbar" aria-label={t("map.layers")}>
          {canRoll && <div className="flex rounded-md overflow-hidden border border-line" role="group" aria-label={t("map.level")}>
            {["site", "cluster", "nop"].map((lv) => <button key={lv} aria-pressed={level === lv} onClick={() => { setLevel(lv); setUnit(null); }} title={t(`map.level_tip.${lv}`)}
              className={`px-2.5 py-1 text-[12px] ${level === lv ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`map.level.${lv}`)}</button>)}
          </div>}
          {showMbpLayers && <>
          <label className="inline-flex items-center gap-1.5 font-medium"><input type="checkbox" checked={coverage} onChange={(e) => setCoverage(e.target.checked)} className="accent-navy" />
            {t("map.cov_toggle")}</label>
          <span className="text-mut -ml-2">{t("map.cov_note", { r: R })}</span>
          <label className="flex items-center gap-2 text-mut">{t("map.radius")}
            <input type="range" min={20} max={200} step={5} value={R} onChange={(e) => onRadius?.(Number(e.target.value))} className="accent-navy w-32" aria-label={t("map.radius")} />
            <span className="text-ink font-semibold tabular w-14">{R} km</span></label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showMbps} onChange={(e) => setShowMbps(e.target.checked)} className="accent-navy" />
            <span className="inline-flex w-4 h-4 rounded bg-navy items-center justify-center text-white text-[9px]" aria-hidden>🚚</span> {t("map.basecamps")}</label>
          </>}
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} className="accent-navy" /> {t("map.sites")}</label>
          {!colorOverride && <label className="flex items-center gap-2 text-mut ml-auto">{t("map.colour_by")}
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="border border-line rounded px-1.5 py-1 text-ink bg-white">{modes.map((k) => <option key={k} value={k}>{t(`map.mode.${k}`)}</option>)}</select></label>}
        </div>
      )}
      <div className="relative">
        <div style={{ height }} className="rounded-md overflow-hidden border border-line">
          <MapContainer center={[0, 102]} zoom={6} zoomSnap={0.5} preferCanvas style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            {!offline && <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap"
              eventHandlers={{ tileerror: () => setTileFail((n) => n + 1), tileload: () => setTileOk((n) => n + 1) }} />}
            <Fit pts={fitPts} sig={fitKey + ":" + fitPts.length} />
            <ZoomWatch onZoom={setZoom} />
            {showMbpLayers && coverage && showMbps && mbpsLoc.map((m) => (
              <Circle key={"r" + m.mbp_id} center={[m.lat, m.lon]} radius={R * 1000} interactive={false}
                pathOptions={{ color: "#2a78d6", weight: 0.8, opacity: 0.5, fillColor: "#2a78d6", fillOpacity: 0.025 }} />
            ))}
            {selMbp && <Circle center={[selMbp.lat, selMbp.lon]} radius={R * 1000} interactive={false} pathOptions={{ color: "#eda100", weight: 2.5, dashArray: "6 6", fillOpacity: 0.06 }}>
              <Tooltip permanent direction="top" offset={[0, -6]} className="!text-[11px]">{t("map.radius_lbl", { r: R })}</Tooltip></Circle>}
            {selMbp && mbpSites.slice(0, 400).map((s) => (
              <Polyline key={"l" + s.site_id} positions={[[selMbp.lat, selMbp.lon], [s.lat, s.lon]]} pathOptions={{ color: "#eda100", weight: 1, opacity: 0.6 }} interactive={false} />
            ))}
            {showSites && (level === "site" || !canRoll) && <SiteLayer sites={shown} colorOf={colorOf} sizeOf={sizeOf} hollowOf={hollowOf} inRadiusOfSel={inRadiusOfSel} onPick={pick} zoom={Math.round(zoom)} ttLine={ttLine} />}
            {showSites && canRoll && level !== "site" && units.map((u) => (
              <Marker key={"u" + u.id} position={[u.lat, u.lon]} icon={PIE(u, MM.keys, (k) => keyColor(mode, k), level === "nop" || zoom >= 7.5 ? String(u.id).replace(/^(NOP|TO) /, "") : "",
                mode === "trend" ? ({ Deteriorating: "▼", Mixed: "◆", Improving: "▲", Stable: "=" })[MM.keys.find((k) => u.counts[k])] || "?" : `${Math.round(100 * u.badShare)}%`)} keyboard
                eventHandlers={{ click: () => setUnit({ level, id: u.id }) }}>
                <Tooltip direction="top" offset={[0, -10]}><b>{u.id}</b> · {fInt(u.n)} {t("map.sites").toLowerCase()}<br />{t("map.unit_tip", { p: fPct(100 * u.badShare, 0), b: fInt(u.bad) })}<br /><span className="text-mut">{t("map.unit_click")}</span></Tooltip>
              </Marker>))}
            {showMbpLayers && showMbps && mbpsLoc.map((m) => (
              <Marker key={"m" + m.mbp_id} position={[m.lat, m.lon]} icon={(zoom >= 8 ? TRUCK : CAMP_DOT)(selMbp?.mbp_id === m.mbp_id, m.is_new, mbpCol(m))} keyboard
                eventHandlers={{ click: () => { setSelMbp(m); setSelSite(null); } }}>
                <Tooltip direction="top"><b>{m.is_new ? (m.new_label || t("map.new_scenario")) + " " : ""}MBP</b> {m.mbp_id}{mbpLabel && !m.is_new ? <><br />{mbpLabel(m)}</> : null}<br />{t("map.tt_camp_click", { r: R })}</Tooltip>
              </Marker>
            ))}
            {selSite && <CircleMarker center={[selSite.lat, selSite.lon]} radius={12} interactive={false} pathOptions={{ color: "#141821", weight: 3, fillOpacity: 0 }} />}
          </MapContainer>
        </div>
        {(selMbp || selSite) && (
          <div className="absolute top-2 right-2 z-[400] w-[300px] bg-white/95 border border-line rounded-lg shadow p-3 text-[12px]" role="dialog" aria-label={t("map.selection")}>
            <button onClick={() => { setSelMbp(null); setSelSite(null); }} className="absolute top-1.5 right-2 text-slate text-[16px]" aria-label={t("common.close")}>×</button>
            {selMbp && (
              <div>
                <div className="font-semibold text-navy text-[13px] pr-4">🚚 {selMbp.mbp_id}</div>
                <div className="text-mut mb-1">{t("map.camp_line", { nop: selMbp.nop || "—", loc: selMbp.coord_status === "REPAIRED" ? t("mbp.coord.REPAIRED") : selMbp.is_new ? t("map.scenario") : t("mbp.as_recorded") })}{selMbp.pic_name ? ` · PIC ${selMbp.pic_name}` : ""}</div>
                <div className="text-[11px] text-[#8a5a00] mb-1">{t("map.radius_note", { r: R })}</div>
                {st ? (
                  <table className="w-full"><tbody>
                    {[[t("col.sites_assigned"), fInt(st.sites_covered)], [t("col.p1p2"), fInt(st.p1_p2)], [t("map.sites_in_radius"), fInt(inRadiusOfSel?.size)],
                      [t("map.avg_distance"), fKm(st.avg_km)], [t("map.avg_eta_est"), fMin(st.avg_eta_min)], [t("col.dark_before_mbp"), `${fInt(st.at_risk_sites)} (${fPct(100 * st.risk_share, 0)})`],
                      [t("map.workload"), fInt(st.deployments_h1)], [t("col.signal"), tv("signal", st.load_signal)]].map(([k, v]) => <tr key={k}><td className="text-mut py-0.5">{k}</td><td className="text-right font-medium">{v}</td></tr>)}
                  </tbody></table>) : <div className="text-mut">{t("map.no_stats")}</div>}
                {st && !mbpPerf && <div className="text-[11px] text-slate mt-1">{te(st.signal_why, "signal")}</div>}
                {mbpPerf?.get(selMbp.mbp_id) && (() => { const p = mbpPerf.get(selMbp.mbp_id); return (
                  <div className="mt-2 border-t border-line pt-1.5">
                    <div className="font-semibold text-[11.5px] text-ink mb-0.5 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: mbpCol(selMbp) || "#1F2A44" }} />{t("perf.card.title")} · {t(`perf.key.${p.key}`)}</div>
                    <table className="w-full"><tbody>
                      {[[t("perf.col.jobs"), `${fInt(p.jobs)} (${fInt(Math.round(p.jobs_month))}/${t("perf.month_short")})`], [t("perf.col.need_month"), fInt(p.need_month)],
                        [t("perf.col.resp"), p.resp == null ? "—" : fPct(100 * p.resp, 0)], [t("perf.col.busy"), fPct(100 * p.busy, 1)],
                        [t("perf.col.ontime"), p.ontime_rate == null ? "—" : fPct(100 * p.ontime_rate, 0)], [t("perf.col.rh_month"), fH(p.busy_h_month)],
                        [t("perf.col.capture"), p.capture == null ? "—" : fPct(100 * p.capture, 0)], [t("perf.col.score"), p.score == null ? "—" : `${p.score} · #${p.rank}/${p.rank_of}`]]
                        .map(([k, v]) => <tr key={k}><td className="text-mut py-0.5">{k}</td><td className="text-right font-medium">{v}</td></tr>)}
                    </tbody></table>
                    {p.nobat_flag && <div className="mt-1 text-[11px] text-[#8a5a00] bg-warn/15 rounded px-1.5 py-0.5">⚑ {t("perf.nobat_flag", { n: fInt(p.nobat), p: fPct(100 * p.nobat_share, 0) })}</div>}
                  </div>); })()}
                {onOpenMbp && !selMbp.is_new && <button onClick={() => onOpenMbp(selMbp)} className="mt-2 w-full bg-navy text-white rounded py-1 text-[12px]">{t("perf.card.open")}</button>}
              </div>
            )}
            {selSite && (
              <div>
                <div className="font-semibold text-navy text-[13px] pr-4">● {selSite.site_id} · {selSite.site_name}</div>
                <div className="text-mut mb-1">{selSite.site_class} · {selSite.nop} · {tv("access", selSite.access_class)}</div>
                {MM && <div className="text-[11.5px] text-ink bg-surface border border-line rounded px-2 py-1 mb-1"><b>{t("map.why_title")}:</b> {siteWhy(mode, selSite)}</div>}
                {canRoll && <div className="text-[11px] text-slate mb-1">{t("map.rollup_to")}{" "}
                  <button className="text-s1 underline" onClick={() => setUnit({ level: "cluster", id: selSite.cluster_to })}>{selSite.cluster_to}</button> ›{" "}
                  <button className="text-s1 underline" onClick={() => setUnit({ level: "nop", id: selSite.nop })}>{selSite.nop}</button></div>}
                <table className="w-full"><tbody>
                  {[[t("health.kpi.avail"), fPct(selSite.avail_wc_pct)], [t("common.target"), fPct(selSite.ran_target_pct)], [t("common.gap"), fPP(selSite.avail_delta_pp)],
                    ["BBT", selSite.battery?.display?.text ? t("bbt.no_battery_ticket") : `${fMin(selSite.battery?.display?.value)} · ${selSite.battery?.display?.evidence}`], [t("status.tip"), tv("status", selSite.bbt_status)],
                    [t("col.power_downtime"), fH(selSite.ran_power_down_h)], [t("map.responsible"), selSite.resp?.primary ? `${tv("resp", selSite.resp.primary)} (${selSite.resp.kind})` : "—"],
                    [t("col.mbp_assigned_nearest"), `${selSite.dist_mbp || "—"}${selSite.within_radius ? "" : " — " + t("mbp.seg.beyond").toLowerCase()}`], [t("map.dist_eta"), `${fKm(selSite.dist_km)} · ${fMin(selSite.dist_eta_min)}${selSite.access_class === "island" ? ` (${t("site.sea_access")})` : ""}`],
                    [t("map.inside_cov"), selSite.covered ? t("map.inside_yes", { n: selSite.mbps_in_radius, r: R }) : t("map.inside_no", { km: fKm(selSite.nearest_mbp_km) })],
                    [t("col.arrives_before_bbt"), selSite.bbt_status === "Unknown" ? `? ${t("eta.bbt_unknown_short")}` : selSite.can_arrive_before_bbt ? `✔ ${t("common.yes")}` : `✖ ${t("common.no")}`]].map(([k, v]) => <tr key={k}><td className="text-mut py-0.5 pr-2">{k}</td><td className="text-right font-medium">{v}</td></tr>)}
                </tbody></table>
                {onPickSite && <button onClick={() => onPickSite(selSite)} className="mt-2 w-full bg-navy text-white rounded py-1 text-[12px]">{t("map.open_detail")}</button>}
              </div>
            )}
          </div>
        )}
      </div>
      {mbpKeyOf && mbpLegend && showMbpLayers && <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-[11.5px] text-slate" role="group" aria-label={t("perf.legend")}>
        <span className="text-ink font-medium">🚚 {t("perf.legend")}:</span>
        {mbpLegend.map((l) => { const on = !mbpHidden.includes(l.k); return (
          <button key={l.k} onClick={() => setMbpHidden(on ? [...mbpHidden, l.k] : mbpHidden.filter((x) => x !== l.k))} aria-pressed={on} className={chip(on)} title={l.tip || ""}>
            <span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/40" style={{ background: on ? l.c : "#C9CFD9" }} />{l.label}<span className="tabular text-mut">{fInt(mbpCounts[l.k] || 0)}</span></button>); })}
        {mbpHidden.length > 0 && <button onClick={() => setMbpHidden([])} className="text-s1 underline">{t("map.leg_all")}</button>}
      </div>}
      {/* legend = toggles: click a category to hide/show it (the KPIs and lists that follow the map use the same filter) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-[11.5px] text-slate" role="group" aria-label={t("map.legend")}>
        <span className="tabular text-ink">{t("map.plotted", { a: fInt(shown.length), b: fInt(located.length) })}</span>
        {legend.map((l) => {
          const on = !l.k || !hidden.includes(l.k), n = l.k && keyOf ? counts[l.k] || 0 : null;
          return keyOf && l.k ? (
            <button key={l.label} onClick={() => toggle(l.k)} aria-pressed={on} title={t(on ? "map.leg_hide" : "map.leg_show")} className={chip(on)}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: on ? l.c : "#C9CFD9" }} />{l.label}{n != null && <span className="tabular text-mut">{fInt(n)}</span>}
            </button>) : <span key={l.label} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: l.c }} />{l.label}</span>;
        })}
        {keyOf && hidden.length > 0 && <button onClick={() => (onHidden || setHiddenL)([])} className="text-s1 underline">{t("map.leg_all")}</button>}
        <span className="text-mut">· {level !== "site" && canRoll ? t("map.leg.pie") : <>{MM?.size || !MM ? t("map.leg.size_m", { m: MM ? t(`map.size.${mode}`) : t("map.tt_power") }) : ""}{(MM ? MM.hollow : true) ? ` · ${MM ? t(`map.hollow.${mode}`) : t("map.leg.hollow", { r: R })}` : ""}</>} · {t("map.leg.click")}</span>
        {offline && <span className="text-[#8a5a00]">{t("map.offline")}</span>}
      </div>
      {canRoll && <RollupPanel unit={unit} sites={visAll} mode={mode} onOpen={setUnit} onClose={() => setUnit(null)} periodText={periodText}
        onPickSite={(s) => { setUnit(null); onPickSite?.(s); }} onFilterNop={onFilterNop} />}
    </div>
  );
}
