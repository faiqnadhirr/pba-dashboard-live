// Data loading: static JSON produced by `python engine/build.py` into public/data/.
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function fromColumnar({ cols, rows }) {
  return rows.map((r) => { const o = {}; for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o; });
}

export async function loadAll() {
  const get = (f) => fetch(`/data/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
  const [meta, sites, mbps, fam] = await Promise.all([get("meta.json"), get("sites.json"), get("mbps.json"), get("familiarity.json")]);
  const famMap = new Map();
  for (const r of fromColumnar(fam)) famMap.set(r.site_id + "|" + r.mbp_id, r.served_n);
  return { meta, sites: fromColumnar(sites), mbps, fam: famMap };
}

const detailCache = new Map();
export async function loadDetail(nop) {
  const k = slug(nop);
  if (!detailCache.has(k)) detailCache.set(k, fetch(`/data/detail/${k}.json`).then((r) => (r.ok ? r.json() : {})));
  return detailCache.get(k);
}
