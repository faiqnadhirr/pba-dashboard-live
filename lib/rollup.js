// v3.5 — site → cluster → NOP → AREA roll-up. Every number of a unit is a plain sum/count over its sites, so the map
// bubble, the justification panel and the Site list always agree, and any unit can be traced down to the sites behind it.
import { MAP_MODES } from "./mapmodes.js";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const LEVELS = ["site", "cluster", "nop"];
export const unitOf = (s, level) => (level === "nop" ? s.nop || "—" : level === "cluster" ? s.cluster_to || "—" : s.site_id);
export const parentLevel = (level) => (level === "cluster" ? "nop" : level === "site" ? "cluster" : "area");

/** units of one level: { id, level, nop, n, counts{key:n}, bad, badShare, size, sizeBad, lat, lon, sites } */
export function rollup(sites, level, modeKey) {
  const M = MAP_MODES[modeKey], by = new Map();
  for (const s of sites) {
    const id = unitOf(s, level);
    let u = by.get(id);
    if (!u) { u = { id, level, nop: s.nop || "—", n: 0, counts: {}, bad: 0, size: 0, sizeBad: 0, la: 0, lo: 0, nl: 0, sites: [] }; by.set(id, u); }
    const k = M.key(s), sz = M.size ? Math.max(0, M.size(s) || 0) : 0, isBad = M.bad.includes(k);
    u.n++; u.counts[k] = (u.counts[k] || 0) + 1; u.size += sz; u.sites.push(s);
    if (isBad) { u.bad++; u.sizeBad += sz; }
    if (isNum(s.lat) && isNum(s.lon)) { u.la += s.lat; u.lo += s.lon; u.nl++; }
  }
  return [...by.values()].map((u) => ({ ...u, lat: u.nl ? u.la / u.nl : null, lon: u.nl ? u.lo / u.nl : null, badShare: u.n ? u.bad / u.n : 0 }))
    .sort((a, b) => b.badShare - a.badShare || b.sizeBad - a.sizeBad);
}

/** justification of one unit: category breakdown, child units (worst first) and the sites that drive it (problem sites, largest first) */
export function justify(sites, level, id, modeKey, topN = 15) {
  const M = MAP_MODES[modeKey];
  const mine = sites.filter((s) => unitOf(s, level) === id);
  const [u] = rollup(mine, level, modeKey);
  if (!u) return null;
  const child = level === "nop" ? rollup(mine, "cluster", modeKey) : null;
  const drivers = mine.filter((s) => M.bad.includes(M.key(s)))
    .sort((a, b) => (M.size ? (M.size(b) || 0) - (M.size(a) || 0) : 0) || M.keys.indexOf(M.key(a)) - M.keys.indexOf(M.key(b)));
  return { unit: u, child, drivers: drivers.slice(0, topN), nDrivers: drivers.length, keys: M.keys.filter((k) => u.counts[k]) };
}
