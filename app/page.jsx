"use client";
import React, { useEffect, useMemo, useState } from "react";
import { loadAll } from "@/lib/data";
import { applyScoring } from "@/lib/logic";
import { Chips, Select, Toggle } from "@/components/ui";
import SiteDrawer from "@/components/SiteDrawer";
import Overview from "@/components/tabs/Overview";
import MbpTab from "@/components/tabs/MbpTab";
import SimTab from "@/components/tabs/SimTab";
import BbsActions from "@/components/tabs/BbsActions";
import BbsAnalysis from "@/components/tabs/BbsAnalysis";
import DataQuality from "@/components/tabs/DataQuality";
import Telemetry from "@/components/tabs/Telemetry";
import ConfigTab from "@/components/tabs/ConfigTab";

const TABS = [
  ["overview", "Overview"], ["mbp", "MBP · Base camps & coverage"], ["sim", "MBP · Simulation"],
  ["bbs", "BBS · Action list"], ["bbsx", "BBS · Analysis"], ["dq", "Data quality"], ["tel", "MBP telemetry (FMC920)"], ["cfg", "Config"],
];
const CLASSES = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const LS_KEY = "pba.config.v2";

export default function Page() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("overview");
  const [nop, setNop] = useState("All NOPs");
  const [classes, setClasses] = useState([]);
  const [inactive, setInactive] = useState(false);
  const [pick, setPick] = useState(null);

  useEffect(() => {
    loadAll().then((d) => {
      setData(d);
      let c = d.meta.config;
      try { const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (saved && saved.__built_at === d.meta.built_at) c = saved; } catch {}
      setCfg(c);
    }).catch((e) => setErr(String(e)));
  }, []);
  const saveCfg = (c) => { setCfg(c); try { localStorage.setItem(LS_KEY, JSON.stringify({ ...c, __built_at: data.meta.built_at })); } catch {} };

  const scored = useMemo(() => (data && cfg ? applyScoring(data.sites, cfg) : []), [data, cfg]);
  const nops = useMemo(() => ["All NOPs", ...[...new Set(scored.map((s) => s.nop).filter(Boolean))].sort()], [scored]);
  const scope = useMemo(() => scored.filter((s) => (nop === "All NOPs" || s.nop === nop) && (!classes.length || classes.includes(s.site_class)) && (inactive || s.site_active === 1)), [scored, nop, classes, inactive]);

  if (err) return <div className="p-8 text-crit">Could not load data: {err}. Run <code>python engine/build.py</code> first (see README).</div>;
  if (!data || !cfg) return <div className="min-h-screen flex items-center justify-center text-slate">Loading PBA data…</div>;
  const ctx = { data, cfg, saveCfg, scored, scope, nop, setPick, classes, inactive };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[500] bg-navy text-white shadow">
        <div className="max-w-[1500px] mx-auto px-5 pt-3 pb-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[18px] font-bold leading-tight">PBA — Power Backup Analytics</div>
            <div className="text-[11.5px] opacity-75">MBP deployment & BBS battery decision support · Telkomsel AREA1 · Jan–Jun 2026 · data built {data.meta.built_at}</div>
          </div>
          <div className="flex flex-wrap items-end gap-3 text-ink">
            <div className="w-56"><Select label={<span className="text-white/80">NOP</span>} value={nop} onChange={setNop} options={nops} /></div>
            <div className="[&_*]:text-[12px]"><Chips label={<span className="text-white/80">Class (none = all)</span>} options={CLASSES} value={classes} onChange={setClasses} /></div>
            <div className="bg-white/10 rounded-md px-2 py-1.5 [&_label]:text-white"><Toggle label="Include inactive sites" checked={inactive} onChange={setInactive} /></div>
          </div>
        </div>
        <nav className="max-w-[1500px] mx-auto px-3 flex overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 text-[13px] whitespace-nowrap border-b-2 ${tab === k ? "border-warn text-white font-semibold" : "border-transparent text-white/70 hover:text-white"}`}>{l}</button>
          ))}
        </nav>
      </header>
      <main className="max-w-[1500px] mx-auto p-5">
        <div className="text-[12px] text-mut mb-3">Scope: <b className="text-ink">{scope.length.toLocaleString()}</b> sites · {nop} · {classes.length ? classes.join(", ") : "all classes"} · {inactive ? "incl." : "excl."} inactive</div>
        {tab === "overview" && <Overview {...ctx} />}
        {tab === "mbp" && <MbpTab {...ctx} />}
        {tab === "sim" && <SimTab {...ctx} />}
        {tab === "bbs" && <BbsActions {...ctx} />}
        {tab === "bbsx" && <BbsAnalysis {...ctx} />}
        {tab === "dq" && <DataQuality {...ctx} />}
        {tab === "tel" && <Telemetry {...ctx} />}
        {tab === "cfg" && <ConfigTab {...ctx} />}
      </main>
      <footer className="max-w-[1500px] mx-auto px-5 pb-6 text-[11px] text-mut">
        Evidence: ACTUAL = observed · DERIVED = calculated · ESTIMATED = modelled · PROXY = assumption · UNAVAILABLE = not in data. Priority P1 = highest.
        Battery status (Dead / Critical / Degraded / OK) is a separate scale from priority.
      </footer>
      <SiteDrawer site={pick} design={cfg.bbt.design_minutes} onClose={() => setPick(null)} />
    </div>
  );
}
