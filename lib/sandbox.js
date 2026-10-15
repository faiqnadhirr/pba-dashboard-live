// Planning sandbox state (2026-10-15) — pure helpers so the hand-over behaviour is testable. One state per NOP:
// { moves: Map(mbp_id → {lat, lon, origin, label}), added: [{mbp_id, lat, lon, nop, label}], removed: Set, fromModel: Set }.
// A proposal from a planning question: { kind: "move" | "remove" | "add", mbp_id?, lat?, lon?, label?, adds? }.
//   how = "replace" → the scenario becomes only this proposal; "merge" → the proposal is added to the user's current changes.
export const emptySandbox = () => ({ moves: new Map(), added: [], removed: new Set(), fromModel: new Set() });
export const sandboxChanges = (o) => (o ? o.moves.size + o.added.length + o.removed.size : 0);

export function applyProposal(o, p, how, nop) {
  const base = how === "replace" || !o ? emptySandbox() : { moves: new Map(o.moves), added: [...o.added], removed: new Set(o.removed), fromModel: new Set(o.fromModel) };
  const k = p.kind || "move";
  if (k === "move") { base.moves.set(p.mbp_id, { lat: p.lat, lon: p.lon, origin: "model", label: p.label }); base.removed.delete(p.mbp_id); }
  else if (k === "remove") { base.moves.delete(p.mbp_id); base.removed.add(p.mbp_id); base.fromModel.add(p.mbp_id); }
  else if (k === "add") {
    const n0 = base.added.length;
    for (const [i, a] of (p.adds || []).entries()) { const id = `NEW-${n0 + i + 1}`; base.added.push({ mbp_id: id, lat: a.lat, lon: a.lon, nop, label: a.label }); base.fromModel.add(id); }
  }
  return base;
}
