"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Circle, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LEVEL_KIND, STATUS, fInt, fKm, fMin, fPct, fPP, fH, isNum } from "./ui";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { MAP_KEYS } from "@/lib/drill";

// far zoom: a small square per base camp so the trucks do not cover the sites; full truck icon from zoom 8
const CAMP_DOT = (sel, isNew) => L.divIcon({ className: "", iconSize: [10, 10], iconAnchor: [5, 5],
  html: `<div style="width:10px;height:10px;border-radius:2px;background:${isNew ? "#4a3aa7" : sel ? "#eda100" : "#1F2A44"};border:1.5px solid #fff;box-shadow:0 0 0 1px #1F2A44"></div>` });
const TRUCK = (sel, isNew) => L.divIcon({
  className: "", iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:6px;background:${isNew ? "#4a3aa7" : sel ? "#eda100" : "#1F2A44"};border:2px solid #fff;box-shadow:0 0 0 1px #1F2A44;display:flex;align-items:center;justify-content:center" aria-label="MBP base camp">
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

/** colour modes: key(s) = legend category (shared with KPIs / Site list via lib/drill MAP_KEYS) */
export const COLOR_MODES = {
  priority: { label: () => t("map.mode.priority"), key: MAP_KEYS.priority, of: (s) => LEVEL_KIND.MBP[MAP_KEYS.priority(s)]?.c,
    legend: () => ["P1", "P2", "P3", "P4"].map((k) => ({ k, label: `${LEVEL_KIND.MBP[k].i} MBP-${k}`, c: LEVEL_KIND.MBP[k].c })) },
  design: { label: () => t("map.mode.design"), key: MAP_KEYS.design, of: (s) => STATUS[MAP_KEYS.design(s)]?.c,
    legend: () => Object.entries(STATUS).map(([k, v]) => ({ k, label: `${v.i} ${tv("status", k)}`, c: v.c })) },
  survival: { label: () => t("map.mode.survival"), key: MAP_KEYS.survival,
    of: (s) => ({ beyond: "#7a1414", unknown: "#A3ABB9", arrive: "#0ca30c", late: "#ec835a" })[MAP_KEYS.survival(s)],
    legend: () => [{ k: "arrive", label: `✔ ${t("map.leg.in_time")}`, c: "#0ca30c" }, { k: "late", label: `▲ ${t("map.leg.late")}`, c: "#ec835a" },
      { k: "unknown", label: `? ${t("mbp.seg.bbt_unknown")}`, c: "#A3ABB9" }, { k: "beyond", label: `✖ ${t("map.leg.no_mbp")}`, c: "#7a1414" }] },
};
const PRIO_Z = { P4: 0, P3: 1, P2: 2, P1: 3 };

/**
 * All sites are drawn on ONE canvas layer (no clustering, no "zoom in to click"): ~20k points stay fast, and a 7-px click
 * tolerance makes every dot clickable at AREA zoom. Dot size grows with power downtime (site went dark on power).
 */
function SiteLayer({ sites, colorOf, sizeOf, selId, inRadiusOfSel, onPick, zoom }) {
  const map = useMap();
  const layer = useRef(null);
  const renderer = useMemo(() => L.canvas({ tolerance: 7, padding: 0.3 }), []);
  useEffect(() => {
    const g = L.layerGroup();
    const base = zoom <= 6 ? 2.6 : zoom <= 7 ? 3.2 : zoom <= 8 ? 4 : zoom <= 10 ? 5 : 6;
    // draw low priority first so P1 sits on top
    const order = [...sites].sort((a, b) => (PRIO_Z[a.mbp_priority_level] ?? 0) - (PRIO_Z[b.mbp_priority_level] ?? 0));
    for (const s of order) {
      const c = colorOf(s) || "#55627A", cov = s.covered, dim = inRadiusOfSel && !inRadiusOfSel.has(s.site_id);
      const m = L.circleMarker([s.lat, s.lon], { renderer, radius: base + sizeOf(s) * (zoom <= 7 ? 3 : 4), color: cov ? "#ffffff" : c, weight: cov ? 0.6 : 1.8,
        fillColor: cov ? c : "#ffffff", fillOpacity: dim ? 0.12 : 0.9, opacity: dim ? 0.25 : 1, bubblingMouseEvents: false });
      m.on("click", () => onPick(s));
      m.on("mouseover", () => {
        if (!m.getTooltip()) m.bindTooltip(`<b>${s.site_id}</b> · ${s.site_name || ""}<br/>MBP-${s.mbp_priority_level} · ${tv("status", s.bbt_status)} · ${fH(s.ran_power_down_h)} ${t("map.tt_power")}<br/><span style="color:#55627A">${t("map.tt_click")}</span>`, { direction: "top", offset: [0, -4] });
        m.openTooltip();
      });
      g.addLayer(m);
    }
    g.addTo(map); layer.current = g;
    return () => { g.remove(); };
  }, [sites, colorOf, sizeOf, inRadiusOfSel, zoom, map, renderer]); // eslint-disable-line
  return null;
}

export default function MapView({ sites = [], mbps = [], cfg, onRadius, onPickSite, mbpStats, fitKey = "", height = 520, colorOverride, legendOverride, keyOverride,
  defaultMode = "priority", extraMbps = [], compact = false, mode: modeProp, onMode, hidden: hiddenProp, onHidden }) {
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
  const colorOf = useMemo(() => colorOverride || COLOR_MODES[mode].of, [colorOverride, mode]);
  const keyOf = keyOverride || (colorOverride ? null : COLOR_MODES[mode].key);
  const legend = legendOverride || COLOR_MODES[mode].legend();
  const located = useMemo(() => sites.filter((s) => isNum(s.lat) && isNum(s.lon)), [sites]);
  const shown = useMemo(() => (keyOf && hidden.length ? located.filter((s) => !hidden.includes(keyOf(s))) : located), [located, keyOf, hidden]);
  const counts = useMemo(() => { const c = {}; if (keyOf) located.forEach((s) => { const k = keyOf(s); c[k] = (c[k] || 0) + 1; }); return c; }, [located, keyOf]);
  const mbpsLoc = useMemo(() => [...mbps, ...extraMbps].filter((m) => isNum(m.lat)), [mbps, extraMbps]);
  const fitPts = useMemo(() => [...located.map((s) => [s.lat, s.lon]), ...mbpsLoc.map((m) => [m.lat, m.lon])], [located, mbpsLoc]);
  // dot size = power downtime (sqrt scale, p95 = full size)
  const p95 = useMemo(() => { const v = located.map((s) => s.ran_power_down_h || 0).sort((a, b) => a - b); return v[Math.floor(v.length * 0.95)] || 1; }, [located]);
  const sizeOf = useMemo(() => (s) => Math.sqrt(Math.min(1, (s.ran_power_down_h || 0) / p95)), [p95]);
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
          <label className="inline-flex items-center gap-1.5 font-medium"><input type="checkbox" checked={coverage} onChange={(e) => setCoverage(e.target.checked)} className="accent-navy" />
            {t("map.cov_toggle")}</label>
          <span className="text-mut -ml-2">{t("map.cov_note", { r: R })}</span>
          <label className="flex items-center gap-2 text-mut">{t("map.radius")}
            <input type="range" min={20} max={200} step={5} value={R} onChange={(e) => onRadius?.(Number(e.target.value))} className="accent-navy w-32" aria-label={t("map.radius")} />
            <span className="text-ink font-semibold tabular w-14">{R} km</span></label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showMbps} onChange={(e) => setShowMbps(e.target.checked)} className="accent-navy" />
            <span className="inline-flex w-4 h-4 rounded bg-navy items-center justify-center text-white text-[9px]" aria-hidden>🚚</span> {t("map.basecamps")}</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={showSites} onChange={(e) => setShowSites(e.target.checked)} className="accent-navy" /> {t("map.sites")}</label>
          {!colorOverride && <label className="flex items-center gap-2 text-mut ml-auto">{t("map.colour_by")}
            <select value={mode} onChange={(e) => setMode(e.target.value)} className="border border-line rounded px-1.5 py-1 text-ink bg-white">{Object.entries(COLOR_MODES).map(([k, v]) => <option key={k} value={k}>{v.label()}</option>)}</select></label>}
        </div>
      )}
      <div className="relative">
        <div style={{ height }} className="rounded-md overflow-hidden border border-line">
          <MapContainer center={[0, 102]} zoom={6} zoomSnap={0.5} preferCanvas style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            {!offline && <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap"
              eventHandlers={{ tileerror: () => setTileFail((n) => n + 1), tileload: () => setTileOk((n) => n + 1) }} />}
            <Fit pts={fitPts} sig={fitKey + ":" + fitPts.length} />
            <ZoomWatch onZoom={setZoom} />
            {coverage && showMbps && mbpsLoc.map((m) => (
              <Circle key={"r" + m.mbp_id} center={[m.lat, m.lon]} radius={R * 1000} interactive={false}
                pathOptions={{ color: "#2a78d6", weight: 0.8, opacity: 0.5, fillColor: "#2a78d6", fillOpacity: 0.025 }} />
            ))}
            {selMbp && <Circle center={[selMbp.lat, selMbp.lon]} radius={R * 1000} interactive={false} pathOptions={{ color: "#eda100", weight: 2.5, dashArray: "6 6", fillOpacity: 0.06 }}>
              <Tooltip permanent direction="top" offset={[0, -6]} className="!text-[11px]">{t("map.radius_lbl", { r: R })}</Tooltip></Circle>}
            {selMbp && mbpSites.slice(0, 400).map((s) => (
              <Polyline key={"l" + s.site_id} positions={[[selMbp.lat, selMbp.lon], [s.lat, s.lon]]} pathOptions={{ color: "#eda100", weight: 1, opacity: 0.6 }} interactive={false} />
            ))}
            {showSites && <SiteLayer sites={shown} colorOf={colorOf} sizeOf={sizeOf} inRadiusOfSel={inRadiusOfSel} onPick={pick} zoom={Math.round(zoom)} />}
            {showMbps && mbpsLoc.map((m) => (
              <Marker key={"m" + m.mbp_id} position={[m.lat, m.lon]} icon={(zoom >= 8 ? TRUCK : CAMP_DOT)(selMbp?.mbp_id === m.mbp_id, m.is_new)} keyboard
                eventHandlers={{ click: () => { setSelMbp(m); setSelSite(null); } }}>
                <Tooltip direction="top"><b>{m.is_new ? t("map.new_scenario") + " " : ""}MBP</b> {m.mbp_id}<br />{t("map.tt_camp_click", { r: R })}</Tooltip>
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
                {st && <div className="text-[11px] text-slate mt-1">{te(st.signal_why, "signal")}</div>}
              </div>
            )}
            {selSite && (
              <div>
                <div className="font-semibold text-navy text-[13px] pr-4">● {selSite.site_id} · {selSite.site_name}</div>
                <div className="text-mut mb-1">{selSite.site_class} · {selSite.nop} · {tv("access", selSite.access_class)}</div>
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
        <span className="text-mut">· {t("map.leg.size")} · {t("map.leg.hollow", { r: R })} · {t("map.leg.click")}</span>
        {offline && <span className="text-[#8a5a00]">{t("map.offline")}</span>}
      </div>
    </div>
  );
}
