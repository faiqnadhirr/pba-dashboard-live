"use client";
// v3.5 — hero map for a tab. The legend is a filter for the WHOLE tab: hiding a category on the map removes those sites
// from the tab's KPIs, charts and tables (a chip says so and links to the same sites in the Site list).
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, fInt } from "./ui";
import { t } from "@/lib/i18n";
import { Go } from "@/lib/nav";
import { MAP_MODES } from "@/lib/mapmodes";
const MapView = dynamic(() => import("./MapView"), { ssr: false });

export function useMapLegend(scope, defaultMode, keyOf) {
  const [mode, setModeS] = useState(defaultMode), [hidden, setHidden] = useState([]);
  const k = keyOf || MAP_MODES[mode].key;
  const vis = useMemo(() => (hidden.length ? scope.filter((s) => !hidden.includes(k(s))) : scope), [scope, hidden, k]);
  const setMode = (m) => { setModeS(m); setHidden([]); };
  return { mode, setMode, hidden, setHidden, vis, all: scope };
}

export function LegendChip({ L }) {
  if (!L.hidden.length) return null;
  const keys = MAP_MODES[L.mode].keys.filter((k) => !L.hidden.includes(k));
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-[12.5px] border border-s1/40 bg-s1/5 rounded-md px-3 py-1.5">
      <b>{t("map.legfilter.title")}</b> {t("map.legfilter.tab", { h: L.hidden.length, n: fInt(L.vis.length), N: fInt(L.all.length) })}
      {L.mode !== "trend" && <Go to={{ view: "mbp.sitelist", sel: `map_${L.mode}~${keys.join("+")}` }}>{t("drill.view_sites", { n: fInt(L.vis.length) })}</Go>}
      <button onClick={() => L.setHidden([])} className="ml-auto text-slate underline">{t("map.leg_all")}</button>
    </div>);
}

export default function MapHero({ L, sites, modes, title, sub, ctx, height = 460, defaultLevel = "site", right }) {
  const { cfg, setRadius, setPick, mbpsScope, mbpStats, nop, setNop, periodText, per } = ctx;
  return (
    <Card title={title} sub={sub} right={right}>
      <MapView sites={sites || L.all} mbps={mbpsScope} cfg={cfg} onRadius={setRadius} onPickSite={setPick} mbpStats={mbpStats} fitKey={nop} height={height}
        modes={modes} mode={L.mode} onMode={L.setMode} hidden={L.hidden} onHidden={L.setHidden} defaultLevel={defaultLevel} showMbpLayers={false}
        onFilterNop={nop === "All NOPs" ? setNop : undefined} periodText={per && per !== "h1" ? periodText : null} />
    </Card>
  );
}
