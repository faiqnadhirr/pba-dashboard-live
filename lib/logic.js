// PBA decision logic — browser port of engine/src (kept 1:1 with the Python engine; see tests/logic.test.mjs).
// Pure functions, no React. Everything that depends on configurable weights/thresholds is recomputed here live.

export const DESIGN_DEFAULT = 120;

/* ------------------------------------------------------------------ small math */
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export function haversineKm(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * p) / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(((lo2 - lo1) * p) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
/** pandas Series.rank(pct=True, method="average") on values (no NaN expected — caller fills). */
export function pctRank(vals) {
  const n = vals.length, idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && vals[idx[j + 1]] === vals[idx[i]]) j++;
    const r = (i + j + 2) / 2 / n;            // average 1-based rank / n
    for (let k = i; k <= j; k++) out[idx[k]] = r;
    i = j + 1;
  }
  return out;
}
/** pandas quantile(q) with linear interpolation */
export function quantile(vals, q) {
  const s = vals.filter(isNum).sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const normW = (w) => {
  const tot = Object.values(w).reduce((a, v) => a + (v > 0 ? v : 0), 0);
  const o = {};
  for (const [k, v] of Object.entries(w)) if (v > 0) o[k] = tot ? v / tot : 0;
  return o;
};

/* ------------------------------------------------------------------ dependency proxy */
export function dependencyChildren(hub, mapping) {
  if (hub == null) return null;
  const key = String(hub).toLowerCase().replace(/[.…()<>+0-9]|sites|anakan|metro-e|radio ip|fo tsel/g, "").trim().replace(/\s+/g, " ");
  const mp = {};
  for (const [k, v] of Object.entries(mapping)) mp[k.toLowerCase()] = v;
  return key in mp ? Number(mp[key]) : null;
}

/* ------------------------------------------------------------------ travel time (ESTIMATED) */
export function travelMinutes(km, isUrban, isIsland, cfg, departHour = null) {
  if (!isNum(km) || isIsland) return null;
  const t = cfg.travel, road = km * t.road_factor, sp = t.speed_kmh;
  const speed = isUrban ? sp.urban : road < 15 ? sp.rural_short : sp.rural_long;
  let mult = 1;
  if (departHour != null) {
    if (t.peak_hours.includes(departHour)) mult = isUrban ? t.peak_multiplier_urban : t.peak_multiplier_rural;
    else if (t.night_hours.includes(departHour)) mult = t.night_multiplier;
  }
  return t.mobilization_minutes + (road / speed) * 60 * mult;
}

/* ------------------------------------------------------------------ scoring helpers */
const LVL = (s, lv) => { s += 1e-9; return s >= lv.P1 ? "P1" : s >= lv.P2 ? "P2" : s >= lv.P3 ? "P3" : "P4"; };
function scoreRows(factors, weights, labels, levels) {
  const w = normW(weights), keys = Object.keys(w);
  return factors.map((f) => {
    const contrib = keys.filter((k) => f[k] != null).map((k) => [k, f[k] * w[k]]);
    const raw = contrib.reduce((a, [, v]) => a + v, 0), s = Math.round(raw * 1e4) / 1e4;
    const top = contrib.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([k, v]) => `${labels[k] || k} (${v.toFixed(2)})`).join(", ");
    return { score: s, level: LVL(raw, levels), drivers: top };
  });
}

export const MBP_LABEL = {
  class: "site class", dependency: "dependency (children)", outage_frequency: "PLN outage frequency",
  travel_distance: "far from MBP", eta_gap: "MBP arrives after battery runs out", site_condition: "availability below target",
  vip: "VIP site", outage_duration: "long PLN outages", mbp_history: "frequent MBP deployments",
};
export const BBS_LABEL = {
  bbt_severity: "BBT gap vs design", pln_exposure: "historical PLN outage", class: "site class",
  dependency: "dependency (children)", site_condition: "availability below target", vip: "VIP site",
};

/** battery status vs design: Dead / Critical / Degraded / OK / Unknown */
export function statusOf(v, b) {
  if (!isNum(v)) return "Unknown";
  if (v <= b.dead_max_minutes) return "Dead";
  if (v < b.degraded_pct * b.design_minutes) return "Critical";
  if (v < b.ok_pct * b.design_minutes) return "Degraded";
  return "OK";
}

/* ------------------------------------------------------------------ BBS action rules (first match wins) */
function actionFor(s, cfg, plnHi) {
  const design = cfg.bbt.design_minutes, st = s.bbt_status, ev = s.bbt_value_evidence;
  const btype = s.battery_type || "OTHER", ages = cfg.battery_age_replace_years;
  const lim = btype === "MIXED" ? ages.VRLA : ages[btype] ?? ages.OTHER;
  const age = s.battery_age_y, load = s.load_a, hub = (s.dependency_children || 0) > 0, reach = s.reach_risk === 1;
  const why = [];
  if (isNum(s.bbt_value_min)) why.push(`BBT ${s.bbt_is_lower_bound === 1 ? "≥ " : ""}${Math.round(s.bbt_value_min)} min = ${Math.round((100 * s.bbt_value_min) / design)}% of design (${ev})`);
  if ((s.tk_no_battery || 0) >= 1) why.push(`${s.tk_no_battery} 'Tidak Ada Baterai' ticket(s)`);
  if (reach && isNum(s.eta_min)) why.push(`MBP ETA ${Math.round(s.eta_min)} min > BBT → site dark ~${Math.round(s.eta_min - (s.bbt_value_min || 0))} min before MBP arrives`);
  if (reach && !isNum(s.eta_min)) why.push("no road ETA (island / no MBP located)");
  if (isNum(age)) why.push(`battery ${age.toFixed(1)} yrs (${btype})`);
  if ((s.pln_freq || 0) > 0) why.push(`${Math.round(s.pln_freq)} PLN outages H1-2026 (${Math.round(s.pln_total_h || 0)} h)`);
  if ((s.avail_gap_pp || 0) > 0) why.push(`availability ${s.avail_wc_pct.toFixed(2)}% (${s.avail_gap_pp.toFixed(2)} pp below target)`);
  if (hub) why.push(`hub: ${s.hub_site} (~${s.dependency_children} children, PROXY)`);
  why.push(`class ${s.site_class}`);
  if (isNum(s.bbt_trend_min) && s.bbt_trend_min < -15) why.push(`BBT dropped ${Math.round(-s.bbt_trend_min)} min Apr–Jun vs Jan–Mar`);
  const bad = st === "Dead" || st === "Critical", prob = bad || st === "Degraded";
  let act;
  if (st === "Dead" && (s.tk_no_battery || 0) >= 1) act = "Replenishment (battery missing / no battery)";
  else if (prob && ev === "ESTIMATED") act = "Inspect & verify (capacity test) — BBT is estimated";
  else if (bad && isNum(age) && age >= lim) act = "Battery replacement";
  else if (prob && isNum(load) && load >= cfg.load_high_ampere) act = "Battery upgrade (add capacity)";
  else if (bad) act = isNum(age) ? "Inspect & capacity test → replace / upgrade" : "Battery replacement";
  else if (st === "Degraded" && (s.pln_freq || 0) >= plnHi) act = "Battery upgrade (add capacity)";
  else if (st === "Degraded") act = "Monitor (re-test next PM)";
  else if (reach && hub) act = "MBP standby + battery upgrade (hub goes dark before MBP arrives)";
  else act = "No action";
  const standby = (bad && (s.pln_freq || 0) >= plnHi) || (reach && hub) ? 1 : 0;
  return { recommended_action: act, reason: why.join("; "), mbp_standby_flag: standby };
}

/* ------------------------------------------------------------------ full live scoring */
export function applyScoring(sites, cfg) {
  const b = cfg.bbt, cs = cfg.class_score, R = cfg.mbp.max_radius_km, full = cfg.site_condition.full_gap_pp;
  const S = sites.map((s0) => {
    const s = { ...s0 };
    s.bbt_design_min = b.design_minutes;
    s.dependency_children = dependencyChildren(s.hub_site, cfg.dependency_children);
    s.eta_min = travelMinutes(s.km_assigned, s.is_urban, s.is_island, cfg);
    s.uncovered = !isNum(s.km_assigned) || s.km_assigned > R ? 1 : 0;
    s.eta_gap_min = isNum(s.eta_min) ? s.eta_min - (s.bbt_value_min || 0) : null;
    s.reach_risk = (s.eta_gap_min > 0 || !isNum(s.eta_min)) && (s.pln_freq || 0) > 0 ? 1 : 0;
    let st = statusOf(s.bbt_value_min, b);
    if ((s.tk_no_battery || 0) >= 1 && (!isNum(s.bbt_value_min) || s.bbt_value_min < b.degraded_pct * b.design_minutes)) st = "Dead";
    s.bbt_status = st;
    s.bbt_pct_design = isNum(s.bbt_value_min) ? Math.round((100 * s.bbt_value_min) / b.design_minutes) : null;
    return s;
  });
  const prFreq = pctRank(S.map((s) => s.pln_freq || 0));
  const prDur = pctRank(S.map((s) => s.pln_total_h || 0));
  const pr25 = pctRank(S.map((s) => s.outage_2025_h || 0));
  const prDep = pctRank(S.map((s) => s.mbp_deployments || 0));
  const classOf = (s) => cs[s.site_class] ?? cs.Unknown ?? 0.3;
  const cond = (s) => clip((s.avail_gap_pp || 0) / full, 0, 1);
  const mf = S.map((s, i) => ({
    class: classOf(s), dependency: clip(s.dependency_children || 0, 0, 15) / 15, outage_frequency: prFreq[i],
    travel_distance: isNum(s.km_assigned) ? clip(s.km_assigned, 0, R) / R : 1,
    eta_gap: isNum(s.eta_min) ? clip(Math.max(0, s.eta_gap_min) / b.design_minutes, 0, 1) : 1,
    site_condition: cond(s), vip: s.vip || 0, outage_duration: prDur[i], mbp_history: prDep[i],
  }));
  const ms = scoreRows(mf, cfg.mbp_priority, MBP_LABEL, cfg.priority_levels);
  const bf = S.map((s, i) => {
    let sev = isNum(s.bbt_value_min) ? 1 - clip(s.bbt_value_min / b.design_minutes, 0, 1) : 0.5;
    if (s.bbt_status === "Dead") sev = 1;
    return { bbt_severity: sev, pln_exposure: 0.5 * prFreq[i] + 0.35 * prDur[i] + 0.15 * pr25[i], class: classOf(s),
      dependency: clip(s.dependency_children || 0, 0, 15) / 15, site_condition: cond(s), vip: s.vip || 0 };
  });
  const bs = scoreRows(bf, cfg.bbs_priority, BBS_LABEL, cfg.bbs_priority_levels);
  const need = S.map((s) => ["Dead", "Critical", "Degraded"].includes(s.bbt_status) || (s.reach_risk === 1 && (s.dependency_children || 0) > 0));
  const plnHi = quantile(S.filter((s, i) => need[i]).map((s) => s.pln_freq || 0), 0.75);
  S.forEach((s, i) => {
    s.mbp_priority_score = ms[i].score; s.mbp_priority_level = ms[i].level; s.mbp_priority_drivers = ms[i].drivers;
    if (need[i]) {
      s.bbs_priority_score = bs[i].score; s.bbs_priority_level = bs[i].level; s.bbs_priority_drivers = bs[i].drivers;
      s.action_batch = cfg.action_batches[bs[i].level];
      Object.assign(s, actionFor(s, cfg, plnHi));
    } else {
      s.bbs_priority_score = null; s.bbs_priority_level = null; s.bbs_priority_drivers = null; s.action_batch = null;
      s.recommended_action = s.bbt_status === "OK" ? "No action" : "Collect data (no BBT info)";
      s.reason = null; s.mbp_standby_flag = 0;
    }
  });
  return S;
}

/* ------------------------------------------------------------------ MBP candidates & simulation */
export function candidatesFor(site, mbps, ctx, cfg, departHour, busy, extra = []) {
  let pool = mbps.filter((m) => isNum(m.lat) && (!cfg.mbp.same_nop_only || m.nop === site.nop));
  let crossNop = false;
  if (!pool.length) { pool = mbps.filter((m) => isNum(m.lat)); crossNop = true; }
  pool = pool.concat(extra);
  if (!isNum(site.lat)) return { list: [], crossNop };
  let c = pool.filter((m) => !busy.has(m.mbp_id)).map((m) => {
    const km = haversineKm(site.lat, site.lon, m.lat, m.lon);
    return { mbp_id: m.mbp_id, km, eta_min: travelMinutes(km, site.is_urban, site.is_island, cfg, departHour),
      served_n: ctx.fam.get(site.site_id + "|" + m.mbp_id) || 0, tickets: m.mbp_tickets_h1 || 0, is_new: !!m.is_new };
  });
  if (!c.length) return { list: [], crossNop };
  const w = normW(cfg.mbp_candidate);
  const maxEta = Math.max(...c.map((x) => x.eta_min || 0)) || 1, maxFam = Math.max(1, ...c.map((x) => x.served_n)), maxWl = Math.max(1, ...c.map((x) => x.tickets));
  c.forEach((x) => { x.cost = (w.eta || 0) * (isNum(x.eta_min) ? x.eta_min / maxEta : 1) - (w.familiarity || 0) * (x.served_n / maxFam) + (w.workload || 0) * (x.tickets / maxWl); });
  c.sort((a, b) => a.cost - b.cost || a.km - b.km);
  return { list: c, crossNop };
}

/** Greedy by priority: each site needing an MBP takes the best free candidate. One MBP = one site per run. */
export function simulate(sites, affectedIds, outageH, mbps, ctx, cfg, { departHour = null, busy = new Set(), extra = [], movedMbps = null } = {}) {
  const pool = movedMbps || mbps, outMin = outageH * 60;
  const byId = new Map(sites.map((s) => [s.site_id, s]));
  const aff = affectedIds.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => b.mbp_priority_score - a.mbp_priority_score);
  const used = new Set(busy), rows = [], cands = [];
  for (const s of aff) {
    const bbt = isNum(s.bbt_value_min) ? s.bbt_value_min : 0;
    const rec = { site_id: s.site_id, site_name: s.site_name, site_class: s.site_class, nop: s.nop, priority: s.mbp_priority_score,
      priority_level: s.mbp_priority_level, bbt_min: s.bbt_value_min, bbt_evidence: isNum(s.bbt_value_min) ? s.bbt_value_evidence : "UNAVAILABLE (assumed 0)",
      mbp_needed: outMin > bbt, mbp: null, km: null, eta_min: null, served_before: 0, outcome: "no_need", expected_down_min: 0, reasons: "" };
    if (rec.mbp_needed) {
      const { list, crossNop } = candidatesFor(s, pool, ctx, cfg, departHour, used, extra);
      cands.push({ site_id: s.site_id, top: list.slice(0, 5) });
      const free = list.filter((x) => isNum(x.eta_min));
      if (free.length) {
        const b0 = free[0]; used.add(b0.mbp_id);
        const late = Math.max(0, b0.eta_min - bbt);
        Object.assign(rec, { mbp: b0.mbp_id, km: b0.km, eta_min: b0.eta_min, served_before: b0.served_n,
          expected_down_min: Math.min(late, outMin - bbt), outcome: late === 0 ? "saved" : "late" });
        const why = [`priority ${s.mbp_priority_score.toFixed(2)} (${s.mbp_priority_level})`, `outage ${Math.round(outMin)} min > BBT ${Math.round(bbt)} min`,
          `best free MBP: ETA ${Math.round(b0.eta_min)} min, ${b0.km.toFixed(1)} km (ESTIMATED)`];
        if (b0.served_n > 0) why.push(`served this site ${b0.served_n}× in H1 (familiar)`);
        if (b0.is_new) why.push("new pre-positioned MBP (scenario C)");
        if (crossNop) why.push("no MBP located in this NOP → cross-NOP");
        if (free.length > 1) why.push(`next option ${free[1].mbp_id} ETA ${Math.round(free[1].eta_min)} min`);
        rec.reasons = why.join("; ");
      } else {
        const island = s.is_island === 1;
        Object.assign(rec, { outcome: island ? "unserved_island" : "unserved_busy", expected_down_min: outMin - bbt,
          reasons: island ? "island site: no road ETA — needs sea / crossing logistics (not modelled)" : "all candidate MBPs in scope are busy" });
      }
    }
    rows.push(rec);
  }
  return { rows, kpi: kpiOf(rows), cands };
}

export function kpiOf(rows) {
  const need = rows.filter((r) => r.mbp_needed), w = rows.reduce((a, r) => a + r.priority, 0) || 1;
  const etas = need.map((r) => r.eta_min).filter(isNum);
  const cnt = (o) => rows.filter((r) => r.outcome === o).length;
  return {
    sites_affected: rows.length, sites_need_mbp: need.length, saved: cnt("saved"), late: cnt("late"),
    unserved_busy: cnt("unserved_busy"), unserved_island: cnt("unserved_island"), no_mbp_needed: cnt("no_need"),
    avg_eta_min: etas.length ? etas.reduce((a, v) => a + v, 0) / etas.length : null, max_eta_min: etas.length ? Math.max(...etas) : null,
    expected_downtime_h: rows.reduce((a, r) => a + r.expected_down_min, 0) / 60,
    priority_weighted_coverage_pct: (100 * rows.reduce((a, r) => a + (r.outcome === "late" || r.outcome.startsWith("unserved") ? 0 : r.priority), 0)) / w,
  };
}

/** weighted k-means (lat/lon) for scenario C pre-positioning */
export function kmeans(pts, k, iters = 30) {
  if (!pts.length) return [];
  k = Math.min(k, pts.length);
  const sorted = [...pts].sort((a, b) => b.w - a.w);
  let cen = sorted.slice(0, k).map((p) => [p.lat, p.lon]);
  for (let it = 0; it < iters; it++) {
    const acc = cen.map(() => [0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      cen.forEach((c, i) => { const d = (p.lat - c[0]) ** 2 + (p.lon - c[1]) ** 2; if (d < bd) { bd = d; bi = i; } });
      acc[bi][0] += p.lat * p.w; acc[bi][1] += p.lon * p.w; acc[bi][2] += p.w;
    }
    cen = acc.map((a, i) => (a[2] ? [a[0] / a[2], a[1] / a[2]] : cen[i]));
  }
  return cen;
}

/* ------------------------------------------------------------------ base camp analysis (decision support) */
export function basecampSummary(sites, mbps) {
  const by = new Map();
  for (const s of sites) {
    if (!s.mbp_assigned) continue;
    const g = by.get(s.mbp_assigned) || { n: 0, p12: 0, km: 0, kmN: 0, eta: 0, etaN: 0, risk: 0, maxKm: 0 };
    g.n++; if (s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2") g.p12++;
    if (isNum(s.km_assigned)) { g.km += s.km_assigned; g.kmN++; g.maxKm = Math.max(g.maxKm, s.km_assigned); }
    if (isNum(s.eta_min)) { g.eta += s.eta_min; g.etaN++; }
    g.risk += s.reach_risk || 0;
    by.set(s.mbp_assigned, g);
  }
  const rows = mbps.map((m) => {
    const g = by.get(m.mbp_id) || { n: 0, p12: 0, km: 0, kmN: 0, eta: 0, etaN: 0, risk: 0, maxKm: 0 };
    return { mbp_id: m.mbp_id, nop: m.nop, coord_status: m.coord_status, lat: m.lat, lon: m.lon, sites_covered: g.n, p1_p2: g.p12,
      avg_km: g.kmN ? g.km / g.kmN : null, max_km: g.kmN ? g.maxKm : null, avg_eta_min: g.etaN ? g.eta / g.etaN : null,
      at_risk_sites: g.risk, deployments_h1: m.mbp_tickets_h1 || 0, run_hours_h1: m.mbp_run_hours_h1 || 0 };
  });
  const dep = rows.map((r) => r.deployments_h1), risk = rows.map((r) => r.at_risk_sites);
  const qHi = quantile(dep, 0.8), qLo = quantile(dep, 0.2), rHi = quantile(risk, 0.9);
  rows.forEach((r) => {
    r.load_signal = r.coord_status === "MISSING" ? "no location (cannot plan)"
      : r.deployments_h1 >= qHi || r.at_risk_sites >= rHi ? "under-served (high load / many at-risk sites)"
      : r.deployments_h1 <= qLo && r.p1_p2 <= 2 ? "possibly over-served (low load)" : "balanced";
  });
  return rows;
}

export function suggestBasecamps(sites, minSites = 5) {
  const by = new Map();
  for (const s of sites) {
    if (s.reach_risk !== 1 || !isNum(s.eta_min) || !isNum(s.lat) || s.is_island === 1) continue;
    if (s.mbp_priority_level !== "P1" && s.mbp_priority_level !== "P2") continue;
    (by.get(s.nop) || by.set(s.nop, []).get(s.nop)).push(s);
  }
  const out = [];
  for (const [nop, g] of by) {
    if (g.length < minSites) continue;
    const W = g.reduce((a, s) => a + s.mbp_priority_score, 0);
    const lat = g.reduce((a, s) => a + s.lat * s.mbp_priority_score, 0) / W, lon = g.reduce((a, s) => a + s.lon * s.mbp_priority_score, 0) / W;
    let best = g[0], bd = Infinity;
    for (const s of g) { const d = haversineKm(lat, lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } }
    out.push({ nop, at_risk_priority_sites: g.length, suggested_lat: lat, suggested_lon: lon, anchor_site: best.site_id, anchor_site_name: best.site_name,
      anchor_lat: best.lat, anchor_lon: best.lon, anchor_km_from_centre: bd, avg_eta_now_min: g.reduce((a, s) => a + s.eta_min, 0) / g.length });
  }
  return out.sort((a, b) => b.at_risk_priority_sites - a.at_risk_priority_sites);
}

/* ------------------------------------------------------------------ telemetry (FMC920 stub) */
export function deriveSessions(rows, sites, geofenceKm = 0.3) {
  const located = sites.filter((s) => isNum(s.lat));
  const by = new Map();
  rows.forEach((r) => (by.get(r.mbp_id) || by.set(r.mbp_id, []).get(r.mbp_id)).push(r));
  const out = [];
  for (const [mbp, g] of by) {
    g.sort((a, b) => a.ts.localeCompare(b.ts));
    let on = null;
    for (const r of g) {
      if (Number(r.power_state) === 1 && !on) on = r;
      if (Number(r.power_state) === 0 && on) {
        let best = null, bd = Infinity;
        for (const s of located) { const d = haversineKm(+on.lat, +on.lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } }
        out.push({ mbp_id: mbp, site_id: bd <= geofenceKm ? best.site_id : null, on_ts: on.ts, off_ts: r.ts,
          duration_h: (new Date(r.ts.replace(" ", "T")) - new Date(on.ts.replace(" ", "T"))) / 3.6e6, match_km: bd, evidence: "ACTUAL" });
        on = null;
      }
    }
  }
  return out;
}
