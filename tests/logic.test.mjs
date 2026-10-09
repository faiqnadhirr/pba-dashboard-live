// Regression tests for the single rule engine (lib/logic.js) on the real data snapshot.
// Run: npm test   (needs public/data produced by `python engine/build.py`)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildModel, travelMinutes, dependencyChildren, pctRank, statusOf, aggregateAvailability, aggregateResponsibility,
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
test("B · PMR107 — assigned MBP within radius; no assignment beyond radius anywhere", () => {
  const s = byId.get("PMR107");
  assert.ok(s.km_assigned <= cfg.mbp.max_radius_km);
  assert.equal(M.filter((x) => x.mbp_assigned && x.km_assigned > cfg.mbp.max_radius_km + 1e-9).length, 0);
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
test("G · smaller radius → fewer covered sites, never assignment beyond the new radius", () => {
  const c2 = { ...cfg, mbp: { ...cfg.mbp, max_radius_km: 40 } };
  const M2 = buildModel(sites, mbps, c2);
  const cov = (L) => L.filter((s) => s.covered).length;
  assert.ok(cov(M2) < cov(M));
  assert.equal(M2.filter((x) => x.mbp_assigned && x.km_assigned > 40 + 1e-9).length, 0);
  const b1 = basecampSummary(M, mbps, cfg).reduce((a, r) => a + r.sites_covered, 0), b2 = basecampSummary(M2, mbps, c2).reduce((a, r) => a + r.sites_covered, 0);
  assert.ok(b2 < b1);
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
    if (x.mbp) assert.ok(x.km <= cfg.mbp.max_radius_km);
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
    if (s.battery_banks > 0) assert.notEqual(s.bbt_design_evidence, "PROXY", s.site_id);
    else assert.equal(s.bbt_design_evidence, "PROXY", s.site_id);
    if (s.battery_banks > 0 && s.load_a > 0) assert.equal(s.bbt_design_evidence, "DERIVED", s.site_id);
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

test("1 · navigation: 4 groups in order Overview · MBP · BBS · Data & Config, landing = MBP overview (v3.7, Overview hidden unless ?full=1), view in URL", () => {
  const src = fs.readFileSync("app/page.jsx", "utf8");
  const order = [...src.matchAll(/^\s+\["(overview|mbp|bbs|data)", \[/gm)].map((m) => m[1]);
  assert.deepEqual(order, ["overview", "mbp", "bbs", "data"]);
  assert.ok(src.includes('DEFAULT_TAB = "mgmt"') && src.includes('HIDDEN_GROUP = "overview"') && src.includes('q.set("full"') && src.includes('q.set("view"') && src.includes("popstate"));
  assert.ok(/\["mbp", \[\["mgmt", "mbp.overview"\]/.test(src), "MBP opens on the management overview");
  assert.ok(/\["bbs", \[\["bbs", "bbs.actions"\]/.test(src), "BBS opens on the action list");
});

/* ================= fourth pass ================= */
import { coverageGap, showCoverageGap } from "../lib/view.js";
test("1a · 'No action' with an MBP coverage gap is labelled as a coverage gap (TBH048)", () => {
  const s = byId.get("TBH048");
  assert.equal(s.recommended_action, "No action");          // engine unchanged
  assert.ok(coverageGap(s) && showCoverageGap(s));
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

test("v3.6 BBT gap = actual ÷ design only for measured batteries with a computed design", () => {
  const W = M.filter((s) => s.bbt_gap_ratio != null);
  assert.ok(W.length > 1000);
  for (const s of W.slice(0, 2000)) {
    assert.ok(s.battery.measured && s.bbt_design_evidence !== "PROXY");
    assert.ok(Math.abs(s.bbt_gap_ratio - s.battery.display.value / s.bbt_design_min) < 1e-9);
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
import { mbpPerformance, replay, backtestMove, dispatchOrder, dispatchAudit, PERF_KEYS, nopMbpSummary } from "../lib/mbpperf.js";
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

test("v3.7 backtest: replay accounts for every job; moving a camp onto its own spot changes nothing", () => {
  const nop = "NOP BENGKULU", S = M.filter((s) => s.nop === nop && s.site_active === 1 && !s.offair), mb = mbps.filter((m) => m.nop === nop && Number.isFinite(m.lat));
  const ids = new Set(S.map((s) => s.site_id)), T = TK.filter((k) => ids.has(k.site));
  const r = replay(new Map(S.map((s) => [s.site_id, s])), mb, T, cfg);
  const t = r.total;
  assert.equal(t.served + t.beyond + t.busy + t.island + t.noLoc, t.tickets);
  const same = replay(new Map(S.map((s) => [s.site_id, s])), mb.map((m) => ({ ...m })), T, cfg);
  assert.equal(same.total.ontime, t.ontime);
  const bt = backtestMove(S, mb, T, cfg, mb[0].mbp_id, { candidates: 4 });
  for (let i = 1; i < bt.results.length; i++) assert.ok(bt.results[i - 1].ontime_gain >= bt.results[i].ontime_gain);
  assert.ok(bt.results.every((x) => x.kecamatan && S.some((s) => s.site_id === x.site_id)));
  const sc = backtestMove(S, mb, T, cfg, mb[0].mbp_id, { candidates: 4, sameCluster: true });
  assert.ok(sc.results.every((x) => S.find((s) => s.site_id === x.site_id).cluster_to === sc.homeCluster));
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
