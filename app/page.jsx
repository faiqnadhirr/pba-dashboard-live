"use client";
import React, { useEffect, useMemo, useState } from "react";
import { loadAll } from "@/lib/data";
import { buildModel, basecampSummary, configHash } from "@/lib/logic";
import { Toggle, Empty, fInt } from "@/components/ui";
import { t, setLang, initialLang, persistLang } from "@/lib/i18n";
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

// Two-level navigation. Level 1 = group, level 2 = sub-tab. The active view lives in the URL (?view=group.sub) so it can be
// shared / bookmarked and the browser Back button works.
const GROUPS = [
  ["overview", [["health", "overview.health"], ["acc", "overview.accountability"], ["impact", "overview.impact"], ["trend", "overview.trend"]]],
  ["mbp", [["mbp", "mbp.coverage"], ["list", "mbp.sitelist"], ["sim", "mbp.simulation"], ["place", "mbp.placement"], ["tel", "mbp.telemetry"]]],
  ["bbs", [["bbs", "bbs.actions"], ["est", "bbs.estimation"], ["corr", "bbs.correlation"]]],
  ["data", [["dq", "data.quality"], ["cfg", "data.config"]]],
];
const VIEW_OF = Object.fromEntries(GROUPS.flatMap(([, tabs]) => tabs.map(([k, v]) => [k, v])));
const TAB_OF = Object.fromEntries(Object.entries(VIEW_OF).map(([k, v]) => [v, k]));
const groupOf = (tab) => GROUPS.find(([, tabs]) => tabs.some(([k]) => k === tab))[0];
const DEFAULT_TAB = "health";
const tabFromUrl = () => { try { return TAB_OF[new URLSearchParams(window.location.search).get("view")] || DEFAULT_TAB; } catch { return DEFAULT_TAB; } };
const CLASSES = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const LS_KEY = "pba.config.v3";

export default function Page() {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [cfg, setCfg] = useState(null);
  const [tab, setTabState] = useState(DEFAULT_TAB), [nop, setNop] = useState("All NOPs"), [classes, setClasses] = useState([]);
  const [inactive, setInactive] = useState(false), [pick, setPick] = useState(null), [offair, setOffair] = useState(false);
  const [lang, setLangState] = useState("id");
  setLang(lang);                                   // module-level language for t() and number formatters (set before children render)
  useEffect(() => {
    document.title = "PBA — Power Backup Analytic";
    setLangState(initialLang()); setTabState(tabFromUrl());
    const onPop = () => setTabState(tabFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setTab = (k) => {
    if (k === tab) return;
    setTabState(k);
    try { const u = new URL(window.location.href); u.searchParams.set("view", VIEW_OF[k]); window.history.pushState({}, "", u); } catch {}
    window.scrollTo({ top: 0 });
  };
  const chooseLang = (l) => {
    setLangState(l); persistLang(l);
    try { const u = new URL(window.location.href); if (u.searchParams.has("lang")) { u.searchParams.set("lang", l); window.history.replaceState({}, "", u); } } catch {}
  };
  const resetFilters = () => { setNop("All NOPs"); setClasses([]); setInactive(false); setOffair(false); };

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

  if (err) return <div className="p-8 text-crit">{t("app.load_error", { err })}</div>;
  if (!data || !cfg) return <div className="min-h-screen flex items-center justify-center text-slate" role="status">{t("app.loading")}</div>;
  const snap = data.meta.snapshot || {};
  const ctx = { data, cfg, saveCfg, setRadius, model, scope, mbpsScope, mbpStats, nop, setPick, classes, inactive, offairSites, includeOffair: offair };
  const empty = scope.length === 0 && !["dq", "tel", "cfg", "corr", "est"].includes(tab);

  const cfgH = configHash(cfg), cfgEdited = cfgH !== configHash(data.meta.config);
  const activeGroup = groupOf(tab);
  const filtered = nop !== "All NOPs" || classes.length > 0 || inactive || offair;
  const scopeChip = [t("filter.scope_sites", { n: fInt(scope.length) }), nop === "All NOPs" ? t("filter.all_nops") : nop, classes.length ? classes.join(", ") : t("filter.all_classes")].join(" · ");
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white p-2 z-[2000]">{t("app.skip")}</a>
      <header className="sticky top-0 z-[500] shadow">
        <div className="bg-navy text-white">
          <div className="max-w-[1560px] mx-auto px-4 h-11 flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <span className="text-[16px] font-bold whitespace-nowrap">PBA — Power Backup Analytic</span>
              <span className="hidden lg:inline px-1.5 py-[1px] rounded bg-white/15 text-[11px] whitespace-nowrap" title={t("header.snapshot_tip")}>{t("header.snapshot")} {snap.period_start} → {snap.period_end}</span>
              <span className="px-1.5 py-[1px] rounded bg-warn text-ink text-[11px] font-semibold whitespace-nowrap" title={t("header.demo_tip")}>{t("header.demo")}</span>
              <span className={`px-1.5 py-[1px] rounded text-[11px] tabular whitespace-nowrap ${cfgEdited ? "bg-crit text-white" : "bg-white/15"}`}
                title={t("header.cfg_tip", { h: cfgH, s: t(cfgEdited ? "cfg.is_edited" : "cfg.is_default") })}>{t("header.cfg")} {cfgH}{cfgEdited ? " ✎" : ""}</span>
            </div>
            <nav className="flex items-stretch h-full ml-1" aria-label={t("nav.main")}>
              {GROUPS.map(([g, tabs]) => (
                <button key={g} onClick={() => activeGroup !== g && setTab(tabs[0][0])} aria-current={activeGroup === g ? "true" : undefined}
                  className={`px-3 text-[13px] font-semibold border-b-[3px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${activeGroup === g ? "border-warn text-white" : "border-transparent text-white/70 hover:text-white"}`}>{t(`nav.${g}`)}</button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-[11.5px] text-white/80 shrink-0">
              <span className="hidden xl:inline whitespace-nowrap" title={t("header.refresh_tip")}>{t("header.refresh")} {snap.refreshed_at || data.meta.built_at}</span>
              <div className="flex rounded-md overflow-hidden border border-white/40" role="group" aria-label={t("header.language")}>
                {["en", "id"].map((l) => (
                  <button key={l} onClick={() => chooseLang(l)} aria-pressed={lang === l}
                    className={`px-2 py-0.5 text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${lang === l ? "bg-white text-navy" : "text-white/80 hover:text-white"}`}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-[#2a3655] text-white">
          <nav className="max-w-[1560px] mx-auto px-3 flex overflow-x-auto" aria-label={t(`nav.${activeGroup}`)}>
            {GROUPS.find(([g]) => g === activeGroup)[1].map(([k, v]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
                className={`px-3 py-1.5 text-[12.5px] whitespace-nowrap border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${tab === k ? "border-warn text-white font-semibold" : "border-transparent text-white/75 hover:text-white"}`}>{t(`nav.${v}`)}</button>
            ))}
          </nav>
        </div>
        <div className="bg-white border-b border-line">
          <div className="max-w-[1560px] mx-auto px-4 py-1.5 flex flex-nowrap items-center gap-x-3 overflow-hidden">
            <label className="flex items-center gap-1.5 text-[12px] text-mut">{t("filter.nop")}
              <select value={nop} onChange={(e) => setNop(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink bg-white w-48 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
                <option value="All NOPs">{t("filter.all_nops")} ({fInt(active.length)})</option>
                {allNops.map((n) => <option key={n} value={n} disabled={!nopCounts.get(n) && n !== nop}>{n} ({fInt(nopCounts.get(n) || 0)})</option>)}
              </select></label>
            <div className="flex items-center gap-1 text-[12px] text-mut shrink-0" role="group" aria-label={t("filter.class")}>{t("filter.class")}
              {CLASSES.map((c) => { const on = classes.includes(c); return (
                <button key={c} aria-pressed={on} onClick={() => setClasses(on ? classes.filter((x) => x !== c) : [...classes, c])}
                  className={`px-1.5 py-[3px] rounded-md border text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${on ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`}>{on ? "✓ " : ""}{c}</button>); })}
            </div>
            <Toggle label={t("filter.inactive")} checked={inactive} onChange={setInactive} />
            <Toggle label={t("filter.offair", { n: fInt(offairSites.length) })} checked={offair} onChange={setOffair} />
            <div className="ml-auto flex items-center gap-2 min-w-0">
              <span className="px-2 py-[3px] rounded-full bg-surface border border-line text-[12px] text-ink tabular truncate max-w-[330px]" title={`${scopeChip} — ${t("filter.scope_tip", { r: cfg.mbp.max_radius_km })}`}>{t("filter.scope")}: <b>{scopeChip}</b></span>
              <button onClick={resetFilters} disabled={!filtered} className="px-2 py-[3px] rounded-md border border-line text-[12px] text-slate bg-white hover:border-slate disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">{t("filter.reset")}</button>
            </div>
          </div>
        </div>
      </header>
      <main id="main" className="max-w-[1560px] mx-auto p-5">
        {empty ? <Empty>{t("empty.no_sites")}</Empty> : <div key={lang}>
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
        </div>}
      </main>
      <footer className="max-w-[1560px] mx-auto px-5 pb-6 text-[11px] text-mut">{t("footer.legend")}</footer>
      <SiteDrawer site={pick} cfg={cfg} onClose={() => setPick(null)} />
    </div>
  );
}
