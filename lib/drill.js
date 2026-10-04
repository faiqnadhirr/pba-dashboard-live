// 2a — generic "Total → breakdown" drilldowns. Pure functions (no React) so the Site list can apply the same filter from the URL
// (?sel=<drill>[~<segment>]) and the tests can check that the panel total equals the number of sites the list shows.
// Display only: nothing here changes the engine or any score.
import { MAP_KEYS, MAP_MODES } from "./mapmodes.js";

export const COL = { blue: "#2a78d6", light: "#7fb2ea", slate: "#55627A", orange: "#eb6834", grey: "#C9CFD9", green: "#0ca30c", red: "#d03b3b", salmon: "#ec835a", dred: "#7a1414", lgrey: "#A3ABB9" };
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/* Evidence-per-field classifiers (also used by Data quality › Evidence per field) */
export const EVCOLS = [["dependency_children", "dependency", (s) => (s.dependency_children != null ? "PROXY" : "UNAVAILABLE")],
  ["bbt_value_min", "bbt", (s) => s.bbt_value_evidence || "UNAVAILABLE"],
  ["eta_min", "eta", (s) => (s.dist_eta_min != null ? "ESTIMATED" : "UNAVAILABLE")],
  ["pln_freq", "pln", (s) => (s.pln_known ? "DERIVED" : "UNAVAILABLE")],
  ["dist_km", "distance", (s) => (s.dist_km != null ? "DERIVED" : "UNAVAILABLE")],
  ["mbp_deployments", "hist", (s) => (s.mbp_hist_known ? "DERIVED" : "UNAVAILABLE")],
  ["avail_wc_pct", "avail", (s) => (s.avail_wc_pct != null ? "DERIVED" : "UNAVAILABLE")]];
const EV_COLOR = { ACTUAL: COL.blue, DERIVED: COL.light, ESTIMATED: COL.orange, PROXY: "#8e7cc3", TICKET: COL.slate, "DERIVED-UNVERIFIED": "#f3c3a5", UNAVAILABLE: COL.grey };

/* battery evidence of one site → 5 segments */
const bbtEv = (s) => { const b = s.battery || {}; return b.source === "ACTUAL" ? "actual" : b.measured ? "derived" : b.source === "TICKET" ? "ticket" : b.source === "ESTIMATED" || b.unverified ? "est" : "none"; };
const BBT_SEGS = [["actual", COL.blue], ["derived", COL.light], ["ticket", COL.slate], ["est", COL.orange], ["none", COL.grey]];
export const CAUSES = ["power", "transport", "ran", "other", "unknown"];
export const causeHours = (s, c) => {
  if (!isNum(s.ran_outage_h)) return 0;
  if (c !== "unknown") return Math.max(0, s[`ran_${c}_down_h`] || 0);
  return Math.max(0, s.ran_outage_h - ["power", "transport", "ran", "other"].reduce((a, k) => a + (s[`ran_${k}_down_h`] || 0), 0));
};
const covSeg = (s) => (!s.covered ? "beyond" : s.bbt_status === "Unknown" ? "bbt_unknown" : s.can_arrive_before_bbt ? "arrive" : s.reach_risk ? "late_dark" : "late_other");

/* map colour modes: one category key per site, shared with the map, the roll-up and the Site list (lib/mapmodes.js) */
export { MAP_KEYS };

/**
 * Each drill: universe(sites) → sites considered; parts(s) → {segment: weight}; segs [[key, colour]]; none = "no data" segment
 * (per-NOP bars are sorted by its share); total(s) → counted in the KPI; unit "sites" | "hours"; groups = named segment sets.
 * Labels: t(`drill.<id>.title|formula`) and t(`drill.seg.<seg>`).
 */
export const DRILLS = {
  bbt_measured: { segs: BBT_SEGS, none: "none", parts: (s) => ({ [bbtEv(s)]: 1 }), total: (s) => !!s.battery?.measured, groups: { total: ["actual", "derived"] } },
  below_target: {
    segs: [["below_power", COL.red], ["below_other", COL.salmon], ["meets", COL.green], ["none", COL.grey]], none: "none",
    parts: (s) => ({ [!isNum(s.avail_delta_pp) ? "none" : s.avail_delta_pp >= 0 ? "meets" : (s.ran_power_down_h || 0) > 0 ? "below_power" : "below_other"]: 1 }),
    total: (s) => isNum(s.avail_delta_pp) && s.avail_delta_pp < 0, groups: { total: ["below_power", "below_other"] },
  },
  downtime: {
    unit: "hours", segs: CAUSES.map((c, i) => [c, ["#d03b3b", "#2a78d6", "#8e7cc3", "#A3ABB9", "#C9CFD9"][i]]), none: "unknown",
    parts: (s) => Object.fromEntries(CAUSES.map((c) => [c, causeHours(s, c)])), total: (s) => (s.ran_outage_h || 0) > 0, groups: { total: CAUSES },
  },
  power_down: {
    unit: "hours", segs: [["OBSERVED", COL.blue], ["INFERRED", COL.orange], ["UNKNOWN", COL.grey]], none: "UNKNOWN",
    parts: (s) => ((s.ran_power_down_h || 0) > 0 ? { [s.resp?.kind === "OBSERVED" || s.resp?.kind === "INFERRED" ? s.resp.kind : "UNKNOWN"]: s.ran_power_down_h } : {}),
    total: (s) => (s.ran_power_down_h || 0) > 0, groups: { total: ["OBSERVED", "INFERRED", "UNKNOWN"] },
  },
  cov: {
    segs: [["arrive", COL.green], ["late_dark", COL.red], ["late_other", COL.salmon], ["bbt_unknown", COL.lgrey], ["beyond", COL.dred]], none: "bbt_unknown",
    parts: (s) => ({ [covSeg(s)]: 1 }), total: (s) => !!s.covered, groups: { total: ["arrive", "late_dark", "late_other", "bbt_unknown"], within: ["arrive", "late_dark", "late_other", "bbt_unknown"] },
  },
  ...Object.fromEntries(["P1", "P2", "P3", "P4"].map((p) => [`bbs_${p}`, {
    segs: BBT_SEGS, none: "none", universe: (S) => S.filter((s) => s.bbs_priority_level === p), parts: (s) => ({ [bbtEv(s)]: 1 }), total: () => true, groups: { total: BBT_SEGS.map((x) => x[0]) },
  }])),
  ...Object.fromEntries(EVCOLS.map(([, k, f]) => [`field_${k}`, {
    segs: ["ACTUAL", "DERIVED", "ESTIMATED", "PROXY", "TICKET", "DERIVED-UNVERIFIED", "UNAVAILABLE"].map((e) => [e, EV_COLOR[e]]), none: "UNAVAILABLE", evtags: true,
    parts: (s) => ({ [f(s)]: 1 }), total: (s) => f(s) !== "UNAVAILABLE", groups: { total: ["ACTUAL", "DERIVED", "ESTIMATED", "PROXY", "TICKET", "DERIVED-UNVERIFIED"] },
  }])),
  // filter-only entries (2b: chart clicks) — no panel, just a Site list filter + sort
  cause: { filterOnly: true, segs: CAUSES.map((c) => [c]), parts: (s) => Object.fromEntries(CAUSES.map((c) => [c, causeHours(s, c)])) },
  // v3.4 map legend toggles → Site list (?sel=map_<mode>~<visible keys>)
  ...Object.fromEntries(Object.keys(MAP_MODES).filter((m) => m !== "trend").map((m) => [`map_${m}`, { filterOnly: true, noSort: true, segs: [], parts: (s) => ({ [MAP_KEYS[m](s)]: 1 }) }])),
  resp: { filterOnly: true, segs: [], parts: (s) => (s.resp?.powerDownH > 0 ? Object.fromEntries(Object.entries(s.resp.shares || {}).map(([k, v]) => [k, v * s.resp.powerDownH])) : {}) },
};

export function parseSel(sel) {
  if (!sel) return null;
  const [id, seg] = String(sel).split("~");
  const d = DRILLS[id];
  return d ? { id, seg: seg || "total", d } : null;
}
const segList = (d, seg) => d.groups?.[seg] || seg.split("+");

/** Site list filter for ?sel=… → {rows, sortBy(s) | null}. Unknown sel → rows unchanged. */
export function applySel(sites, sel) {
  const p = parseSel(sel);
  if (!p) return { rows: sites, weight: null, known: false };
  const { d, seg } = p, keys = segList(d, seg);
  const U = d.universe ? d.universe(sites) : sites;
  const weight = (s) => { const pr = d.parts(s); return keys.reduce((a, k) => a + (pr[k] || 0), 0); };
  const rows = U.filter((s) => weight(s) > 0);
  return { rows, weight: d.unit === "hours" || (d.filterOnly && !d.noSort) ? weight : null, known: true };
}

/** Panel model: totals per segment (≤ 5 shown: the smallest extra segments are merged into "other"), per-NOP rows. */
export function drillModel(id, sites, groupKey = "nop") {
  const d = DRILLS[id];
  const U = d.universe ? d.universe(sites) : sites;
  const tot = {}, cnt = {}, byG = new Map();
  for (const s of U) {
    const pr = d.parts(s), g = s[groupKey] || "—";
    const row = byG.get(g) || byG.set(g, { unit: g, sum: 0, n: 0, v: {} }).get(g);
    row.n++;
    for (const [k, v] of Object.entries(pr)) { if (!(v > 0)) continue; tot[k] = (tot[k] || 0) + v; cnt[k] = (cnt[k] || 0) + 1; row.v[k] = (row.v[k] || 0) + v; row.sum += v; }
  }
  let segs = d.segs.filter(([k]) => tot[k] > 0).map(([k, c]) => ({ k, c, v: tot[k], n: cnt[k] }));
  let merged = [];
  if (segs.length > 5) {
    const keep = [...segs].sort((a, b) => b.v - a.v).slice(0, 4).map((x) => x.k);
    if (!keep.includes(d.none) && tot[d.none]) keep[3] = d.none;
    merged = segs.filter((x) => !keep.includes(x.k)).map((x) => x.k);
    const o = { k: "other", c: "#B9A7D6", v: merged.reduce((a, k) => a + tot[k], 0), n: merged.reduce((a, k) => a + cnt[k], 0), of: merged };
    segs = [...segs.filter((x) => keep.includes(x.k)), o];
  }
  const segOf = (k) => (merged.includes(k) ? "other" : k);
  const all = segs.reduce((a, x) => a + x.v, 0);
  const rows = [...byG.values()].filter((r) => r.sum > 0).map((r) => {
    const v = {}; for (const [k, x] of Object.entries(r.v)) v[segOf(k)] = (v[segOf(k)] || 0) + x;
    return { ...r, v, noneShare: (v[d.none] || 0) / r.sum };
  }).sort((a, b) => b.noneShare - a.noneShare || b.sum - a.sum);
  const totalSites = U.filter(d.total).length;
  const totalValue = d.unit === "hours" ? U.reduce((a, s) => a + (d.total(s) ? Object.values(d.parts(s)).reduce((x, y) => x + y, 0) : 0), 0) : totalSites;
  return { d, segs, all, rows, totalSites, totalValue, universe: U.length, merged };
}
