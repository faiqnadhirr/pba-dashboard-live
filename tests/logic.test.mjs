// Parity test: the browser logic (lib/logic.js) must reproduce the Python engine's build-time results
// for the default configuration. Run: npm test  (needs public/data from engine/build.py)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyScoring, travelMinutes, dependencyChildren, pctRank, simulate, statusOf } from "../lib/logic.js";
import { fromColumnar } from "../lib/data.js";

const meta = JSON.parse(fs.readFileSync("public/data/meta.json", "utf8"));
const sites = fromColumnar(JSON.parse(fs.readFileSync("public/data/sites.json", "utf8")));
const cfg = meta.config;

test("pctRank = pandas average rank", () => {
  assert.deepEqual(pctRank([10, 20, 20, 30]), [0.25, 0.625, 0.625, 1]);
});
test("dependency proxy parsing", () => {
  assert.equal(dependencyChildren("Simpul Sedang..(< 6 Sites Anakan )", cfg.dependency_children), 5);
  assert.equal(dependencyChildren("Simpul Besar…(> 7 Sites + METRO-E)", cfg.dependency_children), 8);
  assert.equal(dependencyChildren("End Site", cfg.dependency_children), 0);
});
test("travel time: island has no ETA, peak is slower", () => {
  assert.equal(travelMinutes(10, 0, 1, cfg), null);
  assert.ok(travelMinutes(10, 1, 0, cfg, 17) > travelMinutes(10, 1, 0, cfg, 11));
});
test("status thresholds", () => {
  assert.deepEqual([null, 3, 20, 45, 90].map((v) => statusOf(v, cfg.bbt)), ["Unknown", "Dead", "Critical", "Degraded", "OK"]);
});
test("JS scoring reproduces Python build (default config)", () => {
  const S = applyScoring(sites, cfg);
  let dScore = 0, lvl = 0, st = 0, bl = 0, act = 0, rr = 0;
  S.forEach((s, i) => {
    const p = sites[i];
    dScore = Math.max(dScore, Math.abs(s.mbp_priority_score - p.mbp_priority_score));
    if (s.mbp_priority_level !== p.mbp_priority_level) lvl++;
    if (s.bbt_status !== p.bbt_status) st++;
    if ((s.bbs_priority_level || null) !== (p.bbs_priority_level || null)) bl++;
    if (s.recommended_action !== p.recommended_action) act++;
    if (s.reach_risk !== p.reach_risk) rr++;
  });
  console.log({ n: S.length, maxScoreDiff: dScore, mbpLevelDiff: lvl, statusDiff: st, bbsLevelDiff: bl, actionDiff: act, reachDiff: rr });
  assert.ok(dScore < 1e-3); assert.equal(lvl, 0); assert.equal(st, 0); assert.equal(bl, 0); assert.equal(act, 0); assert.equal(rr, 0);
});
test("simulation: greedy allocation, busy MBP -> unserved", () => {
  const S = applyScoring(sites, cfg);
  const mbps = JSON.parse(fs.readFileSync("public/data/mbps.json", "utf8"));
  const ids = S.filter((s) => s.nop === "NOP PALEMBANG" && s.is_island === 0).sort((a, b) => b.pln_freq - a.pln_freq).slice(0, 10).map((s) => s.site_id);
  const r = simulate(S, ids, 6, mbps, { fam: new Map() }, cfg, { departHour: 17 });
  assert.equal(r.rows.length, 10);
  const used = r.rows.map((x) => x.mbp).filter(Boolean);
  assert.equal(new Set(used).size, used.length, "one MBP per site");
  const allBusy = new Set(mbps.map((m) => m.mbp_id));
  const r2 = simulate(S, ids.slice(0, 2), 24, mbps, { fam: new Map() }, cfg, { busy: allBusy });
  assert.ok(r2.rows.every((x) => !x.mbp_needed || x.outcome.startsWith("unserved")));
});
