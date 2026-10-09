// v3.8 — AREA 4 (light): availability vs target + causes, battery status from BBT Site Details, field staff (FME) coverage.
// Pure functions shared by components/Area4.jsx and the tests. Same thresholds as AREA 1 (Config) wherever the data allows.
import { isNum, haversineKm } from "./logic.js";

export const A4_STATUS = ["Dead", "Critical", "Degraded", "Below design", "held", "Meets design", "Unknown"];
export const A4_PROBLEM = new Set(["Dead", "Critical", "Degraded"]);

/** battery status from the BBT Site Details snapshot:
 *  Category "BBT" (NE went down) → median BBT vs design (Dead ≤ dead_max, Critical < degraded_pct, Degraded < ok_pct, Below < design);
 *  "Only Mains Fail" (no NE down during the outages) → the battery held: Meets design when the backup ≥ design, else "held" (lower bound). */
export function a4Battery(s, cfg) {
  const b = cfg.bbt, D = b.design_minutes;
  if (s.bbt_category === "BBT" && isNum(s.bbt_median_min)) {
    const v = s.bbt_median_min;
    const st = v <= b.dead_max_minutes ? "Dead" : v < b.degraded_pct * D ? "Critical" : v < b.ok_pct * D ? "Degraded" : v < D ? "Below design" : "Meets design";
    return { status: st, value: v, evidence: "ACTUAL", basis: "median BBT (mains fail → NE down)" };
  }
  if (s.bbt_category && isNum(s.backup_min)) {
    return { status: s.backup_min >= D ? "Meets design" : "held", value: s.backup_min, evidence: "LOWER BOUND", basis: "no NE down: battery held for the whole outage" };
  }
  return { status: "Unknown", value: null, evidence: "UNAVAILABLE", basis: "not in BBT Site Details" };
}

export const GAP_KEYS = ["big", "small", "meets", "nodata"];
export const gapKey = (s) => (!isNum(s.avail_delta_pp) ? "nodata" : s.avail_delta_pp >= 0 ? "meets" : s.avail_delta_pp <= -1 ? "big" : "small");
export const CAUSE_KEYS = ["power", "transport", "ran", "other", "none"];
export const causeKey = (s) => {
  if (!((s.ran_outage_h || 0) > 0)) return "none";
  const c = { power: s.ran_power_down_h || 0, transport: s.ran_transport_down_h || 0, ran: s.ran_ran_down_h || 0, other: s.ran_other_down_h || 0 };
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
};

/** enrich the AREA 4 site rows once */
export function a4Model(rows, cfg) {
  return rows.map((s0) => {
    const s = { ...s0 };
    s.battery = a4Battery(s, cfg); s.bbt_status = s.battery.status;
    s.gap_key = gapKey(s); s.cause_key = causeKey(s);
    s.genset_protected = s.fixed_genset === "ACTIVE" ? 1 : 0;
    return s;
  });
}

/** sum sites into units (NOP / cluster / kecamatan): availability from hours (wall-clock), power share, battery problems */
export function a4Rollup(sites, key) {
  const by = new Map();
  for (const s of sites) {
    const k = s[key] || "—"; const r = by.get(k) || by.set(k, { id: k, nop: s.nop, sites: 0, ran: 0, hours: 0, out: 0, pw: 0, tr: 0, ran_h: 0, oth: 0, below: 0, tgt: [], bbt: 0, prob: 0, dead: 0, genset: 0 }).get(k);
    r.sites++;
    if (isNum(s.ran_hours) && s.ran_hours > 0) { r.ran++; r.hours += s.ran_hours; r.out += s.ran_outage_h || 0; r.pw += s.ran_power_down_h || 0; r.tr += s.ran_transport_down_h || 0; r.ran_h += s.ran_ran_down_h || 0; r.oth += s.ran_other_down_h || 0;
      if (isNum(s.avail_delta_pp) && s.avail_delta_pp < 0) r.below++; if (isNum(s.ran_target_pct)) r.tgt.push(s.ran_target_pct); }
    if (s.bbt_status !== "Unknown") { r.bbt++; if (A4_PROBLEM.has(s.bbt_status)) r.prob++; if (s.bbt_status === "Dead") r.dead++; }
    if (s.genset_protected) r.genset++;
  }
  return [...by.values()].map((r) => { const tg = r.tgt.sort((a, b) => a - b); const target = tg.length ? tg[Math.floor(tg.length / 2)] : null;
    const avail = r.hours ? 100 * (1 - r.out / r.hours) : null;
    return { ...r, tgt: undefined, avail, target, gap: isNum(avail) && isNum(target) ? avail - target : null, power_share: r.out ? r.pw / r.out : null,
      below_share: r.ran ? r.below / r.ran : null, prob_share: r.bbt ? r.prob / r.bbt : null, power_h_site: r.ran ? r.pw / r.ran : null }; });
}

/** field staff per NOP and BPS (MBP operator) reach: sites within the radius of at least one BPS (straight line) */
export function a4Field(sites, fme, R) {
  const bps = fme.filter((p) => p.role === "BPS" && isNum(p.lat));
  const dLat = R / 110.574;
  const within = new Set();
  for (const s of sites) {
    if (!isNum(s.lat)) continue;
    const dLon = R / (111.32 * Math.max(0.2, Math.cos((s.lat * Math.PI) / 180)));
    for (const p of bps) if (Math.abs(p.lat - s.lat) <= dLat && Math.abs(p.lon - s.lon) <= dLon && haversineKm(s.lat, s.lon, p.lat, p.lon) <= R) { within.add(s.site_id); break; }
  }
  const by = new Map();
  const row = (n) => by.get(n) || by.set(n, { nop: n, sites: 0, within: 0, BPS: 0, PM: 0, TS: 0, prob: 0, below: 0 }).get(n);
  for (const s of sites) { const r = row(s.nop || "—"); r.sites++; if (within.has(s.site_id)) r.within++; if (A4_PROBLEM.has(s.bbt_status)) r.prob++; if (isNum(s.avail_delta_pp) && s.avail_delta_pp < 0) r.below++; }
  for (const p of fme) { const r = row(p.nop || "—"); if (r[p.role] != null) r[p.role]++; }
  return { within, rows: [...by.values()].map((r) => ({ ...r, within_pct: r.sites ? r.within / r.sites : null, sites_per_bps: r.BPS ? r.sites / r.BPS : null,
    sites_per_ts: r.TS ? r.sites / r.TS : null, prob_per_ts: r.TS ? r.prob / r.TS : null })).sort((a, b) => a.nop.localeCompare(b.nop)) };
}
