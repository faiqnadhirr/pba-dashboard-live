// Regression tests for the single rule engine (lib/logic.js) on the real data snapshot.
// Run: npm test   (needs public/data produced by `python engine/build.py`)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildModel, buildModelByArea, travelMinutes, dependencyChildren, pctRank, statusOf, aggregateAvailability, aggregateResponsibility,
  clusterTable, topWorstSites, simulate, basecampSummary, PROBLEM, trendLabel, bbtDisplay, placementPlan, basecampGravity, kecamatanAnchors,
} from "../lib/logic.js";
import { fromColumnar } from "../lib/data.js";

const meta = JSON.parse(fs.readFileSync("public/data/meta.json", "utf8"));
const sites = fromColumnar(JSON.parse(fs.readFileSync("public/data/sites.json", "utf8")));
const mbps = JSON.parse(fs.readFileSync("public/data/mbps.json", "utf8"));
const famRows = fromColumnar(JSON.parse(fs.readFileSync("public/data/familiarity.json", "utf8")));
const fam = new Map(famRows.map((r) => [r.site_id + "|" + r.mbp_id, r.served_n]));
const cfg = meta.config;
const M = buildModel(sites, mbps, cfg);
const byId = new Map(M.map((s) => [s.site_id, s]));
const active = M.filter((s) => s.site_active === 1);
const close = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/* ---------- basic helpers ---------- */
test("helpers: pctRank, dependency proxy, status scale", () => {
  assert.deepEqual(pctRank([10, 20, 20, 30]), [0.25, 0.625, 0.625, 1]);
  assert.equal(dependencyChildren("End Site", cfg.dependency_children), 0);
  assert.deepEqual([null, 3, 20, 45, 100, 130].map((v) => statusOf(v, cfg.bbt)), ["Unknown", "Dead", "Critical", "Degraded", "Below design", "Meets design"]);
});
test("travel: island has no ETA; riverine slower than mainland; never inferred from missing ETA", () => {
  assert.equal(travelMinutes(10, { access_class: "island" }, cfg), null);
  assert.ok(travelMinutes(30, { access_class: "riverine_delta", is_urban: 0 }, cfg) > travelMinutes(30, { access_class: "mainland", is_urban: 0 }, cfg));
  // access class comes from the pipeline (Dapot/regency), not from ETA
  const isl = M.filter((s) => s.access_class === "island");
  assert.ok(isl.every((s) => s.access_basis && s.access_basis.length > 0));
});

/* ---------- A. MBP survival is a hard constraint (NTB020) ---------- */
test("A · NTB020 — assigned MBP arrives before BBT expires (historical MBP not forced)", () => {
  const s = byId.get("NTB020");
  assert.ok(s, "NTB020 present");
  assert.ok(s.can_arrive_before_bbt);
  console.log("NTB020 →", s.mbp_assigned, Math.round(s.eta_min), "min vs BBT", Math.round(s.bbt_effective_min), "|", s.assignment_basis);
  assert.ok(s.eta_min <= s.bbt_effective_min, `ETA ${s.eta_min} ≤ BBT ${s.bbt_effective_min}`);
  // global: whenever any feasible MBP exists, the assigned one is feasible
  const bad = M.filter((x) => x.feasible_mbps > 0 && !(x.eta_min <= x.bbt_effective_min));
  assert.equal(bad.length, 0);
});

/* ---------- B. Radius is a hard constraint (PMR107) ---------- */
test("B · PMR107 — v4.0: radius = preference, reach cap = hard limit; never an assignment beyond the cap", () => {
  const s = byId.get("PMR107"), cap = Math.max(cfg.mbp.max_radius_km, cfg.mbp.reach_cap_km ?? 250);
  assert.ok(s.km_assigned <= cap);
  assert.equal(M.filter((x) => x.mbp_assigned && x.km_assigned > cap + 1e-9).length, 0);
  assert.equal(M.filter((x) => !x.covered && x.mbp_assigned).length, 0);
});

/* ---------- C. Battery evidence precedence (AGR132) ---------- */
test("C · AGR132 — measured BBT beats a 'no battery' ticket; conflict shown; no Replenishment", () => {
  const s = byId.get("AGR132");
  assert.equal(s.battery.measured, true);
  assert.ok(s.battery.conflict && s.battery.conflict.includes("precedence"));
  assert.ok(!String(s.recommended_action).startsWith("Replenishment"));
  // global: Replenishment only without measured BBT
  assert.equal(M.filter((x) => String(x.recommended_action).startsWith("Replenishment") && x.battery.measured).length, 0);
});

/* ---------- D. Priority → action consistency; estimate never → replace ---------- */
test("D · P1/P2 never 'Monitor'; ESTIMATED BBT never produces Replace/Replenishment/Upgrade", () => {
  assert.equal(M.filter((x) => ["P1", "P2"].includes(x.bbs_priority_level) && /^Monitor/.test(x.recommended_action)).length, 0);
  const est = M.filter((x) => x.bbt_value_evidence === "ESTIMATED" && PROBLEM.has(x.bbt_status) && x.battery.source !== "TICKET");
  assert.ok(est.length > 0);
  assert.equal(est.filter((x) => /replace|upgrade|Replenish/i.test(x.recommended_action)).length, 0);
  // severity floor: measured Dead/Critical not below the floor
  const ord = { P1: 1, P2: 2, P3: 3, P4: 4 }, floor = ord[cfg.severity_floor.measured_dead_critical];
  assert.equal(M.filter((x) => x.battery.measured && ["Dead", "Critical"].includes(x.bbt_status) && ord[x.bbs_priority_level] > floor).length, 0);
});

/* ---------- E. NOP filter consistency ---------- */
test("E · NOP filter: per-NOP scopes partition the portfolio (counts, downtime, availability)", () => {
  const nops = [...new Set(active.map((s) => s.nop))];
  const n = nops.reduce((a, k) => a + active.filter((s) => s.nop === k).length, 0);
  assert.equal(n, active.length);
  const all = aggregateAvailability(active);
  const parts = nops.map((k) => aggregateAvailability(active.filter((s) => s.nop === k)));
  assert.ok(close(parts.reduce((a, p) => a + (p.outage || 0), 0), all.outage, 1e-3));
  const r = aggregateResponsibility(active), rp = nops.map((k) => aggregateResponsibility(active.filter((s) => s.nop === k)).total);
  assert.ok(close(rp.reduce((a, v) => a + v, 0), r.total, 1e-3));
  // a NOP with zero active sites produces an empty scope (UI shows the explicit empty state)
  assert.equal(active.filter((s) => s.nop === "__NONE__").length, 0);
});

/* ---------- F. Map: distinct icons and independent toggles (code-level) ---------- */
test("F · MapView has distinct site/MBP markers and independent layer toggles", () => {
  const src = fs.readFileSync("components/MapView.jsx", "utf8");
  for (const k of ["showSites", "showMbps", "coverage", "divIcon"]) assert.ok(src.includes(k), k);
  assert.ok(/aria-label/.test(src));
});

/* ---------- G. Radius change propagates ---------- */
test("G · v4.0 smaller preferred radius → same reach, more assignments inside the preferred radius", () => {
  // vNext: the default is now 25 km, so compare 40 km against an explicit 120 km run (the old default)
  const c2 = { ...cfg, mbp: { ...cfg.mbp, max_radius_km: 40 } };
  const M2 = buildModel(sites, mbps, c2), M = buildModel(sites, mbps, { ...cfg, mbp: { ...cfg.mbp, max_radius_km: 120 } });
  const cov = (L) => L.filter((s) => s.covered).length;
  assert.equal(cov(M2), cov(M));
  const inside = (L) => L.filter((x) => x.mbp_assigned && x.km_assigned <= 40).length;
  assert.ok(inside(M2) >= inside(M));
  assert.ok(M2.filter((x) => x.within_radius).length < M.filter((x) => x.within_radius).length);
});

/* ---------- H. Availability math ---------- */
test("H · availability · target · gap are consistent (site and aggregate)", () => {
  for (const s of M.filter((x) => x.av?.available).slice(0, 3000)) {
    assert.ok(close(s.avail_delta_pp, s.avail_wc_pct - s.ran_target_pct, 1e-9));
    assert.ok(close(s.avail_gap_pp, Math.max(0, -s.avail_delta_pp), 1e-9));
  }
  const a = aggregateAvailability(active);
  assert.ok(close(a.gap, a.avail - a.target, 1e-9));
  if (a.gap < 0) assert.ok(close(Object.values(a.contrib).reduce((x, v) => x + v, 0), a.gap, 1e-6));
});

/* ---------- I. Cause decomposition does not invent causes ---------- */
test("I · causes sum to observed downtime; Unknown ≥ 0; overlap is scaled, not invented", () => {
  for (const s of M.filter((x) => x.av?.available && x.av.outage > 0).slice(0, 5000)) {
    const c = s.av.cause, sum = c.power + c.transport + c.ran + c.other + c.unknown;
    assert.ok(close(sum, s.av.outage, 1e-6), s.site_id);
    assert.ok(c.unknown >= 0);
    if (s.av.overlap) assert.equal(c.unknown, 0);
  }
  // responsibility: without ticket RC, never OBSERVED
  assert.equal(M.filter((x) => x.resp.kind === "OBSERVED" && x.resp.n === 0).length, 0);
});

/* ---------- J. Trend uses Q1 vs Q2 ---------- */
test("J · cluster trend = Q2 vs Q1 availability / dark sites", () => {
  const rows = clusterTable(active, cfg);
  const ok = rows.filter((r) => r.trend !== "Insufficient data");
  assert.ok(ok.length > 0);
  for (const r of ok) {
    assert.ok(close(r.delta_pp, r.q2_avail - r.q1_avail, 1e-9));
    if (r.trend === "Deteriorating") assert.ok(r.delta_pp <= -cfg.availability.trend_pp);
    if (r.trend === "Improving") assert.ok(r.delta_pp >= cfg.availability.trend_pp);
  }
  assert.ok(rows.filter((r) => r.small).every((r) => r.severity == null));
});

/* ---------- K. Top 15 explainable ---------- */
test("K · Top 15 worst sites: components sum to score, drivers named", () => {
  const t = topWorstSites(active, cfg, 15);
  assert.equal(t.length, 15);
  for (const s of t) {
    assert.ok(close(Object.values(s.worst_parts).reduce((a, v) => a + v, 0), s.worst_score, 1e-9));
    assert.ok(s.primary_driver && s.secondary_driver);
  }
  for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].worst_score >= t[i].worst_score);
});

/* ---------- simulation honours the same constraints ---------- */
test("Simulation: picked MBP within radius; feasible-first; outcomes classified", () => {
  const nop = "NOP PALEMBANG";
  const aff = active.filter((s) => s.nop === nop).sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)).slice(0, 30).map((s) => s.site_id);
  const r = simulate(M, aff, 6, mbps, { fam }, cfg, { departHour: 17 });
  assert.equal(r.rows.length, aff.length);
  for (const x of r.rows) {
    // dispatch searches up to the hard cap (reach_cap_km); the preferred radius is not a cut-off (v4.0)
    if (x.mbp) assert.ok(x.km <= Math.max(cfg.mbp.max_radius_km, cfg.mbp.reach_cap_km ?? 250));
    if (x.outcome === "saved") assert.equal(x.feasible, true);
    assert.ok(["saved", "late", "unserved_busy", "unserved_no_coverage", "unserved_island", "no_need"].includes(x.outcome));
  }
  const k = r.kpi;
  assert.equal(k.saved + k.late + k.unserved_busy + k.unserved_no_coverage + k.unserved_island + k.no_mbp_needed, k.sites_affected);
});

/* ================= second fix pass (A1–A6, B1–B3, D1) ================= */
const scope = active.filter((s) => !s.offair);

test("A1 · trend: availability is primary; dark-site change is a share; disagreement → Mixed; realistic spread", () => {
  assert.equal(trendLabel(1.76, 18.9, cfg)[0], "Mixed");                 // TO TAKENGON case
  assert.equal(trendLabel(-1.0, 0.5, cfg)[0], "Deteriorating");
  assert.equal(trendLabel(0.8, -3, cfg)[0], "Improving");
  assert.equal(trendLabel(0.1, 0.5, cfg)[0], "Stable");
  const rows = clusterTable(scope, cfg).filter((r) => r.trend !== "Insufficient data");
  assert.equal(rows.filter((r) => r.trend === "Deteriorating" && r.delta_pp > 0).length, 0, "no Deteriorating with rising availability");
  const labels = new Set(rows.map((r) => r.trend));
  assert.ok(labels.size >= 3, [...labels].join(","));
  assert.ok(rows.filter((r) => r.trend === "Deteriorating").length < rows.length, "not every cluster Deteriorating");
});

test("A2 · dark site is defined per month; dark share is no longer ~100%", () => {
  const share = scope.filter((s) => s.dark).length / scope.length;
  assert.ok(share < 0.6, `dark share ${share.toFixed(3)}`);
  for (const s of scope.slice(0, 4000)) {
    const n = (s.m_pw || []).filter((v) => v >= cfg.availability.dark_month_h).length;
    assert.equal(s.dark_months, n);
    assert.equal(!!s.dark, n >= cfg.availability.dark_min_months);
  }
});

test("A3 · no row shows a status that contradicts its displayed BBT basis", () => {
  const b = cfg.bbt;
  for (const s of M) {
    const d = bbtDisplay(s);
    if (s.battery.source === "TICKET") { assert.equal(d.value, null, s.site_id); assert.ok(/no battery per ticket/.test(d.text)); continue; }
    if (d.value != null) assert.equal(statusOf(d.value, b, s.bbt_criteria_design_min), s.bbt_status, s.site_id);
    assert.equal(d.evidence, s.battery.source, s.site_id);
  }
  // v3.6: 'Tidak Ada Baterai' tickets are a field-check flag, not a status (ops decision); old behaviour behind bbt.ticket_sets_status
  for (const id of ["LHK154", "UJT096"]) { const s = byId.get(id); assert.ok(s.battery.ticket && s.battery.source !== "TICKET" && /field check/.test(s.battery.conflict), id); }
  // every tab renders the BBT through bbtDisplay (no raw bbt_value_min in BBT cells)
  assert.ok(fs.readFileSync("components/ui.jsx", "utf8").includes("bbtDisplay(r)"));
  for (const f of ["components/tabs/BbsActions.jsx", "components/tabs/Impact.jsx", "components/SiteDrawer.jsx"])
    assert.ok(fs.readFileSync(f, "utf8").includes("<BbtCell"), f);
  assert.ok(fs.readFileSync("components/tabs/SimTab.jsx", "utf8").includes("bbt_shown"));
  // simulation rows carry the same display value
  const sim = simulate(M, ["LHK154", "UJT096", "MGR003"], 4, mbps, { fam }, cfg, {});
  for (const r of sim.rows) assert.equal(r.bbt_shown, bbtDisplay(byId.get(r.site_id)).value);
});

test("A4 · derived zero BBT without site evidence: no priority floor, Inspect & verify, out of BBS-P1", () => {
  for (const id of ["MGR003", "MBN001", "MGA099"]) {
    const s = byId.get(id);
    assert.ok(s.battery.unverified, id);
    assert.notEqual(s.bbs_priority_level, "P1", id);
    assert.ok(s.recommended_action.startsWith("Inspect"), id);
  }
  assert.equal(M.filter((s) => s.battery.unverified && s.priority_floor).length, 0);
  assert.equal(M.filter((s) => s.battery.unverified && /replace|upgrade/i.test(s.recommended_action)).length, 0);
});

test("A5 · off-air / data-issue sites are flagged and excluded from default scope", () => {
  assert.ok(byId.get("BTM493").offair);
  const fl = active.filter((s) => s.offair);
  assert.ok(fl.length > 0 && fl.length < 0.05 * active.length, `${fl.length}`);
  assert.equal(scope.filter((s) => s.offair).length, 0);
});

test("A6 · battery_banks present in the export (Data quality and correlation use the same field)", () => {
  assert.ok(sites.filter((s) => s.battery_banks > 0).length > 9000);
});

test("B1 · per-site BBT design whenever banks are known; class fallback (PROXY) only when banks are missing", () => {
  for (const s of M) {
    if (s.battery_banks > 0) assert.notEqual(s.bbt_design_kind, "class_default", s.site_id);
    else { assert.equal(s.bbt_design_kind, "class_default", s.site_id); assert.equal(s.bbt_design_evidence, "PROXY", s.site_id); }
    if (s.bbt_design_kind === "median_load") assert.equal(s.bbt_design_evidence, "PROXY", s.site_id);   // load AND Ah assumed
    // vNext.2: computed design with the site's own load = ESTIMATED (Ah per bank is assumed); never DERIVED (that label = monthly BBT summary)
    if (s.battery_banks > 0 && s.load_a > 0) { assert.equal(s.bbt_design_evidence, "ESTIMATED", s.site_id); assert.equal(s.bbt_design_kind, "site_load"); }
    assert.notEqual(s.bbt_design_evidence, "DERIVED", s.site_id);
  }
});

test("B2 · distance and ETA always filled for located sites (nearest MBP even beyond radius)", () => {
  const loc = M.filter((s) => s.lat != null);
  assert.equal(loc.filter((s) => s.dist_km == null || s.dist_eta_min == null).length, 0);
  assert.ok(loc.filter((s) => !s.covered).every((s) => s.within_radius === 0 && s.dist_km > cfg.mbp.max_radius_km));
});

test("B3 · base camp merge map applied (no merged record left)", () => {
  const mm = fs.readFileSync("engine/config/basecamp_merge.csv", "utf8").trim().split("\n").slice(1).map((l) => l.split(","));
  const ids = new Set(mbps.map((m) => m.mbp_id));
  assert.equal(ids.size, mbps.length);
  for (const r of mm) if (r.at(-2) === "yes") assert.ok(!ids.has(r[1]), r[1]);
});

test("D1 · placement: monotonic marginal gain, anchors are real sites, target respected", () => {
  for (const nop of ["NOP PALEMBANG", "NOP ACEH", "NOP BINJAI"]) {
    const p = placementPlan(M.filter((s) => s.nop === nop), mbps, cfg);
    for (let i = 1; i < p.steps.length; i++) assert.ok(p.steps[i].share >= p.steps[i - 1].share);
    for (const a of p.added) assert.ok(byId.has(a.anchor_site));
    if (p.needed != null) assert.ok(p.steps[p.needed].share >= cfg.placement.target_share);
  }
});

/* ================= third pass: navigation / i18n / data consistency ================= */
import { coverageBreakdown, configHash } from "../lib/logic.js";
import path from "node:path";

test("i18n · EN and ID dictionaries have the same keys; every literal t('key') used in the code exists", () => {
  const en = JSON.parse(fs.readFileSync("i18n/en.json", "utf8")), id = JSON.parse(fs.readFileSync("i18n/id.json", "utf8"));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(id).sort());
  const files = ["app/page.jsx", "components/ui.jsx", "components/MapView.jsx", "components/SiteDrawer.jsx", ...fs.readdirSync("components/tabs").map((f) => path.join("components/tabs", f))];
  const missing = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/\bt\("([a-z0-9_.']+[a-z0-9_]?)"/gi)) if (!(m[1] in en)) missing.push(`${f}: ${m[1]}`);
    for (const m of src.matchAll(/label: "([a-z0-9_]+\.[a-z0-9_.]+)"/g)) if (!(m[1] in en)) missing.push(`${f}: label ${m[1]}`);
  }
  assert.deepEqual(missing, []);
  // number format follows the language
  assert.equal((19771).toLocaleString("id-ID"), "19.771");
  assert.equal((97.98).toLocaleString("id-ID", { minimumFractionDigits: 2 }), "97,98");
  assert.equal((19771).toLocaleString("en-US"), "19,771");
});

test("3b · unknown PLN data / MBP history is not zero: neutral rank, flagged", () => {
  const unk = M.filter((s) => !s.pln_known);
  assert.ok(unk.length > 1000);
  const v = new Set(unk.map((s) => s.mbp_parts.outage_frequency.toFixed(9)));
  assert.equal(v.size, 1, "all unknown-PLN sites get the same neutral contribution");
  const w = cfg.mbp_priority, tot = Object.values(w).reduce((a, x) => a + (x > 0 ? x : 0), 0);
  assert.ok(close(unk[0].mbp_parts.outage_frequency, (cfg.unknown_handling.neutral_rank * w.outage_frequency) / tot, 1e-9));
  assert.equal(M.filter((s) => !s.mbp_hist_known && s.in_ticket_file).length, 0);
});

test("3a · column 7 = design used by the criteria; computed design kept separately", () => {
  for (const s of M.slice(0, 5000)) {
    assert.equal(s.bbt_criteria_design_min, cfg.bbt.criteria_basis === "site" ? s.bbt_design_min : cfg.bbt.design_minutes);
    if (s.battery.display.value != null) assert.equal(s.bbt_pct_design, Math.round((100 * s.battery.display.value) / s.bbt_criteria_design_min));
  }
});

test("3e · coverage breakdown segments add up to the scope", () => {
  for (const nop of [null, "NOP BATAM", "NOP PALEMBANG"]) {
    const sc = active.filter((s) => !s.offair && (!nop || s.nop === nop));
    const b = coverageBreakdown(sc);
    assert.equal(b.arrive + b.late_dark + b.late_other + b.bbt_unknown + b.beyond, sc.length);
    assert.equal(b.within, sc.filter((s) => s.covered).length);
  }
});

test("3f · relocation candidates are cumulative and capped", () => {
  const p = placementPlan(M.filter((s) => s.nop === "NOP PALEMBANG"), mbps, cfg);
  assert.ok(p.relocation.length <= cfg.placement.relocation_max_candidates);
  for (let i = 1; i < p.relocation.length; i++) assert.ok(p.relocation[i].lost_cumulative >= p.relocation[i - 1].lost_cumulative);
  assert.ok(p.relocation.every((r) => r.loss_pp < cfg.placement.relocation_max_loss_pp));
});

test("4 · simulation 'Why' uses the same dark minutes as Expected down", () => {
  const aff = active.filter((s) => s.nop === "NOP PALEMBANG").sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)).slice(0, 20).map((s) => s.site_id);
  const r = simulate(M, aff, 4, mbps, { fam }, cfg, { departHour: 17 });
  for (const x of r.rows) { const m = x.reasons.match(/site dark ~(\d+) min/); if (m) assert.ok(Math.abs(+m[1] - Math.round(x.expected_down_min)) <= 1, x.site_id); }
});

test("4 · config hash is stable and key-order independent", () => {
  const h = configHash(cfg), shuffled = Object.fromEntries(Object.entries(cfg).reverse());
  assert.equal(configHash(shuffled), h);
  assert.notEqual(configHash({ ...cfg, mbp: { ...cfg.mbp, max_radius_km: cfg.mbp.max_radius_km + 5 } }), h);
});

test("1 · navigation (v5.0): MBP = Fleet · Explorer · Planning, BBS = Battery Risk · Actions; advanced views kept; legacy links resolve", () => {
  const src = fs.readFileSync("app/page.jsx", "utf8");
  const order = [...src.matchAll(/^\s+\["(overview|mbp|bbs|data)", \[/gm)].map((m) => m[1]);
  assert.deepEqual(order, ["overview", "mbp", "bbs", "data"]);
  assert.ok(src.includes('DEFAULT_TAB = "fleet"') && src.includes('HIDDEN_GROUP = "overview"') && src.includes('q.set("full"') && src.includes('q.set("view"') && src.includes("popstate"));
  assert.ok(/\["mbp", \[\["fleet", "mbp.fleet"\], \["explorer", "mbp.explorer"\], \["plan", "mbp.plan"\]/.test(src));
  assert.ok(/\["bbs", \[\["risk", "bbs.risk"\], \["bbs", "bbs.actions"\]/.test(src));
  for (const v of ["mbp.overview", "mbp.performance", "mbp.sitelist", "mbp.simmap", "mbp.placement", "mbp.backtest", "mbp.simulation"]) assert.ok(src.includes(`"${v}"`), `legacy ${v}`);
  for (const k of ["mbp", "disp", "tel", "est", "corr"]) assert.ok(new RegExp(`\\["${k}", "`).test(src), `advanced view ${k} kept`);
});

/* ================= fourth pass ================= */
import { coverageGap, showCoverageGap } from "../lib/view.js";
test("1a · 'No action' with an MBP coverage gap is labelled as a coverage gap (TBH048)", () => {
  // v4.0 — TBH048 is now reachable before BBT (radius is a preference) → no gap; the rule is tested on the sites that still have one
  const s = active.find((x) => x.recommended_action === "No action" && x.mbp_priority_level === "P1" && !x.can_arrive_before_bbt && x.bbt_status !== "Unknown" && !x.genset_protected);
  assert.ok(s, "a P1 'No action' site without reach exists");
  assert.ok(coverageGap(s) && showCoverageGap(s));
  assert.ok(!coverageGap(byId.get("TBH048")));
  const n = active.filter((x) => x.mbp_priority_level === "P1" && showCoverageGap(x)).length;
  console.log("MBP-P1 sites relabelled as coverage gap:", n);
  assert.equal(active.filter((x) => showCoverageGap(x) && x.bbs_priority_level && x.recommended_action !== "No action").length, 0);
  for (const f of ["components/ui.jsx", "components/SiteDrawer.jsx", "components/tabs/BbsActions.jsx"]) assert.ok(fs.readFileSync(f, "utf8").includes("ActionLabel"), f);
  for (const f of ["components/tabs/MbpTab.jsx", "components/tabs/BbsActions.jsx"]) assert.ok(fs.readFileSync(f, "utf8").includes('label: "coverage_gap"'), f);
});

/* ---------- 1b. every engine string is translated in ID (frontend pattern mapping) ---------- */
test("1b · engine strings: every string on the snapshot is covered by an ID pattern", async () => {
  const { registerDicts, setLang, t } = await import("../lib/i18n.js");
  const { te, covered } = await import("../lib/i18n-engine.js");
  const en = JSON.parse(fs.readFileSync("i18n/en.json", "utf8")), id = JSON.parse(fs.readFileSync("i18n/id.json", "utf8"));
  registerDicts({ en, id });
  const miss = new Map(), seen = new Map();
  const chk = (fam, kind, v) => {
    if (v == null || v === "") return; seen.set(fam, (seen.get(fam) || 0) + 1);
    if (!covered(v, kind)) { const k = `${fam}: ${String(v).replace(/\d+(\.\d+)?/g, "#")}`; miss.set(k, (miss.get(k) || 0) + 1); }
  };
  for (const s of M) {
    chk("rule", "rule", s.rule); chk("precedence", "prec", s.battery.precedence); chk("conflict", "conflict", s.battery.conflict);
    for (const e of s.evidence || []) { chk("ev.value", "ev", e.value); chk("ev.threshold", "ev", e.threshold); chk("ev.rule", "ev", e.rule); }
    chk("mbp_drivers", "drivers", s.mbp_priority_drivers); chk("bbs_drivers", "drivers", s.bbs_priority_drivers);
    chk("resp.why", "resp", s.resp.why); chk("assignment_basis", "assign", s.assignment_basis); chk("eta_conf", "eta_conf", s.eta_confidence);
    chk("dist_note", "dist_note", s.dist_note); chk("offair", "offair", s.offair); chk("bbt_value_basis", "bbtbasis", s.bbt_value_basis);
    chk("access_basis", "access", s.access_basis); chk("design_basis", "design", s.bbt_design_basis); chk("nop_flag", "nop_flag", s.nop_flag);
    chk("est_conf", "conf", s.bbt_est_confidence);
  }
  for (const r of clusterTable(active, cfg)) chk("trend_why", "trend", r.trend_why);
  for (const r of basecampSummary(M, mbps, cfg)) chk("signal_why", "signal", r.signal_why);
  const aff = active.filter((s) => s.nop === "NOP PALEMBANG").sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)).slice(0, 40).map((s) => s.site_id);
  for (const h of [1, 4, 12]) for (const r of simulate(M, aff, h, mbps, { fam }, cfg, { departHour: 17 }).rows) chk("sim.reasons", "sim", r.reasons);
  for (const m of meta.mbp.pic_matches || []) chk("pic.basis", "pic", m.basis);
  for (const m of meta.mbp.duplicates || []) chk("dup.status", "pic", m.status);
  for (const m of meta.dq.unmatched || []) chk("unmatched.note", "pic", m.note);
  for (const c of meta.qa.build_sanity || []) chk("sanity", "sanity", c.check);
  console.log("1b families checked:", Object.fromEntries(seen));
  if (miss.size) console.log("1b untranslated:", [...miss.entries()].slice(0, 40));
  assert.equal(miss.size, 0, `${miss.size} untranslated engine string shapes`);
  // spot checks: rendered Indonesian, English kept in EN
  setLang("id");
  const tpi = byId.get("TPI516") || M[0];
  const r8 = te("R8: Degraded at P1/P2 — monitoring is not allowed for a high priority", "rule");
  assert.match(r8, /^R8: Menurun/);
  assert.match(te("no MBP within 35 km coverage radius", "sim"), /tidak ada MBP dalam radius cakupan 35 km/);
  assert.match(te("eta gap", "drivers") ?? "", /eta gap/);
  assert.ok(!/[{}]/.test(te(tpi.assignment_basis, "assign") || ""), "no unfilled placeholders");
  for (const k of Object.keys(id).filter((k) => k.startsWith("eng."))) assert.ok(!/eng\./.test(t(k)), k);
  setLang("en");
  assert.equal(te(r8, "rule"), r8);
});

/* ---------- 2a/2b. drilldowns: panel totals = Site-list rows behind "View N sites" ---------- */
test("2a · drilldown totals equal the Site-list filter; segments ≤ 5; per-NOP sorted by 'no data' share", async () => {
  const { DRILLS, drillModel, applySel, parseSel } = await import("../lib/drill.js");
  const scope = M.filter((s) => s.site_active === 1 && !s.offair);
  const ids = Object.keys(DRILLS).filter((k) => !DRILLS[k].filterOnly);
  for (const id of ids) {
    const m = drillModel(id, scope);
    assert.ok(m.segs.length <= 5, `${id}: ${m.segs.length} segments`);
    const sitesSum = m.segs.reduce((a, x) => a + x.n, 0);
    if (!DRILLS[id].unit) assert.equal(sitesSum, m.universe, `${id}: every site in exactly one segment`);
    assert.equal(applySel(scope, id).rows.length, m.totalSites, `${id}: View N sites = KPI total`);
    for (const x of m.segs) if (x.k !== "other" && !DRILLS[id].unit) assert.equal(applySel(scope, `${id}~${x.k}`).rows.length, x.n, `${id}~${x.k}`);
    for (let i = 1; i < m.rows.length; i++) assert.ok(m.rows[i - 1].noneShare >= m.rows[i].noneShare);
  }
  // KPI values on the cards
  assert.equal(drillModel("bbt_measured", scope).totalSites, scope.filter((s) => s.battery.measured).length);
  assert.equal(drillModel("below_target", scope).totalSites, scope.filter((s) => typeof s.avail_delta_pp === "number" && s.avail_delta_pp < 0).length);
  const cov = drillModel("cov", scope); assert.equal(applySel(scope, "cov~within").rows.length, scope.filter((s) => s.covered).length);
  assert.equal(cov.universe, scope.length);
  const pd = drillModel("power_down", scope);
  assert.ok(Math.abs(pd.totalValue - scope.reduce((a, s) => a + (s.ran_power_down_h || 0), 0)) < 1e-6);
  // 2b filter-only presets sort by hours
  const c = applySel(scope, "cause~power"); assert.ok(c.weight && c.rows.every((s) => s.ran_power_down_h > 0));
  const r = applySel(scope, "resp~utility_inferred"); assert.ok(r.rows.length > 0 && r.rows.every((s) => (s.resp.shares?.utility_inferred || 0) > 0));
  assert.equal(parseSel("nonsense"), null); assert.equal(applySel(scope, "nonsense").rows.length, scope.length);
  console.log("2a drills:", ids.map((id) => `${id}=${drillModel(id, scope).totalSites}`).join(" "));
});

/* ---------- v3.4 period filter ---------- */
test("v3.4 · period: H1 re-summed from daily files = snapshot; Q1 + Q2 = H1; days add up; decisions unchanged", async () => {
  const P = await import("../lib/period.js");
  const files = {}; for (let m = 1; m <= 6; m++) files[`20260${m}`] = JSON.parse(fs.readFileSync(`public/data/period/20260${m}.json`, "utf8"));
  const ids = sites.map((s) => s.site_id), n = sites.length;
  const H = P.parsePeriod("h1"), A = P.periodAgg(files, H, n), X = P.applyPeriod(M, ids, A, H);
  const bad = (k, tol) => X.filter((s, i) => Math.abs((s[k] ?? 0) - (M[i][k] ?? 0)) > tol).length;
  for (const k of ["ran_hours", "ran_outage_h", "ran_power_down_h", "ran_transport_down_h", "ran_ran_down_h", "ran_other_down_h", "pln_total_h", "mbp_backup_h"]) assert.equal(bad(k, 0.05), 0, k);
  for (const k of ["pln_freq", "mbp_deployments"]) assert.equal(bad(k, 1e-9), 0, k);
  assert.equal(X.filter((s, i) => s.resp.primary !== M[i].resp.primary).length, 0, "responsibility");
  // decisions are the snapshot's
  assert.ok(X.every((s, i) => s.mbp_priority_level === M[i].mbp_priority_level && s.recommended_action === M[i].recommended_action && s.bbt_status === M[i].bbt_status));
  const q1 = P.periodAgg(files, P.parsePeriod("q:1"), n), q2 = P.periodAgg(files, P.parsePeriod("q:2"), n);
  let d = 0; for (let i = 0; i < n; i++) d = Math.max(d, Math.abs(q1.o[i] + q2.o[i] - A.o[i]), Math.abs(q1.hours[i] + q2.hours[i] - A.hours[i]));
  assert.ok(d < 1e-6, `Q1+Q2 vs H1 ${d}`);
  // a single day is ≤ 24 h per site and the days of May add up to the month
  const may = P.periodAgg(files, P.parsePeriod("m:202605"), n);
  let sum = new Float64Array(n); for (let dd = 1; dd <= 31; dd++) { const a = P.periodAgg(files, P.parsePeriod(`d:202605${String(dd).padStart(2, "0")}`), n); for (let i = 0; i < n; i++) { sum[i] += a.o[i]; assert.ok(a.o[i] <= 24.0001); } }
  let e = 0; for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(sum[i] - may.o[i])); assert.ok(e < 1e-6, `days vs month ${e}`);
  // parsing / stepping
  assert.equal(P.parsePeriod("w:20260101").b, 3); assert.equal(P.step(P.parsePeriod("w:20260101"), 1).key, "w:20260105");
  assert.equal(P.step(P.parsePeriod("m:202606"), 1), null); assert.equal(P.parsePeriod("bogus").key, "h1");
  assert.equal(P.parsePeriod("r:20260520-20260501").key, "r:20260501-20260520");
});

test("v3.4 · map legend filter = Site-list filter (?sel=map_<mode>~keys)", async () => {
  const { applySel, MAP_KEYS } = await import("../lib/drill.js");
  const scope = M.filter((s) => s.site_active === 1 && !s.offair);
  for (const [mode, keys] of [["priority", ["P1", "P2"]], ["survival", ["late", "beyond"]], ["design", ["Dead", "Critical"]]]) {
    const r = applySel(scope, `map_${mode}~${keys.join("+")}`);
    assert.equal(r.rows.length, scope.filter((s) => keys.includes(MAP_KEYS[mode](s))).length, mode);
    assert.equal(r.weight, null, "no hours column for a legend filter");
  }
});

/* ---------- v3.5 site → cluster → NOP roll-up ---------- */
test("v3.5 · roll-up: NOP = Σ its clusters = Σ its sites, for every map mode; drivers are the NOP's problem sites", async () => {
  const { MAP_MODES } = await import("../lib/mapmodes.js");
  const { rollup, justify } = await import("../lib/rollup.js");
  const scope = M.filter((s) => s.site_active === 1 && !s.offair);
  for (const mode of Object.keys(MAP_MODES)) {
    const K = MAP_MODES[mode];
    const S = mode === "trend" ? scope.map((s) => ({ ...s, _trend: "Stable" })) : scope;
    for (const s of S.slice(0, 500)) assert.ok(K.keys.includes(K.key(s)), `${mode}: key ${K.key(s)} not in legend`);
    const nops = rollup(S, "nop", mode), cls = rollup(S, "cluster", mode);
    assert.equal(nops.reduce((a, u) => a + u.n, 0), S.length, mode);
    for (const u of nops) {
      const mine = cls.filter((c) => c.nop === u.nop);
      assert.equal(mine.reduce((a, c) => a + c.bad, 0), u.bad, `${mode} ${u.id} bad`);
      const sz = S.filter((s) => s.nop === u.id).reduce((a, s) => a + (K.size ? Math.max(0, K.size(s) || 0) : 0), 0);
      assert.ok(Math.abs(sz - u.size) < 1e-6, `${mode} ${u.id} size`);
      for (const k of K.keys) assert.equal(u.counts[k] || 0, S.filter((s) => s.nop === u.id && K.key(s) === k).length);
    }
    const J = justify(S, "nop", nops[0].id, mode);
    assert.equal(J.nDrivers, nops[0].bad); assert.ok(J.drivers.every((s) => K.bad.includes(K.key(s)) && s.nop === nops[0].id));
  }
});

// ---------------------------------------------------------------- v3.6 ops feedback
test("v3.6 fixed genset: protected sites never need an MBP and are out of placement targets", () => {
  const G = M.filter((s) => s.fixed_genset === "ACTIVE");
  assert.ok(G.length > 1000, "fixed-genset sites exported");
  assert.ok(G.every((s) => s.genset_protected === 1 && s.reach_risk === 0));
  const nop = G[0].nop, g = G.filter((s) => s.nop === nop).slice(0, 5).map((s) => s.site_id);
  const r = simulate(M, g, 4, mbps, { fam }, cfg, {});
  assert.ok(r.rows.every((x) => !x.mbp_needed), "genset sites not dispatched");
  const p = placementPlan(M.filter((s) => s.nop === nop), mbps, cfg, { deadline: 30, scopeMode: "all", maxNew: 3 });
  const tgt = M.filter((s) => s.nop === nop && s.site_active === 1 && !s.offair && !s.genset_protected && s.access_class !== "island" && Number.isFinite(s.lat));
  assert.equal(p.targets + p.battery, tgt.length);
});

test("v4.0 BBT gap = measured BBT ÷ the 120-min standard (the computed design rests on an assumed 100 Ah per bank)", () => {
  const W = M.filter((s) => s.bbt_gap_ratio != null);
  assert.ok(W.length > 1000);
  for (const s of W.slice(0, 2000)) {
    assert.ok(s.battery.measured);
    assert.ok(Math.abs(s.bbt_gap_ratio - s.battery.display.value / cfg.bbt.design_minutes) < 1e-9);
  }
});

test("v3.6 response target: placement reach now = sites whose fastest MBP ETA ≤ target; new spots are kecamatan sites", () => {
  for (const nop of ["NOP PALEMBANG", "NOP BATAM", "NOP ACEH"]) {
    const S = M.filter((s) => s.nop === nop);
    const p = placementPlan(S, mbps, cfg, { deadline: 30, scopeMode: "all", maxNew: 5, target: 1 });
    const T = S.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected && s.access_class !== "island" && Number.isFinite(s.lat));
    assert.equal(p.reachedNow, T.filter((s) => s.eta_fastest_min != null && s.eta_fastest_min <= 30).length, nop);
    assert.ok(p.added.length > 0 && p.added.every((a) => a.kecamatan), `${nop}: every new spot has a kecamatan`);
    for (let k = 1; k < p.steps.length; k++) assert.ok(p.steps[k].reached > p.steps[k - 1].reached, "each step adds reach");
  }
  const A = kecamatanAnchors(M.filter((s) => s.nop === "NOP BATAM"));
  assert.ok(A.length > 5 && A.every((a) => a.site.site_active === 1 && a.site.access_class !== "island" && a.site.kecamatan === a.kecamatan));
});

test("v3.6 centre of gravity: recommendation is a real kecamatan site and never worse on weighted reach", () => {
  const G = basecampGravity(M, mbps, cfg, { deadline: 30 });
  assert.ok(G.length > 200);
  const byId = new Map(M.map((s) => [s.site_id, s]));
  for (const g of G) {
    const a = byId.get(g.rec_site);
    assert.ok(a && a.kecamatan === g.rec_kecamatan && a.site_active === 1 && a.access_class !== "island", g.mbp_id);
    if (g.verdict !== "stay") assert.ok(g.wreach_rec >= g.wreach_now - 1e-9 || g.eta_w_rec < g.eta_w_now, g.mbp_id);
  }
  assert.ok(G.reduce((a, g) => a + g.reach_rec, 0) >= G.reduce((a, g) => a + g.reach_now, 0));
});

test("v3.6 concurrency & productivity exports are consistent", () => {
  const C = meta.mbp.concurrency;
  const N = new Set(M.map((s) => s.nop).filter(Boolean));
  assert.ok(C.length >= N.size - 2 && C.every((c) => N.has(c.nop)), "one row per NOP with MBP tickets");
  for (const c of C) assert.ok(c.p90 <= c.p95 && c.p95 <= c.p99 && c.p99 <= c.max && c.jobs > 0, c.nop);
  for (const m of mbps.filter((x) => x.prod_tickets > 0)) {
    assert.ok(m.prod_plnoff <= m.prod_tickets && m.prod_visits <= m.prod_tickets, m.mbp_id);
    assert.ok(m.prod_rh_median_h == null || m.prod_rh_median_h <= 48);
  }
  const pl = M.reduce((a, s) => a + (s.tk_plnoff_n || 0), 0), vi = M.reduce((a, s) => a + (s.tk_plnoff_visit_n || 0), 0);
  assert.ok(vi <= pl && pl > 30000);
});

// ---------------------------------------------------------------- v3.7 MBP performance, backtest, dispatch, BBS action types
import { mbpPerformance, replayDelta, backtestMove, dispatchOrder, dispatchAudit, dispatchScore, PERF_KEYS, nopMbpSummary, sitePairs, groupEvents, modelCheck, campCode } from "../lib/mbpperf.js";
import { computeKpis, reconcile } from "../lib/kpi.js";
import { actionType, ACTION_TYPES } from "../lib/logic.js";
const TK = fs.existsSync("public/data/tickets.json") ? fromColumnar(JSON.parse(fs.readFileSync("public/data/tickets.json", "utf8"))) : [];

test("v3.7 MBP performance: every job counted once, classes valid, on-time judged only on PLN-off jobs", () => {
  assert.ok(TK.length > 30000, "tickets exported");
  const P = mbpPerformance(M, mbps, TK, cfg);
  const ids = new Set(mbps.map((m) => m.mbp_id));
  const sum = [...P.values()].reduce((a, p) => a + p.jobs, 0);
  assert.equal(sum, TK.filter((k) => ids.has(k.mbp)).length);
  for (const p of P.values()) {
    assert.ok(PERF_KEYS.includes(p.key), p.key);
    assert.ok(p.ontime + p.late + p.bbt_unknown <= p.plnoff && p.plnoff + p.non_pln === p.jobs, p.mbp_id);
    if (p.ontime_rate != null) assert.ok(p.ontime_rate >= 0 && p.ontime_rate <= 1);
  }
  const rows = nopMbpSummary(active, mbps, P);
  for (const r of rows) assert.ok(r.within + r.beyond === r.sites && r.arrive <= r.within, r.nop);
});

test("v4.0 replay is anchored on the actual: no change = actual on-time; moving a camp onto its own spot changes nothing", () => {
  const nop = "NOP BENGKULU", S = M.filter((s) => s.nop === nop), mb = mbps.filter((m) => m.nop === nop && Number.isFinite(m.lat));
  const by = new Map(S.map((s) => [s.site_id, s])), T = TK.filter((k) => by.has(k.site));
  const r = replayDelta(by, mb, T, cfg).total;
  let on = 0, n = 0;
  for (const k of T) { const s = by.get(k.site); if ((k.rc && k.rc !== "P") || !Number.isFinite(k.arr) || s.bbt_status === "Unknown") continue; n++; if (k.arr <= s.bbt_effective_min) on++; }
  assert.equal(r.ontime, on, "baseline = actual");
  assert.equal(r.gained + r.lost, 0);
  const same = replayDelta(by, mb, T, cfg, { moves: new Map([[mb[0].mbp_id, { lat: mb[0].lat, lon: mb[0].lon }]]) }).total;
  assert.equal(same.ontime, r.ontime);
  const bt = backtestMove(S.filter((s) => s.site_active === 1 && !s.offair), mb, T, cfg, mb[0].mbp_id, { candidates: 4 });
  for (let i = 1; i < bt.results.length; i++) assert.ok(bt.results[i - 1].ontime_gain >= bt.results[i].ontime_gain);
  assert.ok(bt.results.every((x) => x.kecamatan));
});

test("v3.7 dispatch: savable sites first, then score; audit decisions only when other jobs were waiting", () => {
  const camp = mbps.find((m) => m.mbp_id && Number.isFinite(m.lat) && M.filter((s) => s.mbp_assigned === m.mbp_id).length > 20);
  const down = M.filter((s) => s.mbp_assigned === camp.mbp_id).slice(0, 12);
  const o = dispatchOrder(down, camp, cfg);
  for (let i = 1; i < o.length; i++) { assert.ok(o[i - 1].group <= o[i].group); if (o[i - 1].group === o[i].group) assert.ok(o[i - 1].score >= o[i].score - 1e-12); }
  const A = dispatchAudit(TK.slice(0, 8000), byId, cfg);
  assert.ok(A.length > 0 && A.every((d) => d.waiting >= 2 && typeof d.followed === "boolean" && d.best_score >= d.chosen_score));
});

test("v3.7 BBS: action types cover every action; Critical on a young / lithium battery → check setting, never straight replacement", () => {
  for (const s of M) { assert.ok(ACTION_TYPES.includes(s.action_type)); if (s.recommended_action !== "No action") assert.notEqual(s.action_type, "NONE", s.recommended_action); }
  const young = M.filter((s) => s.bbt_status === "Critical" && s.battery.measured && s.bbs_priority_level && Number.isFinite(s.battery_age_y)
    && s.battery_age_y < 0.4 * (cfg.battery_age_replace_years[s.battery_type] ?? 5) && !(s.load_a >= cfg.load_high_ampere));
  assert.ok(young.length > 50);
  assert.ok(young.every((s) => s.action_type === "SETTING" && s.rule.startsWith("R6c")), "young Critical → R6c");
});

const EV = fs.existsSync("public/data/pln_ev.json") ? fromColumnar(JSON.parse(fs.readFileSync("public/data/pln_ev.json", "utf8"))) : [];
test("v4.0 need = event pairs: outages longer than BBT with a matched MBP job, never above 100 %", () => {
  const p = sitePairs([{ dur: 200, arr: 60, mbp: "A" }, { dur: 200, arr: 150, mbp: "A" }, { dur: 200, arr: null, mbp: null }, { dur: 50, arr: 20, mbp: "A" }], { bbt_effective_min: 90, bbt_status: "Degraded" });
  assert.deepEqual(p, { need: 3, served: 2, ontime: 1, jobs_on_events: 3 });
  assert.equal(sitePairs([{ dur: 200, mbp: "A" }], { bbt_effective_min: 90, bbt_status: "Unknown" }), null);
  assert.ok(EV.length > 100000, "pln_ev exported");
  const P = mbpPerformance(M, mbps, TK, cfg, groupEvents(EV));
  for (const x of P.values()) { assert.ok(x.need_served <= x.need && x.need_ontime <= x.need_served, x.mbp_id); if (x.resp != null) assert.ok(x.resp >= 0 && x.resp <= 1); }
});

test("v4.0 ONE KPI layer reconciles: Σ NOP = AREA, every share within 0–100 %", () => {
  const K = computeKpis(M.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected), mbps, TK, EV, cfg);
  assert.deepEqual(reconcile(K), []);
  assert.ok(K.area.served <= K.area.need && K.area.p12_reach <= K.area.p12);
  assert.ok(K.area.bbs_p1 > 0 && K.area.setting > 0);
});

test("v4.0 calibration: model vs actual per NOP, ok only within ±5 pp", () => {
  const C = modelCheck(M, mbps, TK, cfg);
  const rows = Object.entries(C).filter(([k]) => k !== "__all").map(([, v]) => v);
  assert.ok(rows.length >= 10);
  for (const r of rows) assert.equal(r.ok, r.n >= 50 && Math.abs(r.diff_pp) <= 5);
  assert.ok(Math.abs(C.__all.diff_pp) <= 5, "AREA-wide model within ±5 pp after calibration");
});

test("v4.0 dispatch: PROXY dependency gets no weight; audit has one decision per camp · site · day; codes carry no names", () => {
  const s = { site_class: "Gold", mbp_priority_score: 0.5 }, d = cfg.dispatch;
  const sc = dispatchScore(s, cfg), cls = cfg.class_score.Gold;
  assert.ok(Math.abs(sc.score - (d.w_class * cls + d.w_priority * 0.5) / (d.w_class + d.w_priority)) < 1e-12);
  const A = dispatchAudit(TK.slice(0, 8000), byId, cfg), keys = A.map((x) => `${x.mbp}|${x.chosen}|${Math.floor(x.T / 1440)}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(campCode("BPS001-BJI-HENDRIKA"), "BPS001-BJI");
  assert.ok(!campCode("MBP-LHT-LISUS").includes("LISUS"));
});

test("v4.0 radius is a preference: reach before BBT does not change with the preferred radius", () => {
  const c20 = JSON.parse(JSON.stringify(cfg)); c20.mbp.max_radius_km = 20;
  const f = (L) => L.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  const A20 = f(buildModel(sites, mbps, c20));
  const n = (L) => L.filter((s) => s.covered && s.can_arrive_before_bbt).length;
  assert.equal(n(A20), n(f(M)));
  for (const id of ["BKJ358", "PSP542", "BGE163"]) { const s = A20.find((x) => x.site_id === id); if (s) assert.equal(s.can_arrive_before_bbt, 1, id); }
});

// ---------------------------------------------------------------- v3.8 AREA 4 (light)
test("v3.8 AREA 4: battery status from BBT Site Details, roll-up sums, field reach", async () => {
  const { a4Battery, a4Model, a4Rollup, a4Field } = await import("../lib/area4.js");
  assert.equal(a4Battery({ bbt_category: "BBT", bbt_median_min: 3 }, cfg).status, "Dead");
  assert.equal(a4Battery({ bbt_category: "BBT", bbt_median_min: 45 }, cfg).status, "Degraded");
  assert.equal(a4Battery({ bbt_category: "Only Mains Fail", backup_min: 40 }, cfg).status, "held");
  assert.equal(a4Battery({ bbt_category: "Only Mains Fail", backup_min: 130 }, cfg).status, "Meets design");
  assert.equal(a4Battery({}, cfg).status, "Unknown");
  if (!fs.existsSync("public/data/a4/field_sites.json")) return;
  const S = a4Model(fromColumnar(JSON.parse(fs.readFileSync("public/data/a4/field_sites.json", "utf8"))), cfg);
  const F = fromColumnar(JSON.parse(fs.readFileSync("public/data/a4/fme.json", "utf8")));
  assert.ok(S.length > 15000 && F.length > 500);
  assert.ok(!Object.keys(F[0]).some((k) => /mail|phone/i.test(k)), "no personal contact data exported");
  const nops = a4Rollup(S, "nop"), cl = a4Rollup(S, "cluster_to");
  assert.equal(nops.reduce((a, r) => a + r.sites, 0), S.length);
  assert.ok(Math.abs(nops.reduce((a, r) => a + r.out, 0) - cl.reduce((a, r) => a + r.out, 0)) < 1e-6);
  const fr = a4Field(S.slice(0, 3000), F, cfg.mbp.max_radius_km);
  assert.ok(fr.rows.every((r) => r.within <= r.sites));
});

test("v4.0 AREA 4 in the AREA 1 shape: same site columns, model runs, KPIs reconcile, N/A where there is no source", () => {
  if (!fs.existsSync("public/data/a4/meta.json")) return;
  const rd = (f) => JSON.parse(fs.readFileSync(`public/data/a4/${f}`, "utf8"));
  const s4 = rd("sites.json"), s1 = JSON.parse(fs.readFileSync("public/data/sites.json", "utf8"));
  assert.deepEqual(s4.cols, s1.cols);
  const m4 = rd("meta.json"), b4 = rd("mbps.json");
  assert.ok(m4.config && m4.monthly_nop.length && b4.length > 100 && b4.every((m) => !String(m.mbp_id).includes(m.pic_name || "§")));
  const S = buildModel(fromColumnar(s4), b4, m4.config).filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  const K = computeKpis(S, b4, [], [], m4.config);
  assert.deepEqual(reconcile(K), []);
  assert.equal(K.area.served_pct, null); assert.equal(K.area.jobs_ontime_pct, null);
});

test("v4.1 one dataset: AREA 1 + AREA 4 merged, AREA is a filter; KPIs reconcile per AREA and combined", () => {
  if (!fs.existsSync("public/data/a4/meta.json")) return;
  const rd = (f) => JSON.parse(fs.readFileSync(`public/data/a4/${f}`, "utf8"));
  const ids = new Set(sites.map((s) => s.site_id));
  const s4 = fromColumnar(rd("sites.json")).filter((s) => !ids.has(s.site_id)).map((s) => ({ ...s, area: "AREA 4" }));
  const all = [...sites.map((s) => ({ ...s, area: "AREA 1" })), ...s4], mb = [...mbps.map((m) => ({ ...m, area: "AREA 1" })), ...rd("mbps.json").map((m) => ({ ...m, area: "AREA 4" }))];
  const MM = buildModelByArea(all, mb, cfg).filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  const K = computeKpis(MM, mb, TK, EV, cfg), K1 = computeKpis(MM.filter((s) => s.area === "AREA 1"), mb.filter((m) => m.area === "AREA 1"), TK, EV, cfg);
  assert.deepEqual(reconcile(K), []);
  const K4 = computeKpis(MM.filter((s) => s.area === "AREA 4"), mb.filter((m) => m.area === "AREA 4"), TK, EV, cfg);
  assert.equal(K.area.sites, K1.area.sites + K4.area.sites);
  assert.equal(K.area.need, K1.area.need);                        // AREA 4 has no PLN events yet
  // AREA 1 numbers do not change when AREA 4 is loaded next to it
  const A1 = M.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  assert.equal(K1.area.p12_reach, computeKpis(A1, mbps, TK, EV, cfg).area.p12_reach);
});

// ---------------------------------------------------------------- v4.2 — review fixes as ISTQB-style test cases (TC-xx ↔ FIX-xx)
import { basecampFinal, basecampCounts, areaCoverage, recommendable, needsCleanup, statusOf as bcStatusOf, LIST_STATUS, BC_STATUS } from "../lib/basecamp.js";
import { mergeAreas } from "../lib/data.js";
import { bbtUnknown, reachOk, REACH_EVIDENCE } from "../lib/logic.js";
import { MAP_KEYS } from "../lib/mapmodes.js";
const has4 = fs.existsSync("public/data/a4/meta.json") && fs.existsSync("public/data/basecamps.json");
const V42 = (() => {
  if (!has4) return null;
  const ld = (d) => { const rd = (f, x) => (fs.existsSync(`${d}/${f}`) ? JSON.parse(fs.readFileSync(`${d}/${f}`, "utf8")) : x); const E = { cols: [], rows: [] };
    return { meta: rd("meta.json"), sites: fromColumnar(rd("sites.json")), mbps: rd("mbps.json", []), fam: fromColumnar(rd("familiarity.json", E)), tickets: fromColumnar(rd("tickets.json", E)), events: fromColumnar(rd("pln_ev.json", E)) }; };
  const D = mergeAreas([{ a: "AREA 1", d: ld("public/data") }, { a: "AREA 4", d: ld("public/data/a4") }]);
  const MM = buildModelByArea(D.sites, D.mbps, D.meta.config);
  const ev = groupEvents(D.events), pf = mbpPerformance(MM, D.mbps, D.tickets, D.meta.config, ev);
  const BC = basecampFinal(MM, D.mbps, pf, D.meta.config, { areas: D.meta.areas, mergeReview: D.meta.mbp?.merge_review || [] });
  const cov = areaCoverage(D.meta.areas), act = MM.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  const full = act.filter((s) => cov[s.area] === "FULL");
  const KA = computeKpis(act, D.mbps, D.tickets, D.events, D.meta.config, { evBySite: ev, perf: pf, unmatchedByNop: D.meta.dq.ticket_gaps, coverage: cov });
  const KF = computeKpis(full, D.mbps.filter((m) => cov[m.area] === "FULL"), D.tickets, D.events, D.meta.config, { evBySite: ev, perf: pf, unmatchedByNop: D.meta.dq.ticket_gaps, coverage: cov });
  return { D, MM, BC, cov, act, KA, KF, json: JSON.parse(fs.readFileSync("public/data/basecamps.json", "utf8")), kpi: JSON.parse(fs.readFileSync("public/data/kpi.json", "utf8")) };
})();

test("TC-01 (FIX-01) one source for the base-camp count: header = Σ legend = Σ NOP table = all base camps", { skip: !V42 }, () => {
  const { BC, D, KA } = V42, C = basecampCounts(BC);
  assert.equal(C.total, D.mbps.length);
  assert.equal(BC_STATUS.reduce((a, k) => a + (C.by[k] || 0), 0), C.total);
  assert.equal(KA.nops.reduce((a, r) => a + r.mbp, 0), C.total);
  assert.ok(KA.byNop.get("Unassigned / no location")?.mbp >= 1, "camps without NOP / location get their own row");
});

test("TC-02 (FIX-02) status: exactly one per base camp, decided in the documented order", () => {
  const c = cfg, base = { jobs: 60, judged: 50, busy: 0.1, ontime_rate: 0.7 };
  assert.equal(bcStatusOf(base, c, { hasLoc: false, coverage: "FULL" }), "noloc");
  assert.equal(bcStatusOf(base, c, { hasLoc: true, coverage: "PARTIAL" }), "nodata");
  assert.equal(bcStatusOf({ jobs: 0 }, c, { hasLoc: true, coverage: "FULL" }), "none");
  assert.equal(bcStatusOf({ ...base, judged: 5, ontime_rate: null }, c, { hasLoc: true }), "few");
  assert.equal(bcStatusOf({ ...base, busy: 0.01 }, c, { hasLoc: true }), "under");
  assert.equal(bcStatusOf({ ...base, busy: 0.4, ontime_rate: 0.1 }, c, { hasLoc: true }), "high");
  assert.equal(bcStatusOf({ ...base, ontime_rate: 0.2 }, c, { hasLoc: true }), "low");
  assert.equal(bcStatusOf({ ...base, ontime_rate: 0.5 }, c, { hasLoc: true }), "watch");
  assert.equal(bcStatusOf(base, c, { hasLoc: true }), "good");
  if (V42) assert.ok(V42.BC.every((r) => BC_STATUS.includes(r.status)));
});

test("TC-03 (FIX-03) recommendation lists hold selectable camps only; listed artefacts sit in 'clean up first'", { skip: !V42 }, () => {
  const { BC } = V42;
  for (const st of LIST_STATUS) assert.ok(recommendable(BC, st).every((r) => r.selectable && r.sites_assigned > 0 && r.dup_state !== "PENDING"));
  const clean = new Set(needsCleanup(BC).map((r) => r.mbp_id)), listed = new Set([...LIST_STATUS].flatMap((st) => recommendable(BC, st).map((r) => r.mbp_id)));
  for (const pre of ["BPS004-RHL", "BPS007-RHL", "BPS006-SLK-AFRI", "BPS007-SLK- RIDHO", "BPS004-BJI-MUHAMMAD"]) {
    const r = BC.find((x) => x.mbp_id.startsWith(pre)); assert.ok(r, pre);
    assert.ok(clean.has(r.mbp_id) && !listed.has(r.mbp_id), `${pre} must be in clean-up, not in a recommendation list`);
  }
  assert.equal(new Set(BC.map((r) => r.code)).size, BC.length, "base-camp codes are unique");
});

test("TC-04 (FIX-04) partial-data AREA does not dilute the KPI; its reach is N/A, never 0 %", { skip: !V42 }, () => {
  const { KA, KF, cov } = V42;
  assert.equal(cov["AREA 1"], "FULL"); assert.equal(cov["AREA 4"], "PARTIAL");
  assert.equal(KA.area.p12_reach, KF.area.p12_reach); assert.equal(KA.area.p12_eval, KF.area.p12_eval);
  for (const r of KA.nops.filter((x) => x.area === "AREA 4")) { assert.equal(r.p12_reach_pct, null, r.nop); assert.equal(r.served_pct, null); assert.equal(r.jobs_ontime_pct, null); }
  assert.ok(V42.BC.filter((r) => r.area === "AREA 4" && r.has_location).every((r) => r.status === "nodata"));
});

test("TC-05 (FIX-05) reach rests only on ACTUAL / ESTIMATED / DERIVED battery values, with its basis shown", { skip: !V42 }, () => {
  const { act, KF } = V42;
  assert.ok(act.filter(reachOk).every((s) => REACH_EVIDENCE.has(s.battery.display.evidence)));
  assert.ok(!act.some((s) => reachOk(s) && ["PROXY", "TICKET", "UNAVAILABLE", "DERIVED-UNVERIFIED"].includes(s.battery.display.evidence)));
  const A = KF.area; assert.equal(A.p12_reach, A.p12_reach_actual + A.p12_reach_estimated + A.p12_reach_derived);
  assert.ok(cfg.bbt.design_from_battery.calibration_scale > 0 && cfg.bbt.design_from_battery.calibration_scale < 1, "design calibration factor in Config");
});

test("TC-06 (FIX-06) busy at peak never exceeds the units of the NOP; ratios within 0–100 %", { skip: !V42 }, () => {
  const { KA } = V42;
  for (const r of KA.nops) { if (r.conc_max != null) assert.ok(r.conc_max <= r.mbp, `${r.nop} ${r.conc_max}/${r.mbp}`); }
  const rp = KA.byNop.get("NOP RANTAU PRAPAT"); assert.ok(rp.conc_p95 <= 17 && rp.conc_p95 <= rp.mbp);
  assert.deepEqual(reconcile(KA), []);
});

test("TC-07 (FIX-07) one definition: BBT unknown and RAN unavailable give the same count on every page", { skip: !V42 }, () => {
  const { act, KA } = V42, n = act.filter(bbtUnknown).length;
  assert.equal(KA.area.bbt_unknown, n);
  assert.equal(act.filter((s) => MAP_KEYS.survival(s) === "unknown").length, n, "map legend");
  assert.equal(act.filter((s) => (bbtUnknown(s) ? "UNAVAILABLE" : s.bbt_value_evidence || "UNAVAILABLE") === "UNAVAILABLE").length, n, "evidence table");
  const ran = act.filter((s) => !Number.isFinite(s.avail_wc_pct)).length;
  assert.equal(act.filter((s) => MAP_KEYS.gap(s) === "nodata").length, ran);
  assert.ok(act.filter((s) => MAP_KEYS.dq(s) === "no_bbt").length <= n, "first-missing-input map is a subset (labelled as such)");
});

test("TC-08 (FIX-08) plotted + not plotted = all sites; AREA 4 coordinates carry their precision", { skip: !V42 }, () => {
  const { MM, kpi } = V42;
  assert.equal(kpi.plotted + kpi.not_plotted.length, MM.length);
  const a4 = MM.filter((s) => s.area === "AREA 4" && Number.isFinite(s.lat));
  assert.ok(a4.filter((s) => Number.isFinite(s.coord_decimals)).length / a4.length > 0.95);
});

test("TC-09/10 (FIX-09/10) median n = units used; long-outage columns reconcile with the KPI", { skip: !V42 }, () => {
  const { KF } = V42;
  assert.equal(KF.area.occupancy_n, KF.nops.reduce((a, r) => a + r.occupancy_n, 0));
  assert.equal(KF.nops.reduce((a, r) => a + r.need_p12, 0), KF.area.need_p12);
  assert.equal(KF.nops.reduce((a, r) => a + r.served_p12, 0), KF.area.served_p12);
});

test("TC-11 (FIX-11) every applied merge has a reviewer; unreviewed pairs are PENDING and badged", { skip: !V42 }, () => {
  const R = V42.D.meta.mbp.merge_review;
  assert.ok(R.every((r) => ["APPLIED", "PENDING", "REJECTED"].includes(r.review_state)));
  assert.ok(R.filter((r) => r.review_state === "APPLIED").every((r) => r.reviewed_by && r.reviewed_by.trim()));
  for (const r of R.filter((x) => x.review_state === "PENDING")) { const a = V42.BC.find((b) => b.mbp_id === r.keep); if (a) assert.equal(a.dup_state, "PENDING", r.keep); }
});

test("TC-12/13/14 (FIX-12/13/14) sources: raw, clean, parent and last record date; AREA 4 listed", { skip: !V42 }, () => {
  const S = V42.D.meta.dq.sources;
  assert.ok(S.some((r) => r.area === "AREA 4" && /Dapot/.test(r.source)));
  const pln = S.find((r) => /PLN/.test(r.source)); assert.ok(pln.derived_from && /BBT events/.test(pln.derived_from));
  assert.ok(S.find((r) => r.source === "RAN availability").raw > 0);
  for (const r of S.filter((x) => /Ticket|BBT events|RAN|PLN|monthly/.test(x.source) && x.area === "AREA 1")) assert.ok(r.data_max_date, r.source);
  assert.ok(cfg.freshness?.max_age_days > 0);
});

test("TC-15/16 (FIX-15/16) no placeholder IDs in the output; low match rate per NOP is visible", { skip: !V42 }, () => {
  const PH = /^\s*(|-+|X+\d*|N\/?A|NULL|NONE|0+|\?+|TBD|NAN|<NA>)\s*$/i;
  assert.ok(!V42.MM.some((s) => PH.test(String(s.site_id ?? ""))) && !V42.D.mbps.some((m) => PH.test(String(m.mbp_id ?? ""))));
  assert.ok(V42.D.meta.dq.field_coverage && V42.D.meta.dq.field_coverage.load_a < 0.5, "low-coverage fields reported");
  const rp = V42.KA.byNop.get("NOP RANTAU PRAPAT"); assert.ok(rp.ticket_match_pct < 0.9, `RANTAU PRAPAT match ${rp.ticket_match_pct}`);
});

test("TC-17 (FIX-17) the dashboard does not recount: its basecamp_final equals the engine JSON row by row", { skip: !V42 }, () => {
  const J = new Map(V42.json.rows.map((r) => [r.mbp_id, r]));
  assert.equal(J.size, V42.BC.length);
  for (const r of V42.BC) { const j = J.get(r.mbp_id); assert.ok(j, r.mbp_id); for (const k of ["status", "selectable", "nop", "area", "sites_assigned", "code", "dup_state"]) assert.deepEqual(r[k], j[k], `${r.mbp_id}.${k}`); }
  assert.deepEqual(V42.kpi.problems, []);
});

// ---------------------------------------------------------------- v5.0 — map + table workspace, dispatch, planning baseline
import { workspaceRows, selectionState, markerKey } from "../lib/workspace.js";
import { searchRows, sortRows, pageOfKey } from "../lib/table.js";
import { dispatchFor } from "../lib/dispatch.js";
import { reachOf as reachOfV5 } from "../lib/mbpperf.js";

test("WS-1/3/4 one record set: legend + base-camp focus filter map and table alike; selection never filters", () => {
  const rows = active.filter((s) => s.nop === "NOP JAMBI");
  const hid = workspaceRows(rows, { mode: "survival", hidden: ["arrive"] });
  assert.ok(hid.length < rows.length && hid.every((s) => MAP_KEYS.survival(s) !== "arrive"));
  const camp = rows.find((s) => s.mbp_assigned)?.mbp_assigned;
  const cs = workspaceRows(rows, { camp });
  assert.ok(cs.length > 0 && cs.every((s) => s.mbp_assigned === camp));
  assert.deepEqual(workspaceRows(rows, {}), rows, "no filter = same records (selection is not a filter)");
  const id = rows[0].site_id;
  assert.equal(selectionState(rows, rows, id).state, "shown");
  assert.equal(selectionState(rows, rows.slice(1), id).state, "hidden_by_map");
  assert.equal(selectionState(rows.slice(1), rows.slice(1), id).state, "excluded");
  assert.equal(selectionState(rows, rows, null).state, "none");
});

test("WS-2/5 table pipeline: the selected record's page is found after sorting; sorting never changes a marker's colour key", () => {
  const rows = active.filter((s) => s.nop === "NOP PALEMBANG");
  const cols = [{ key: "mbp_priority_score" }, { key: "site_id" }, { key: "eta_min" }];
  const before = new Map(rows.map((s) => [s.site_id, markerKey("survival", s)]));
  for (const sort of [{ key: "mbp_priority_score", dir: -1 }, { key: "eta_min", dir: 1 }, { key: "site_id", dir: -1 }]) {
    const S = sortRows(rows, sort, cols);
    assert.equal(S.length, rows.length);
    const target = S[S.length - 3].site_id, pg = pageOfKey(S, target, 50);
    assert.equal(S.slice(pg * 50, pg * 50 + 50).some((s) => s.site_id === target), true, "selected row is on the page the table opens");
    for (const s of S) assert.equal(markerKey("survival", s), before.get(s.site_id));
  }
  const sr = searchRows(rows, rows[5].site_id, [{ key: "site_id" }]);
  assert.ok(sr.length >= 1 && sr.some((s) => s.site_id === rows[5].site_id));
  assert.equal(pageOfKey(sr, "NOT-A-SITE", 50), null);
});

test("WS-6 dispatch: engine ranking, explicit outcome for every case, busy marks respected", () => {
  const s = active.find((x) => x.nop === "NOP JAMBI" && x.covered && x.can_arrive_before_bbt && x.bbt_status !== "Unknown" && x.access_class !== "island");
  const fam = new Map(famRows.map((r) => [r.site_id + "|" + r.mbp_id, r.served_n]));
  const r = dispatchFor(s, mbps, fam, cfg);
  assert.equal(r.outcome, "before"); assert.ok(r.pick && r.pick.eta_min <= s.bbt_effective_min);
  assert.equal(r.list[0].mbp_id, r.pick.mbp_id, "chosen camp ranks first");
  assert.equal(dispatchFor(s, mbps, fam, cfg, { outageMin: Math.max(0, s.bbt_effective_min - 5) }).outcome, "no_need");
  const allBusy = new Set(r.list.map((x) => x.mbp_id));
  assert.equal(dispatchFor(s, mbps, fam, cfg, { busy: allBusy }).outcome, "all_busy");
  const r2 = dispatchFor(s, mbps, fam, cfg, { busy: new Set([r.pick.mbp_id]) });
  assert.notEqual(r2.pick?.mbp_id, r.pick.mbp_id);
  const unk = active.find((x) => x.bbt_status === "Unknown" && Number.isFinite(x.lat) && x.access_class !== "island");
  assert.equal(dispatchFor(unk, mbps, fam, cfg).outcome === "unknown" || dispatchFor(unk, mbps, fam, cfg).outcome === "none_in_range", true);
  const isl = active.find((x) => x.access_class === "island");
  if (isl) assert.equal(dispatchFor(isl, mbps, fam, cfg).outcome, "unknown");
  assert.equal(dispatchFor(s, [], fam, cfg).outcome, "none_in_range");
});

test("WS-8 planning baseline = KPI layer: with no change the scenario reach equals the dashboard reach, per NOP", () => {
  for (const nop of ["NOP PALEMBANG", "NOP ACEH", "NOP BATAM"]) {
    const sn = M.filter((s) => s.nop === nop), act = sn.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected && Number.isFinite(s.lat));
    const r = reachOfV5(sn, mbps.filter((m) => Number.isFinite(m.lat)), cfg);
    assert.equal(r.ok, act.filter(reachOk).length, nop);
    assert.equal(r.p12ok, act.filter((s) => reachOk(s) && ["P1", "P2"].includes(s.mbp_priority_level)).length, nop);
  }
});

// ---------------------------------------------------------------- vNext
test("VN-1 KPI layer: reach before BBT is independent of the preferred radius (20 / 40 / 80 / 120 km)", async () => {
  const { computeKpis, kpiFor, reachSplit } = await import("../lib/kpi.js");
  const ev = (await import("../lib/mbpperf.js")).groupEvents(fromColumnar(JSON.parse(fs.readFileSync("public/data/pln_ev.json", "utf8"))));
  const tk = fromColumnar(JSON.parse(fs.readFileSync("public/data/tickets.json", "utf8")));
  const run = (r) => { const c = JSON.parse(JSON.stringify(cfg)); c.mbp.max_radius_km = r;
    const A = buildModelByArea(sites, mbps, c).filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
    return kpiFor(computeKpis(A, mbps, tk, [], c, { evBySite: ev }), "All NOPs"); };
  const base = run(cfg.mbp.max_radius_km);
  for (const r of [20, 40, 80]) { const k = run(r); assert.equal(k.p12_reach, base.p12_reach, `radius ${r}`); assert.equal(k.p12_eval, base.p12_eval); }
  const sp = reachSplit(base);
  assert.equal(sp.ok + sp.no + sp.unv, base.p12_eval, "hero bar segments add up to the denominator");
  assert.equal(reachSplit(null).total, 0);
});

test("VN-2 evidence safety: an ESTIMATED / unverified BBT never leads to a battery replacement by itself", () => {
  const A = M.filter((s) => s.site_active === 1);
  const bad = A.filter((s) => ["ESTIMATED", "DERIVED-UNVERIFIED", "UNAVAILABLE"].includes(s.battery?.source) && s.action_type === "REPLACE");
  assert.equal(bad.length, 0, bad.slice(0, 5).map((s) => s.site_id).join(","));
  // missing battery data is never turned into a number
  assert.ok(A.filter((s) => s.battery?.source === "UNAVAILABLE").every((s) => s.battery.display.value == null));
  // action batch is 1:1 with BBS priority (so the main view shows the priority, not "Batch n")
  for (const s of A) if (s.bbs_priority_level) assert.ok(String(s.action_batch).startsWith(`Batch ${s.bbs_priority_level.slice(1)}`), s.site_id);
});

test("VN-3 additional-unit sizing states why it stopped (target met / limit / no more benefit)", async () => {
  const { sizingStop } = await import("../lib/logic.js");
  const inN = M.filter((s) => s.nop === "NOP JAMBI");
  const p15 = placementPlan(inN, mbps, cfg, { target: 0.9, maxNew: 15 });
  assert.equal(sizingStop(p15, 15), p15.needed == null ? (p15.steps.length - 1 >= 15 ? "limit" : "flat") : "target");
  const p0 = placementPlan(inN, mbps, cfg, { target: 0.05, maxNew: 15 });
  assert.equal(sizingStop(p0, 15), "now");
  assert.equal(sizingStop({ targets: 0 }, 15), "none");
  assert.equal(sizingStop({ targets: 10, needed: null, steps: [0, 1, 2] }, 15), "flat");
  assert.equal(sizingStop({ targets: 10, needed: null, steps: new Array(16) }, 15), "limit");
});

test("VN-4 navigation + labels: BBS pages renamed in both languages, legacy links still resolve, scenario palette has one purple", async () => {
  const en = JSON.parse(fs.readFileSync("i18n/en.json", "utf8")), id = JSON.parse(fs.readFileSync("i18n/id.json", "utf8"));
  assert.equal(en["nav.bbs.risk"], "Battery Condition"); assert.equal(id["nav.bbs.risk"], "Kondisi Baterai");
  assert.equal(en["nav.bbs.actions"], "Field Actions"); assert.equal(id["nav.bbs.actions"], "Tindak Lanjut Lapangan");
  const page = fs.readFileSync("app/page.jsx", "utf8");
  for (const v of ["mbp.overview", "mbp.sitelist", "mbp.placement", "mbp.backtest", "mbp.simulation"]) assert.ok(page.includes(`"${v}"`), v);
  assert.ok(page.includes('["risk", "bbs.risk"]') && page.includes('["bbs", "bbs.actions"]'), "view keys unchanged (deep links)");
  const ui = fs.readFileSync("components/ui.jsx", "utf8"), scn = ui.match(/export const SCN = \{([^}]*)\}/)[1];
  const cols = [...scn.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase());
  assert.equal(new Set(cols).size, cols.length, "scenario colours are distinct");
  const perf = fs.readFileSync("components/perfUi.jsx", "utf8");
  assert.ok(!perf.includes("#6b4bd8"), "fleet 'busy' no longer purple (purple = proposed unit in planning)");
  // every new vNext key exists in both languages
  for (const k of Object.keys(en).filter((k) => /^(snap|cond|fa|plan\.q|plan\.base|place\.seq|place\.stop|sim\.sum)\./.test(k))) assert.ok(id[k], k);
});

// ---------------------------------------------------------------- vNext.2
test("VN-5 history lib: one on-time rule (equals mbpPerformance per camp), outcomes counted once, timeline + filters add up", async () => {
  const H = await import("../lib/history.js"), P = await import("../lib/mbpperf.js");
  const tk = fromColumnar(JSON.parse(fs.readFileSync("public/data/tickets.json", "utf8")));
  const camps = new Set(mbps.map((m) => m.mbp_id));
  const R = H.enrichTickets(tk, byId).filter((r) => camps.has(r.mbp));
  const perf = P.mbpPerformance(M, mbps, tk, cfg);
  const cap = new Map(H.capability(R).map((c) => [c.mbp_id, c]));
  for (const [id, p] of perf) { const c = cap.get(id); if (!p.jobs) { assert.ok(!c, id); continue; }
    assert.equal(c.jobs, p.jobs, id); assert.equal(c.ontime, p.ontime, id); assert.equal(c.late, p.late, id); }
  const T = H.historyTotals(R);
  assert.equal(H.OUTCOMES.reduce((a, o) => a + T[o], 0), T.jobs, "every job has exactly one outcome");
  assert.equal(H.JUDGE.reduce((a, j) => a + T[j], 0), T.jobs, "every job has exactly one judgement");
  assert.ok(H.OUTCOMES.every((o) => !H.JUDGE.includes(o)), "outcome and judgement keys never collide");
  assert.equal(H.timeline(R, "month").reduce((a, b) => a + b.n, 0), T.jobs);
  assert.equal(H.timeline(R, "week").reduce((a, b) => a + b.n, 0), T.jobs);
  assert.equal(H.timeline([], "month").length, 6, "empty months are present as 0, not missing");
  const f = H.filterTickets(R, { months: [3, 4], cats: ["P"], outcomes: ["power_on"] });
  assert.ok(f.every((r) => r.month >= 3 && r.month <= 4 && r.rc === "P" && r.outcome === "power_on"));
  // power-on is never inferred from visits: a job without check-in is "no_checkin", never power_on
  assert.equal(H.ticketOutcome({ out: "N", job: 5 }), "no_checkin");
  assert.equal(H.ticketOutcome({ out: "G", job: 0 }), "connected_no_rh");
  assert.equal(H.ticketOutcome({ out: "G", job: 2.5 }), "power_on");
  assert.equal(H.monthOf(0), 1); assert.equal(H.monthOf(31 * 1440), 2);
  for (const c of cap.values()) assert.ok(c.rh_heap == null || (c.rh_heap >= 0 && c.rh_heap <= 1), c.mbp_id);
});

test("VN-6 BBS: condition, evidence and action never contradict; every priority has its drivers", () => {
  const A = M.filter((s) => s.site_active === 1);
  const measured = (s) => !!s.battery?.measured;
  for (const s of A) {
    const at = s.action_type, st = s.bbt_status, id = s.site_id;
    if (at === "REPLACE") assert.ok(["Dead", "Critical"].includes(st) && (measured(s) || s.battery.source === "TICKET"), `${id} replace needs measured Dead/Critical`);
    if (at === "UPGRADE") assert.ok(measured(s), `${id} upgrade needs a measured BBT (was R10 on unknown / estimated)`);
    if (at === "SETTING") assert.ok(st === "Critical" && measured(s), id);
    if (at === "MONITOR") assert.equal(st, "Degraded", id);
    if (at === "DATA") assert.equal(st, "Unknown", id);
    if (st === "Unknown") assert.ok(["DATA", "NONE"].includes(at), `${id} unknown BBT → only collect data`);
    if (["Dead", "Critical", "Degraded"].includes(st)) assert.notEqual(at, "NONE", `${id} problem status must have an action`);
    if (s.bbs_priority_level) assert.ok(String(s.bbs_priority_drivers || "").length > 0, `${id} priority without drivers`);
  }
});

test("VN-7 outage scenario: unknown BBT is shown as not evaluable, never as a measured late / unserved result", async () => {
  const { simOutcomeView, simCounts, SIM_OUTCOMES } = await import("../lib/dispatch.js");
  const nop = "NOP PALEMBANG";
  const aff = active.filter((s) => s.nop === nop).sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)).slice(0, 60).map((s) => s.site_id);
  const unk = active.filter((s) => s.nop === nop && s.battery.source === "UNAVAILABLE").slice(0, 5).map((s) => s.site_id);
  const r = simulate(M, [...aff, ...unk], 6, mbps, { fam }, cfg, { departHour: 17 });
  const c = simCounts(r.rows);
  assert.equal(SIM_OUTCOMES.reduce((a, k) => a + c[k], 0), r.rows.length, "every simulated site has exactly one displayed outcome");
  for (const x of r.rows) if (String(x.bbt_evidence).startsWith("UNAVAILABLE") && x.mbp_needed) assert.equal(simOutcomeView(x), "not_evaluable", x.site_id);
  if (unk.length) assert.ok(c.not_evaluable > 0);
});

test("VN-8 click-through filters: hero reach segments and data-quality rows open exactly the counted sites", async () => {
  const { applySel } = await import("../lib/drill.js");
  const { computeKpis, kpiFor, reachSplit } = await import("../lib/kpi.js");
  const A = M.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  const sp = reachSplit(kpiFor(computeKpis(A, mbps, [], [], cfg), "All NOPs"));
  assert.equal(applySel(A, "reach_p12~ok").rows.length, sp.ok);
  assert.equal(applySel(A, "reach_p12~no").rows.length, sp.no);
  assert.equal(applySel(A, "reach_p12~unv").rows.length, sp.unv);
  assert.equal(applySel(A, "missing~load_a").rows.length, A.filter((s) => s.load_a == null).length);
  assert.equal(applySel(A, "unknown~pln").rows.length, A.filter((s) => !s.pln_known).length);
  assert.equal(applySel(A, "design_kind~site_load").rows.length, A.filter((s) => s.bbt_design_kind === "site_load").length);
  // map icons are cached (a new icon object per render made markers unclickable)
  const mv = fs.readFileSync("components/MapView.jsx", "utf8");
  assert.ok(mv.includes("const ICONS = new Map()") && /icon=\{\(zoom >= 8 \|\| draggableMbps \? TRUCK : CAMP_DOT\)/.test(mv));
});

/* ---------- Simplification brief 2026-10-14 (buckets 1–4): display groups are partitions of the unchanged engine states ---------- */
test("SB-1 Fleet: one operational status per base camp, mapped only from basecamp_final; Σ = all camps; movable ⇒ idle ∧ selectable", { skip: !V42 }, async () => {
  const { opStatus, opCounts, OP_KEYS } = await import("../lib/opstatus.js");
  const { BC, D } = V42, c = D.meta.config, C = opCounts(BC, c), by = basecampCounts(BC).by;
  assert.equal(OP_KEYS.reduce((a, k) => a + C[k], 0), BC.length);
  assert.equal(C.check, (by.low || 0) + (by.high || 0));
  assert.equal(C.ok, (by.watch || 0) + (by.good || 0));
  assert.equal(C.movable, BC.filter((b) => b.status === "under" && b.selectable !== false).length);
  assert.equal(C.clean, BC.filter((b) => b.selectable === false).length);
  for (const b of BC) { const o = opStatus(b, c); if (o.op === "movable") assert.ok(b.status === "under" && b.selectable !== false); }
  assert.equal(opStatus({ status: "low", busy: 0.5 }, c).also[0], "busy", "often late keeps busy as second reason");
});

test("SB-2 Coverage: Keburu / Tidak keburu / Belum bisa dinilai = KPI reach split; every not-reached P1/P2 has exactly one display reason", async () => {
  const { reachBreakdown, reachReasons, reachTab, etaGap, REASONS } = await import("../lib/coverage.js");
  const { computeKpis, kpiFor, reachSplit } = await import("../lib/kpi.js");
  const A = M.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
  const sp = reachSplit(kpiFor(computeKpis(A, mbps, [], [], cfg), "All NOPs")), R = reachBreakdown(A, cfg);
  assert.deepEqual([R.tab.ok, R.tab.no, R.tab.unv], [sp.ok, sp.no, sp.unv]);
  assert.equal(REASONS.reduce((a, k) => a + R.reason[k], 0), R.tab.no);
  for (const s of A.filter((x) => reachTab(x) === "no")) { const r = reachReasons(s, cfg); assert.ok(r.length >= 1 && r.every((k) => REASONS.includes(k))); if (s.access_class === "island") assert.equal(r[0], "island"); }
  for (const s of A.filter((x) => reachTab(x) === "unv")) assert.equal(etaGap(s), null, "no ETA − BBT gap is invented for an unverifiable BBT");
});

test("SB-3 Planning: outage boxes partition the simulated sites; the sandbox accepts every hand-over kind; old plan links resolve", () => {
  const top = active.filter((s) => s.nop === active[0].nop).sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)).slice(0, 30).map((s) => s.site_id);
  const r = simulate(M, top, 4, mbps, { fam }, cfg, {});
  return import("../lib/dispatch.js").then(({ simGroupCounts, simCounts, SIM_GROUPS }) => {
    const g = simGroupCounts(r.rows), c = simCounts(r.rows);
    assert.equal(SIM_GROUPS.reduce((a, k) => a + g[k], 0), r.rows.length);
    assert.equal(g.unserved, c.unserved_busy + c.unserved_no_coverage + c.unserved_island);
    const sm = fs.readFileSync("components/tabs/SimMap.jsx", "utf8"), pt = fs.readFileSync("components/tabs/PlanTab.jsx", "utf8"), pg = fs.readFileSync("app/page.jsx", "utf8");
    for (const k of ['k === "move"', 'k === "remove"', 'k === "add"']) assert.ok(sm.includes(k), k);
    assert.ok(pt.includes('const ALIAS = { scenario: "sandbox", backtest: "move" }') && pg.includes('"mbp.backtest": ["plan", "move"]') && pg.includes('"mbp.simmap": ["plan", "sandbox"]'));
    assert.ok(fs.readFileSync("components/tabs/Placement.jsx", "utf8").includes('kind: "add"') && fs.readFileSync("components/tabs/MoveCandidates.jsx", "utf8").includes('kind: "remove"'));
  });
});

test("SB-4 BBS: 4 condition groups and 4 evidence groups partition the sites; every detailed status / evidence maps to one group", async () => {
  const { groupCounts, STATUS_GROUP_OF, EV_GROUP_OF, STATUS_GROUPS, EV_GROUPS } = await import("../lib/bbsgroups.js");
  const { STATUS_ORDER } = await import("../lib/logic.js");
  const A = M.filter((s) => s.site_active === 1 && !s.offair), G = groupCounts(A);
  assert.equal(STATUS_GROUPS.reduce((a, k) => a + G.st[k], 0), A.length); assert.equal(EV_GROUPS.reduce((a, k) => a + G.ev[k], 0), A.length);
  for (const k of STATUS_ORDER) assert.ok(STATUS_GROUP_OF[k], k);
  const n = (f) => A.filter(f).length;
  assert.equal(G.st.act, n((s) => ["Dead", "Critical", "Degraded"].includes(s.bbt_status)));
  assert.equal(G.ev.measured, n((s) => ["ACTUAL", "DERIVED"].includes(s.battery?.display?.evidence)));
  for (const s of A) assert.ok(EV_GROUP_OF[s.battery?.display?.evidence || "UNAVAILABLE"], s.battery?.display?.evidence);
  // cross-page hand-offs exist (Coverage → Planning / BBS, Condition → Field Actions)
  const ex = fs.readFileSync("components/tabs/Explorer.jsx", "utf8"), br = fs.readFileSync("components/tabs/BatteryRisk.jsx", "utf8");
  assert.ok(ex.includes('view: "mbp.plan"') && ex.includes('"bbs.actions" : "bbs.risk"') && br.includes('view: "bbs.actions"'));
});
