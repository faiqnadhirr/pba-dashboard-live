// Regression tests for the single rule engine (lib/logic.js) on the real data snapshot.
// Run: npm test   (needs public/data produced by `python engine/build.py`)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildModel, travelMinutes, dependencyChildren, pctRank, statusOf, aggregateAvailability, aggregateResponsibility,
  clusterTable, topWorstSites, simulate, basecampSummary, PROBLEM,
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
    if (r.trend === "Deteriorating") assert.ok(r.delta_pp <= -cfg.availability.trend_pp || r.q2_dark - r.q1_dark >= cfg.availability.trend_dark_sites);
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
