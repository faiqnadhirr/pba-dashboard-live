// v5.0 — shared state of a map + table workspace, as pure functions (tested in tests/logic.test.mjs).
// One record set feeds the map AND the table: page filters → legend categories → base-camp focus. Selection never filters.
import { MAP_KEYS } from "./mapmodes.js";

/** records shown on the map and in the table. hidden = legend categories switched off for the current map mode;
 *  camp = a selected base camp limits the records to the sites assigned to it (shown as a removable chip). */
export function workspaceRows(rows, { mode = null, hidden = [], keyOf = null, camp = null } = {}) {
  const k = keyOf || (mode ? MAP_KEYS[mode] : null);
  let out = rows;
  if (k && hidden.length) out = out.filter((s) => !hidden.includes(k(s)));
  if (camp) out = out.filter((s) => s.mbp_assigned === camp);
  return out;
}

/** where the selected record stands: shown, or excluded by a filter (then the UI says so instead of keeping a silent selection) */
export function selectionState(allRows, shownRows, id) {
  if (!id) return { state: "none" };
  if (shownRows.some((s) => s.site_id === id)) return { state: "shown" };
  if (allRows.some((s) => s.site_id === id)) return { state: "hidden_by_map" };
  return { state: "excluded" };
}

/** colour of a record depends only on the record and the map mode — never on table sort / page (contract tested) */
export const markerKey = (mode, s) => MAP_KEYS[mode](s);
