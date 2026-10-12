// v4.0 — MBP performance, need (event pairs), simulation / relocation (anchored on actual jobs) and static dispatch priority.
// Pure functions (no React) shared by the UI, the KPI layer and the tests. Thresholds live in thresholds.yaml › mbp_perf / dispatch.
// Formulas are a PROPOSAL until agreed with Telkomsel — every figure on screen states how it is computed.
import { isNum, haversineKm, travelMinutes, kecamatanAnchors, pctRank, reachCap } from "./logic.js";

// ONE status system for base camps (v4.0): idle → relocation candidate; busy → may need another unit; late / watch / good = on time
export const PERF_KEYS = ["low", "watch", "good", "high", "under", "nodata", "none"];
export const UTIL_KEYS = ["high", "normal", "under", "none"];
export const ONTIME_KEYS = ["low", "watch", "good", "nodata"];
const P = (cfg) => ({ period_hours: 4344, min_jobs: 10, under_busy_max: 0.03, under_jobs_month_max: 2, high_busy_min: 0.25, ontime_good: 0.6,
  ontime_low: 0.35, dispatch_lag_cap_min: 240, default_job_h: 3, nobat_flag_share: 0.3, min_decisions: 10, calib_tolerance_pp: 5,
  reloc_min_gain_jobs: 10, ...(cfg.mbp_perf || {}) });
export const perfCfg = P;
const MONTHS = 6;
const isPln = (k) => k.rc === undefined || k.rc === "P";

export function utilKey(m, cfg) {
  const c = P(cfg);
  if (!m || !m.jobs) return "none";
  if (m.jobs / MONTHS < c.under_jobs_month_max || m.busy < c.under_busy_max) return "under";
  return m.busy >= c.high_busy_min ? "high" : "normal";
}
export function ontimeKey(m, cfg) {
  const c = P(cfg);
  if (!m || (m.ontime + m.late) < c.min_jobs || m.ontime_rate == null) return "nodata";
  return m.ontime_rate < c.ontime_low ? "low" : m.ontime_rate < c.ontime_good ? "watch" : "good";
}
/** status precedence: no job → idle (grey) → too few judged jobs → late (red) → busy (purple) → amber / green on time */
export function perfKey(m, cfg) {
  const u = utilKey(m, cfg);
  if (u === "none" || u === "under") return u;
  const o = ontimeKey(m, cfg);
  if (o === "nodata") return "nodata";
  if (o === "low") return "low";
  if (u === "high") return "high";
  return o;
}

/* ------------------------------------------------------------------ MBP need = event pairs (≤ 100 % by construction) */
/** events of one site (pln_ev.json rows: dur min, arr min from outage start to MBP check-in or null, mbp) vs its BBT:
 *  need = outages longer than the BBT · served = need outages with a matched MBP job · ontime = served and arrived before BBT */
export function sitePairs(evs, s) {
  const b = s.bbt_effective_min;
  if (!evs || !evs.length || !isNum(b) || s.bbt_status === "Unknown") return null;
  let need = 0, served = 0, ontime = 0, jobs = 0;
  for (const e of evs) {
    if (e.mbp) jobs++;
    if (!(e.dur > b)) continue;
    need++;
    if (e.mbp) { served++; if (isNum(e.arr) && e.arr <= b) ontime++; }
  }
  return { need, served, ontime, jobs_on_events: jobs };
}
export const groupEvents = (events) => { const m = new Map(); for (const e of events || []) (m.get(e.site) || m.set(e.site, []).get(e.site)).push(e); return m; };

const blank = () => ({ jobs: 0, busy_h: 0, ontime: 0, late: 0, bbt_unknown: 0, genset: 0, pln_back: 0, no_checkin: 0, other: 0, p12: 0, hiclass: 0, sites: new Set(), months: [0, 0, 0, 0, 0, 0], arr: [] });
const med = (a) => { if (!a.length) return null; const v = [...a].sort((x, y) => x - y), h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };

/** Historical (ACTUAL tickets) performance per base camp + need of its assigned area (event pairs). */
export function mbpPerformance(sites, mbps, tickets, cfg, evBySite = null) {
  const c = P(cfg), byId = new Map(sites.map((s) => [s.site_id, s])), M = new Map(mbps.map((m) => [m.mbp_id, blank()]));
  const area = new Map(), areaJobs = new Map(), inR = new Map(), inR12 = new Map();
  const Rp = cfg.mbp.max_radius_km;
  for (const s of sites) {
    if (s.mbp_assigned) {
      const a = area.get(s.mbp_assigned) || area.set(s.mbp_assigned, { n: 0, p12: 0, need: 0, served: 0, ontime: 0, plnSites: 0 }).get(s.mbp_assigned);
      a.n++; if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") a.p12++;
      const pr = s.site_active === 1 && !s.genset_protected && evBySite ? sitePairs(evBySite.get(s.site_id), s) : null;
      if (pr) { a.need += pr.need; a.served += pr.served; a.ontime += pr.ontime; a.plnSites++; }
    }
    for (const x of s.coverage?.inRadius || []) if (x.km <= Rp) { inR.set(x.mbp_id, (inR.get(x.mbp_id) || 0) + 1); if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") inR12.set(x.mbp_id, (inR12.get(x.mbp_id) || 0) + 1); }
  }
  for (const k of tickets) {
    const s = byId.get(k.site);
    if (s?.mbp_assigned) { const a = areaJobs.get(s.mbp_assigned) || areaJobs.set(s.mbp_assigned, { all: 0, own: 0 }).get(s.mbp_assigned); a.all++; if (k.mbp === s.mbp_assigned) a.own++; }
    const r = M.get(k.mbp);
    if (!r) continue;
    r.jobs++; r.busy_h += isNum(k.job) ? k.job : c.default_job_h; r.sites.add(k.site);
    const mo = Math.min(5, Math.max(0, Math.floor(k.occ / (1440 * 30.4)))); r.months[mo]++;
    r[k.out === "G" ? "genset" : k.out === "P" ? "pln_back" : k.out === "N" ? "no_checkin" : "other"]++;
    if (s && (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2")) r.p12++;
    if (s && (s.site_class === "Diamond" || s.site_class === "Platinum")) r.hiclass++;
    if (k.rc === "B") r.nobat = (r.nobat || 0) + 1;
    if (!isPln(k)) { r.non_pln = (r.non_pln || 0) + 1; continue; }   // battery / rental jobs: workload only, not judged on time
    r.plnoff = (r.plnoff || 0) + 1;
    if (isNum(k.arr)) {
      r.arr.push(k.arr);
      if (s && isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown") k.arr <= s.bbt_effective_min ? r.ontime++ : r.late++;
      else r.bbt_unknown++;
    }
  }
  const out = new Map();
  for (const m of mbps) {
    const r = M.get(m.mbp_id), a = area.get(m.mbp_id) || { n: 0, p12: 0, need: 0, served: 0, ontime: 0, plnSites: 0 }, aj = areaJobs.get(m.mbp_id) || { all: 0, own: 0 };
    const judged = r.ontime + r.late;
    const o = { mbp_id: m.mbp_id, code: campCode(m.mbp_id), nop: m.nop, pic_name: m.pic_name, jobs: r.jobs, jobs_month: r.jobs / MONTHS, busy_h: r.busy_h, busy: r.busy_h / c.period_hours,
      busy_h_month: r.busy_h / MONTHS, ontime: r.ontime, late: r.late, judged, bbt_unknown: r.bbt_unknown, ontime_rate: judged >= c.min_jobs ? r.ontime / judged : null,
      plnoff: r.plnoff || 0, non_pln: r.non_pln || 0, genset: r.genset, pln_back: r.pln_back, no_checkin: r.no_checkin, backup_rate: r.jobs ? r.genset / r.jobs : null,
      p12_share: r.jobs ? r.p12 / r.jobs : null, hiclass_share: r.jobs ? r.hiclass / r.jobs : null, sites_served: r.sites.size, months: r.months,
      arr_median: med(r.arr), area_sites: a.n, area_p12: a.p12, area_jobs: aj.all, capture: aj.all ? aj.own / aj.all : null,
      in_radius: inR.get(m.mbp_id) || 0, in_radius_p12: inR12.get(m.mbp_id) || 0, located: isNum(m.lat),
      need: a.need, need_month: a.need / MONTHS, need_served: a.served, need_ontime: a.ontime, pln_sites: a.plnSites,
      resp: a.need >= c.min_jobs ? a.served / a.need : null, resp_ontime: a.need >= c.min_jobs ? a.ontime / a.need : null,
      nobat: r.nobat || 0, nobat_share: r.jobs ? (r.nobat || 0) / r.jobs : 0 };
    o.nobat_flag = o.nobat_share >= c.nobat_flag_share && o.nobat > 0;
    o.key = perfKey(o, cfg); o.util_key = utilKey(o, cfg); o.ontime_key = ontimeKey(o, cfg);
    out.set(m.mbp_id, o);
  }
  // composite score (percentile ranks among base camps with enough jobs): on time 50 % · occupancy 30 % · genset connected 20 %
  const R = [...out.values()].filter((o) => o.ontime_rate != null);
  const rb = pctRank(R.map((o) => o.busy)), ro = pctRank(R.map((o) => o.ontime_rate)), rg = pctRank(R.map((o) => o.backup_rate || 0));
  R.forEach((o, i) => { o.score = Math.round(100 * (0.5 * ro[i] + 0.3 * rb[i] + 0.2 * rg[i])); });
  [...R].sort((a, b) => b.score - a.score).forEach((o, i) => { o.rank = i + 1; o.rank_of = R.length; });
  return out;
}

/** base-camp code for management views (no person name): "BPS001-BTM-GABRIEL SAKA" → "BPS001-BTM", "MBP-LHT-LISUS" → "MBP-LHT·L1S" */
export function campCode(id) {
  if (!id) return "—";
  const p = String(id).split("-");
  if (/^(BPS|MBP)\d+$/i.test(p[0]) && p[1]) return p.length === 2 && p[1].length > 4 ? p[0] : `${p[0]}-${p[1]}`;
  if (p[0] && p[1] && /^(MBP|BPS|TS|SCD)$/i.test(p[0])) { const n = (p.slice(2).join(" ") || "").replace(/[^A-Z]/gi, "").toUpperCase(); return `${p[0]}-${p[1]}·${n.slice(0, 1)}${n.length}${n.slice(-1)}`; }
  return String(id).slice(0, 10);
}

/** per-NOP management summary: units, denominators (all sites in scope), reach before BBT, need / served (event pairs), status counts */
export function nopMbpSummary(sites, mbps, perf) {
  const by = new Map();
  const row = (n) => by.get(n) || by.set(n, { nop: n, mbp: 0, mbp_located: 0, sites: 0, within: 0, within_pref: 0, arrive: 0, p12: 0, p12_arrive: 0, beyond: 0, island: 0,
    jobs: 0, ontime: 0, judged: 0, busy_h: 0, need: 0, need_served: 0, need_ontime: 0, nobat: 0, keys: Object.fromEntries(PERF_KEYS.map((k) => [k, 0])) }).get(n);
  for (const m of mbps) { if (!m.nop) continue; const r = row(m.nop); r.mbp++; if (isNum(m.lat)) r.mbp_located++; const p = perf.get(m.mbp_id);
    if (p) { r.jobs += p.jobs; r.ontime += p.ontime; r.judged += p.judged; r.busy_h += p.busy_h; r.keys[p.key]++; r.need += p.need; r.need_served += p.need_served; r.need_ontime += p.need_ontime; r.nobat += p.nobat; } }
  for (const s of sites) {
    if (!s.nop) continue; const r = row(s.nop); r.sites++;
    if (s.access_class === "island") r.island++;
    if (s.covered) r.within++; else r.beyond++;
    if (s.within_radius) r.within_pref++;
    if (s.covered && s.can_arrive_before_bbt) r.arrive++;
    if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") { r.p12++; if (s.covered && s.can_arrive_before_bbt) r.p12_arrive++; }
  }
  return [...by.values()].map((r) => ({ ...r, within_pct: r.sites ? r.within / r.sites : null, arrive_pct: r.sites ? r.arrive / r.sites : null,
    p12_arrive_pct: r.p12 ? r.p12_arrive / r.p12 : null, resp: r.need ? r.need_served / r.need : null, resp_ontime: r.need ? r.need_ontime / r.need : null,
    ontime_rate: r.judged ? r.ontime / r.judged : null, sites_per_mbp: r.mbp ? r.sites / r.mbp : null }))
    .sort((a, b) => a.nop.localeCompare(b.nop));
}

/* ------------------------------------------------------------------ calibration: can the travel model reproduce the actual on-time? */
/** per NOP: actual on-time of PLN-off jobs vs the model applied to the SAME jobs (same base camp, actual take-over delay + model ETA).
 *  ok = |model − actual| ≤ tolerance (default 5 pp). Recommendation screens are hidden when not ok. */
export function modelCheck(sites, mbps, tickets, cfg) {
  const c = P(cfg), byId = new Map(sites.map((s) => [s.site_id, s])), MB = new Map(mbps.map((m) => [m.mbp_id, m])), by = new Map();
  for (const k of tickets) {
    if (!isPln(k) || !isNum(k.arr) || !isNum(k.to)) continue;
    const s = byId.get(k.site), m = MB.get(k.mbp);
    if (!s || !m || !isNum(s.lat) || !isNum(m.lat) || s.bbt_status === "Unknown" || !isNum(s.bbt_effective_min)) continue;
    const e = travelMinutes(haversineKm(s.lat, s.lon, m.lat, m.lon), s, cfg, Math.floor((k.occ + k.to) / 60) % 24);
    if (!isNum(e)) continue;
    const r = by.get(s.nop) || by.set(s.nop, { nop: s.nop, n: 0, actual: 0, model: 0 }).get(s.nop);
    r.n++; if (k.arr <= s.bbt_effective_min) r.actual++; if (k.to + e <= s.bbt_effective_min) r.model++;
  }
  const out = {};
  let N = 0, A = 0, Mo = 0;
  for (const r of by.values()) {
    N += r.n; A += r.actual; Mo += r.model;
    const a = r.actual / r.n, m = r.model / r.n;
    out[r.nop] = { n: r.n, actual: a, model: m, diff_pp: 100 * (m - a), ok: r.n >= 50 && Math.abs(100 * (m - a)) <= c.calib_tolerance_pp };
  }
  out.__all = N ? { n: N, actual: A / N, model: Mo / N, diff_pp: 100 * (Mo - A) / N, ok: Math.abs(100 * (Mo - A) / N) <= c.calib_tolerance_pp } : null;
  return out;
}

/* ------------------------------------------------------------------ simulation / relocation, anchored on the actual jobs */
/** Counterfactual replay of the NOP's H1 MBP jobs (v4.0). Every job starts from what really happened: its own take-over delay and its
 *  real arrival. Only jobs touched by the scenario change:
 *  · its base camp moved → actual arrival + (model ETA from the new spot − model ETA from the old spot);
 *  · its base camp removed, or a moved / added camp is faster and free → arrival = delay + model ETA of that camp.
 *  So with no change the replay IS the actual (0 pp); the difference is the effect of the change only.
 *  moves: Map(mbp_id → {lat, lon}); added: [{mbp_id, lat, lon}]; removed: Set(mbp_id). */
export function replayDelta(sitesById, mbps, tickets, cfg, { moves = new Map(), added = [], removed = new Set() } = {}) {
  const c = P(cfg), R = reachCap(cfg);
  const orig = new Map(mbps.filter((m) => isNum(m.lat)).map((m) => [m.mbp_id, m]));
  const now = new Map();
  for (const [id, m] of orig) if (!removed.has(id)) now.set(id, moves.has(id) ? { ...m, ...moves.get(id), moved: true } : m);
  for (const a of added) now.set(a.mbp_id, { ...a, added: true });
  const changed = [...now.values()].filter((m) => m.moved || m.added);
  const busy = new Map([...now.keys()].map((k) => [k, -Infinity]));
  const per = new Map([...now.keys()].map((k) => [k, { jobs: 0, busy_h: 0, ontime: 0, late: 0, bbt_unknown: 0 }]));
  const T = { tickets: 0, pln: 0, ontime: 0, late: 0, unserved: 0, changed: 0, gained: 0, lost: 0 };
  const eta = (s, m, h) => { const km = haversineKm(s.lat, s.lon, m.lat, m.lon); return km <= R ? travelMinutes(km, s, cfg, h) : null; };
  const sorted = [...tickets].sort((a, b) => a.occ + (a.to || 0) - (b.occ + (b.to || 0)));
  for (const k of sorted) {
    const s = sitesById.get(k.site); if (!s) continue;
    T.tickets++;
    const lag = Math.min(c.dispatch_lag_cap_min, Math.max(0, isNum(k.to) ? k.to : 30)), tD = k.occ + lag, hour = Math.floor(tD / 60) % 24;
    const job = (isNum(k.job) ? k.job : c.default_job_h) * 60;
    const actualArr = isNum(k.arr) ? k.arr : null;
    let pick = null;
    const own = now.get(k.mbp), origM = orig.get(k.mbp), outside = !origM;   // outside = a camp not in this scenario (other NOP / no position)
    const free = (m) => !(busy.get(m.mbp_id) > tD);
    if ((outside || (own && !own.moved)) && actualArr != null) pick = { id: k.mbp, arr: actualArr };
    else if (own && own.moved && actualArr != null && isNum(s.lat)) {
      // moved camp keeps its own job, shifted by the ETA difference; when the move made it slower, an unchanged free camp may take it
      // (but never earlier than what really happened)
      const e0 = eta(s, origM, hour), e1 = eta(s, own, hour);
      if (isNum(e0) && isNum(e1)) pick = { id: k.mbp, arr: e1 < e0 ? Math.max(Math.min(actualArr, lag + cfg.travel.mobilization_minutes), actualArr + e1 - e0) : actualArr + e1 - e0 };
      else pick = isNum(e0) ? null : { id: k.mbp, arr: actualArr };
      if (!pick || pick.arr > actualArr + 1) for (const m of now.values()) {
        if (m.mbp_id === k.mbp || m.moved || m.added || !free(m)) continue;
        const e = eta(s, m, hour); if (!isNum(e)) continue;
        const arr = Math.max(actualArr, lag + e);
        if (!pick || arr < pick.arr - 1) pick = { id: m.mbp_id, arr, model: true };
      }
    } else if (!own && !outside && isNum(s.lat)) {
      // its camp was removed: the fastest free camp takes the job (model arrival)
      for (const m of now.values()) { if (!free(m)) continue; const e = eta(s, m, hour); if (!isNum(e)) continue; const arr = lag + e; if (!pick || arr < pick.arr - 1) pick = { id: m.mbp_id, arr, model: true }; }
    }
    // a moved / added camp takes another camp's job only when the change brings it closer (moved: new ETA < old ETA) and it beats the real arrival
    if (isNum(s.lat) && pick && changed.length) for (const m of changed) {
      if (m.mbp_id === pick.id || m.mbp_id === k.mbp || !free(m)) continue;
      const e = eta(s, m, hour); if (!isNum(e)) continue;
      if (m.moved) { const e0 = eta(s, orig.get(m.mbp_id), hour); if (isNum(e0) && e >= e0 - 1) continue; }
      const arr = lag + e;
      if (arr < pick.arr - 1) pick = { id: m.mbp_id, arr, model: true };
    }
    if (!pick) { if (isPln(k)) { T.pln++; T.unserved++; } continue; }
    if (pick.id !== k.mbp || pick.model) T.changed++;
    if (busy.has(pick.id)) busy.set(pick.id, Math.max(busy.get(pick.id), tD) + Math.max(0, pick.arr - lag) + job);
    const r = per.get(pick.id) || { jobs: 0, busy_h: 0, ontime: 0, late: 0, bbt_unknown: 0, outside: true };
    r.jobs++; r.busy_h += (Math.max(0, pick.arr - lag) + job) / 60;
    if (!isPln(k)) continue;
    T.pln++;
    if (isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown") {
      const was = actualArr != null && actualArr <= s.bbt_effective_min, is = pick.arr <= s.bbt_effective_min;
      if (is) { r.ontime++; T.ontime++; } else { r.late++; T.late++; }
      if (is && !was) T.gained++; if (!is && was) T.lost++;
    } else r.bbt_unknown++;
  }
  for (const [id, r] of per) { const j = r.ontime + r.late; r.ontime_rate = j >= c.min_jobs ? r.ontime / j : null; r.judged = j; r.busy = r.busy_h / c.period_hours; r.mbp_id = id; r.key = perfKey(r, cfg); }
  const judged = T.ontime + T.late;
  T.ontime_rate = judged ? T.ontime / judged : null;
  return { per, total: T };
}

/** reach before BBT for a set of base-camp positions (capability, ESTIMATED): sites whose fastest MBP arrives before the BBT */
export function reachOf(sites, camps, cfg) {
  const R = reachCap(cfg), dLat = R / 110.574;
  let n = 0, ok = 0, p12 = 0, p12ok = 0, dark = 0;
  const ok_ids = new Set();
  for (const s of sites) {
    if (!isNum(s.lat) || s.site_active !== 1 || s.offair || s.genset_protected) continue;
    n++; const pr = s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2"; if (pr) p12++;
    const b = s.bbt_status === "Unknown" ? null : s.bbt_effective_min;
    let best = Infinity;
    const dLon = R / (111.32 * Math.max(0.2, Math.cos((s.lat * Math.PI) / 180)));
    for (const m of camps) { if (Math.abs(m.lat - s.lat) > dLat || Math.abs(m.lon - s.lon) > dLon) continue; const km = haversineKm(s.lat, s.lon, m.lat, m.lon); if (km > R) continue;
      const e = travelMinutes(km, s, cfg); if (isNum(e) && e < best) best = e; }
    if (isNum(b) && best <= b) { ok++; ok_ids.add(s.site_id); if (pr) p12ok++; }
    else if (isNum(b) && (s.dark || (s.evt_exhaustion || 0) >= 1)) dark++;
  }
  return { n, ok, p12, p12ok, dark_risk: dark, ok_ids };
}

/** Relocation candidates for one base camp: anchors (one site per kecamatan, same cluster by default) ranked by Δ jobs on time
 *  in the anchored replay. Recommendations are only meaningful when modelCheck(nop).ok. */
export function backtestMove(sitesNop, mbpsNop, ticketsNop, cfg, mbpId, { candidates = 8, dest = null, sameCluster = true } = {}) {
  const byId = new Map(sitesNop.map((s) => [s.site_id, s]));
  const base = replayDelta(byId, mbpsNop, ticketsNop, cfg);
  const R = reachCap(cfg);
  // where the late jobs are (actual): candidate anchors that could reach them in time
  const lateSites = new Map();
  for (const k of ticketsNop) { const s = byId.get(k.site); if (!s || !isPln(k) || !isNum(k.arr) || s.bbt_status === "Unknown") continue; if (k.arr > s.bbt_effective_min) lateSites.set(k.site, (lateSites.get(k.site) || 0) + 1); }
  let anchors = kecamatanAnchors(sitesNop);
  const camp = mbpsNop.find((m) => m.mbp_id === mbpId);
  const homeCluster = campCluster(sitesNop, camp);
  if (sameCluster && homeCluster) anchors = anchors.filter((a) => a.site.cluster_to === homeCluster);
  let cand = anchors.map((a) => {
    let pot = 0;
    for (const [sid, n] of lateSites) { const s = byId.get(sid); if (!s || !isNum(s.lat)) continue; const km = haversineKm(s.lat, s.lon, a.site.lat, a.site.lon);
      if (km > R) continue; const e = travelMinutes(km, s, cfg); if (isNum(e) && e <= s.bbt_effective_min) pot += n; }
    return { a, pot };
  }).filter((x) => x.pot > 0).sort((x, y) => y.pot - x.pot).slice(0, candidates);
  if (dest) { const d = anchors.find((a) => a.site.site_id === dest) || kecamatanAnchors(sitesNop).find((a) => a.site.site_id === dest); if (d && !cand.some((x) => x.a.site.site_id === dest)) cand.unshift({ a: d, pot: null }); }
  const results = cand.map(({ a, pot }) => {
    const r = replayDelta(byId, mbpsNop, ticketsNop, cfg, { moves: new Map([[mbpId, { lat: a.site.lat, lon: a.site.lon }]]) });
    const me = r.per.get(mbpId), was = base.per.get(mbpId);
    return { kecamatan: a.kecamatan, city: a.city, site_id: a.site.site_id, site_name: a.site.site_name, lat: a.site.lat, lon: a.site.lon, potential: pot,
      shift_km: camp && isNum(camp.lat) ? haversineKm(camp.lat, camp.lon, a.site.lat, a.site.lon) : null,
      ontime: r.total.ontime, ontime_gain: r.total.ontime - base.total.ontime, ontime_rate: r.total.ontime_rate, unserved_change: r.total.unserved - base.total.unserved,
      me_jobs: me?.jobs ?? 0, me_busy: me?.busy ?? 0, me_key: me?.key ?? "none", was_key: was?.key ?? "none", was_jobs: was?.jobs ?? 0, was_busy: was?.busy ?? 0, per: r.per };
  }).sort((x, y) => y.ontime_gain - x.ontime_gain || x.unserved_change - y.unserved_change);
  return { base, results, camp, homeCluster };
}
export function campCluster(sites, camp) {
  if (!camp) return null;
  const c = new Map();
  for (const s of sites) if (s.mbp_assigned === camp.mbp_id && s.cluster_to) c.set(s.cluster_to, (c.get(s.cluster_to) || 0) + 1);
  if (c.size) return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (!isNum(camp.lat)) return null;
  let best = null, bd = Infinity;
  for (const s of sites) if (isNum(s.lat) && s.cluster_to) { const d = (s.lat - camp.lat) ** 2 + (s.lon - camp.lon) ** 2; if (d < bd) { bd = d; best = s.cluster_to; } }
  return best;
}

/* ------------------------------------------------------------------ dispatch priority (static) */
const D = (cfg) => ({ w_class: 0.4, w_dependency: 0.3, w_priority: 0.3, savable_first: true, ...(cfg.dispatch || {}) });
/** class + MBP priority (+ dependency ONLY when NOP officers filled it — a PROXY dependency gets no weight, weights re-normalised) */
export function dispatchScore(s, cfg) {
  const d = D(cfg), cls = cfg.class_score?.[s.site_class] ?? cfg.class_score?.Unknown ?? 0.3;
  const depActual = isNum(s.dep_children_actual), dep = depActual ? Math.min(15, s.dep_children_actual) / 15 : 0;
  const pr = isNum(s.mbp_priority_score) ? Math.max(0, Math.min(1, s.mbp_priority_score)) : 0;
  const wd = depActual ? d.w_dependency : 0, tot = d.w_class + wd + d.w_priority || 1;
  return { score: (d.w_class * cls + wd * dep + d.w_priority * pr) / tot, cls, dep, pr, depEvidence: depActual ? "ACTUAL" : "—" };
}
export function dispatchOrder(sitesDown, camp, cfg, departHour = null) {
  const d = D(cfg);
  const rows = sitesDown.map((s) => {
    const sc = dispatchScore(s, cfg);
    const km = isNum(camp?.lat) && isNum(s.lat) ? haversineKm(s.lat, s.lon, camp.lat, camp.lon) : null;
    const eta = isNum(km) && km <= reachCap(cfg) ? travelMinutes(km, s, cfg, departHour) : null;
    const bbt = isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown" ? s.bbt_effective_min : null;
    const savable = eta == null ? false : bbt == null ? null : eta <= bbt;
    return { site: s, ...sc, km, eta, bbt, savable };
  });
  const grp = (r) => (!d.savable_first ? 0 : r.eta == null ? 3 : r.savable === true ? 0 : r.savable === null ? 1 : 2);
  rows.sort((a, b) => grp(a) - grp(b) || b.score - a.score || (a.eta ?? 1e9) - (b.eta ?? 1e9));
  rows.forEach((r, i) => { r.order = i + 1; r.group = grp(r); });
  return rows;
}
/** audit: each moment a base camp took a job while other jobs for it were waiting — did it take the highest-scored one?
 *  One decision per (camp, site taken, day); a camp's share is shown only from min_decisions on. */
export function dispatchAudit(tickets, sitesById, cfg, { eps = 0.02, maxWaitMin = 1440 } = {}) {
  const by = new Map();
  for (const k of tickets) if (isNum(k.to)) (by.get(k.mbp) || by.set(k.mbp, []).get(k.mbp)).push({ ...k, T: k.occ + k.to });
  const sc = new Map(), score = (id) => { if (!sc.has(id)) { const s = sitesById.get(id); sc.set(id, s ? dispatchScore(s, cfg).score : null); } return sc.get(id); };
  const decisions = [], seen = new Set();
  for (const [mbp, L] of by) {
    L.sort((a, b) => a.T - b.T);
    for (let i = 0; i < L.length; i++) {
      const k = L[i], pend = [];
      for (let j = i + 1; j < L.length && L[j].T > k.T; j++) if (L[j].occ < k.T && k.T - L[j].occ <= maxWaitMin && L[j].site !== k.site) pend.push(L[j]);
      if (!pend.length) continue;
      const key = `${mbp}|${k.site}|${Math.floor(k.T / 1440)}`;
      if (seen.has(key)) continue; seen.add(key);
      const sk = score(k.site); if (sk == null) continue;
      let best = null; for (const p of pend) { const v = score(p.site); if (v != null && (!best || v > best.v)) best = { p, v }; }
      if (!best) continue;
      decisions.push({ mbp, occ: k.occ, T: k.T, chosen: k.site, chosen_score: sk, waiting: pend.length + 1, best_site: best.v > sk ? best.p.site : k.site,
        best_score: Math.max(best.v, sk), followed: sk >= best.v - eps });
    }
  }
  return decisions;
}
export const minToDate = (m) => { const d = new Date(Date.UTC(2026, 0, 1) + m * 60000); return d.toISOString().slice(0, 16).replace("T", " "); };
