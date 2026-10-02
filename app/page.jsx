"use client";
import React, { useEffect, useMemo, useState } from "react";
import { loadAll } from "@/lib/data";
import { buildModel, basecampSummary } from "@/lib/logic";
import { Chips, Select, Toggle, Empty } from "@/components/ui";
import SiteDrawer from "@/components/SiteDrawer";
import Health from "@/components/tabs/Health";
import Accountability from "@/components/tabs/Accountability";
import Impact from "@/components/tabs/Impact";
import Trend from "@/components/tabs/Trend";
import MbpTab from "@/components/tabs/MbpTab";
import SimTab from "@/components/tabs/SimTab";
import BbsActions from "@/components/tabs/BbsActions";
import BbsAnalysis from "@/components/tabs/BbsAnalysis";
import DataQuality from "@/components/tabs/DataQuality";
import Telemetry from "@/components/tabs/Telemetry";
import Placement from "@/components/tabs/Placement";
import ConfigTab from "@/components/tabs/ConfigTab";

// C2 — grouped navigation (MBP · BBS · Overview · Data & Config)
const GROUPS = [
  ["MBP", [["mbp", "Coverage & map"], ["list", "Site list (14 cols)"], ["sim", "Simulation"], ["place", "Placement & fleet size"], ["tel", "Telemetry pilot"]]],
  ["BBS", [["corr", "Correlation"], ["est", "BBT estimation"], ["bbs", "Problem criteria & actions"]]],
  ["Overview", [["health", "Health"], ["acc", "Accountability"], ["impact", "Impact"], ["trend", "Trend"]]],
  ["Data & Config", [["dq", "Data quality"], ["cfg", "Config"]]],
];
const groupOf = (t) => GROUPS.find(([, tabs]) => tabs.some(([k]) => k === t))[0];
const CLASSES = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const LS_KEY = "pba.config.v3";

export default function Page() {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("mbp"), [nop, setNop] = useState("All NOPs"), [classes, setClasses] = useState([]);
  const [inactive, setInactive] = useState(false), [pick, setPick] = useState(null), [offair, setOffair] = useState(false);
  useEffect(() => { document.title = "PBA — Power Backup Analytic"; }, []);

  useEffect(() => {
    loadAll().then((d) => {
      setData(d);
      let c = d.meta.config;
      try { const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (saved && saved.__built_at === d.meta.built_at) c = saved; } catch {}
      setCfg(c);
    }).catch((e) => setErr(String(e)));
  }, []);
  const saveCfg = (c) => { setCfg(c); try { localStorage.setItem(LS_KEY, JSON.stringify({ ...c, __built_at: data.meta.built_at })); } catch {} };
  const setRadius = (km) => saveCfg({ ...cfg, mbp: { ...cfg.mbp, max_radius_km: km } });

  // ONE model for every tab (single source of truth)
  const model = useMemo(() => (data && cfg ? buildModel(data.sites, data.mbps, cfg) : []), [data, cfg]);
  // A5 — suspected off-air / dismantle / data-issue sites are excluded from every KPI unless the toggle is on
  const active = useMemo(() => model.filter((s) => (inactive || s.site_active === 1) && (offair || !s.offair)), [model, inactive, offair]);
  const offairSites = useMemo(() => model.filter((s) => s.offair && (inactive || s.site_active === 1)), [model, inactive]);
  const nopCounts = useMemo(() => { const m = new Map(); active.forEach((s) => m.set(s.nop, (m.get(s.nop) || 0) + 1)); return m; }, [active]);
  const allNops = useMemo(() => [...new Set(model.map((s) => s.nop).filter(Boolean))].sort(), [model]);
  const scope = useMemo(() => active.filter((s) => (nop === "All NOPs" || s.nop === nop) && (!classes.length || classes.includes(s.site_class))), [active, nop, classes]);
  const mbpsScope = useMemo(() => (data ? data.mbps.filter((m) => nop === "All NOPs" || m.nop === nop) : []), [data, nop]);
  const mbpStats = useMemo(() => (data && cfg ? new Map(basecampSummary(model, data.mbps, cfg).map((r) => [r.mbp_id, r])) : new Map()), [model, data, cfg]);

  if (err) return <div className="p-8 text-crit">Could not load data: {err}. Run <code>python engine/build.py</code> first (see README).</div>;
  if (!data || !cfg) return <div className="min-h-screen flex items-center justify-center text-slate" role="status">Loading PBA data snapshot…</div>;
  const snap = data.meta.snapshot || {};
  const ctx = { data, cfg, saveCfg, setRadius, model, scope, mbpsScope, mbpStats, nop, setPick, classes, inactive, offairSites, includeOffair: offair };
  const empty = scope.length === 0 && !["dq", "tel", "cfg", "corr", "est"].includes(tab);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white p-2 z-[2000]">Skip to content</a>
      <header className="sticky top-0 z-[500] bg-navy text-white shadow">
        <div className="max-w-[1560px] mx-auto px-5 pt-3 pb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[18px] font-bold leading-tight">PBA — Power Backup Analytic</div>
            <div className="text-[11.5px] opacity-80">
              Telkomsel AREA1 · <b>Data snapshot</b> {snap.period_start} → {snap.period_end} · Last pipeline refresh {snap.refreshed_at || data.meta.built_at} · not real-time
              <span className="ml-2 px-1.5 py-[1px] rounded bg-warn text-ink font-semibold">DEMO MODE · local config</span>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-ink">
            <div className="w-64"><Select label={<span className="text-white/80">NOP</span>} value={nop} onChange={setNop}
              options={[{ value: "All NOPs", label: `All NOPs (${active.length.toLocaleString()} sites)` },
                ...allNops.map((n) => ({ value: n, label: `${n} (${(nopCounts.get(n) || 0).toLocaleString()}${inactive ? "" : " active"})`, disabled: !nopCounts.get(n) && n !== nop }))]} /></div>
            <div className="[&_*]:text-[12px]"><Chips label={<span className="text-white/80">Class (none = all)</span>} options={CLASSES} value={classes} onChange={setClasses} /></div>
            <div className="bg-white/10 rounded-md px-2 py-1 [&_label]:text-white flex flex-col gap-0.5"><Toggle label="Include inactive sites" checked={inactive} onChange={setInactive} />
              <Toggle label={`Include suspected off-air (${offairSites.length})`} checked={offair} onChange={setOffair} /></div>
          </div>
        </div>
        <nav className="max-w-[1560px] mx-auto px-3 flex flex-wrap gap-x-5 pb-1" aria-label="Sections">
          {GROUPS.map(([g, tabs]) => (
            <div key={g} className="flex items-center" role="group" aria-label={g}>
              <span className={`text-[11px] uppercase tracking-wide mr-1.5 font-bold ${groupOf(tab) === g ? "text-warn" : "text-white/50"}`}>{g}</span>
              {tabs.map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
                  className={`px-2 py-2 text-[12.5px] whitespace-nowrap border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${tab === k ? "border-warn text-white font-semibold" : "border-transparent text-white/75 hover:text-white"}`}>{l}</button>
              ))}
            </div>
          ))}
        </nav>
      </header>
      <main id="main" className="max-w-[1560px] mx-auto p-5">
        <div className="text-[12px] text-mut mb-3">Scope: <b className="text-ink">{scope.length.toLocaleString()}</b> sites · {nop} · {classes.length ? classes.join(", ") : "all classes"} · {inactive ? "incl." : "excl."} inactive · {offair ? "incl." : "excl."} {offairSites.length} suspected off-air · MBP coverage radius <b className="text-ink">{cfg.mbp.max_radius_km} km</b></div>
        {empty ? <Empty /> : <>
          {tab === "health" && <Health {...ctx} />}
          {tab === "acc" && <Accountability {...ctx} />}
          {tab === "impact" && <Impact {...ctx} />}
          {tab === "trend" && <Trend {...ctx} />}
          {tab === "mbp" && <MbpTab {...ctx} part="map" />}
          {tab === "list" && <MbpTab {...ctx} part="list" />}
          {tab === "place" && <Placement {...ctx} />}
          {tab === "sim" && <SimTab {...ctx} />}
          {tab === "bbs" && <BbsActions {...ctx} />}
          {tab === "corr" && <BbsAnalysis {...ctx} part="corr" />}
          {tab === "est" && <BbsAnalysis {...ctx} part="est" />}
          {tab === "dq" && <DataQuality {...ctx} />}
          {tab === "tel" && <Telemetry {...ctx} />}
          {tab === "cfg" && <ConfigTab {...ctx} />}
        </>}
      </main>
      <footer className="max-w-[1560px] mx-auto px-5 pb-6 text-[11px] text-mut">
        Evidence: ACTUAL = observed · DERIVED = calculated · ESTIMATED = modelled · PROXY = assumption · UNAVAILABLE = not in data. Two priority scales: MBP-P1…P4 (response) and BBS-P1…P4 (battery action); P1 = highest.
        Battery vs design (Dead / Critical / Degraded / Below design / Meets design) is a separate scale from priority. Availability gaps in percentage points (pp).
      </footer>
      <SiteDrawer site={pick} cfg={cfg} onClose={() => setPick(null)} />
    </div>
  );
}
