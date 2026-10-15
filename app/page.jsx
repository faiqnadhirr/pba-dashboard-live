"use client";
import "@/lib/i18n-dicts";
import React, { useEffect, useMemo, useState } from "react";
import { loadAll } from "@/lib/data";
import { buildModelByArea, basecampSummary, configHash } from "@/lib/logic";
import { Toggle, Empty, fInt } from "@/components/ui";
import { t, setLang, initialLang, persistLang } from "@/lib/i18n";
import { NavCtx } from "@/lib/nav";
import SiteDrawer from "@/components/SiteDrawer";
import DrillPanel from "@/components/DrillPanel";
import PeriodBar, { periodLabel } from "@/components/PeriodBar";
import { parsePeriod, isFull, periodAgg, applyPeriod, loadPeriodFiles } from "@/lib/period";
// v5.0 — primary pages load with the app; secondary / advanced pages are code-split and load when opened
import dynamic from "next/dynamic";
import FleetTab from "@/components/tabs/FleetTab";
import Explorer from "@/components/tabs/Explorer";
import PlanTab from "@/components/tabs/PlanTab";
import BatteryRisk from "@/components/tabs/BatteryRisk";
import BbsActions from "@/components/tabs/BbsActions";
import MbpPanel from "@/components/MbpPanel";
import { mbpPerformance, groupEvents } from "@/lib/mbpperf";
import { computeKpis } from "@/lib/kpi";
import { basecampFinal, areaCoverage } from "@/lib/basecamp";
const lazy = (f) => dynamic(f, { ssr: false, loading: () => <div className="py-10 text-center text-slate" role="status">{t("app.loading_page")}</div> });
const Health = lazy(() => import("@/components/tabs/Health"));
const Accountability = lazy(() => import("@/components/tabs/Accountability"));
const Impact = lazy(() => import("@/components/tabs/Impact"));
const Trend = lazy(() => import("@/components/tabs/Trend"));
const MbpTab = lazy(() => import("@/components/tabs/MbpTab"));
const BbsAnalysis = lazy(() => import("@/components/tabs/BbsAnalysis"));
const DataQuality = lazy(() => import("@/components/tabs/DataQuality"));
const Telemetry = lazy(() => import("@/components/tabs/Telemetry"));
const HistoryTab = lazy(() => import("@/components/tabs/HistoryTab"));
const Dispatch = lazy(() => import("@/components/tabs/Dispatch"));
const Area4 = lazy(() => import("@/components/Area4"));
const DataInventory = lazy(() => import("@/components/DataInventory"));
const ConfigTab = lazy(() => import("@/components/tabs/ConfigTab"));

// Two-level navigation. Level 1 = group, level 2 = sub-tab. The active view lives in the URL (?view=group.sub) so it can be
// shared / bookmarked and the browser Back button works.
// v5.0 — MBP: Fleet Performance · Coverage & Site Explorer · Resource Planning; BBS: Battery Risk · Recommended Actions.
// vNext — BBS pages renamed: Kondisi Baterai / Battery Condition · Tindak Lanjut Lapangan / Field Actions (same view keys, links unchanged).
// Tabs in SECONDARY are advanced views shown after a divider in the sub-navigation (kept, not competing with the main flow).
const GROUPS = [
  ["overview", [["health", "overview.health"], ["acc", "overview.accountability"], ["impact", "overview.impact"], ["trend", "overview.trend"]]],
  ["mbp", [["fleet", "mbp.fleet"], ["explorer", "mbp.explorer"], ["plan", "mbp.plan"], ["hist", "mbp.history"], ["mbp", "mbp.coverage"], ["disp", "mbp.dispatch"], ["tel", "mbp.telemetry"]]],
  ["bbs", [["risk", "bbs.risk"], ["bbs", "bbs.actions"], ["est", "bbs.estimation"], ["corr", "bbs.correlation"]]],
  ["data", [["dq", "data.quality"], ["inv", "data.inventory"], ["field", "data.field"], ["cfg", "data.config"]]],
];
const SECONDARY = new Set(["mbp", "disp", "tel", "est", "corr"]);
// tabs that need data AREA 4 does not have yet (MBP jobs / PLN events / battery inventory) → an N/A banner explains it
const NEEDS_JOBS = new Set(["fleet", "disp", "hist"]);
// vNext.2 — unfinished telemetry design is a prototype: hidden from the navigation unless ?full=1 (direct links still open it)
const PROTOTYPE = new Set(["tel"]);
const VIEW_OF = Object.fromEntries(GROUPS.flatMap(([, tabs]) => tabs.map(([k, v]) => [k, v])));
const TAB_OF = Object.fromEntries(Object.entries(VIEW_OF).map(([k, v]) => [v, k]));
// v5.0 — links from earlier versions keep working: old view → new page (+ Resource Planning step)
const LEGACY = { "mbp.overview": ["fleet"], "mbp.performance": ["fleet"], "mbp.productivity": ["fleet"], "mbp.sitelist": ["explorer"],
  "mbp.simmap": ["plan", "sandbox"], "mbp.placement": ["plan", "units"], "mbp.backtest": ["plan", "move"], "mbp.simulation": ["plan", "outage"] };
const resolveView = (v) => { if (TAB_OF[v]) return TAB_OF[v]; const L = LEGACY[v]; if (!L) return null; if (L[1]) try { window.__pbaPlan = L[1]; } catch {} return L[0]; };
const groupOf = (tab) => GROUPS.find(([, tabs]) => tabs.some(([k]) => k === tab))[0];
const DEFAULT_TAB = "fleet";
// v3.7 — the Overview (availability) menu is hidden from the presentation flow; ?full=1 (or opening one of its views) shows it again
const HIDDEN_GROUP = "overview";
// tabs that do not follow the period filter (decisions / estimators / fixed Q1-vs-Q2 comparison)
const FIXED_TABS = new Set(["inv", "trend", "plan", "fleet", "hist", "disp", "est", "corr", "tel", "cfg", "field"]);
const FIRST_OF = Object.fromEntries(GROUPS.map(([g, tabs]) => [g, tabs[0][0]]));
/** everything the URL can carry; an unknown ?view= falls back to its group's first sub-tab (or Health) with a notice */
function readUrl() {
  try {
    const q = new URLSearchParams(window.location.search), v = q.get("view");
    if (q.get("a4")) window.__pbaA4 = q.get("a4");      // AREA 4 sub-tab (read once before the URL is rewritten)
    if (q.get("plan")) window.__pbaPlan = q.get("plan");
    let tab = resolveView(v) || DEFAULT_TAB, notice = null;
    if (v && !resolveView(v)) { const g = v.split(".")[0]; tab = FIRST_OF[g] || DEFAULT_TAB; notice = v; }
    return { tab, notice, full: q.get("full") === "1", area: q.get("area") === "4" ? "AREA 4" : q.get("area") === "1" ? "AREA 1" : "all", clu: q.get("clu") || "", partial: q.get("partial") === "1", site: q.get("site") || null, camp: q.get("camp") || null, nop: q.get("nop") || "All NOPs", cls: (q.get("cls") || "").split(",").filter(Boolean), inactive: q.get("inactive") === "1", offair: q.get("offair") === "1", gen: q.get("gen") === "1", sel: q.get("sel") || null, per: parsePeriod(q.get("per")).key };
  } catch { return { tab: DEFAULT_TAB, full: false, nop: "All NOPs", cls: [], inactive: false, offair: false, gen: false, sel: null, per: "h1" }; }
}
const CLASSES = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const LS_KEY = "pba.config.v4";

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
  const [full, setFull] = useState(false), [pickMbp, setPickMbp] = useState(null), [area, setArea] = useState("all"), [clu, setClu] = useState("");
  const [names, setNames] = useState(false), [partial, setPartial] = useState(false);
  // v5.0 — shared selection of the map + table workspaces (site and / or base camp); survives tab changes, never filters
  const [focus, setFocus] = useState({ site: null, mbp: null });
  setLang(lang);                                   // module-level language for t() and number formatters (set before children render)
  useEffect(() => {
    document.title = "PBA — Power Backup Analytic";
    const l = initialLang(); setLangState(l); persistLang(l);       // ?lang= is remembered
    const apply = () => { const u = readUrl(); setTabState(u.tab); setNop(u.nop); setClasses(u.cls); setInactive(u.inactive); setOffair(u.offair); setGen(u.gen); setSel(u.sel); setNotice(u.notice); setPer(u.per); setFull(u.full); setArea(u.area); setClu(u.clu); setPartial(u.partial); setFocus({ site: u.site, mbp: u.camp }); };
    apply();
    const onPop = () => apply();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  // URL builder: current state + overrides. Language is always carried so shared links open in the same language.
  const cur = { view: VIEW_OF[tab], nop, cls: classes, inactive, offair, gen, sel, per, lang, full, area, clu, partial, site: focus.site, camp: focus.mbp };
  const hrefFor = (o = {}) => {
    const st = { ...cur, sel: null, ...o }, q = new URLSearchParams();
    q.set("view", VIEW_OF[resolveView(st.view)] || st.view);
    if (st.nop && st.nop !== "All NOPs") q.set("nop", st.nop);
    if (st.cls?.length) q.set("cls", st.cls.join(","));
    if (st.inactive) q.set("inactive", "1");
    if (st.offair) q.set("offair", "1");
    if (st.gen) q.set("gen", "1");
    if (st.sel) q.set("sel", st.sel);
    if (st.per && st.per !== "h1") q.set("per", st.per);
    if (st.full) q.set("full", "1");
    if (st.area && st.area !== "all") q.set("area", st.area.replace("AREA ", ""));
    if (st.clu) q.set("clu", st.clu);
    if (st.partial) q.set("partial", "1");
    if (st.site) q.set("site", st.site);
    if (st.camp) q.set("camp", st.camp);
    q.set("lang", st.lang);
    return `?${q.toString()}`;
  };
  const navigate = (o = {}) => {
    const st = { ...cur, sel: null, ...o };
    const tv0 = resolveView(st.view); if (tv0) setTabState(tv0);
    setNop(st.nop || "All NOPs"); setClasses(st.cls || []); setInactive(!!st.inactive); setOffair(!!st.offair); setGen(!!st.gen); setSel(st.sel || null); setPer(st.per || "h1"); setFull(!!st.full); if (o.area !== undefined) setArea(o.area); setClu(st.clu || ""); setNotice(null); setPick(null); setDrill(null); setPickMbp(null);
    try { window.history.pushState({}, "", hrefFor(o)); } catch {}
    window.scrollTo({ top: 0 });
  };
  const setTab = (k) => { if (k !== tab) navigate({ view: VIEW_OF[k] }); };
  // filter changes replace the URL (no history spam) but keep it shareable
  useEffect(() => { try { if (window.location.search !== hrefFor({ sel })) window.history.replaceState({}, "", hrefFor({ sel })); } catch {} }, [nop, classes, inactive, offair, gen, lang, sel, per, full, area, clu, partial, focus]); // eslint-disable-line
  const chooseLang = (l) => { setLangState(l); persistLang(l); };
  const resetFilters = () => { setArea("all"); setClu(""); setPartial(false); setNop("All NOPs"); setClasses([]); setInactive(false); setOffair(false); setGen(false); setSel(null); setPer("h1"); };

  // v4.1 — ONE dataset: AREA 1 + AREA 4 are merged on load; AREA is a filter like NOP (lib/data.js › loadAll)
  useEffect(() => {
    loadAll().then((d) => {
      setData(d);
      let c = d.meta.config;
      try { const saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (saved && saved.__built_at === d.meta.built_at) c = saved; } catch {}
      setCfg(c);
    }).catch((e) => setErr(String(e)));
  }, []);
  const saveCfg = (c) => { setCfg(c); try { localStorage.setItem(LS_KEY, JSON.stringify({ ...c, __built_at: data.meta.built_at })); } catch {} };
  const resetCfg = () => { setCfg(data.meta.config); try { localStorage.removeItem(LS_KEY); } catch {} };
  const setRadius = (km) => saveCfg({ ...cfg, mbp: { ...cfg.mbp, max_radius_km: km } });

  // ONE model for every tab (single source of truth)
  const model = useMemo(() => (data && cfg ? buildModelByArea(data.sites, data.mbps, cfg) : []), [data, cfg]);
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
    // period files cover AREA 1 sites only (the first n1 rows); other AREAs keep their full-period values
    return applyPeriod(model, data.sites.slice(0, data.n1).map((s) => s.site_id), periodAgg(pf.files, P, data.n1), P);
  }, [model, pf, P.key]); // eslint-disable-line
  // A5 — suspected off-air / dismantle / data-issue sites are excluded from every KPI unless the toggle is on
  // v3.6 — sites with an active fixed genset stand on their own: excluded unless "+ fixed genset" is on
  const genOn = gen || cfg?.fixed_genset?.exclude_by_default === false;
  // v4.2 (FIX-04) — "All areas" means the areas with FULL data (MBP jobs + PLN events); PARTIAL areas join only with the toggle
  const coverage = useMemo(() => areaCoverage(data?.meta.areas || []), [data]);
  const inArea = (x) => (area === "all" ? partial || (coverage[x.area] || "FULL") === "FULL" : x.area === area);
  const active = useMemo(() => pmodel.filter((s) => inArea(s) && (inactive || s.site_active === 1) && (offair || !s.offair) && (genOn || !s.genset_protected)), [pmodel, inactive, offair, genOn, area, partial, coverage]); // eslint-disable-line
  const gensetSites = useMemo(() => pmodel.filter((s) => inArea(s) && s.genset_protected && (inactive || s.site_active === 1)), [pmodel, inactive, area, partial, coverage]); // eslint-disable-line
  const offairSites = useMemo(() => pmodel.filter((s) => inArea(s) && s.offair && (inactive || s.site_active === 1)), [pmodel, inactive, area, partial, coverage]); // eslint-disable-line
  const nopCounts = useMemo(() => { const m = new Map(); active.forEach((s) => m.set(s.nop, (m.get(s.nop) || 0) + 1)); return m; }, [active]);
  const allNops = useMemo(() => [...new Set(model.filter(inArea).map((s) => s.nop).filter(Boolean))].sort(), [model, area, partial, coverage]); // eslint-disable-line
  const clusters = useMemo(() => [...new Set(active.filter((s) => nop === "All NOPs" || s.nop === nop).map((s) => s.cluster_to).filter(Boolean))].sort(), [active, nop]);
  const scope = useMemo(() => active.filter((s) => (nop === "All NOPs" || s.nop === nop) && (!clu || s.cluster_to === clu) && (!classes.length || classes.includes(s.site_class))), [active, nop, clu, classes]);
  const mbpsScope = useMemo(() => (data ? data.mbps.filter((m) => inArea(m) && (nop === "All NOPs" || m.nop === nop)) : []), [data, nop, area, partial, coverage]); // eslint-disable-line
  const mbpStats = useMemo(() => (data && cfg ? new Map(basecampSummary(model, data.mbps, cfg).map((r) => [r.mbp_id, r])) : new Map()), [model, data, cfg]);
  // v3.7 — MBP performance & utilisation from the H1 PLN-off job tickets (full snapshot, like coverage)
  // v4.0 — need = event pairs (PLN outage longer than BBT ↔ matched MBP job), ≤ 100 % by construction
  const evBySite = useMemo(() => (data ? groupEvents(data.events) : new Map()), [data]);
  const perf0 = useMemo(() => (data && cfg ? mbpPerformance(model, data.mbps, data.tickets || [], cfg, evBySite) : new Map()), [model, data, cfg, evBySite]);
  // v4.2 (FIX-01/02/03) — basecamp_final: one row per base camp with ONE status; every widget reads it (same function the build runs)
  const bc = useMemo(() => (data && cfg ? basecampFinal(model, data.mbps, perf0, cfg, { areas: data.meta.areas, mergeReview: data.meta.mbp?.merge_review || [] }) : []), [model, data, cfg, perf0]);
  const perf = useMemo(() => { const m = new Map(); for (const b of bc) m.set(b.mbp_id, { ...(perf0.get(b.mbp_id) || {}), ...b, key: b.status }); return m; }, [bc, perf0]);
  const bcScope = useMemo(() => { const ids = new Set(mbpsScope.map((m) => m.mbp_id)); return bc.filter((b) => ids.has(b.mbp_id)); }, [bc, mbpsScope]);
  // v4.0 — ONE KPI layer (lib/kpi.js, checked at build time by scripts/kpi_check.mjs): every tab reads these numbers
  const kpiSites = useMemo(() => active.filter((s) => (!clu || s.cluster_to === clu) && (!classes.length || classes.includes(s.site_class))), [active, clu, classes]);
  const kpiMbps = useMemo(() => (data ? data.mbps.filter(inArea) : []), [data, area, partial, coverage]); // eslint-disable-line
  const K = useMemo(() => (data && cfg ? computeKpis(kpiSites, kpiMbps, data.tickets || [], data.events || [], cfg, { evBySite, perf: perf0, unmatchedByNop: data.meta.dq?.ticket_gaps, coverage }) : null), [kpiSites, kpiMbps, data, cfg, evBySite, perf0, coverage]);

  if (err) return <div className="p-8 text-crit">{t("app.load_error", { err })}</div>;
  if (!data || !cfg) return <div className="min-h-screen flex items-center justify-center text-slate" role="status">{t("app.loading")}</div>;
  const snap = data.meta.snapshot || {};
  const ctx = { data, cfg, saveCfg, setRadius, model, scope, mbpsScope, mbpStats, nop, setNop, setPick, classes, inactive, offairSites, includeOffair: offair, gensetSites, includeGenset: genOn, sel, setSel, navigate, hrefFor, per, period: P, periodText: periodLabel(P), openDrill: (id, focus, sites) => setDrill({ id, focus, sites }), perf, tickets: data.tickets || [], openMbp: setPickMbp, allNops, active, K, names, setNames, area, resetCfg, cfgEdited: false, full, hasJobs: (K?.area.jobs || 0) > 0, bc, bcScope, coverage, partial, focus, setFocus };
  const empty = scope.length === 0 && !["dq", "tel", "cfg", "corr", "est", "inv", "field"].includes(tab);

  const cfgH = configHash(cfg), cfgEdited = cfgH !== configHash(data.meta.config);
  ctx.cfgEdited = cfgEdited;
  const scopeA4 = scope.some((s) => coverage[s.area] === "PARTIAL");
  const partialAreas = Object.entries(coverage).filter(([, v]) => v === "PARTIAL").map(([a]) => a);
  const fullAreas = Object.entries(coverage).filter(([, v]) => v === "FULL").map(([a]) => a);
  // v4.2 (FIX-14) — freshness badge on every page: period of the data + last refresh; orange when older than Config › freshness
  const maxAge = cfg.freshness?.max_age_days ?? 45;
  const ageDays = Math.round((Date.now() - Date.parse((snap.period_end || "2026-06-30") + "T23:59:00+07:00")) / 86400000);
  const fmtD = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; } };
  const visibleTabs = (g) => GROUPS.find(([x]) => x === g)[1].filter(([k]) => !PROTOTYPE.has(k) || full || tab === k);
  const activeGroup = groupOf(tab);
  const groups = GROUPS.filter(([g]) => g !== HIDDEN_GROUP || full || activeGroup === HIDDEN_GROUP);
  const filtered = area !== "all" || clu || nop !== "All NOPs" || classes.length > 0 || inactive || offair || gen || per !== "h1";
  const fullOnly = area === "all" && !partial && partialAreas.length > 0;
  const scopeChip = [t("filter.scope_sites", { n: fInt(scope.length) }), area === "all" ? (fullOnly ? t("scope.full_chip", { f: fullAreas.join(", ") }) : t("filter.all_areas")) : area, nop === "All NOPs" ? t("filter.all_nops") : nop, clu || null, classes.length ? classes.join(", ") : null].filter(Boolean).join(" · ");
  return (
    <NavCtx.Provider value={{ navigate, hrefFor, state: cur, radiusDefault: data.meta.config.mbp.max_radius_km }}>
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white p-2 z-[2000]">{t("app.skip")}</a>
      <header className="sticky top-0 z-[500] shadow">
        <div className="bg-navy text-white">
          <div className="max-w-[1560px] mx-auto px-4 min-h-11 py-1 md:py-0 md:h-11 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <span className="text-[16px] font-bold whitespace-nowrap">PBA<span className="hidden md:inline"> — Power Backup Analytic</span></span>
            </div>
            <nav className="flex items-stretch md:h-full h-8 ml-1" aria-label={t("nav.main")}>
              {groups.map(([g, tabs]) => (
                <button key={g} onClick={() => activeGroup !== g && setTab(tabs[0][0])} aria-current={activeGroup === g ? "true" : undefined}
                  className={`px-3 text-[13px] font-semibold border-b-[3px] whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${activeGroup === g ? "border-warn text-white" : "border-transparent text-white/70 hover:text-white"}`}>{t(`nav.${g}`)}</button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-[11.5px] text-white/80 min-w-0">
              <span className={`px-2 py-[2px] rounded text-[11.5px] whitespace-nowrap truncate max-w-[210px] sm:max-w-none ${ageDays > maxAge ? "bg-[#eb6834] text-white" : "bg-white/15 text-white"}`} title={t("header.fresh_tip", { n: fInt(ageDays), m: maxAge })}>
                {t("header.fresh", { a: fmtD(snap.period_start), b: fmtD(snap.period_end), r: String(snap.refreshed_at || data.meta.built_at).replace(/ \d\d:\d\d.*$/, "") })}{ageDays > maxAge ? " ⚠" : ""}</span>
              <div className="flex rounded-md overflow-hidden border border-white/40" role="group" aria-label={t("header.language")}>
                {["en", "id"].map((l) => (
                  <button key={l} onClick={() => chooseLang(l)} aria-pressed={lang === l}
                    className={`px-2 py-0.5 text-[12px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${lang === l ? "bg-white text-navy" : "text-white/80 hover:text-white"}`}>{l.toUpperCase()}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {cfgEdited && <div role="alert" className="bg-crit text-white text-[12.5px]"><div className="max-w-[1560px] mx-auto px-4 py-1 flex items-center gap-3">
          <b>{t("whatif.title")}</b><span className="truncate">{t("whatif.body")}</span>
          <button onClick={resetCfg} className="ml-auto px-2 py-0.5 rounded bg-white text-crit font-semibold whitespace-nowrap">{t("whatif.reset")}</button></div></div>}
        <><div className="bg-[#2a3655] text-white">
          <nav className="max-w-[1560px] mx-auto px-3 flex overflow-x-auto" aria-label={t(`nav.${activeGroup}`)}>
            {visibleTabs(activeGroup).map(([k, v], i, L) => (
              <React.Fragment key={k}>
                {SECONDARY.has(k) && !SECONDARY.has(L[i - 1]?.[0]) && <span className="self-center ml-3 mr-1 pl-3 border-l border-white/30 text-[10.5px] uppercase tracking-wide text-white/45 whitespace-nowrap">{t("nav.for_analyst")}</span>}
                <button onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} title={SECONDARY.has(k) ? t("nav.secondary_tip") : undefined}
                  className={`px-3 py-1.5 whitespace-nowrap border-b-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${SECONDARY.has(k) ? "text-[11.5px]" : "text-[13px] font-semibold"} ${tab === k ? "border-warn text-white" : SECONDARY.has(k) ? "border-transparent text-white/55 hover:text-white" : "border-transparent text-white/80 hover:text-white"}`}>{t(`nav.${v}`)}</button>
              </React.Fragment>
            ))}
          </nav>
        </div>
        <div className="bg-white border-b border-line">
          <div className="max-w-[1560px] mx-auto px-4 py-1.5 flex flex-nowrap items-center gap-x-3 overflow-x-auto md:overflow-visible">
            <label className="flex items-center gap-1.5 text-[12px] text-mut shrink-0">{t("filter.area")}
              <select value={area} onChange={(e) => { setArea(e.target.value); setNop("All NOPs"); setClu(""); setSel(null); }} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
                <option value="all">{t("filter.all_areas")}</option>
                {(data.meta.areas || []).map((a) => <option key={a.area} value={a.area}>{a.area}</option>)}
              </select></label>
            <label className="flex items-center gap-1.5 text-[12px] text-mut">{t("filter.nop")}
              <select value={nop} onChange={(e) => { setNop(e.target.value); setClu(""); }} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink bg-white w-48 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
                <option value="All NOPs">{t("filter.all_nops")} ({fInt(active.length)})</option>
                {allNops.map((n) => <option key={n} value={n} disabled={!nopCounts.get(n) && n !== nop}>{n} ({fInt(nopCounts.get(n) || 0)})</option>)}
              </select></label>
            <label className="flex items-center gap-1.5 text-[12px] text-mut shrink-0">{t("filter.cluster")}
              <select value={clu} onChange={(e) => setClu(e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink bg-white w-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
                <option value="">{t("filter.all_clusters")} ({fInt(clusters.length)})</option>
                {clusters.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></label>
            <div className="flex items-center gap-1 text-[12px] text-mut shrink-0" role="group" aria-label={t("filter.class")}>{t("filter.class")}
              {CLASSES.map((c) => { const on = classes.includes(c); return (
                <button key={c} aria-pressed={on} onClick={() => setClasses(on ? classes.filter((x) => x !== c) : [...classes, c])}
                  className={`px-1.5 py-[3px] rounded-md border text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${on ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`}>{on ? "✓ " : ""}{c}</button>); })}
            </div>
            <details className="relative shrink-0">
              <summary className={`list-none cursor-pointer px-2 py-[3px] rounded-md border text-[12px] whitespace-nowrap ${inactive || offair || gen || partial ? "bg-navy text-white border-navy" : "bg-white text-slate border-line"}`}>{t("filter.more")}{inactive || offair || gen || partial ? ` (${[inactive, offair, gen, partial].filter(Boolean).length})` : ""} ▾</summary>
              <div className="absolute z-[600] mt-1 bg-white border border-line rounded-md shadow p-2 space-y-1.5 w-64">
                <Toggle label={t("filter.inactive")} checked={inactive} onChange={setInactive} />
                <Toggle label={t("filter.offair", { n: fInt(offairSites.length) })} checked={offair} onChange={setOffair} />
                <span title={t("filter.genset_tip")}><Toggle label={t("filter.genset", { n: fInt(gensetSites.length) })} checked={gen} onChange={setGen} /></span>
                {partialAreas.length > 0 && <span title={t("filter.partial_tip", { a: partialAreas.join(", ") })}><Toggle label={t("filter.partial", { a: partialAreas.join(", ") })} checked={partial} onChange={setPartial} /></span>}
              </div>
            </details>
            <div className="ml-auto flex items-center gap-2 min-w-0">
              <span className="px-2 py-[3px] rounded-full bg-surface border border-line text-[12px] text-ink tabular truncate max-w-[440px]" title={`${scopeChip} — ${t("filter.scope_tip", { r: cfg.mbp.max_radius_km })}${fullOnly ? `\n${t("scope.full_only", { f: fullAreas.join(", "), p: partialAreas.join(", ") })}` : ""}`}>{t("filter.scope")}: <b>{scopeChip}</b></span>
              
              <button onClick={resetFilters} disabled={!filtered} className="px-2 py-[3px] rounded-md border border-line text-[12px] text-slate bg-white hover:border-slate disabled:opacity-40 whitespace-nowrap shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">{t("filter.reset")}</button>
            </div>
          </div>
          {!FIXED_TABS.has(tab) && <div className="max-w-[1560px] mx-auto px-4 py-1 flex items-center gap-3 border-t border-line/70 overflow-x-auto">
            <PeriodBar per={per} setPer={setPer} loading={perLoading} error={perErr} />
          </div>}
        </div></>
      </header>
      <main id="main" className="max-w-[1560px] mx-auto p-5">
        <>
        {scopeA4 && NEEDS_JOBS.has(tab) && <div role="status" className="mb-3 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5">{t("a4.note")}</div>}
        {notice && <div role="status" className="mb-3 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5 flex items-center gap-2">{t("nav.unknown_view", { v: notice, to: t(`nav.${VIEW_OF[tab]}`) })}<button onClick={() => setNotice(null)} className="ml-auto text-slate" aria-label={t("common.close")}>×</button></div>}
        {!isFull(P) && FIXED_TABS.has(tab) && <div role="status" className="mb-3 text-[12.5px] border border-s1/30 bg-s1/5 rounded-md px-3 py-1.5">{t("per.tab_fixed", { p: periodLabel(P) })}</div>}
        {empty ? <Empty>{t("empty.no_sites")}</Empty> : <div key={lang}>
          {tab === "health" && <Health {...ctx} />}
          {tab === "acc" && <Accountability {...ctx} />}
          {tab === "impact" && <Impact {...ctx} />}
          {tab === "trend" && <Trend {...ctx} />}
          {tab === "fleet" && <FleetTab {...ctx} />}
          {tab === "explorer" && <Explorer {...ctx} />}
          {tab === "plan" && <PlanTab {...ctx} />}
          {tab === "risk" && <BatteryRisk {...ctx} />}
          {tab === "mbp" && <MbpTab {...ctx} part="map" />}
          {tab === "field" && <div key={"a4" + lang}><Area4 cfg={cfg} setRadius={setRadius} setPick={setPick} meta1={data.meta} /></div>}
          {tab === "disp" && <Dispatch {...ctx} />}
          {tab === "bbs" && <BbsActions {...ctx} />}
          {tab === "corr" && <BbsAnalysis {...ctx} part="corr" />}
          {tab === "est" && <BbsAnalysis {...ctx} part="est" />}
          {tab === "dq" && <DataQuality {...ctx} />}
          {tab === "tel" && <><div role="status" className="mb-3 text-[12.5px] border border-warn/60 bg-warn/10 rounded-md px-3 py-1.5">{t("tel.prototype")}</div><Telemetry {...ctx} /></>}
          {tab === "hist" && <HistoryTab {...ctx} />}
          {tab === "cfg" && <ConfigTab {...ctx} />}
          {tab === "inv" && <InventoryTab meta1={data.meta} />}
        </div>}
        </>
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
