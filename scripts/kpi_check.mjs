// v4.0 — build-time KPI layer + reconciliation. Usage: node scripts/kpi_check.mjs [dataDir=public/data]
// Writes <dataDir>/kpi.json and exits 1 when Σ NOP ≠ AREA, a share is outside 0–100 %, or served > need.
import fs from "node:fs";
import path from "node:path";
import { buildModel } from "../lib/logic.js";
import { fromColumnar } from "../lib/data.js";
import { computeKpis, reconcile } from "../lib/kpi.js";

const dir = process.argv[2] || "public/data";
const rd = (f, dflt) => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : dflt; };
const meta = rd("meta.json"), mbps = rd("mbps.json", []);
const S = buildModel(fromColumnar(rd("sites.json")), mbps, meta.config);
const TK = fromColumnar(rd("tickets.json", { cols: [], rows: [] })), EV = fromColumnar(rd("pln_ev.json", { cols: [], rows: [] }));
const act = S.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
const K = computeKpis(act, mbps, TK, EV, meta.config, { unmatchedByNop: meta.dq?.ticket_gaps || null });
const bad = reconcile(K);
const r = (x) => (x == null ? null : +x.toFixed(4));
const slim = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === "number" ? r(v) : v]));
fs.writeFileSync(path.join(dir, "kpi.json"), JSON.stringify({ built_at: meta.built_at, area: slim(K.area), nops: K.nops.map(slim), problems: bad }));
const A = K.area, p = (x) => (x == null ? "—" : (100 * x).toFixed(1) + "%");
console.log(`[kpi] ${dir}: sites ${A.sites} · P1/P2 ${A.p12} reach ${p(A.p12_reach_pct)} · need ${A.need} served ${p(A.served_pct)} on-time ${p(A.ontime_pct)} (P1/P2 ${p(A.p12_ontime_pct)}) · ` +
  `occupancy ${p(A.occupancy)} median ${p(A.occupancy_median)} · BBS-P1 ${A.bbs_p1} · setting ${A.setting} · calib ok ${A.calib_ok_nops}/${A.calib_nops}`);
if (bad.length) { console.error("[kpi] RECONCILIATION FAILED:\n  " + bad.join("\n  ")); process.exit(1); }
console.log("[kpi] reconciliation OK (Σ NOP = AREA, all shares within 0–100 %)");
