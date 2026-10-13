// v5.0 — the table's row pipeline as pure functions (search → sort → page), shared by DataTable, the CSV export and the tests,
// so "what the table shows", "what the export contains" and "which page holds the selected record" can never disagree.
export const rowKey = (r, i) => r?.site_id ?? r?.mbp_id ?? r?.cluster ?? r?.nop ?? i;

export function searchRows(rows, q, columns) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter((r) => columns.some((c) => String(c.csv ? c.csv(r) : r[c.key] ?? "").toLowerCase().includes(s)));
}

/** stable sort: ties keep the incoming order; missing values always last */
export function sortRows(rows, sort, columns) {
  if (!sort?.key) return rows;
  const col = columns.find((c) => c.key === sort.key), val = col?.sortVal || ((r) => r[sort.key]);
  return rows.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return ia - ib; if (x == null) return 1; if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * sort.dir || ia - ib;
  }).map(([r]) => r);
}

/** page that holds the record with key k (null = not in the rows, e.g. hidden by the table search) */
export function pageOfKey(sorted, k, pageSize, keyOf = rowKey) {
  if (k == null) return null;
  const i = sorted.findIndex((r, j) => keyOf(r, j) === k);
  return i < 0 ? null : Math.floor(i / pageSize);
}
