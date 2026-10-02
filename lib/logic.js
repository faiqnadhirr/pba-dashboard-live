// PBA rule engine — SINGLE SOURCE OF TRUTH for every decision shown in the dashboard, map, simulation, exports and tests.
// Python (engine/) only prepares evidence (cleaned data, Kaplan-Meier BBT). Every rule here is deterministic and explainable.
//
// Chain: Availability → Gap vs target → Cause of gap → Responsibility → Impact → Response (MBP + BBT survival) → Action

/* ================================================================== small math */
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => (isNum(v) ? Math.round(v * 10) / 10 : v);
export function haversineKm(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  const a = Math.sin(((la2 - la1) * p) / 2) ** 2 + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.sin(((lo2 - lo1) * p) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
/** pandas rank(pct=True, method="average") */
export function pctRank(vals) {
  const n = vals.length, idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
  const out = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && vals[idx[j + 1]] === vals[idx[i]]) j++;
    const r = (i + j + 2) / 2 / n;
    for (let k = i; k <= j; k++) out[idx[k]] = r;
    i = j + 1;
  }
  return out;
}
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
const PRIO_ORDER = { P1: 1, P2: 2, P3: 3, P4: 4 };
const LVL = (s, lv) => { s += 1e-9; return s >= lv.P1 ? "P1" : s >= lv.P2 ? "P2" : s >= lv.P3 ? "P3" : "P4"; };

/* ================================================================== labels (UI uses these — no duplicated strings) */
export const ACCESS_LABEL = { mainland: "Mainland", island: "Island", riverine_delta: "Riverine / delta", remote: "Remote / difficult access", unknown: "Unknown access" };
export const RESP = {
  utility: "PLN / Utility", internal: "Site / internal power system", battery: "Battery", generator: "Generator",
  vendor: "Vendor / maintenance (power lease)", operational: "Operational / response",
  utility_inferred: "PLN-triggered (inferred)", unknown: "Unknown",
};
export const RESP_POWER = ["utility", "internal", "battery", "generator", "vendor", "operational"];
export const CAUSE = { power: "Power", ran: "Network / RAN", transport: "Transmission / transport", other: "Other known", unknown: "Unknown / unclassified" };
export const STATUS_ORDER = ["Dead", "Critical", "Degraded", "Below design", "Meets design", "Unknown"];
export const PROBLEM = new Set(["Dead", "Critical", "Degraded"]);
export const MBP_LABEL = {
  class: "site class", dependency: "dependency (children, PROXY)", outage_frequency: "PLN outage frequency", travel_distance: "far from MBP",
  eta_gap: "MBP cannot arrive before battery runs out", site_condition: "availability below target", vip: "VIP site",
  outage_duration: "long PLN outages", mbp_history: "frequent MBP deployments",
};
export const BBS_LABEL = {
  bbt_severity: "BBT gap vs design", pln_exposure: "historical PLN outage", class: "site class",
  dependency: "dependency (children, PROXY)", site_condition: "availability below target", vip: "VIP site",
};

/* ================================================================== dependency proxy */
export function dependencyChildren(hub, mapping) {
  if (hub == null) return null;
  const key = String(hub).toLowerCase().replace(/[.…()<>+0-9]|sites|anakan|metro-e|radio ip|fo tsel/g, "").trim().replace(/\s+/g, " ");
  const mp = {};
  for (const [k, v] of Object.entries(mapping)) mp[k.toLowerCase()] = v;
  return key in mp ? Number(mp[key]) : null;
}

/* ================================================================== travel time (ESTIMATED) */
/** minutes, or null when there is no road access (island). `site` carries is_urban + access_class. */
export function travelMinutes(km, site, cfg, departHour = null) {
  if (!isNum(km)) return null;
  const acc = site.access_class || "unknown";
  if (acc === "island") return null;
  const t = cfg.travel, road = km * t.road_factor, sp = t.speed_kmh;
  const speed = site.is_urban ? sp.urban : road < 15 ? sp.rural_short : sp.rural_long;
  let mult = 1;
  if (departHour != null) {
    if (t.peak_hours.includes(departHour)) mult = site.is_urban ? t.peak_multiplier_urban : t.peak_multiplier_rural;
    else if (t.night_hours.includes(departHour)) mult = t.night_multiplier;
  }
  const am = (t.access_multiplier || {})[acc] ?? 1;
  return t.mobilization_minutes + (road / speed) * 60 * mult * am;
}
export const etaConfidence = (site) => (site.access_class === "island" ? "UNAVAILABLE (island — sea logistics)"
  : site.access_class === "riverine_delta" || site.access_class === "remote" ? "ESTIMATED · low confidence (difficult access)"
  : site.access_class === "unknown" ? "ESTIMATED · access class unknown" : "ESTIMATED");

/* ================================================================== 1. COVERAGE (radius is a HARD constraint) */
/** For every site: MBPs within the configured radius, the assigned MBP (rules below) and the nearest MBP at any distance.
 *  Assignment: (a) historical primary MBP if located within radius, else (b) nearest within radius in the same NOP,
 *  else (c) nearest within radius in another NOP. No MBP within radius → NOT covered (never assigned). */
export function computeCoverage(sites, mbps, cfg) {
  const R = cfg.mbp.max_radius_km, dLat = R / 110.574;
  const located = mbps.filter((m) => isNum(m.lat) && isNum(m.lon));
  const out = new Map();
  for (const s of sites) {
    if (!isNum(s.lat)) { out.set(s.site_id, { covered: 0, inRadius: [], basis: "site has no coordinates", nearest: null }); continue; }
    const dLon = R / (111.32 * Math.max(0.2, Math.cos((s.lat * Math.PI) / 180)));
    let nearest = null;
    const inR = [];
    for (const m of located) {
      const inBox = Math.abs(m.lat - s.lat) <= dLat && Math.abs(m.lon - s.lon) <= dLon;
      const km = haversineKm(s.lat, s.lon, m.lat, m.lon);
      if (!nearest || km < nearest.km) nearest = { mbp_id: m.mbp_id, km, nop: m.nop };
      if (inBox && km <= R) inR.push({ mbp_id: m.mbp_id, km, nop: m.nop });
    }
    inR.sort((a, b) => a.km - b.km);
    out.set(s.site_id, { covered: inR.length ? 1 : 0, inRadius: inR.slice(0, 15), nIn: inR.length, nearest,
      basis: inR.length ? null : `no MBP within ${R} km (nearest ${nearest ? nearest.mbp_id + " at " + nearest.km.toFixed(0) + " km" : "—"})` });
  }
  return out;
}

/** Assignment = same rule as the simulation: (1) radius, (2) MBPs that can arrive before BBT expires (hard constraint),
 *  (3) among those prefer the historical primary MBP, then same NOP, then nearest. If none can arrive in time → fallback to the
 *  earliest-arriving MBP within radius, flagged "no feasible MBP". */
export function assignMbp(s, c, cfg, bbtEff) {
  if (!c.inRadius.length) return { mbp: null, basis: c.basis, feasible: 0, nFeasible: 0 };
  const cand = c.inRadius.map((x) => ({ ...x, eta: travelMinutes(x.km, s, cfg) }));
  const road = cand.filter((x) => isNum(x.eta));
  if (!road.length) return { mbp: cand[0], basis: "within radius, but no road ETA (island)", feasible: 0, nFeasible: 0 };
  const feas = road.filter((x) => x.eta <= bbtEff);
  const pickFrom = (L, label) => {
    const hist = s.mbp_primary_hist && L.find((x) => x.mbp_id === s.mbp_primary_hist);
    if (hist) return [hist, `${label}: historical primary MBP`];
    const same = [...L].filter((x) => x.nop === s.nop).sort((a, b) => a.eta - b.eta)[0];
    if (same) return [same, `${label}: fastest MBP in NOP`];
    return [[...L].sort((a, b) => a.eta - b.eta)[0], `${label}: fastest MBP within radius (other NOP)`];
  };
  if (feas.length) {
    const [m, why] = pickFrom(feas, `arrives before BBT (${feas.length} of ${road.length} within radius)`);
    const histLate = s.mbp_primary_hist && road.find((x) => x.mbp_id === s.mbp_primary_hist && x.eta > bbtEff);
    return { mbp: m, feasible: 1, nFeasible: feas.length, basis: why + (histLate ? ` — historical MBP ${histLate.mbp_id} excluded (ETA ${Math.round(histLate.eta)} min > BBT)` : "") };
  }
  const m = [...road].sort((a, b) => a.eta - b.eta)[0];
  return { mbp: m, feasible: 0, nFeasible: 0, basis: `NO MBP can arrive before BBT — fallback: earliest arrival (${road.length} within radius)` };
}

/* ================================================================== 2. BATTERY STATUS (evidence precedence) */
// Precedence: 1 measured operational evidence (ACTUAL/DERIVED BBT) > 2 validated inspection (not in data) > 3 ticket > 4 derived inference > 5 estimate/proxy
export function statusOf(v, b) {
  if (!isNum(v)) return "Unknown";
  if (v <= b.dead_max_minutes) return "Dead";
  if (v < b.degraded_pct * b.design_minutes) return "Critical";
  if (v < b.ok_pct * b.design_minutes) return "Degraded";
  if (v < b.design_minutes) return "Below design";
  return "Meets design";
}
export function batteryAssessment(s, b) {
  const measured = s.bbt_value_evidence === "ACTUAL" || s.bbt_value_evidence === "DERIVED";
  const ticket = (s.tk_no_battery || 0) >= 1;
  let status = statusOf(s.bbt_value_min, b), source = s.bbt_value_evidence || "UNAVAILABLE", conflict = null, precedence;
  if (measured) {
    precedence = `level 1 — measured BBT (${s.bbt_value_evidence})`;
    if (ticket && status !== "Dead") conflict = `${s.tk_no_battery} 'Tidak Ada Baterai' ticket(s) conflict with measured BBT ${Math.round(s.bbt_value_min)} min — measured operational evidence takes precedence over ticket evidence; verify ticket on site.`;
  } else if (ticket) {
    status = "Dead"; source = "TICKET";
    precedence = "level 3 — ticket evidence ('Tidak Ada Baterai'); no measured BBT";
    if (isNum(s.bbt_value_min)) conflict = `Estimated BBT ${Math.round(s.bbt_value_min)} min ignored: ticket evidence (level 3) outranks an estimate (level 5).`;
  } else precedence = s.bbt_value_evidence === "ESTIMATED" ? "level 5 — estimate (comparable-site Kaplan-Meier)" : "no battery evidence";
  return { status, source, conflict, precedence, measured, ticket };
}

/* ================================================================== 3. AVAILABILITY, GAP and CAUSE (DERIVED from RAN, wall-clock) */
/** Decompose downtime hours into causes; proportional attribution of the gap vs target. Works for one site or a sum of sites. */
export function availabilityOf(h) {
  // h: {hours, outage, power, transport, ran, other, targetHours (Σ target% × hours)}
  if (!isNum(h.hours) || h.hours <= 0) return { available: false };
  const avail = 100 * (1 - h.outage / h.hours), target = h.targetHours / h.hours, gap = avail - target;
  const known = { power: h.power || 0, transport: h.transport || 0, ran: h.ran || 0, other: h.other || 0 };
  const sumKnown = known.power + known.transport + known.ran + known.other;
  let overlap = false, scale = 1, unknown = Math.max(0, h.outage - sumKnown);
  if (sumKnown > h.outage + 1e-6) { overlap = true; scale = h.outage / sumKnown; unknown = 0; }
  const cause = {};
  for (const k of Object.keys(known)) cause[k] = known[k] * scale;
  cause.unknown = unknown;
  const contrib = {};
  if (gap < 0 && h.outage > 0) for (const k of Object.keys(cause)) contrib[k] = (gap * cause[k]) / h.outage;
  return { available: true, avail, target, gap, outage: h.outage, hours: h.hours, cause, contrib, overlap,
    powerSharePct: h.outage > 0 ? (100 * cause.power) / h.outage : 0 };
}
const siteHours = (s) => ({
  hours: s.ran_hours, outage: s.ran_outage_h, power: s.ran_power_down_h, transport: s.ran_transport_down_h, ran: s.ran_ran_down_h,
  other: s.ran_other_down_h, targetHours: isNum(s.ran_target_pct) && isNum(s.ran_hours) ? s.ran_target_pct * s.ran_hours : null,
});
export function aggregateAvailability(sites) {
  const h = { hours: 0, outage: 0, power: 0, transport: 0, ran: 0, other: 0, targetHours: 0 };
  let n = 0;
  for (const s of sites) {
    if (!isNum(s.ran_hours) || !isNum(s.ran_target_pct)) continue;
    n++; h.hours += s.ran_hours; h.outage += s.ran_outage_h || 0; h.power += s.ran_power_down_h || 0; h.transport += s.ran_transport_down_h || 0;
    h.ran += s.ran_ran_down_h || 0; h.other += s.ran_other_down_h || 0; h.targetHours += s.ran_target_pct * s.ran_hours;
  }
  return { ...availabilityOf(h), sitesWithData: n };
}

/* ================================================================== 4. RESPONSIBILITY for power downtime */
export function responsibilityOf(s) {
  const pd = s.ran_power_down_h || 0;
  const counts = {}; let n = 0;
  for (const k of RESP_POWER) { counts[k] = s["rc_" + k] || 0; n += counts[k]; }
  if (n > 0) {
    const shares = {}; let primary = null;
    for (const k of RESP_POWER) { shares[k] = counts[k] / n; if (!primary || counts[k] > counts[primary]) primary = k; }
    return { primary, kind: "OBSERVED", evidence: "ACTUAL", shares, n, powerDownH: pd,
      why: `${n} power ticket(s) with root cause recorded (${RESP_POWER.filter((k) => counts[k]).map((k) => `${RESP[k]} ${counts[k]}`).join(", ")}); majority = ${RESP[primary]}.` };
  }
  if (pd > 0 && (s.evt_total || 0) > 0)
    return { primary: "utility_inferred", kind: "INFERRED", evidence: "DERIVED", shares: { utility_inferred: 1 }, n: 0, powerDownH: pd,
      why: `${s.evt_total} mains-fail alarm(s) recorded and ${pd.toFixed(1)} h power downtime, but no ticket root cause. PLN triggered the outage; why backup did not bridge it is not recorded — responsibility not confirmed.` };
  if (pd > 0) return { primary: "unknown", kind: "UNKNOWN", evidence: "UNAVAILABLE", shares: { unknown: 1 }, n: 0, powerDownH: pd,
    why: "Power downtime exists, but no ticket or alarm record identifies the responsible party." };
  return { primary: null, kind: "NONE", evidence: "DERIVED", shares: {}, n: 0, powerDownH: 0, why: "No power downtime recorded." };
}
export function aggregateResponsibility(sites) {
  const hours = {}; for (const k of [...RESP_POWER, "utility_inferred", "unknown"]) hours[k] = 0;
  const sitesBy = { ...hours };
  for (const s of sites) {
    const r = s.resp || responsibilityOf(s);
    if (!r.primary) continue;
    for (const [k, v] of Object.entries(r.shares)) hours[k] += v * r.powerDownH;
    sitesBy[r.primary] += 1;
  }
  return { hours, sites: sitesBy, total: Object.values(hours).reduce((a, v) => a + v, 0) };
}

/* ================================================================== 5. SCORING */
function scoreRows(factors, weights, labels, levels) {
  const w = normW(weights), keys = Object.keys(w);
  return factors.map((f) => {
    const contrib = keys.filter((k) => f[k] != null).map((k) => [k, f[k] * w[k]]);
    const raw = contrib.reduce((a, [, v]) => a + v, 0);
    const top = contrib.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${labels[k] || k} (${v.toFixed(2)})`).join(", ");
    return { score: Math.round(raw * 1e4) / 1e4, level: LVL(raw, levels), drivers: top, parts: Object.fromEntries(contrib) };
  });
}

/* ================================================================== 6. ACTION RULES (deterministic, evidence = Metric → Value → Threshold → Rule) */
const ev = (metric, value, threshold, rule) => ({ metric, value, threshold, rule });
export function actionFor(s, cfg, plnHi) {
  const b = cfg.bbt, design = b.design_minutes, st = s.bbt_status, A = s.battery;
  const btype = s.battery_type || "OTHER", ages = cfg.battery_age_replace_years;
  const lim = btype === "MIXED" ? ages.VRLA : ages[btype] ?? ages.OTHER;
  const age = s.battery_age_y, load = s.load_a, hub = (s.dependency_children || 0) > 0, P = s.bbs_priority_level;
  const loadHi = isNum(load) && load >= cfg.load_high_ampere, aged = isNum(age) && age >= lim, plnHigh = (s.pln_freq || 0) >= plnHi;
  const E = [];
  const bbtTxt = isNum(s.bbt_value_min) ? `${Math.round(s.bbt_value_min)} min (${Math.round((100 * s.bbt_value_min) / design)}% of design, ${s.bbt_value_evidence})` : "unknown";
  E.push(ev("BBT", bbtTxt, `design ${design} min · Critical < ${b.degraded_pct * 100}% · Degraded < ${b.ok_pct * 100}%`, `Battery status = ${st} (${A.precedence})`));
  if (A.conflict) E.push(ev("Evidence conflict", "ticket vs measurement", "precedence: measured > inspection > ticket > derived > estimate", A.conflict));
  let action, rule;
  if (st === "Dead" && A.source === "TICKET") {
    action = "Replenishment — install battery (reported missing)"; rule = "R1: no measured BBT + 'Tidak Ada Baterai' ticket";
    E.push(ev("'Tidak Ada Baterai' tickets", s.tk_no_battery, "≥ 1", rule));
  } else if (PROBLEM.has(st) && s.bbt_value_evidence === "ESTIMATED") {
    action = "Inspect & verify (capacity test) — BBT is estimated"; rule = "R2: problem status based on an ESTIMATE → never replace on an estimate";
    E.push(ev("BBT evidence", "ESTIMATED", "replacement requires ACTUAL/DERIVED", rule));
  } else if (st === "Dead") {
    action = loadHi ? "Battery replacement with higher capacity" : "Battery replacement"; rule = loadHi ? "R3b: measured Dead + NE load above threshold" : "R3: measured Dead (battery does not hold)";
    E.push(ev("Measured BBT", `${Math.round(s.bbt_value_min)} min`, `≤ ${b.dead_max_minutes} min`, rule));
    if (loadHi) E.push(ev("NE load", `${load} A`, `≥ ${cfg.load_high_ampere} A`, "size replacement for the load"));
  } else if (st === "Critical" && aged) {
    action = "Battery replacement"; rule = "R4: measured Critical + battery at/over replacement age";
    E.push(ev("Battery age", `${age.toFixed(1)} y (${btype})`, `≥ ${lim} y`, rule));
  } else if ((st === "Critical" || st === "Degraded") && loadHi) {
    action = "Battery upgrade (add capacity)"; rule = "R5: battery works but is undersized for the load";
    E.push(ev("NE load", `${load} A`, `≥ ${cfg.load_high_ampere} A`, rule));
  } else if (st === "Critical") {
    action = isNum(age) ? "Capacity test → replace / upgrade" : "Battery replacement"; rule = isNum(age) ? "R6: measured Critical, battery younger than replacement age" : "R6b: measured Critical, battery age unknown";
    E.push(ev("Battery age", isNum(age) ? `${age.toFixed(1)} y` : "unknown", `${lim} y`, rule));
  } else if (st === "Degraded" && plnHigh) {
    action = "Battery upgrade (add capacity)"; rule = "R7: Degraded + PLN outage frequency in top quartile";
    E.push(ev("PLN outages", Math.round(s.pln_freq), `≥ ${Math.round(plnHi)} (top quartile)`, rule));
  } else if (st === "Degraded" && (P === "P1" || P === "P2")) {
    action = "Capacity test → replace / upgrade"; rule = "R8: Degraded at P1/P2 — monitoring is not allowed for a high priority";
    E.push(ev("Priority", P, "P1/P2 → active intervention", rule));
  } else if (st === "Degraded") {
    action = "Monitor — re-test at next PM"; rule = "R9: Degraded, low priority (P3/P4), PLN exposure not high";
    E.push(ev("Priority", P, "P3/P4", rule));
  } else if (s.reach_risk && hub) {
    action = "MBP standby + battery upgrade (hub goes dark before MBP arrives)"; rule = "R10: hub with ETA > BBT (combined MBP–BBS rule)";
    E.push(ev("MBP ETA vs BBT", isNum(s.eta_min) ? `${Math.round(s.eta_min)} min vs ${Math.round(s.bbt_value_min || 0)} min` : "no MBP within radius / no road ETA",
      "ETA ≤ BBT", rule));
    E.push(ev("Dependency", `${s.dependency_children} children (PROXY)`, "> 0 = hub", rule));
  } else { action = "No action"; rule = "R0"; }
  if ((s.avail_gap_pp ?? 0) > 0) E.push(ev("Availability", `${s.avail_wc_pct.toFixed(2)}%`, `target ${s.ran_target_pct.toFixed(2)}% (gap −${s.avail_gap_pp.toFixed(2)} pp)`, "raises BBS priority (site condition)"));
  if (s.priority_floor) E.push(ev("Priority floor", s.priority_floor, cfg.severity_floor.measured_dead_critical, "measured Dead/Critical cannot be below this priority"));
  const standby = (st === "Dead" || st === "Critical") && plnHigh ? 1 : s.reach_risk && hub ? 1 : 0;
  const why = E.map((e) => `${e.metric}: ${e.value} (threshold ${e.threshold})`).join("; ");
  return { recommended_action: action, rule, evidence: E, reason: why, mbp_standby_flag: standby };
}

/* ================================================================== 7. FULL MODEL — one call, used by every tab */
export function buildModel(rawSites, mbps, cfg) {
  const b = cfg.bbt, cs = cfg.class_score, R = cfg.mbp.max_radius_km, full = cfg.site_condition.full_gap_pp;
  const cov = computeCoverage(rawSites, mbps, cfg);
  const S = rawSites.map((s0) => {
    const s = { ...s0 };
    const c = cov.get(s.site_id);
    s.coverage = c;
    s.covered = c.covered;
    s.mbps_in_radius = c.nIn || 0;
    s.nearest_mbp = c.nearest ? c.nearest.mbp_id : null;
    s.nearest_mbp_km = c.nearest ? c.nearest.km : null;
    s.dependency_children = dependencyChildren(s.hub_site, cfg.dependency_children);
    s.battery = batteryAssessment(s, b);
    s.bbt_status = s.battery.status;
    s.bbt_pct_design = isNum(s.bbt_value_min) ? Math.round((100 * s.bbt_value_min) / b.design_minutes) : null;
    const bbtEff = s.bbt_status === "Dead" ? 0 : isNum(s.bbt_value_min) ? s.bbt_value_min : 0;
    s.bbt_effective_min = bbtEff;
    const a = assignMbp(s, c, cfg, bbtEff);
    s.mbp_assigned = a.mbp ? a.mbp.mbp_id : null;
    s.km_assigned = a.mbp ? a.mbp.km : null;
    s.assignment_basis = a.basis;
    s.feasible_mbps = a.nFeasible;
    s.eta_min = a.mbp && isNum(a.mbp.eta) ? a.mbp.eta : null;
    s.eta_confidence = etaConfidence(s);
    s.can_arrive_before_bbt = a.feasible;
    s.eta_gap_min = isNum(s.eta_min) ? s.eta_min - bbtEff : null;
    s.reach_risk = (s.pln_freq || 0) > 0 && !s.can_arrive_before_bbt ? 1 : 0;
    const av = availabilityOf(siteHours(s));
    s.av = av;
    s.avail_wc_pct = av.available ? av.avail : null;
    s.ran_target_pct = av.available ? av.target : s.ran_target_pct;
    s.avail_gap_pp = av.available ? Math.max(0, -av.gap) : null;          // shortfall (pp, positive = below target)
    s.avail_delta_pp = av.available ? av.gap : null;                        // signed (negative = below target)
    s.resp = responsibilityOf(s);
    return s;
  });
  const prFreq = pctRank(S.map((s) => s.pln_freq || 0)), prDur = pctRank(S.map((s) => s.pln_total_h || 0));
  const pr25 = pctRank(S.map((s) => s.outage_2025_h || 0)), prDep = pctRank(S.map((s) => s.mbp_deployments || 0));
  const classOf = (s) => cs[s.site_class] ?? cs.Unknown ?? 0.3;
  const cond = (s) => clip((s.avail_gap_pp || 0) / full, 0, 1);
  const mf = S.map((s, i) => ({
    class: classOf(s), dependency: clip(s.dependency_children || 0, 0, 15) / 15, outage_frequency: prFreq[i],
    travel_distance: s.covered ? clip(s.km_assigned, 0, R) / R : 1,
    eta_gap: s.covered && isNum(s.eta_min) ? clip(Math.max(0, s.eta_gap_min) / b.design_minutes, 0, 1) : 1,
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
  const need = S.map((s) => PROBLEM.has(s.bbt_status) || (s.reach_risk === 1 && (s.dependency_children || 0) > 0));
  const plnHi = quantile(S.filter((s, i) => need[i]).map((s) => s.pln_freq || 0), 0.75);
  const floor = cfg.severity_floor?.measured_dead_critical || "P2";
  S.forEach((s, i) => {
    s.mbp_priority_score = ms[i].score; s.mbp_priority_level = ms[i].level; s.mbp_priority_drivers = ms[i].drivers; s.mbp_parts = ms[i].parts;
    if (need[i]) {
      let lvl = bs[i].level; s.priority_floor = null;
      if (s.battery.measured && (s.bbt_status === "Dead" || s.bbt_status === "Critical") && PRIO_ORDER[lvl] > PRIO_ORDER[floor]) { s.priority_floor = lvl; lvl = floor; }
      s.bbs_priority_score = bs[i].score; s.bbs_priority_level = lvl; s.bbs_priority_drivers = bs[i].drivers;
      s.action_batch = cfg.action_batches[lvl];
      Object.assign(s, actionFor(s, cfg, plnHi));
    } else {
      s.bbs_priority_score = null; s.bbs_priority_level = null; s.bbs_priority_drivers = null; s.action_batch = null; s.priority_floor = null;
      s.recommended_action = s.bbt_status === "Unknown" ? "Collect data (no BBT evidence)" : "No action";
      s.rule = s.bbt_status === "Unknown" ? "R-data" : "R0"; s.evidence = []; s.reason = null; s.mbp_standby_flag = 0;
    }
  });
  return S;
}

/* ================================================================== 8. MBP SELECTION (survival is a HARD constraint) */
export function candidatesFor(site, mbps, ctx, cfg, departHour, busy, extra = []) {
  const R = cfg.mbp.max_radius_km;
  if (!isNum(site.lat)) return { list: [], inRadius: 0 };
  const pool = mbps.filter((m) => isNum(m.lat)).concat(extra);
  let c = pool.map((m) => {
    const km = haversineKm(site.lat, site.lon, m.lat, m.lon);
    return { mbp_id: m.mbp_id, km, eta_min: travelMinutes(km, site, cfg, departHour), served_n: ctx.fam.get(site.site_id + "|" + m.mbp_id) || 0,
      tickets: m.mbp_tickets_h1 || 0, is_new: !!m.is_new, busy: busy.has(m.mbp_id), same_nop: m.nop === site.nop };
  }).filter((x) => x.km <= R);
  const inRadius = c.length;
  c = c.filter((x) => !x.busy);
  if (!c.length) return { list: [], inRadius };
  const w = normW(cfg.mbp_candidate);
  const maxEta = Math.max(...c.map((x) => x.eta_min || 0)) || 1, maxFam = Math.max(1, ...c.map((x) => x.served_n)), maxWl = Math.max(1, ...c.map((x) => x.tickets));
  c.forEach((x) => { x.cost = (w.eta || 0) * (isNum(x.eta_min) ? x.eta_min / maxEta : 1) - (w.familiarity || 0) * (x.served_n / maxFam) + (w.workload || 0) * (x.tickets / maxWl); });
  return { list: c, inRadius };
}
/** Step 1 radius · Step 2 exclude MBPs that cannot arrive before BBT expires (if any can) · Step 3 score feasible ones · Step 4 fallback = earliest arrival */
export function selectMbp(list, bbtMin) {
  const road = list.filter((x) => isNum(x.eta_min));
  if (!road.length) return { pick: null, feasible: [], mode: "none" };
  const feasible = road.filter((x) => x.eta_min <= bbtMin).sort((a, b) => a.cost - b.cost || a.eta_min - b.eta_min);
  if (feasible.length) return { pick: feasible[0], feasible, mode: "feasible", alternatives: road.length - feasible.length };
  const fb = [...road].sort((a, b) => a.eta_min - b.eta_min || a.cost - b.cost);
  return { pick: fb[0], feasible: [], mode: "fallback" };
}
/** Two passes, both in priority order: pass 1 assigns only MBPs that arrive before BBT (saves sites);
 *  pass 2 gives the remaining free MBPs to the sites nobody can save in time (earliest arrival = least dark time).
 *  This stops a hopeless high-priority site from taking the only MBP that could have saved another site. */
export function simulate(sites, affectedIds, outageH, mbps, ctx, cfg, { departHour = null, busy = new Set(), extra = [], movedMbps = null } = {}) {
  const pool = movedMbps || mbps, outMin = outageH * 60, R = cfg.mbp.max_radius_km;
  const byId = new Map(sites.map((s) => [s.site_id, s]));
  const aff = affectedIds.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => b.mbp_priority_score - a.mbp_priority_score);
  const used = new Set(busy), cands = [];
  const rows = aff.map((s) => {
    const bbt = s.bbt_status === "Dead" ? 0 : isNum(s.bbt_value_min) ? s.bbt_value_min : 0;
    return { _s: s, site_id: s.site_id, site_name: s.site_name, site_class: s.site_class, nop: s.nop, priority: s.mbp_priority_score,
      priority_level: s.mbp_priority_level, bbt_min: bbt, bbt_evidence: s.bbt_status === "Dead" && s.battery.source === "TICKET" ? "TICKET (no battery)" : isNum(s.bbt_value_min) ? s.bbt_value_evidence : "UNAVAILABLE (assumed 0)",
      access: ACCESS_LABEL[s.access_class], mbp_needed: outMin > bbt, mbp: null, km: null, eta_min: null, served_before: 0, feasible: null,
      outcome: "no_need", expected_down_min: 0, reasons: "outage shorter than battery backup" };
  });
  const take = (rec, p, mode, inRadius, nFeas, slower) => {
    used.add(p.mbp_id);
    const late = Math.max(0, p.eta_min - rec.bbt_min);
    Object.assign(rec, { mbp: p.mbp_id, km: p.km, eta_min: p.eta_min, served_before: p.served_n, feasible: mode === "feasible",
      expected_down_min: Math.min(late, outMin - rec.bbt_min), outcome: late === 0 ? "saved" : "late" });
    const why = [`step 1: ${inRadius} MBP(s) within ${R} km`];
    if (mode === "feasible") {
      why.push(`step 2: ${nFeas} free MBP(s) can arrive before BBT ${Math.round(rec.bbt_min)} min (hard constraint)${slower ? `, ${slower} slower excluded` : ""}`);
      why.push(`step 3: chosen ${p.mbp_id} — ETA ${Math.round(p.eta_min)} min, ${p.km.toFixed(1)} km${p.served_n ? `, served this site ${p.served_n}× (familiar)` : ""}`);
    } else {
      why.push(`step 2: NO free MBP can arrive before BBT ${Math.round(rec.bbt_min)} min`);
      why.push(`step 4 fallback (after all savable sites were served): earliest arrival ${p.mbp_id} — ETA ${Math.round(p.eta_min)} min → site dark ~${Math.round(late)} min`);
    }
    if (p.is_new) why.push("new pre-positioned MBP (scenario C)");
    rec.reasons = why.join("; ");
  };
  const need = rows.filter((r) => r.mbp_needed);
  // pass 1 — feasible only
  for (const rec of need) {
    const { list, inRadius } = candidatesFor(rec._s, pool, ctx, cfg, departHour, used, extra);
    cands.push({ site_id: rec.site_id, top: [...list].sort((a, b) => (a.eta_min ?? 1e9) - (b.eta_min ?? 1e9)).slice(0, 5) });
    const sel = selectMbp(list, rec.bbt_min);
    if (sel.mode === "feasible") take(rec, sel.pick, "feasible", inRadius, sel.feasible.length, sel.alternatives);
  }
  // pass 2 — fallback for the rest
  for (const rec of need) {
    if (rec.mbp) continue;
    const s = rec._s;
    const { list, inRadius } = candidatesFor(s, pool, ctx, cfg, departHour, used, extra);
    const sel = selectMbp(list, rec.bbt_min);
    if (sel.pick) { take(rec, sel.pick, sel.mode, inRadius, sel.feasible.length, sel.alternatives); continue; }
    const island = s.access_class === "island", noCov = !inRadius;
    Object.assign(rec, { outcome: island ? "unserved_island" : noCov ? "unserved_no_coverage" : "unserved_busy", expected_down_min: outMin - rec.bbt_min,
      reasons: island ? "island site: no road ETA — needs sea / crossing logistics (not modelled)"
        : noCov ? `no MBP within ${R} km coverage radius` : "all MBPs within radius are busy" });
  }
  rows.forEach((r) => delete r._s);
  return { rows, kpi: kpiOf(rows), cands };
}
export function kpiOf(rows) {
  const need = rows.filter((r) => r.mbp_needed), w = rows.reduce((a, r) => a + r.priority, 0) || 1;
  const etas = need.map((r) => r.eta_min).filter(isNum);
  const cnt = (o) => rows.filter((r) => r.outcome === o).length;
  return {
    sites_affected: rows.length, sites_need_mbp: need.length, saved: cnt("saved"), late: cnt("late"),
    unserved_busy: cnt("unserved_busy"), unserved_no_coverage: cnt("unserved_no_coverage"), unserved_island: cnt("unserved_island"), no_mbp_needed: cnt("no_need"),
    no_feasible: rows.filter((r) => r.feasible === false).length,
    avg_eta_min: etas.length ? etas.reduce((a, v) => a + v, 0) / etas.length : null, max_eta_min: etas.length ? Math.max(...etas) : null,
    expected_downtime_h: rows.reduce((a, r) => a + r.expected_down_min, 0) / 60,
    priority_weighted_coverage_pct: (100 * rows.reduce((a, r) => a + (r.outcome === "saved" || r.outcome === "no_need" ? r.priority : 0), 0)) / w,
  };
}
export function kmeans(pts, k, iters = 30) {
  if (!pts.length) return [];
  k = Math.min(k, pts.length);
  let cen = [...pts].sort((a, b) => b.w - a.w).slice(0, k).map((p) => [p.lat, p.lon]);
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

/* ================================================================== 9. BASE CAMP SIGNAL (transparent multi-criteria) */
export function basecampSummary(sites, mbps, cfg) {
  const bc = cfg.basecamp_signal, R = cfg.mbp.max_radius_km;
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
      at_risk_sites: g.risk, risk_share: g.n ? g.risk / g.n : 0, deployments_h1: m.mbp_tickets_h1 || 0, run_hours_h1: m.mbp_run_hours_h1 || 0, radius_km: R };
  });
  const wlHi = quantile(rows.filter((r) => r.coord_status !== "MISSING").map((r) => r.deployments_h1), bc.workload_quantile);
  const wlLo = quantile(rows.filter((r) => r.coord_status !== "MISSING").map((r) => r.deployments_h1), 1 - bc.workload_quantile);
  rows.forEach((r) => {
    const crit = [];
    if (r.p1_p2 >= bc.p1p2_sites_min) crit.push(`${r.p1_p2} P1/P2 sites ≥ ${bc.p1p2_sites_min}`);
    if (r.sites_covered && r.risk_share >= bc.reach_risk_share_min) crit.push(`${Math.round(100 * r.risk_share)}% sites dark before MBP ≥ ${Math.round(100 * bc.reach_risk_share_min)}%`);
    if (isNum(r.avg_eta_min) && r.avg_eta_min >= bc.avg_eta_min) crit.push(`avg ETA ${Math.round(r.avg_eta_min)} min ≥ ${bc.avg_eta_min}`);
    if (r.deployments_h1 >= wlHi && wlHi > 0) crit.push(`workload ${r.deployments_h1} deployments ≥ p${Math.round(bc.workload_quantile * 100)} (${Math.round(wlHi)})`);
    r.signal_criteria = crit;
    r.load_signal = r.coord_status === "MISSING" ? "No location (cannot plan)"
      : crit.length >= bc.criteria_needed ? "Under-served"
      : r.deployments_h1 <= wlLo && r.p1_p2 <= bc.overserved_max_p1p2 && (r.avg_eta_min ?? 0) < 30 ? "Possibly over-served"
      : r.sites_covered === 0 ? "No sites within radius" : "Balanced";
    r.signal_why = r.coord_status === "MISSING" ? "base camp has no coordinates"
      : crit.length ? `${crit.length}/${4} criteria met (need ${bc.criteria_needed}): ${crit.join("; ")}` : "no under-served criterion met";
  });
  return rows;
}
export function suggestBasecamps(sites, minSites = 5) {
  const by = new Map();
  for (const s of sites) {
    if (s.reach_risk !== 1 || !isNum(s.lat) || s.access_class === "island") continue;
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
    out.push({ nop, at_risk_priority_sites: g.length, uncovered: g.filter((s) => !s.covered).length, suggested_lat: lat, suggested_lon: lon,
      anchor_site: best.site_id, anchor_site_name: best.site_name, anchor_lat: best.lat, anchor_lon: best.lon, anchor_decimals: best.coord_decimals,
      anchor_km_from_centre: bd, avg_eta_now_min: (() => { const e = g.map((s) => s.eta_min).filter(isNum); return e.length ? e.reduce((a, v) => a + v, 0) / e.length : null; })() });
  }
  return out.sort((a, b) => b.at_risk_priority_sites - a.at_risk_priority_sites);
}

/* ================================================================== 10. IMPACT: worst clusters, trend, top 15 */
const darkIn = (powerH, cfg) => (powerH || 0) >= cfg.availability.dark_power_h;
const periodAvail = (sites, q) => {
  let hrs = 0, out = 0, tgt = 0;
  for (const s of sites) { const h = s[q + "_hours"]; if (!isNum(h) || h <= 0) continue; hrs += h; out += s[q + "_outage_h"] || 0; tgt += (s.ran_target_pct || 0) * h; }
  return hrs ? { avail: 100 * (1 - out / hrs), target: tgt / hrs, hours: hrs } : null;
};
export function clusterTable(sites, cfg) {
  const by = new Map();
  for (const s of sites) { if (!s.cluster_to) continue; (by.get(s.cluster_to) || by.set(s.cluster_to, []).get(s.cluster_to)).push(s); }
  const rows = [];
  for (const [cluster, g] of by) {
    const av = aggregateAvailability(g);
    const dark = g.filter((s) => darkIn(s.ran_power_down_h, cfg));
    const powerH = g.reduce((a, s) => a + (s.ran_power_down_h || 0), 0);
    const q1 = periodAvail(g, "q1"), q2 = periodAvail(g, "q2");
    const d1 = g.filter((s) => darkIn(s.q1_power_h, cfg)).length, d2 = g.filter((s) => darkIn(s.q2_power_h, cfg)).length;
    const p1 = g.reduce((a, s) => a + (s.q1_power_h || 0), 0), p2 = g.reduce((a, s) => a + (s.q2_power_h || 0), 0);
    const withBoth = g.filter((s) => isNum(s.q1_hours) && s.q1_hours > 0 && isNum(s.q2_hours) && s.q2_hours > 0).length;
    let trend = "Insufficient data", trendWhy = `${withBoth} sites with data in both periods (< ${cfg.availability.min_cluster_sites})`;
    if (q1 && q2 && withBoth >= cfg.availability.min_cluster_sites) {
      const dA = q2.avail - q1.avail, dD = d2 - d1;
      if (dA <= -cfg.availability.trend_pp || dD >= cfg.availability.trend_dark_sites) trend = "Deteriorating";
      else if (dA >= cfg.availability.trend_pp || dD <= -cfg.availability.trend_dark_sites) trend = "Improving";
      else trend = "Stable";
      trendWhy = `availability ${q1.avail.toFixed(2)}% → ${q2.avail.toFixed(2)}% (${dA >= 0 ? "+" : ""}${dA.toFixed(2)} pp), dark sites ${d1} → ${d2}; thresholds ±${cfg.availability.trend_pp} pp or ±${cfg.availability.trend_dark_sites} dark sites`;
    }
    rows.push({
      cluster, nop: g[0].nop, sites: g.length, dark_sites: dark.length, share_dark: g.length ? dark.length / g.length : 0,
      power_down_h: powerH, power_per_site_h: g.length ? powerH / g.length : 0, avail: av.available ? av.avail : null, target: av.available ? av.target : null,
      gap_pp: av.available ? av.gap : null, power_contrib_pp: av.available ? av.contrib.power ?? 0 : null,
      p1p2_dark: dark.filter((s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2").length,
      q1_avail: q1?.avail ?? null, q2_avail: q2?.avail ?? null, delta_pp: q1 && q2 ? q2.avail - q1.avail : null,
      q1_dark: d1, q2_dark: d2, q1_power_h: p1, q2_power_h: p2, trend, trend_why: trendWhy, small: g.length < cfg.availability.min_cluster_sites,
    });
  }
  const big = rows.filter((r) => !r.small && r.avail != null);
  const ranks = (f) => { const v = pctRank(big.map(f)); return new Map(big.map((r, i) => [r.cluster, v[i]])); };
  const w = normW(cfg.worst_cluster_weights);
  const rk = { share_dark: ranks((r) => r.share_dark), power_downtime_per_site: ranks((r) => r.power_per_site_h), availability_gap: ranks((r) => -(r.gap_pp ?? 0)),
    p1p2_dark_share: ranks((r) => (r.dark_sites ? r.p1p2_dark / r.sites : 0)) };
  for (const r of rows) {
    if (r.small || r.avail == null) { r.severity = null; r.severity_parts = null; continue; }
    r.severity_parts = Object.fromEntries(Object.keys(w).map((k) => [k, rk[k].get(r.cluster) * w[k]]));
    r.severity = Object.values(r.severity_parts).reduce((a, v) => a + v, 0);
  }
  return rows;
}
const PRIO_SCORE = { P1: 1, P2: 0.66, P3: 0.33, P4: 0 };
export function topWorstSites(sites, cfg, n = 15) {
  const S = sites.filter((s) => s.site_active === 1 && s.av?.available);
  if (!S.length) return [];
  const design = cfg.bbt.design_minutes, w = normW(cfg.top15_weights);
  const comp = {
    availability_gap: pctRank(S.map((s) => s.avail_gap_pp || 0)), power_downtime: pctRank(S.map((s) => s.ran_power_down_h || 0)),
    bbt_risk: S.map((s) => (s.bbt_status === "Dead" ? 1 : isNum(s.bbt_value_min) ? 1 - clip(s.bbt_value_min / design, 0, 1) : 0.5)),
    priority: S.map((s) => PRIO_SCORE[s.mbp_priority_level] ?? 0), recurrence: pctRank(S.map((s) => s.pln_freq || 0)),
    criticality: S.map((s) => cfg.class_score[s.site_class] ?? 0.3),
  };
  const LBL = { availability_gap: "availability gap", power_downtime: "power downtime", bbt_risk: "battery risk", priority: "MBP priority", recurrence: "PLN recurrence", criticality: "site class" };
  return S.map((s, i) => {
    const parts = Object.fromEntries(Object.keys(w).map((k) => [k, comp[k][i] * w[k]]));
    const score = Object.values(parts).reduce((a, v) => a + v, 0);
    const main = Object.entries(parts).sort((a, b) => b[1] - a[1]);
    return { ...s, worst_score: score, worst_parts: parts, primary_driver: LBL[main[0][0]], secondary_driver: LBL[main[1][0]] };
  }).sort((a, b) => b.worst_score - a.worst_score).slice(0, n);
}

/* ================================================================== telemetry (FMC920 stub) */
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
export { r1 };
