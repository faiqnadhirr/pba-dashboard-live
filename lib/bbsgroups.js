// Bucket 4 (2026-10-14) — DISPLAY groups for battery status and BBT evidence. The detailed status (lib/logic.js › statusOf,
// thresholds bbt.design_minutes / ok_pct / degraded_pct / dead_max_minutes) and the evidence label are unchanged and always
// kept next to the group (tooltip, panel, CSV).
export const STATUS_GROUPS = ["act", "warn", "ok", "unk"];
export const STATUS_GROUP_OF = { Dead: "act", Critical: "act", Degraded: "act", "Below design": "warn", "Meets design": "ok", Unknown: "unk" };
export const STATUS_GROUP_COLOR = { act: "#d03b3b", warn: "#eda100", ok: "#0ca30c", unk: "#C9CFD9" };
export const statusGroup = (s) => STATUS_GROUP_OF[s?.bbt_status] || "unk";

export const EV_GROUPS = ["measured", "estimated", "unverified", "none"];
// TICKET does not occur in the current data; when it does it is shown as "none" (no battery value) — documented, not invented
export const EV_GROUP_OF = { ACTUAL: "measured", DERIVED: "measured", ESTIMATED: "estimated", "DERIVED-UNVERIFIED": "unverified", UNAVAILABLE: "none", TICKET: "none" };
export const EV_GROUP_COLOR = { measured: "#2a78d6", estimated: "#eb6834", unverified: "#f3c3a5", none: "#C9CFD9" };
export const evLabel = (s) => s?.battery?.display?.evidence || "UNAVAILABLE";
export const evGroup = (s) => EV_GROUP_OF[evLabel(s)] || "none";

export function groupCounts(rows) {
  const st = Object.fromEntries(STATUS_GROUPS.map((k) => [k, 0])), ev = Object.fromEntries(EV_GROUPS.map((k) => [k, 0]));
  for (const s of rows) { st[statusGroup(s)]++; ev[evGroup(s)]++; }
  return { st, ev };
}
