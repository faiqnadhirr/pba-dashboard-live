// v3.4 — period filter. Pure functions (no React) so the tests run the same code on the real files.
//
// What follows the period (observed, time-stamped data): RAN availability + downtime by cause, PLN outages (BBT event
// intervals), mains-fail events, power-ticket root causes (→ responsibility), MBP deployments and RH hours.
// What stays on the full snapshot (needs all the evidence): BBT and battery status, MBP/BBS priority and actions, dark-site
// profile, off-air flag, coverage and assignment. The UI marks those with a "full period" badge.
import { availabilityOf, responsibilityOf, RESP_POWER } from "./logic.js";

export const Y = 2026, FIRST = 0, MDAYS = [31, 28, 31, 30, 31, 30];
const CUM = MDAYS.reduce((a, d) => [...a, a[a.length - 1] + d], [0]);   // day index of each month's 1st day
export const LAST = CUM[6] - 1;                                            // 180 = 30 Jun
export const GRANS = ["d", "w", "m", "q", "h1", "r"];

export const idxOf = (m, d) => CUM[m - 1] + d - 1;                         // m = 1..6
export const dateOf = (i) => { let m = 0; while (m < 5 && i >= CUM[m + 1]) m++; return { m: m + 1, d: i - CUM[m] + 1 }; };
const ymd = (i) => { const { m, d } = dateOf(i); return `${Y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`; };
const parseYmd = (s) => { const m = +s.slice(4, 6), d = +s.slice(6, 8); return m >= 1 && m <= 6 && d >= 1 && d <= MDAYS[m - 1] ? idxOf(m, d) : null; };
export const isoOf = (i) => { const { m, d } = dateOf(i); return `${Y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
export const fromIso = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) === Y ? parseYmd(s.replace(/-/g, "")) : null);
const clamp = (i) => Math.max(FIRST, Math.min(LAST, i));
// weekday of 1 Jan 2026 = Thursday → Monday-based offset
const dow = (i) => (i + 3) % 7;                                             // 0 = Monday
const monday = (i) => i - dow(i);                                          // may be < 0 (week of 1 Jan)

/** period string (URL ?per=) → { gran, a, b, key } ; a..b inclusive day indexes. Unknown → H1. */
export function parsePeriod(p) {
  const s = String(p || "h1");
  if (s.startsWith("d:")) { const i = parseYmd(s.slice(2)); if (i != null) return { gran: "d", a: i, b: i, key: `d:${ymd(i)}` }; }
  if (s.startsWith("w:")) { const i = parseYmd(s.slice(2)); if (i != null) { const r = monday(i), a = clamp(r); return { gran: "w", a, b: clamp(r + 6), key: `w:${ymd(a)}` }; } }
  if (s.startsWith("m:")) { const m = +s.slice(6, 8); if (s.slice(2, 6) === String(Y) && m >= 1 && m <= 6) return { gran: "m", a: idxOf(m, 1), b: idxOf(m, MDAYS[m - 1]), key: `m:${Y}${String(m).padStart(2, "0")}` }; }
  if (s === "q:1") return { gran: "q", a: 0, b: CUM[3] - 1, key: "q:1" };
  if (s === "q:2") return { gran: "q", a: CUM[3], b: LAST, key: "q:2" };
  if (s.startsWith("r:")) { const [x, y] = s.slice(2).split("-").map(parseYmd); if (x != null && y != null) { const a = Math.min(x, y), b = Math.max(x, y); return { gran: "r", a, b, key: `r:${ymd(a)}-${ymd(b)}` }; } }
  return { gran: "h1", a: FIRST, b: LAST, key: "h1" };
}
export const isFull = (P) => P.a === FIRST && P.b === LAST;

/** switch granularity, keeping the period anchored at the current end (most recent data first) */
export function withGran(P, g) {
  const end = P.gran === "h1" ? LAST : P.b;
  if (g === "d") return parsePeriod(`d:${ymd(end)}`);
  if (g === "w") return parsePeriod(`w:${ymd(end)}`);
  if (g === "m") { const { m } = dateOf(end); return parsePeriod(`m:${Y}${String(m).padStart(2, "0")}`); }
  if (g === "q") return parsePeriod(end >= CUM[3] ? "q:2" : "q:1");
  if (g === "r") return parsePeriod(`r:${ymd(P.gran === "h1" ? clamp(LAST - 29) : P.a)}-${ymd(end)}`);
  return parsePeriod("h1");
}
/** ◀ ▶ stepper; returns null when it would leave the data range */
export function step(P, dir) {
  const { m } = dateOf(P.a);
  let n = null;
  if (P.gran === "d") n = P.a + dir <= LAST && P.a + dir >= FIRST ? `d:${ymd(P.a + dir)}` : null;
  if (P.gran === "w") { const r = monday(P.b) + 7 * dir; n = r <= LAST && r + 6 >= FIRST ? `w:${ymd(clamp(r))}` : null; }
  if (P.gran === "m") n = m + dir >= 1 && m + dir <= 6 ? `m:${Y}${String(m + dir).padStart(2, "0")}` : null;
  if (P.gran === "q") n = P.key === "q:1" && dir > 0 ? "q:2" : P.key === "q:2" && dir < 0 ? "q:1" : null;
  if (P.gran === "r") { const len = P.b - P.a + 1, a = P.a + dir * len, b = P.b + dir * len; n = a >= FIRST && b <= LAST ? `r:${ymd(a)}-${ymd(b)}` : null; }
  return n ? parsePeriod(n) : null;
}
/** months (1..6) a period touches, with the day sub-range inside each month */
export function monthsOf(P) {
  const out = [];
  for (let m = 1; m <= 6; m++) {
    const a = Math.max(P.a, idxOf(m, 1)), b = Math.min(P.b, idxOf(m, MDAYS[m - 1]));
    if (a <= b) out.push({ m, ym: `${Y}${String(m).padStart(2, "0")}`, d0: a - CUM[m - 1] + 1, d1: b - CUM[m - 1] + 1, full: a === idxOf(m, 1) && b === idxOf(m, MDAYS[m - 1]) });
  }
  return out;
}
export const days = (P) => P.b - P.a + 1;

/** Sum the month files over the period → per-site arrays (index = row in sites.json). */
export function periodAgg(files, P, n) {
  const z = () => new Float64Array(n);
  const A = { hours: z(), o: z(), p: z(), t: z(), r: z(), x: z(), plnN: z(), plnH: z(), plnApprox: new Uint8Array(n), evt: z(), dep: z(), rh: z(), rhN: z(),
    rc: RESP_POWER.map(() => z()) };
  for (const M of monthsOf(P)) {
    const F = files[M.ym]; if (!F) throw new Error(`period file ${M.ym} missing`);
    if (F.n_sites !== n) throw new Error(`period file ${M.ym}: ${F.n_sites} sites, model has ${n}`);
    const inR = (d) => d >= M.d0 && d <= M.d1, span = M.d1 - M.d0 + 1;
    // RAN days present in range
    const miss = new Map(F.miss.map(([i, ...ds]) => [i, ds]));
    for (let i = 0; i < n; i++) {
      const dd = F.days[i]; if (!dd) continue;
      const ms = miss.get(i);
      A.hours[i] += 24 * (M.full ? dd : span - (ms ? ms.filter(inR).length : 0));
    }
    const R = F.ran;
    for (let k = 0; k < R.s.length; k++) { if (!inR(R.d[k])) continue; const i = R.s[k];
      A.o[i] += R.o[k] / 3600; A.p[i] += R.p[k] / 3600; A.t[i] += R.t[k] / 3600; A.r[i] += R.r[k] / 3600; A.x[i] += R.x[k] / 3600; }
    const L = F.pln;
    for (let k = 0; k < L.s.length; k++) if (inR(L.d[k])) { A.plnN[L.s[k]] += 1; A.plnH[L.s[k]] += L.h[k] / 3600; }
    const Lm = F.plnm, f = span / F.mdays;                     // monthly-summary sites: month grain → prorated
    for (let k = 0; k < Lm.s.length; k++) { const i = Lm.s[k]; A.plnN[i] += Lm.n[k] * f; A.plnH[i] += Lm.h[k] * f; if (!M.full) A.plnApprox[i] = 1; }
    const E = F.evt;
    for (let k = 0; k < E.s.length; k++) if (inR(E.d[k])) A.evt[E.s[k]] += E.n[k];
    const T = F.tk;
    for (let k = 0; k < T.s.length; k++) { if (!inR(T.d[k])) continue; const i = T.s[k];
      if (T.c[k] >= 0) A.rc[T.c[k]][i] += 1;
      if (T.dep[k]) { A.dep[i] += 1; if (T.rh[k] != null) { A.rh[i] += T.rh[k]; A.rhN[i] += 1; } } }
  }
  return A;
}

/** Overlay the period's observed metrics on the (full-snapshot) model. Sites keep their decisions (BBT, priority, action). */
export function applyPeriod(model, idOrder, A, P) {
  const at = new Map(idOrder.map((id, i) => [id, i]));
  return model.map((s0) => {
    const i = at.get(s0.site_id); if (i == null) return s0;
    const hours = A.hours[i];
    const s = { ...s0, period_key: P.key };
    s.ran_hours = hours || null;
    s.ran_outage_h = A.o[i]; s.ran_power_down_h = A.p[i]; s.ran_transport_down_h = A.t[i]; s.ran_ran_down_h = A.r[i]; s.ran_other_down_h = A.x[i];
    const av = availabilityOf({ hours, outage: A.o[i], power: A.p[i], transport: A.t[i], ran: A.r[i], other: A.x[i],
      targetHours: typeof s0.ran_target_pct === "number" && hours ? s0.ran_target_pct * hours : null });
    s.av = av;
    s.avail_wc_pct = av.available ? av.avail : null;
    s.avail_gap_pp = av.available ? Math.max(0, -av.gap) : null;
    s.avail_delta_pp = av.available ? av.gap : null;
    if (s0.pln_known) { s.pln_freq = A.plnN[i]; s.pln_total_h = A.plnH[i]; s.pln_period_approx = A.plnApprox[i] === 1; }
    if (s0.mbp_hist_known) { s.mbp_deployments = A.dep[i]; s.mbp_backup_h = A.rhN[i] ? A.rh[i] : null; }
    const rc = {}; RESP_POWER.forEach((k, j) => { rc["rc_" + k] = A.rc[j][i]; });
    s.resp = responsibilityOf({ ...s, ...rc, evt_total: A.evt[i] });
    Object.assign(s, rc);
    s.period_evt_total = A.evt[i];
    return s;
  });
}

/* loader with a per-month cache (browser) */
const cache = new Map();
export function loadPeriodFiles(P, base = "/data/period/") {
  return Promise.all(monthsOf(P).map((M) => {
    if (!cache.has(M.ym)) cache.set(M.ym, fetch(`${base}${M.ym}.json`).then((r) => { if (!r.ok) throw new Error(`${M.ym}: HTTP ${r.status}`); return r.json(); })
      .catch((e) => { cache.delete(M.ym); throw e; }));
    return cache.get(M.ym).then((f) => [M.ym, f]);
  })).then(Object.fromEntries);
}
