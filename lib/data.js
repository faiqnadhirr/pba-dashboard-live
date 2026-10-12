// Data loading: static JSON produced by `python engine/build.py` into public/data/.
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function fromColumnar({ cols, rows }) {
  return rows.map((r) => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o; });
}

/** AREA data folders: AREA 1 → /data/, AREA 4 → /data/a4/ (both written in the same shape by the engine) */
export const AREAS = [["AREA 1", "/data/"], ["AREA 4", "/data/a4/"]];
export const dataBase = (area = "AREA 1") => (AREAS.find(([a]) => a === area) || AREAS[0])[1];

async function loadOne(base) {
  const get = (f) => fetch(`${base}${f}`).then((r) => { if (!r.ok) throw new Error(`${base}${f}: HTTP ${r.status}`); return r.json(); });
  const opt = (f) => get(f).catch(() => ({ cols: [], rows: [] }));
  const [meta, sites, mbps, fam, tk, ev] = await Promise.all([get("meta.json"), get("sites.json"), get("mbps.json"), opt("familiarity.json"), opt("tickets.json"), opt("pln_ev.json")]);
  return { meta, sites: fromColumnar(sites), mbps, fam: fromColumnar(fam), tickets: fromColumnar(tk), events: fromColumnar(ev) };
}

/** v4.1 — ONE dataset: every AREA is loaded and merged; AREA is a field on every site / base camp and a filter like NOP.
 *  AREA 1 comes first so the period files (indexed on AREA 1 sites) keep their order (n1). A missing AREA folder is skipped. */
export async function loadAll() {
  const parts = await Promise.all(AREAS.map(([a, base]) => loadOne(base).then((d) => ({ a, d })).catch((e) => (a === "AREA 1" ? Promise.reject(e) : null))));
  const ok = parts.filter(Boolean), main = ok[0].d;
  const seen = new Set(), sites = [], mbps = [], tickets = [], events = [], famMap = new Map(), monthly = [], gaps = [], areas = [];
  for (const { a, d } of ok) {
    areas.push({ area: a, built_at: d.meta.built_at, snapshot: d.meta.snapshot, has_jobs: d.tickets.length > 0, has_events: d.events.length > 0, inventory: d.meta.inventory || null });
    for (const s of d.sites) { if (seen.has(s.site_id)) continue; seen.add(s.site_id); s.area = a; sites.push(s); }
    for (const m of d.mbps) { m.area = a; mbps.push(m); }
    for (const k of d.tickets) tickets.push(k);
    for (const e of d.events) events.push(e);
    for (const r of d.fam) famMap.set(r.site_id + "|" + r.mbp_id, r.served_n);
    for (const r of d.meta.monthly_nop || []) monthly.push({ ...r, area: a });
    for (const r of d.meta.dq?.ticket_gaps || []) gaps.push({ ...r, area: a });
  }
  const meta = { ...main.meta, monthly_nop: monthly, areas, dq: { ...(main.meta.dq || {}), ticket_gaps: gaps } };
  return { meta, sites, mbps, fam: famMap, tickets, events, n1: main.sites.length };
}

const detailCache = new Map();
export async function loadDetail(nop, area = "AREA 1") {
  const k = area + "|" + slug(nop);
  if (!detailCache.has(k)) detailCache.set(k, fetch(`${dataBase(area)}detail/${slug(nop)}.json`).then((r) => (r.ok ? r.json() : {})));
  return detailCache.get(k);
}
