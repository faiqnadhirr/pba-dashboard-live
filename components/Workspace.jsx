"use client";
// v5.0 — one map + one table on ONE record set (lib/workspace.js). Page filters → legend categories → base-camp focus decide the
// records; map and table both draw exactly those. Selection is shared (ctx.focus): a marker click selects the row (page opened,
// row scrolled into view), a row click highlights the marker (map flies to it). Selection never filters; a base camp click limits
// the records to the sites assigned to it, shown as a removable chip. Changing the map mode only changes the colours.
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, DataTable, Panel, fInt } from "@/components/ui";
import { workspaceRows, selectionState } from "@/lib/workspace";
import { MAP_MODES } from "@/lib/mapmodes";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false, loading: () => <div className="h-[560px] rounded-md border border-line bg-surface animate-pulse" /> });

export default function Workspace({ ctx, rows, modes, defaultMode, columns, filename, initialSort, expand, extraCsv, detail, title, sub, toolbar, height = 600,
  mbps, mbpKeyOf, mbpLegend, mbpLegendTitle, mbpCountsOverride, mbpLabel, campFilter = true, pageSize = 50, showMbpLayers = true, tableTitle, tableSub, below, legendCmd, mapProps = {}, aboveTable = null, tableKeyFn }) {
  const { cfg, setRadius, nop, mbpStats, perf, openMbp, focus, setFocus } = ctx;
  // vNext.2 — a hero segment (here or on another page) can open this workspace with a legend filter: { mode, show: [keys] }.
  // Cross-page hand-off via window.__pbaLeg (read once), same-page via the legendCmd prop ({ mode, show, n }).
  const hiddenFor = (m, show) => (MAP_MODES[m]?.keys || []).filter((k) => !show.includes(k));
  const [init] = useState(() => { try { const L = window.__pbaLeg; if (L && modes.includes(L.mode)) { window.__pbaLeg = null; return L; } } catch {} return null; });
  const [mode, setModeS] = useState(init?.mode || defaultMode || modes[0]), [hidden, setHidden] = useState(init ? hiddenFor(init.mode, init.show) : []);
  React.useEffect(() => { if (legendCmd && modes.includes(legendCmd.mode)) { setModeS(legendCmd.mode); setHidden(legendCmd.show ? hiddenFor(legendCmd.mode, legendCmd.show) : []); } }, [legendCmd?.n]); // eslint-disable-line
  const setMode = (m) => { setModeS(m); setHidden([]); };
  const camp = campFilter && focus.mbp ? focus.mbp : null;
  const shown = useMemo(() => workspaceRows(rows, { mode, hidden, camp }), [rows, mode, hidden, camp]);
  const campIds = useMemo(() => (camp ? new Set(shown.map((s) => s.site_id)) : null), [camp, shown]);
  const st = selectionState(rows, shown, focus.site);
  const selSite = focus.site ? rows.find((s) => s.site_id === focus.site) || null : null;
  const campRow = camp ? (mbps || ctx.mbpsScope).find((m) => m.mbp_id === camp) : null;
  const selectSite = (s) => setFocus({ ...focus, site: s ? s.site_id : null });
  const selectMbp = (m) => setFocus({ site: null, mbp: m ? m.mbp_id : null });
  // a row click selects the marker; when the map is scrolled out of view, bring it back so the highlighted marker is visible
  const mapBox = React.useRef(null);
  const showMap = () => { const el = mapBox.current; if (!el) return; const r = el.getBoundingClientRect(); if (r.bottom < 120 || r.top > window.innerHeight - 120) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const nameOf = (id) => (ctx.names ? id : perf?.get(id)?.code || id);
  return (
    <div className="space-y-3">
      <div ref={mapBox} className="scroll-mt-32"><Card title={title} sub={sub} right={toolbar}>
        {(camp || hidden.length > 0 || st.state === "excluded" || st.state === "hidden_by_map") && <div className="flex flex-wrap items-center gap-2 mb-2 text-[12.5px]" role="status">
          {camp && <span className="inline-flex items-center gap-1.5 bg-warn/15 border border-warn/50 rounded-full pl-3 pr-1 py-0.5">
            🚚 <b>{nameOf(camp)}</b> · {t("ws.camp_sites", { n: fInt(shown.length) })}
            {campRow && openMbp && <button className="underline text-s1 ml-1" onClick={() => openMbp(campRow)}>{t("ws.camp_open")}</button>}
            <button onClick={() => selectMbp(null)} aria-label={t("ws.clear")} className="w-5 h-5 rounded-full hover:bg-warn/30 leading-none">×</button></span>}
          {hidden.length > 0 && <span className="inline-flex items-center gap-1.5 bg-s1/10 border border-s1/40 rounded-full pl-3 pr-1 py-0.5">
            {t("ws.legend_filter", { h: hidden.length, n: fInt(shown.length), N: fInt(rows.length) })}
            <button onClick={() => setHidden([])} aria-label={t("ws.clear")} className="w-5 h-5 rounded-full hover:bg-s1/20 leading-none">×</button></span>}
          {(st.state === "excluded" || st.state === "hidden_by_map") && <span className="inline-flex items-center gap-1.5 bg-crit/5 border border-crit/40 rounded-full pl-3 pr-1 py-0.5">
            {t(st.state === "excluded" ? "ws.sel_excluded" : "ws.sel_hidden", { id: focus.site })}
            <button onClick={() => selectSite(null)} className="underline text-crit">{t("ws.clear_sel")}</button></span>}
        </div>}
        <div className={detail ? "grid xl:grid-cols-[minmax(0,1fr)_360px] gap-3" : ""}>
          <MapView sites={shown} mbps={mbps || ctx.mbpsScope} cfg={cfg} onRadius={setRadius} mbpStats={mbpStats} fitKey={nop + (camp || "") + (ctx.area || "")} height={height}
            mode={mode} onMode={setMode} modes={modes} hidden={hidden} onHidden={setHidden} showMbpLayers={showMbpLayers}
            selectedSiteId={focus.site} onSelectSite={selectSite} selectedMbpId={focus.mbp} onSelectMbp={selectMbp} showCard={!detail} campSiteIds={campIds}
            mbpKeyOf={mbpKeyOf} mbpLegend={mbpLegend} mbpLegendTitle={mbpLegendTitle} mbpPerf={perf} onOpenMbp={openMbp} mbpLabel={mbpLabel} mbpCountsOverride={mbpCountsOverride}
            onPickSite={ctx.setPick} {...mapProps} />
          {detail && <Panel className="max-h-[720px] overflow-y-auto" title={selSite ? selSite.site_id : null} sub={selSite ? `${selSite.site_name} · ${selSite.site_class} · ${selSite.nop}` : null} onClose={() => selectSite(null)}
            empty={<>{t("ws.pick_hint")}<div className="mt-2 text-[11.5px]">{t(`map.mode.${mode}`)}: {MAP_MODES[mode]?.keys?.length ? t("ws.legend_hint") : ""}</div></>}>
            {selSite && <>
              <div>{detail(selSite)}</div>
              <button onClick={() => ctx.setPick(selSite)} className="mt-3 w-full bg-navy text-white rounded py-1.5 text-[12.5px]">{t("ws.full_detail")}</button></>}
          </Panel>}
        </div>
      </Card></div>
      <Card title={tableTitle || t("ws.table", { n: fInt(shown.length) })} sub={tableSub}>
        {aboveTable}
        {!shown.length ? <div className="py-8 text-center text-mut text-[13px]">{t("ws.empty")}</div> :
          <DataTable rows={shown} columns={columns} filename={filename} initialSort={initialSort} pageSize={pageSize} expand={expand} extraCsv={extraCsv}
            selectedKey={focus.site} onSelect={(r) => { const off = focus.site === r.site_id && !expand; selectSite(off ? null : r); if (!off) setTimeout(showMap, 0); }} maxH={560} />}
      </Card>
      {below}
    </div>
  );
}
