// vNext.2 — reconciliation report: every headline denominator and metric definition, computed with the SAME functions the
// dashboard runs (lib/logic.js, lib/kpi.js, lib/basecamp.js, lib/mbpperf.js, lib/history.js). Nothing is hardcoded.
// Usage: node scripts/reconcile.mjs [dataDir=public/data] [out=docs/RECONCILIATION_generated.md]
import fs from "node:fs";
import path from "node:path";
import { buildModelByArea, isNum, REACH_EVIDENCE, reachOk } from "../lib/logic.js";
import { fromColumnar, mergeAreas } from "../lib/data.js";
import { computeKpis, kpiFor, reachSplit } from "../lib/kpi.js";
import { mbpPerformance, groupEvents } from "../lib/mbpperf.js";
import { basecampFinal, basecampCounts, areaCoverage } from "../lib/basecamp.js";
import { enrichTickets, historyTotals, capability } from "../lib/history.js";

const dir = process.argv[2] || "public/data", outF = process.argv[3] || "docs/RECONCILIATION_generated.md";
const rd = (d, f, x) => { const p = path.join(d, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : x; };
const E = { cols: [], rows: [] };
const load = (d) => ({ meta: rd(d, "meta.json"), sites: fromColumnar(rd(d, "sites.json")), mbps: rd(d, "mbps.json", []), fam: fromColumnar(rd(d, "familiarity.json", E)),
  tickets: fromColumnar(rd(d, "tickets.json", E)), events: fromColumnar(rd(d, "pln_ev.json", E)) });
const A1 = load(dir), parts = [{ a: "AREA 1", d: A1 }];
if (fs.existsSync(path.join(dir, "a4", "meta.json"))) parts.push({ a: "AREA 4", d: load(path.join(dir, "a4")) });
const D = mergeAreas(parts), cfg = D.meta.config, cov = areaCoverage(D.meta.areas);
const full = Object.entries(cov).filter(([, v]) => v === "FULL").map(([a]) => a);
const M = buildModelByArea(D.sites, D.mbps, cfg);
const act = M.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected);
const ev = groupEvents(D.events), perf = mbpPerformance(M, D.mbps, D.tickets, cfg, ev);
const BC = basecampFinal(M, D.mbps, perf, cfg, { areas: D.meta.areas, mergeReview: D.meta.mbp?.merge_review || [] });
const KF = computeKpis(act.filter((s) => full.includes(s.area)), D.mbps.filter((m) => full.includes(m.area)), D.tickets, D.events, cfg, { evBySite: ev, perf, unmatchedByNop: D.meta.dq?.ticket_gaps, coverage: cov });
const k = kpiFor(KF, "All NOPs");
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : "N/A");
const f = (v) => (v == null ? "N/A" : typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v));
const L = [];
const T = (title, head, rows) => { L.push(`\n### ${title}\n`, `| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(f).join(" | ")} |`)); };

// 1 · sites
const byArea = (L0, a) => L0.filter((s) => s.area === a).length;
const ids = D.sites.map((s) => s.site_id);
const A1s = M.filter((s) => s.area === "AREA 1"), A1a = A1s.filter((s) => s.site_active === 1);
T("1 · Sites — scope chain", ["Step", "AREA 1", "AREA 4", "Rule"], [
  ["sites in the published model", byArea(M, "AREA 1"), byArea(M, "AREA 4"), "sites.json per area (engine output)"],
  ["unique site IDs (merged)", new Set(ids).size === ids.length ? "unique" : `${ids.length - new Set(ids).size} duplicates`, "", "mergeAreas de-duplicates; build guardrail"],
  ["active (site_active = 1)", A1a.length, byArea(M.filter((s) => s.site_active === 1), "AREA 4"), "Dapot `Site : Active`"],
  ["− suspected off-air", A1a.filter((s) => s.offair).length, "", "excluded unless 'Also show › off-air'"],
  ["− fixed genset on site", A1a.filter((s) => !s.offair && s.genset_protected).length, "", "excluded unless 'Also show › genset'"],
  ["= KPI scope (default)", byArea(act, "AREA 1"), byArea(act, "AREA 4"), "AREA 4 excluded from KPIs by default (PARTIAL)"],
  ["KPI sites (FULL areas)", k.sites, "—", "kpiFor(K).sites"],
  ["MBP-P1/P2 sites", k.p12, "—", "mbp_priority_level ∈ {P1,P2}"],
  ["evaluable P1/P2 (p12_eval)", k.p12_eval, "N/A", "P1/P2 in a FULL area"],
  ["… of which BBT not verified", k.p12_unverified, "", `evidence ∉ ${[...REACH_EVIDENCE].join("/")}`],
  ["without coordinates", A1s.filter((s) => !isNum(s.lat)).length, M.filter((s) => s.area === "AREA 4" && !isNum(s.lat)).length, "not drawn; listed in Data quality"],
]);

// 2 · base camps
const C1 = basecampCounts(BC.filter((b) => b.area === "AREA 1")), C4 = basecampCounts(BC.filter((b) => b.area === "AREA 4"));
const mr = D.meta.mbp?.merge_review || [], st = (s) => mr.filter((r) => (r.review_state || r.state) === s).length;
T("2 · MBP base camps — identity chain", ["Step", "AREA 1", "AREA 4", "Rule"], [
  ["base camps published", C1.total, C4.total, "mbps.json (BPS master / HW Master FME)"],
  ["unique mbp_id", new Set(D.mbps.map((m) => m.mbp_id)).size === D.mbps.length ? "unique" : "DUPLICATES", "", "build guardrail"],
  ["without location", C1.by.noloc || 0, C4.by.noloc || 0, "status noloc (not on map, not in lists)"],
  ["merge review APPLIED / PENDING / REJECTED", `${st("APPLIED")} / ${st("PENDING")} / ${st("REJECTED")}`, "", "apply = yes AND reviewed_by (FIX-11); PENDING camps stay separate units"],
  ["camps flagged 'possible duplicate'", BC.filter((b) => b.dup_state === "PENDING").length, "", "badge until reviewed"],
  ["Σ status = total", Object.values(C1.by).reduce((a, v) => a + v, 0), Object.values(C4.by).reduce((a, v) => a + v, 0), "one status per camp"],
]);

// 3 · tickets
const byId = new Map(M.map((s) => [s.site_id, s])), camp = new Set(D.mbps.map((m) => m.mbp_id));
const R = enrichTickets(D.tickets, byId), H = historyTotals(R.filter((r) => camp.has(r.mbp)));
const unknownPic = R.filter((r) => !camp.has(r.mbp)).length;
T("3 · MBP job tickets — matching chain (Jan–Jun 2026, ACTUAL)", ["Step", "Count", "Rule"], [
  ["exported tickets", D.tickets.length, "not CANCELED, PIC + occurred time present, exact duplicate rows dropped (engine)"],
  ["− PIC not a known base camp", unknownPic, "e.g. SCD-PALUTA / SCD-PALAS; shown per NOP as ticket match %"],
  ["= jobs of known base camps", H.jobs, "KPI layer jobs = " + k.jobs],
  ["… site not in the model", H.unmatched_site, "site ID not in the site master (cannot be judged)"],
  ["… PLN-off jobs judged on time / late", `${H.ontime} / ${H.late}`, "check-in − PLN-off ≤ site BBT (judgeTicket)"],
  ["… PLN-off, BBT unknown (not judged)", H.bbt_unknown, ""],
  ["… PLN-off, no check-in time (not judged)", H.no_arrival, ""],
  ["… battery / rental / other jobs (not judged)", H.not_pln, "workload only"],
  ["historical on time", pct(H.ontime, H.judged), "KPI layer: " + (k.jobs_ontime_pct == null ? "N/A" : (100 * k.jobs_ontime_pct).toFixed(1) + " %")],
]);
T("4 · Power-on outcome (REPORTED: resolution drop-down + running-hour meter)", ["Outcome", "Jobs", "Share of jobs with check-in"], [
  ...["power_on", "connected_no_rh", "pln_back", "other_action"].map((o) => [o, H[o], pct(H[o], H.outcome_known)]),
  ["no_checkin (outcome missing)", H.no_checkin, "excluded from the denominator"],
]);

// 5 · metric definitions
const calUtil = [...perf.values()].filter((p) => p.jobs && D.mbps.find((m) => m.mbp_id === p.mbp_id)?.area === "AREA 1").map((p) => p.busy).sort((a, b) => a - b);
const P12 = act.filter((s) => full.includes(s.area) && (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2"));
const RT = cfg.mbp.response_target_min ?? 30, Rp = cfg.mbp.max_radius_km;
const located = act.filter((s) => full.includes(s.area) && isNum(s.lat));
const sp = reachSplit(k);
T("5 · Metric definitions (FULL areas)", ["Metric", "Formula", "Value", "Denominator"], [
  ["Historical on-time arrival", "PLN-off jobs: check-in − occurrence ≤ site BBT", pct(H.ontime, H.judged), `${H.judged} judged jobs`],
  ["Power-on (reported)", "resolution 'connect genset' AND running hours > 0", pct(H.power_on, H.outcome_known), `${H.outcome_known} jobs with check-in`],
  ["Running hours", "take-over → RH stop (0–48 h) else RH meter", `${f(R.filter((r) => camp.has(r.mbp)).reduce((a, r) => a + (isNum(r.job) ? r.job : 0), 0))} h`, `${R.filter((r) => camp.has(r.mbp) && !isNum(r.job)).length} jobs without hours (3 h default in working time)`],
  ["Calendar utilisation (working time)", "job hours ÷ 4,344 h (181 days)", calUtil.length ? `median ${(100 * calUtil[calUtil.length >> 1]).toFixed(1)} %` : "N/A", `${calUtil.length} AREA 1 camps with jobs`],
  ["Utilisation in shift / available hours", "needs shift rosters", "N/A", "no shift data in the sources"],
  [`Geographic radius coverage (${Rp} km)`, "nearest base camp ≤ preferred radius", pct(located.filter((s) => s.within_radius).length, located.length), `${located.length} located KPI sites`],
  [`ETA target attainment (≤ ${RT} min)`, "P1/P2 with indicative ETA ≤ target", pct(P12.filter((s) => isNum(s.eta_min) && s.eta_min <= RT).length, P12.length), `${P12.length} P1/P2`],
  ["Reach before BBT exhaustion", "covered (≤ search cap) AND ETA ≤ BBT AND evidence ∈ ACTUAL/ESTIMATED/DERIVED", `${sp.ok} / ${sp.total} (${pct(sp.ok, sp.total)})`, `${sp.unv} not verified kept in denominator`],
  ["Mains-fail events (proxy for PLN outage)", "merged mains-fail alarm intervals per site (BBT alarm file)", D.events.length, "no confirmed PLN outage feed in the sources"],
]);

// 6 · BBT design
const ev1 = {}; for (const s of act.filter((x) => x.area === "AREA 1")) { const key = `${s.bbt_design_kind} (${s.bbt_design_evidence})`; ev1[key] = (ev1[key] || 0) + 1; }
T("6 · BBT design bases (AREA 1 KPI scope)", ["Basis", "Value", "Used for"], [
  ["management standard", `${cfg.bbt.design_minutes} min (all classes)`, "status thresholds 50 / 25 % / dead ≤ " + cfg.bbt.dead_max_minutes + " min"],
  ...Object.entries(ev1).map(([e, n]) => [`per-site computed design — ${e}`, `${n} sites`, "display only (banks × Ah × DoD ÷ load × " + (cfg.bbt.design_from_battery?.calibration_scale ?? 1) + "); never used for reach or status"]),
]);

// 7 · per-NOP sums
const sum = (key) => KF.nops.reduce((a, r) => a + (r[key] || 0), 0);
T("7 · Per-NOP totals = area totals", ["Field", "Σ NOP", "Area", "OK"], ["sites", "p12_eval", "p12_reach", "jobs", "jobs_judged", "mbp"].map((x) => [x, sum(x), KF.area[x], sum(x) === KF.area[x] ? "✔" : "✖"]));

const cap = capability(R.filter((r) => camp.has(r.mbp)));
L.unshift(`# PBA — reconciliation (generated ${new Date().toISOString().slice(0, 16)} UTC from ${dir}, built ${D.meta.built_at})`,
  "", "Generated by `node scripts/reconcile.mjs` with the dashboard's own functions. Do not edit by hand.",
  `\nBase camps with a capability profile (≥ 1 job): ${cap.length}; with an on-time rate (≥ 10 judged): ${cap.filter((c) => c.ontime_rate != null).length}; with a power-on rate (≥ 10 jobs with check-in): ${cap.filter((c) => c.power_on_rate != null).length}.`);
fs.writeFileSync(outF, L.join("\n") + "\n");
console.log(L.join("\n"));
