// Data loading: static JSON produced by `python engine/build.py` into public/data/.
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function fromColumnar({ cols, rows }) {
  return rows.map((r) => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o; });
}

/** area "1" → /data/, area "4" → /data/a4/ (v4.0: AREA 4 is written in the same shape; missing data = empty files → N/A) */
export const dataBase = (area = "1") => (area === "4" ? "/data/a4/" : "/data/");
export async function loadAll(area = "1") {
  const base = dataBase(area);
  const get = (f) => fetch(`${base}${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
  const [meta, sites, mbps, fam, tk, ev] = await Promise.all([get("meta.json"), get("sites.json"), get("mbps.json"), get("familiarity.json"),
    get("tickets.json").catch(() => ({ cols: [], rows: [] })),   // v3.7 MBP jobs (optional)
    get("pln_ev.json").catch(() => ({ cols: [], rows: [] }))]);   // v4.0 PLN outage events paired with MBP jobs (optional)
  const famMap = new Map();
  for (const r of fromColumnar(fam)) famMap.set(r.site_id + "|" + r.mbp_id, r.served_n);
  return { meta, sites: fromColumnar(sites), mbps, fam: famMap, tickets: fromColumnar(tk), events: fromColumnar(ev), area };
}

const detailCache = new Map();
export async function loadDetail(nop, area = "1") {
  const k = area + "|" + slug(nop);
  if (!detailCache.has(k)) detailCache.set(k, fetch(`${dataBase(area)}detail/${slug(nop)}.json`).then((r) => (r.ok ? r.json() : {})));
  return detailCache.get(k);
}
