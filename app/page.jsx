"use client";
import "@/lib/i18n-dicts";
import React, { useEffect, useMemo, useState } from "react";
import { loadAll } from "@/lib/data";
import { buildModel, basecampSummary, configHash } from "@/lib/logic";
import { Toggle, Empty, fInt } from "@/components/ui";
import { t, setLang, initialLang, persistLang } from "@/lib/i18n";
import { NavCtx } from "@/lib/nav";
import SiteDrawer from "@/components/SiteDrawer";
import DrillPanel from "@/components/DrillPanel";
import PeriodBar, { periodLabel } from "@/components/PeriodBar";
import { parsePeriod, isFull, periodAgg, applyPeriod, loadPeriodFiles } from "@/lib/period";
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
import MbpOverview from "@/components/tabs/MbpOverview";
import Performance from "@/components/tabs/Performance";
import Backtest from "@/components/tabs/Backtest";
import Dispatch from "@/components/tabs/Dispatch";
import MbpPanel from "@/components/MbpPanel";
import Area4 from "@/components/Area4";
import DataInventory from "@/components/DataInventory";
import { mbpPerformance } from "@/lib/mbpperf";
import ConfigTab from "@/components/tabs/ConfigTab";

// Two-level navigation. Level 1 = group, level 2 = sub-tab. The active view lives in the URL (?view=group.sub) so it can be
// shared / bookmarked and the browser Back button works.
const GROUPS = [
  ["overview", [["health", "overview.health"], ["acc", "overview.accountability"], ["impact", "overview.impact"], ["trend", "overview.trend"]]],
  // v3.7 — MBP first: management overview → coverage → performance → relocation backtest → dispatch → simulation → fleet → site list → telemetry
  ["mbp", [["mgmt", "mbp.overview"], ["mbp", "mbp.coverage"], ["prod", "mbp.performance"], ["bt", "mbp.backtest"], ["disp", "mbp.dispatch"], ["sim", "mbp.simulation"], ["place", "mbp.placement"], ["list", "mbp.sitelist"], ["tel", "mbp.telemetry"]]],
  ["bbs", [["bbs", "bbs.actions"], ["est", "bbs.estimation"], ["corr", "bbs.correlation"]]],
  ["data", [["dq", "data.quality"], ["inv", "data.inventory"], ["cfg", "data.config"]]],
];
const VIEW_OF = Object.fromEntries(GROUPS.flatMap(([, tabs]) => tabs.map(([k, v]) => [k, v])));
const TAB_OF = Object.fromEntries(Object.entries(VIEW_OF).map(([k, v]) => [v, k]));
const groupOf = (tab) => GROUPS.find(([, tabs]) => tabs.some(([k]) => k === tab))[0];
const DEFAULT_TAB = "mgmt";
// v3.7 — the Overview (availability) menu is hidden from the presentation flow; ?full=1 (or opening one of its views) shows it again
const HIDDEN_GROUP = "overview";
// tabs that do not follow the period filter (decisions / estimators / fixed Q1-vs-Q2 comparison)
const FIXED_TABS = new Set(["inv", "trend", "sim", "place", "prod", "mgmt", "bt", "disp", "est", "corr", "tel", "cfg"]);
const FIRST_OF = Object.fromEntries(GROUPS.map(([g, tabs]) => [g, tabs[0][0]]));
/** everything the URL can carry; an unknown ?view= falls back to its group's first sub-tab (or Health) with a notice */
function readUrl() {
  try {
    const q = new URLSearchParams(window.location.search), v = q.get("view");
    if (q.get("a4")) window.__pbaA4 = q.get("a4");      // AREA 4 sub-tab (read once before the URL is rewritten)
    let tab = TAB_OF[v] || DEFAULT_TAB, notice = null;
    if (v && !TAB_OF[v]) { const g = v.split(".")[0]; tab = FIRST_OF[g] || DEFAULT_TAB; notice = v; }
    if (v === "mbp.productivity") { tab = "prod"; notice = null; }        // v3.6 link → v3.7 Performance
    return { tab, notice, full: q.get("full") === "1", area: q.get("area") === "4" ? "4" : "1", nop: q.get("nop") || "All NOPs", cls: (q.get("cls") || "").split(",").filter(Boolean), inactive: q.get("inactive") === "1", offair: q.get("offair") === "1", gen: q.get("gen") === "1", sel: q.get("sel") || null, per: parsePeriod(q.get("per")).key };
  } catch { return { tab: DEFAULT_TAB, full: false, nop: "All NOPs", cls: [], inactive: false, offair: false, gen: false, sel: null, per: "h1" }; }
}
const CLASSES = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const LS_KEY = "pba.config.v3";

function InventoryTab({ meta1 }) {
  const [m4, setM4] = useState(null);
  useEffect(() => { fetch("/data/a4/meta.json").then((r) => (r.ok ? r.json() : null)).then(setM4).catch(() => setM4(null)); }, []);
  return <DataInventory meta1={meta1} meta4={m4} />;
}

export default function Page() {
  const [data, setData] = useState(null), [err, setErr] = useState(null), [cfg, setCfg] = useState(null);
  const [tab, setTabState] = useState(DEFAULT_TAB), [nop, setNop] = useState("All NOPs"), [classes, setClasses] = useState([]);
  const [inactive, setInactive] = useState(false), [pick, setPick] = useState(null), [offair, setOffair] = useState(false);
  const [lang, setLangState] = useState("id");
  const [sel, setSel] = useState(null), [notice, setNotice] = useState(null), [drill, setDrill] = useState(null), [per, setPer] = useState("h1"), [gen, setGen] = useState(false), [pf, setPf] = useState(null);
  const [full, setFull] = useState(false), [pickMbp, setPickMbp] = useState(null), [area, setArea] = useState("1");
  setLang(lang);                                   // module-level language for t() and number formatters (set before children render)
  useEffect(() => {
    document.title = "PBA — Power Backup Analytic";
    const l = initialLang(); setLangState(l); persistLang(l);       // ?lang= is remembered
    const apply = () => { const u = readUrl(); setTabState(u.tab); setNop(u.nop); setClasses(u.cls); setInactive(u.inactive); setOffair(u.offair); setGen(u.gen); setSel(u.sel); setNotice(u.notice); setPer(u.per); setFull(u.full); setArea(u.area); };
    apply();
    const onPop = () => apply();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // URL builder: current state + overrides. Language is always carried so shared links open in the same language.
  const cur = { view: VIEW_OF[tab], nop, cls: classes, inactive, offair, gen, sel, per, lang, full, area };
  const hrefFor = (o = {}) => {
    const st = { ...cur, sel: null, ...o }, q = new URLSearchParams();
    q.set("view", st.view);
    if (st.nop && st.nop !== "All NOPs") q.set("nop", st.nop);
    if (st.cls?.length) q.set("cls", st.cls.join(","));
    if (st.inactive) q.set("inactive", "1");
    if (st.offair) q.set("offair", "1");
    if (st.gen) q.set("gen", "1");
    if (st.sel) q.set("sel", st.sel);
    if (st.per && st.per !== "h1") q.set("per", st.per);
    if (st.full) q.set("full", "1");
    if (st.area === "4") { q.set("area", "4"); try { const a4 = new URLSearchParams(window.location.search).get("a4"); if (a4) q.set("a4", a4); } catch {} }
    q.set("lang", st.lang);
    return `?${q.toString()}`;
  };
  const navigate = (o = {}) => {
    const st = { ...cur, sel: null, ...o };
    if (TAB_OF[st.view]) setTabState(TAB_OF[st.view]);
    setNop(st.nop || "All NOPs"); setClasses(st.cls || []); setInactive(!!st.inactive); setOffair(!!st.offair); setGen(!!st.gen); setSel(st.sel || null); setPer(st.per || "h1"); setFull(!!st.full); setNotice(null); setPick(null); setDrill(null); setPickMbp(null);
    try { window.history.pushState({}, "", hrefFor(o)); } catch {}
    window.scrollTo({ top: 0 });
  };
  const setTab = (k) => { if (k !== tab) navigate({ view: VIEW_OF[k] }); };
  // filter changes replace the URL (no history spam) but keep it shareable
  useEffect(() => { try { if (window.location.search !== hrefFor({ sel })) window.history.replaceState({}, "", hrefFor({ sel })); } catch {} }, [nop, classes, inactive, offair, gen, lang, sel, per, full, area]); // eslint-disable-line
  const chooseLang = (l) => { setLangState(l); persistLang(l); };
  const resetFilters = () => { setNop("All NOPs"); setClasses([]); setInactive(false); setOffair(false); setGen(false); setSel(null); setPer("h1"); };

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
  // v3.4 — period filter: observed metrics (RAN, PLN, events, tickets) are re-summed over the period; decisions stay on the full snapshot
  const P = parsePeriod(per);
  const [perErr, setPerErr] = useState(null);
  useEffect(() => {
    if (!data || isFull(P)) return;
    let alive = true; setPerErr(null);
    loadPeriodFiles(P).then((files) => { if (alive) setPf({ key: P.key, files }); }).catch((e) => alive && setPerErr(String(e)));
    return () => { alive = false; };
  }, [data, P.key]); // eslint-disable-line
  const perLoading = !isFull(P) && (!pf || pf.key !== P.key) && !perErr;
  const pmodel = useMemo(() => {
    if (isFull(P) || !pf || pf.key !== P.key || !model.length) return model;
    return applyPeriod(model, data.sites.map((s) => s.site_id), periodAgg(pf.files, P, data.sites.length), P);
  }, [model, pf, P.key]); // eslint-disable-line
  // A5 — suspected off-air / dismantle / data-issue sites are excluded from every KPI unless the toggle is on
  // v3.6 — sites with an active fixed genset stand on their own: excluded unless "+ fixed genset" is on
  const genOn = gen || cfg?.fixed_genset?.exclude_by_default === false;
  const active = useMemo(() => pmodel.filter((s) => (inactive || s.site_active === 1) && (offair || !s.offair) && (genOn || !s.genset_protected)), [pmodel, inactive, offair, genOn]);
  const gensetSites = useMemo(() => pmodel.filter((s) => s.genset_protected && (inactive || s.site_active === 1)), [pmodel, inactive]);
  const offairSites = useMemo(() => pmodel.filter((s) => s.offair && (inactive || s.site_active === 1)), [pmodel, inactive]);
  const nopCounts = useMemo(() => { const m = new Map(); active.forEach((s) => m.set(s.nop, (m.get(s.nop) || 0) + 1)); return m; }, [active]);
  const allNops = useMemo(() => [...new Set(model.map((s) => s.nop).filter(Boolean))].sort(), [model]);
  const scope = useMemo(() => active.filter((s) => (nop === "All NOPs" || s.nop === nop) && (!classes.length || classes.includes(s.site_class))), [active, nop, classes]);
  const mbpsScope = useMemo(() => (data ? data.mbps.filter((m) => nop === "All NOPs" || m.nop === nop) : []), [data, nop]);
  const mbpStats = useMemo(() => (data && cfg ? new Map(basecampSummary(model, data.mbps, cfg).map((r) => [r.mbp_id, r])) : new Map()), [model, data, cfg]);
  // v3.7 — MBP performance & utilisation from the H1 PLN-off job tickets (full snapshot, like coverage)
  const perf = useMemo(() => (data && cfg ? mbpPerformance(model, data.mbps, data.tickets || [], cfg) : new Map()), [model, data, cfg]);

  if (err) return <div className="p-8 text-crit">{t("app.load_error", { err })}</div>;
  if (!data || !cfg) return <div className="min-h-screen flex items-center justify-center text-slate" role="status">{t("app.loading")}</div>;
  const snap = data.meta.snapshot || {};
  const ctx = { data, cfg, saveCfg, setRadius, model, scope, mbpsScope, mbpStats, nop, setNop, setPick, classes, inactive, offairSites, includeOffair: offair, gensetSites, includeGenset: genOn, sel, setSel, navigate, hrefFor, per, period: P, periodText: periodLabel(P), openDrill: (id, focus, sites) => setDrill({ id, focus, sites }), perf, tickets: data.tickets || [], openMbp: setPickMbp, allNops, active };
  const empty = scope.length === 0 && !["dq", "tel", "cfg", "corr", "est", "inv"].includes(tab);

  const cfgH = configHash(cfg), cfgEdited = cfgH !== configHash(data.meta.config);
  const activeGroup = groupOf(tab);
  const groups = GROUPS.filter(([g]) => g !== HIDDEN_GROUP || full || activeGroup === HIDDEN_GROUP);
  const filtered = nop !== "All NOPs" || classes.length > 0 || inactive || offair || gen || per !== "h1";
  const scopeChip = [t("filter.scope_sites", { n: fInt(scope.length) }), nop === "All NOPs" ? t("filter.all_nops") : nop, classes.length ? classes.join(", ") : t("filter.all_classes")].join(" · ");
  return (
    <NavCtx.Provider value={{ navigate, hrefFor, state: cur }}>
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white p-2 z-[2000]">{t("app.skip")}</a>
      <header className="sticky top-0 z-[500] shadow">
        <div className="bg-navy text-white">
          <div className="max-w-[1560px] mx-auto px-4 h-11 flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <span className="text-[16px] font-bold whitespace-nowrap">PBA — Power Backup Analytic</span>
              {area === "1" && <span className="hidden 2xl:inline px-1.5 py-[1px] rounded bg-white/15 text-[11px] whitespace-nowrap" title={t("header.snapshot_tip")}>{t("header.snapshot")} {snap.period_start} → {snap.period_end}</span>}
              <span className="px-1.5 py-[1px] rounded bg-warn text-ink text-[11px] font-semibold whitespace-nowrap" title={t("header.demo_tip")}>{t("header.demo")}</span>
              <span className={`px-1.5 py-[1px] rounded text-[11px] tabular whitespace-nowrap ${cfgEdited ? "bg-crit text-white" : "bg-white/15"}`}
                title={t("header.cfg_tip", { h: cfgH, s: t(cfgEdited ? "cfg.is_edited" : "cfg.is_default") })}>{t("header.cfg")} {cfgH}{cfgEdited ? " ✎" : ""}</span>
            </div>
            {area === "1" && <nav className="flex items-stretch h-full ml-1" aria-label={t("nav.main")}>
              {groups.map(([g, tabs]) => (
                <button key={g} onClick={() => activeGroup !== g && setTab(tabs[0][0])} aria-current={activeGroup === g ? "true" : undefined}
                  className={`px-3 text-[13px] font-semibold border-b-[3px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${activeGroup === g ? "border-warn text-white" : "border-transparent text-white/70 hover:text-white"}`}>{t(`nav.${g}`)}</button>
              ))}
            </nav>}
            {area === "4" && <span className="ml-2 text-[12.5px] text-white/85">{t("a4.header")}</span>}
            <div className="ml-auto flex items-center gap-3 text-[11.5px] text-white/80 shrink-0">
              <div className="flex rounded-md overflow-hidden border border-white/40" role="group" aria-label={t("header.area")}>
                {["1", "4"].map((a) => (
                  <button key={a} onClick={() => { setArea(a); window.scrollTo({ top: 0 }); }} aria-pressed={area === a}
                    className={`px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${area === a ? "bg-warn text-ink" : "text-white/80 hover:text-white"}`}>AREA {a}</button>))}
              </div>
              <span className="hidden 2xl:inline whitespace-nowrap" title={t("header.refresh_tip")}>{t("header.refresh")} {snap.refreshed_at || data.meta.built_at}</span>
              <div className="flex rounded-md overflow-hidden border border-white/40" role="group" aria-label={t("header.language")}>
                {["en", "id"].map((l) => (
                  <button key={l} onClick={() => chooseLang(l)} aria-pressed={lang === l}
                    className={`px-2 py-0.5 text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${lang === l ? "bg-white text-navy" : "text-white/80 hover:text-white"}`}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {area === "1" && <><div className="bg-[#2a3655] text-white">
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
            <span title={t("filter.genset_tip")}><Toggle label={t("filter.genset", { n: fInt(gensetSites.length) })} checked={gen} onChange={setGen} /></span>
            <div className="ml-auto flex items-center gap-2 min-w-0">
              <span className="px-2 py-[3px] rounded-full bg-surface border border-line text-[12px] text-ink tabular truncate max-w-[330px]" title={`${scopeChip} — ${t("filter.scope_tip", { r: cfg.mbp.max_radius_km })}`}>{t("filter.scope")}: <b>{scopeChip}</b></span>
              <button onClick={resetFilters} disabled={!filtered} className="px-2 py-[3px] rounded-md border border-line text-[12px] text-slate bg-white hover:border-slate disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">{t("filter.reset")}</button>
            </div>
          </div>
          <div className="max-w-[1560px] mx-auto px-4 py-1 flex items-center gap-3 border-t border-line/70 overflow-x-auto">
            <PeriodBar per={per} setPer={setPer} loading={perLoading} error={perErr} />
            {!isFull(P) && <span className="ml-auto text-[11px] text-mut whitespace-nowrap" title={t("per.fixed_tip")}>{t("per.fixed_short")}</span>}
          </div>
        </div></>}
      </header>
      <main id="main" className="max-w-[1560px] mx-auto p-5">
        {area === "4" ? <div key={"a4" + lang}><Area4 cfg={cfg} setRadius={setRadius} setPick={setPick} meta1={data.meta} /></div> : <>
        {notice && <div role="status" className="mb-3 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5 flex items-center gap-2">{t("nav.unknown_view", { v: notice, to: t(`nav.${VIEW_OF[tab]}`) })}<button onClick={() => setNotice(null)} className="ml-auto text-slate" aria-label={t("common.close")}>×</button></div>}
        {!isFull(P) && FIXED_TABS.has(tab) && <div role="status" className="mb-3 text-[12.5px] border border-s1/30 bg-s1/5 rounded-md px-3 py-1.5">{t("per.tab_fixed", { p: periodLabel(P) })}</div>}
        {empty ? <Empty>{t("empty.no_sites")}</Empty> : <div key={lang}>
          {tab === "health" && <Health {...ctx} />}
          {tab === "acc" && <Accountability {...ctx} />}
          {tab === "impact" && <Impact {...ctx} />}
          {tab === "trend" && <Trend {...ctx} />}
          {tab === "mbp" && <MbpTab {...ctx} part="map" />}
          {tab === "list" && <MbpTab {...ctx} part="list" />}
          {tab === "place" && <Placement {...ctx} />}
          {tab === "mgmt" && <MbpOverview {...ctx} />}
          {tab === "prod" && <Performance {...ctx} />}
          {tab === "bt" && <Backtest {...ctx} />}
          {tab === "disp" && <Dispatch {...ctx} />}
          {tab === "sim" && <SimTab {...ctx} />}
          {tab === "bbs" && <BbsActions {...ctx} />}
          {tab === "corr" && <BbsAnalysis {...ctx} part="corr" />}
          {tab === "est" && <BbsAnalysis {...ctx} part="est" />}
          {tab === "dq" && <DataQuality {...ctx} />}
          {tab === "tel" && <Telemetry {...ctx} />}
          {tab === "cfg" && <ConfigTab {...ctx} />}
          {tab === "inv" && <InventoryTab meta1={data.meta} />}
        </div>}
        </>}
      </main>
      <footer className="max-w-[1560px] mx-auto px-5 pb-6 text-[11px] text-mut">{t("footer.legend")}
        {" "}<button className="underline hover:text-ink" onClick={() => navigate(full || activeGroup === HIDDEN_GROUP ? { view: VIEW_OF[DEFAULT_TAB], full: false } : { view: "overview.health", full: true })}>
          {t(full || activeGroup === HIDDEN_GROUP ? "nav.overview_hide" : "nav.overview_show")}</button></footer>
      <SiteDrawer site={pick} cfg={cfg} onClose={() => setPick(null)} />
      <MbpPanel mbp={pickMbp} ctx={ctx} onClose={() => setPickMbp(null)} />
      <DrillPanel drill={drill} scope={drill?.sites || scope} nop={nop} cfg={cfg} onClose={() => setDrill(null)} />
    </div>
    </NavCtx.Provider>
  );
}
