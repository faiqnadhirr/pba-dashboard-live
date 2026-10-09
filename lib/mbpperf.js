// v3.7 — MBP performance & utilisation, relocation backtest (replay of historical PLN-off tickets) and static dispatch priority.
// Pure functions (no React) shared by the UI and the tests. Thresholds live in thresholds.yaml › mbp_perf / dispatch.
// The formulas are a PROPOSAL until agreed with Telkomsel — every figure on screen states how it is computed.
import { isNum, haversineKm, travelMinutes, kecamatanAnchors, pctRank } from "./logic.js";

export const PERF_KEYS = ["low", "watch", "good", "high", "under", "nodata", "none"];
export const UTIL_KEYS = ["high", "normal", "under", "none"];
export const ONTIME_KEYS = ["low", "watch", "good", "nodata"];
const P = (cfg) => ({ period_hours: 4344, min_jobs: 10, under_busy_max: 0.03, under_jobs_month_max: 2, high_busy_min: 0.25, ontime_good: 0.6,
  ontime_low: 0.35, dispatch_lag_cap_min: 240, default_job_h: 3, ...(cfg.mbp_perf || {}) });
const MONTHS = 6;

/** utilisation (workload) class: no jobs at all → none; few jobs / low occupancy → under (grey); occupancy ≥ high → high (purple) */
export function utilKey(m, cfg) {
  const c = P(cfg);
  if (!m || !m.jobs) return "none";
  if (m.jobs / MONTHS < c.under_jobs_month_max || m.busy < c.under_busy_max) return "under";
  return m.busy >= c.high_busy_min ? "high" : "normal";
}
/** performance class: share of jobs arriving before the site's battery runs out */
export function ontimeKey(m, cfg) {
  const c = P(cfg);
  if (!m || m.jobs < c.min_jobs || m.ontime_rate == null) return "nodata";
  return m.ontime_rate < c.ontime_low ? "low" : m.ontime_rate < c.ontime_good ? "watch" : "good";
}
/** one combined key per MBP for the map: none / under (grey) first, then on-time red / amber / green; high load (purple) when not red */
export function perfKey(m, cfg) {
  const u = utilKey(m, cfg);
  if (u === "none" || u === "under") return u;
  const o = ontimeKey(m, cfg);
  if (o === "nodata") return "nodata";
  if (o === "low") return "low";
  if (u === "high") return "high";
  return o;
}

const blank = () => ({ jobs: 0, busy_h: 0, ontime: 0, late: 0, bbt_unknown: 0, genset: 0, pln_back: 0, no_checkin: 0, other: 0, p12: 0, hiclass: 0, sites: new Set(), months: [0, 0, 0, 0, 0, 0], arr: [] });
const med = (a) => { if (!a.length) return null; const v = [...a].sort((x, y) => x - y), h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };

/** Historical (ACTUAL tickets) performance per base camp.
 *  busy = job hours (take-over → RH stop) ÷ hours in H1 — an MBP serves ONE site at a time, so this is its occupancy.
 *  on-time = check-in − PLN-off occurrence ≤ the site's effective BBT (BBT is ACTUAL/DERIVED/ESTIMATED per site).
 *  area = sites assigned to the base camp; capture = share of the area's PLN-off jobs done by this base camp. */
export function mbpPerformance(sites, mbps, tickets, cfg) {
  const c = P(cfg), byId = new Map(sites.map((s) => [s.site_id, s])), M = new Map(mbps.map((m) => [m.mbp_id, blank()]));
  const area = new Map(), areaJobs = new Map(), inR = new Map(), inR12 = new Map();
  for (const s of sites) {
    if (s.mbp_assigned) { const a = area.get(s.mbp_assigned) || area.set(s.mbp_assigned, { n: 0, p12: 0 }).get(s.mbp_assigned); a.n++; if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") a.p12++; }
    for (const x of s.coverage?.inRadius || []) { inR.set(x.mbp_id, (inR.get(x.mbp_id) || 0) + 1); if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") inR12.set(x.mbp_id, (inR12.get(x.mbp_id) || 0) + 1); }
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
    if (k.rc !== undefined && k.rc !== "P") { r.non_pln = (r.non_pln || 0) + 1; continue; }   // battery / rental jobs: workload only, not judged on time
    r.plnoff = (r.plnoff || 0) + 1;
    if (isNum(k.arr)) {
      r.arr.push(k.arr);
      if (s && isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown") k.arr <= s.bbt_effective_min ? r.ontime++ : r.late++;
      else r.bbt_unknown++;
    }
  }
  const out = new Map();
  for (const m of mbps) {
    const r = M.get(m.mbp_id), a = area.get(m.mbp_id) || { n: 0, p12: 0 }, aj = areaJobs.get(m.mbp_id) || { all: 0, own: 0 };
    const judged = r.ontime + r.late;
    const o = { mbp_id: m.mbp_id, nop: m.nop, pic_name: m.pic_name, jobs: r.jobs, jobs_month: r.jobs / MONTHS, busy_h: r.busy_h, busy: r.busy_h / c.period_hours,
      busy_h_month: r.busy_h / MONTHS, ontime: r.ontime, late: r.late, bbt_unknown: r.bbt_unknown, ontime_rate: judged ? r.ontime / judged : null,
      plnoff: r.plnoff || 0, non_pln: r.non_pln || 0, genset: r.genset, pln_back: r.pln_back, no_checkin: r.no_checkin, backup_rate: r.jobs ? r.genset / r.jobs : null,
      p12_share: r.jobs ? r.p12 / r.jobs : null, hiclass_share: r.jobs ? r.hiclass / r.jobs : null, sites_served: r.sites.size, months: r.months,
      arr_median: med(r.arr), area_sites: a.n, area_p12: a.p12, area_jobs: aj.all, capture: aj.all ? aj.own / aj.all : null,
      in_radius: inR.get(m.mbp_id) || 0, in_radius_p12: inR12.get(m.mbp_id) || 0, located: isNum(m.lat) };
    o.key = perfKey(o, cfg); o.util_key = utilKey(o, cfg); o.ontime_key = ontimeKey(o, cfg);
    out.set(m.mbp_id, o);
  }
  // composite score (percentile ranks among base camps with enough jobs): occupancy 40 % · on-time 40 % · genset-connected 20 %
  const R = [...out.values()].filter((o) => o.jobs >= c.min_jobs && o.ontime_rate != null);
  const rb = pctRank(R.map((o) => o.busy)), ro = pctRank(R.map((o) => o.ontime_rate)), rg = pctRank(R.map((o) => o.backup_rate || 0));
  R.forEach((o, i) => { o.score = Math.round(100 * (0.4 * rb[i] + 0.4 * ro[i] + 0.2 * rg[i])); });
  [...R].sort((a, b) => b.score - a.score).forEach((o, i) => { o.rank = i + 1; o.rank_of = R.length; });
  return out;
}

/** per-NOP management summary: units, denominators (all sites in scope), reach, on-time, utilisation classes */
export function nopMbpSummary(sites, mbps, perf) {
  const by = new Map();
  const row = (n) => by.get(n) || by.set(n, { nop: n, mbp: 0, mbp_located: 0, sites: 0, within: 0, arrive: 0, p12: 0, p12_arrive: 0, beyond: 0, island: 0,
    jobs: 0, ontime: 0, judged: 0, busy_h: 0, keys: Object.fromEntries(PERF_KEYS.map((k) => [k, 0])) }).get(n);
  for (const m of mbps) { if (!m.nop) continue; const r = row(m.nop); r.mbp++; if (isNum(m.lat)) r.mbp_located++; const p = perf.get(m.mbp_id);
    if (p) { r.jobs += p.jobs; r.ontime += p.ontime; r.judged += p.ontime + p.late; r.busy_h += p.busy_h; r.keys[p.key]++; } }
  for (const s of sites) {
    if (!s.nop) continue; const r = row(s.nop); r.sites++;
    if (s.access_class === "island") r.island++;
    if (s.covered) r.within++; else r.beyond++;
    if (s.covered && s.can_arrive_before_bbt) r.arrive++;
    if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") { r.p12++; if (s.covered && s.can_arrive_before_bbt) r.p12_arrive++; }
  }
  return [...by.values()].map((r) => ({ ...r, within_pct: r.sites ? r.within / r.sites : null, arrive_pct: r.sites ? r.arrive / r.sites : null,
    p12_arrive_pct: r.p12 ? r.p12_arrive / r.p12 : null, ontime_rate: r.judged ? r.ontime / r.judged : null, sites_per_mbp: r.mbp ? r.sites / r.mbp : null }))
    .sort((a, b) => a.nop.localeCompare(b.nop));
}

/* ------------------------------------------------------------------ relocation backtest (replay) */
/** Replay the NOP's historical PLN-off jobs in time order with the given base-camp locations (ESTIMATED travel model):
 *  dispatch time = occurrence + the ticket's own take-over lag (capped); the job goes to the FASTEST FREE base camp within the radius
 *  (one site at a time; busy until arrival + the ticket's job hours); on-time = lag + ETA ≤ the site's BBT.
 *  Baseline and scenario use the same rule, so the difference is the effect of the move only. */
export function replay(sitesById, mbps, tickets, cfg, memo = new Map()) {
  const c = P(cfg), R = cfg.mbp.max_radius_km;
  const M = mbps.filter((m) => isNum(m.lat));
  const lags = tickets.map((k) => k.to).filter(isNum), medLag = med(lags) ?? 30;
  const busy = new Map(M.map((m) => [m.mbp_id, -Infinity]));
  const per = new Map(M.map((m) => [m.mbp_id, { jobs: 0, busy_h: 0, ontime: 0, late: 0, bbt_unknown: 0 }]));
  const T = { tickets: 0, served: 0, ontime: 0, late: 0, bbt_unknown: 0, beyond: 0, busy: 0, island: 0, noLoc: 0 };
  const sig = M.map((m) => m.mbp_id + "@" + m.lat.toFixed(5) + "," + m.lon.toFixed(5)).join(";");
  const etaList = (s) => {
    const key = sig;
    let L = memo.get(s.site_id);
    if (!L || L.sig !== key) {
      L = { sig: key, list: [] };
      for (const m of M) { const km = haversineKm(s.lat, s.lon, m.lat, m.lon); if (km <= R) L.list.push({ m, km }); }
      L.list.sort((a, b) => a.km - b.km);
      memo.set(s.site_id, L);
    }
    return L.list;
  };
  for (const k of tickets) {
    T.tickets++;
    const s = sitesById.get(k.site);
    if (!s || !isNum(s.lat)) { T.noLoc++; continue; }
    if (s.access_class === "island") { T.island++; continue; }
    if (k.rc === undefined || k.rc === "P") T.pln_road = (T.pln_road || 0) + 1;
    const lag = Math.min(c.dispatch_lag_cap_min, Math.max(0, isNum(k.to) ? k.to : medLag)), tD = k.occ + lag, hour = Math.floor(tD / 60) % 24;
    const L = etaList(s);
    if (!L.length) { T.beyond++; continue; }
    let pick = null;
    for (const x of L) { if (busy.get(x.m.mbp_id) <= tD) { const e = travelMinutes(x.km, s, cfg, hour); if (isNum(e) && (!pick || e < pick.e)) pick = { m: x.m, e }; } }
    if (!pick) { T.busy++; continue; }
    const job = isNum(k.job) ? k.job : c.default_job_h, r = per.get(pick.m.mbp_id);
    busy.set(pick.m.mbp_id, tD + pick.e + job * 60);
    r.jobs++; r.busy_h += pick.e / 60 + job; T.served++;
    if (k.rc !== undefined && k.rc !== "P") { T.non_pln = (T.non_pln || 0) + 1; continue; }
    if (isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown") { if (lag + pick.e <= s.bbt_effective_min) { r.ontime++; T.ontime++; } else { r.late++; T.late++; } }
    else { r.bbt_unknown++; T.bbt_unknown++; }
  }
  for (const [id, r] of per) { const j = r.ontime + r.late; r.ontime_rate = j ? r.ontime / j : null; r.busy = r.busy_h / c.period_hours; r.mbp_id = id; r.key = perfKey(r, cfg); r.util_key = utilKey(r, cfg); r.ontime_key = ontimeKey(r, cfg); }
  const judged = T.ontime + T.late;
  T.ontime_rate = judged ? T.ontime / judged : null;
  T.ok_share = T.pln_road > 0 ? T.ontime / T.pln_road : null;   // on-time over every PLN-off road job (unserved count as not on time)
  return { per, total: T };
}

/** Backtest one base camp: baseline replay, then the camp moved to each candidate kecamatan anchor of its NOP.
 *  Candidates = the anchors that could reach (ETA ≤ BBT) the most jobs that were late / unserved in the baseline (top N). */
export function backtestMove(sitesNop, mbpsNop, ticketsNop, cfg, mbpId, { candidates = 10, dest = null, sameCluster = false } = {}) {
  const byId = new Map(sitesNop.map((s) => [s.site_id, s]));
  const base = replay(byId, mbpsNop, ticketsNop, cfg);
  const R = cfg.mbp.max_radius_km;
  // jobs the baseline did not serve on time (late, busy, beyond radius) — weighted by how often the site needed MBP
  const failSites = new Map();
  {
    const b2 = replayDetail(byId, mbpsNop, ticketsNop, cfg);
    for (const d of b2) if (!["ontime", "island", "noloc", "non_pln"].includes(d.res)) failSites.set(d.site, (failSites.get(d.site) || 0) + 1);
  }
  let anchors = kecamatanAnchors(sitesNop);
  // ops constraint: a unit usually moves only inside its own cluster (same FMC / contract) — cluster = majority of its assigned sites
  const homeCluster = campCluster(sitesNop, mbpsNop.find((m) => m.mbp_id === mbpId));
  if (sameCluster && homeCluster) anchors = anchors.filter((a) => a.site.cluster_to === homeCluster);
  let cand = anchors.map((a) => {
    let gain = 0;
    for (const [sid, n] of failSites) { const s = byId.get(sid); if (!s || !isNum(s.lat)) continue; const km = haversineKm(s.lat, s.lon, a.site.lat, a.site.lon);
      if (km > R) continue; const e = travelMinutes(km, s, cfg); if (isNum(e) && isNum(s.bbt_effective_min) && e <= s.bbt_effective_min) gain += n; }
    return { a, pot: gain };
  }).filter((x) => x.pot > 0).sort((x, y) => y.pot - x.pot).slice(0, candidates);
  if (dest) { const d = anchors.find((a) => a.site.site_id === dest); if (d && !cand.some((x) => x.a.site.site_id === dest)) cand.unshift({ a: d, pot: null }); }
  const camp = mbpsNop.find((m) => m.mbp_id === mbpId);
  const results = cand.map(({ a, pot }) => {
    const moved = mbpsNop.map((m) => (m.mbp_id === mbpId ? { ...m, lat: a.site.lat, lon: a.site.lon } : m));
    const r = replay(byId, moved, ticketsNop, cfg);
    const me = r.per.get(mbpId), was = base.per.get(mbpId);
    return { kecamatan: a.kecamatan, city: a.city, site_id: a.site.site_id, site_name: a.site.site_name, lat: a.site.lat, lon: a.site.lon, potential: pot,
      shift_km: camp && isNum(camp.lat) ? haversineKm(camp.lat, camp.lon, a.site.lat, a.site.lon) : null,
      ontime: r.total.ontime, ontime_gain: r.total.ontime - base.total.ontime, ok_share: r.total.ok_share, unserved: r.total.busy + r.total.beyond,
      unserved_change: r.total.busy + r.total.beyond - (base.total.busy + base.total.beyond),
      me_jobs: me?.jobs ?? 0, me_busy: me?.busy ?? 0, me_ontime_rate: me?.ontime_rate ?? null, me_key: me?.key ?? "none", was_key: was?.key ?? "none",
      me_util: me?.util_key ?? "none", was_util: was?.util_key ?? "none", was_busy: was?.busy ?? 0, was_ontime_rate: was?.ontime_rate ?? null,
      was_jobs: was?.jobs ?? 0, per: r.per };
  }).sort((x, y) => y.ontime_gain - x.ontime_gain || x.unserved_change - y.unserved_change);
  return { base, results, camp, homeCluster };
}
/** cluster of a base camp = the cluster most of its assigned sites belong to (else the nearest site's cluster) */
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

/** same replay, one row per job (used for the candidate search and the audit-style tables) */
export function replayDetail(sitesById, mbps, tickets, cfg) {
  const c = P(cfg), R = cfg.mbp.max_radius_km, M = mbps.filter((m) => isNum(m.lat)), busy = new Map(M.map((m) => [m.mbp_id, -Infinity]));
  const lags = tickets.map((k) => k.to).filter(isNum), medLag = med(lags) ?? 30, out = [];
  for (const k of tickets) {
    const s = sitesById.get(k.site);
    if (!s || !isNum(s.lat)) { out.push({ site: k.site, res: "noloc" }); continue; }
    if (s.access_class === "island") { out.push({ site: k.site, res: "island" }); continue; }
    const lag = Math.min(c.dispatch_lag_cap_min, Math.max(0, isNum(k.to) ? k.to : medLag)), tD = k.occ + lag, hour = Math.floor(tD / 60) % 24;
    let any = false, pick = null;
    for (const m of M) { const km = haversineKm(s.lat, s.lon, m.lat, m.lon); if (km > R) continue; any = true;
      if (busy.get(m.mbp_id) <= tD) { const e = travelMinutes(km, s, cfg, hour); if (isNum(e) && (!pick || e < pick.e)) pick = { m, e }; } }
    if (!any) { out.push({ site: k.site, res: "beyond" }); continue; }
    if (!pick) { out.push({ site: k.site, res: "busy" }); continue; }
    busy.set(pick.m.mbp_id, tD + pick.e + (isNum(k.job) ? k.job : c.default_job_h) * 60);
    if (k.rc !== undefined && k.rc !== "P") { out.push({ site: k.site, mbp: pick.m.mbp_id, eta: pick.e, res: "non_pln" }); continue; }
    const known = isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown";
    out.push({ site: k.site, mbp: pick.m.mbp_id, eta: pick.e, res: !known ? "bbt_unknown" : lag + pick.e <= s.bbt_effective_min ? "ontime" : "late" });
  }
  return out;
}

/* ------------------------------------------------------------------ dispatch priority (static) */
const D = (cfg) => ({ w_class: 0.4, w_dependency: 0.3, w_priority: 0.3, savable_first: true, ...(cfg.dispatch || {}) });
/** static site score for "which site first": class + dependency (ACTUAL from NOP officers when present, else PROXY) + MBP priority */
export function dispatchScore(s, cfg) {
  const d = D(cfg), cls = cfg.class_score?.[s.site_class] ?? cfg.class_score?.Unknown ?? 0.3;
  const depActual = isNum(s.dep_children_actual), dep = Math.min(15, depActual ? s.dep_children_actual : s.dependency_children || 0) / 15;
  const pr = isNum(s.mbp_priority_score) ? Math.max(0, Math.min(1, s.mbp_priority_score)) : 0;
  const tot = d.w_class + d.w_dependency + d.w_priority || 1;
  return { score: (d.w_class * cls + d.w_dependency * dep + d.w_priority * pr) / tot, cls, dep, pr, depEvidence: depActual ? "ACTUAL" : "PROXY" };
}
/** order the sites that are down now for one base camp: savable first (ETA from the camp ≤ BBT), then by score; then the rest by score */
export function dispatchOrder(sitesDown, camp, cfg, departHour = null) {
  const d = D(cfg);
  const rows = sitesDown.map((s) => {
    const sc = dispatchScore(s, cfg);
    const km = isNum(camp?.lat) && isNum(s.lat) ? haversineKm(s.lat, s.lon, camp.lat, camp.lon) : null;
    const eta = isNum(km) && km <= cfg.mbp.max_radius_km ? travelMinutes(km, s, cfg, departHour) : null;
    const bbt = isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown" ? s.bbt_effective_min : null;
    const savable = eta == null ? false : bbt == null ? null : eta <= bbt;
    return { site: s, ...sc, km, eta, bbt, savable };
  });
  const grp = (r) => (!d.savable_first ? 0 : r.eta == null ? 3 : r.savable === true ? 0 : r.savable === null ? 1 : 2);
  rows.sort((a, b) => grp(a) - grp(b) || b.score - a.score || (a.eta ?? 1e9) - (b.eta ?? 1e9));
  rows.forEach((r, i) => { r.order = i + 1; r.group = grp(r); });
  return rows;
}
/** audit: every moment a base camp took a job while other jobs for it were already waiting — did it take the highest-scored one? */
export function dispatchAudit(tickets, sitesById, cfg, { eps = 0.02, maxWaitMin = 1440 } = {}) {
  const by = new Map();
  for (const k of tickets) if (isNum(k.to)) (by.get(k.mbp) || by.set(k.mbp, []).get(k.mbp)).push({ ...k, T: k.occ + k.to });
  const sc = new Map(), score = (id) => { if (!sc.has(id)) { const s = sitesById.get(id); sc.set(id, s ? dispatchScore(s, cfg).score : null); } return sc.get(id); };
  const decisions = [];
  for (const [mbp, L] of by) {
    L.sort((a, b) => a.T - b.T);
    for (let i = 0; i < L.length; i++) {
      const k = L[i], pend = [];
      for (let j = i + 1; j < L.length && L[j].T > k.T; j++) if (L[j].occ < k.T && k.T - L[j].occ <= maxWaitMin && L[j].site !== k.site) pend.push(L[j]);
      if (!pend.length) continue;
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
