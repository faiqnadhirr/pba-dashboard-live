// Bucket 1 (2026-10-14) — ONE operational status per base camp, derived ONLY from the existing basecamp_final status
// (lib/basecamp.js › status, thresholds in thresholds.yaml › mbp_perf). No new thresholds, no new scoring.
//
//   existing status            → operational status      primary reason
//   low  (often late)           → check   "Perlu dicek"   often_late  (+ busy as second reason when working time ≥ high_busy_min)
//   high (busy)                 → check   "Perlu dicek"   busy
//   under (idle) AND selectable → movable "Bisa dipindah" idle
//   under but NOT selectable    → unrated "Belum bisa dinilai" (data must be cleaned first — never offered as movable)
//   watch (sometimes late), good → ok     "Aman"          (watch keeps the note "kadang telat" in the panel / table)
//   noloc · nodata · none · few  → unrated "Belum bisa dinilai" (no location / no area data / no jobs / too few judged jobs)
// Deterministic order = the existing basecamp_final decision order (lateness before workload).
// "Bersihkan data" is a separate flag (not a status): selectable = false (no location / no NOP / no sites / pending duplicate).
export const OP_KEYS = ["check", "movable", "ok", "unrated"];
export const OP_COLOR = { check: "#ec835a", movable: "#7FB2EA", ok: "#0ca30c", unrated: "#D5DAE2" };

export function opStatus(b, cfg) {
  const st = b?.status ?? b?.key;
  const hb = cfg?.mbp_perf?.high_busy_min ?? 0.25;
  if (st === "low") return { op: "check", reason: "often_late", also: (b.busy ?? 0) >= hb ? ["busy"] : [] };
  if (st === "high") return { op: "check", reason: "busy", also: [] };
  if (st === "under") return b.selectable === false ? { op: "unrated", reason: "clean_first", also: ["idle"] } : { op: "movable", reason: "idle", also: [] };
  if (st === "watch") return { op: "ok", reason: "sometimes_late", also: [] };
  if (st === "good") return { op: "ok", reason: "ontime", also: [] };
  return { op: "unrated", reason: st || "nodata", also: [] };   // noloc · nodata · none · few
}
export const needsClean = (b) => b?.selectable === false;

/** counts per operational status + cleanup flag; Σ OP_KEYS = rows.length by construction */
export function opCounts(rows, cfg) {
  const c = Object.fromEntries(OP_KEYS.map((k) => [k, 0])); let clean = 0;
  for (const b of rows) { c[opStatus(b, cfg).op]++; if (needsClean(b)) clean++; }
  return { ...c, clean, total: rows.length };
}
