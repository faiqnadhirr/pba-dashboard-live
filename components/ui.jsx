"use client";
import React, { Fragment, useMemo, useState } from "react";
import { bbtDisplay } from "@/lib/logic";

/* ---------------- format (never None / nan; counts as integers; precision follows the data) ---------------- */
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const fInt = (v) => (isNum(v) ? Math.round(v).toLocaleString("en-US") : "—");
export const f1 = (v) => (isNum(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—");
export const f2 = (v) => (isNum(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
export const fMin = (v) => (isNum(v) ? `${Math.round(v).toLocaleString("en-US")} min` : "—");
export const fH = (v) => (isNum(v) ? `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} h` : "—");
export const fKm = (v) => (isNum(v) ? `${v.toFixed(1)} km` : "—");
export const fPct = (v, d = 2) => (isNum(v) ? `${v.toFixed(d)}%` : "—");
export const fPP = (v, d = 2) => (isNum(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)} pp` : "—");
/** coordinate at the precision the source actually has (max 5 decimals) */
export const fCoord = (v, dec = 5) => (isNum(v) ? v.toFixed(Math.max(2, Math.min(5, dec ?? 5))) : "—");
export const precisionNote = (dec) => (dec >= 5 ? "≈ ±1 m" : dec === 4 ? "≈ ±10 m" : dec === 3 ? "≈ ±100 m" : dec === 2 ? "≈ ±1 km" : "unknown precision");
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/* ---------------- colours + ICONS (never colour alone) ---------------- */
// C4 — two priority scales, two colour families, always prefixed (never a bare "P1")
export const LEVEL_KIND = {
  MBP: { P1: { c: "#2b2370", t: "white", i: "▲" }, P2: { c: "#5a4fc4", t: "white", i: "◆" }, P3: { c: "#a9a2ea", t: "#141821", i: "●" }, P4: { c: "#DCD9F5", t: "#141821", i: "○" } },
  BBS: { P1: { c: "#d03b3b", t: "white", i: "▲" }, P2: { c: "#ec835a", t: "#141821", i: "◆" }, P3: { c: "#fab219", t: "#141821", i: "●" }, P4: { c: "#C9CFD9", t: "#141821", i: "○" } },
};
export const LEVEL = {
  P1: { c: "#d03b3b", t: "white", i: "▲" }, P2: { c: "#ec835a", t: "#141821", i: "◆" },
  P3: { c: "#fab219", t: "#141821", i: "●" }, P4: { c: "#C9CFD9", t: "#141821", i: "○" },
};
export const STATUS = {
  Dead: { c: "#7a1414", t: "white", i: "✖" }, Critical: { c: "#d03b3b", t: "white", i: "▲" }, Degraded: { c: "#fab219", t: "#141821", i: "◆" },
  "Below design": { c: "#DDE3EC", t: "#141821", i: "◐" }, "Meets design": { c: "#0ca30c", t: "white", i: "✔" }, Unknown: { c: "#EEF1F5", t: "#55627A", i: "?" },
};
export const EVID = {
  ACTUAL: { c: "#2a78d6", t: "white" }, "DERIVED-UNVERIFIED": { c: "#f3d9c9", t: "#7a2d0b" }, DERIVED: { c: "#1baf7a", t: "#0b2b1f" }, ESTIMATED: { c: "#eb6834", t: "white" },
  PROXY: { c: "#4a3aa7", t: "white" }, UNAVAILABLE: { c: "#C9CFD9", t: "#141821" }, TICKET: { c: "#55627A", t: "white" },
  OBSERVED: { c: "#2a78d6", t: "white" }, INFERRED: { c: "#eb6834", t: "white" }, UNKNOWN: { c: "#C9CFD9", t: "#141821" },
};
export const CAUSE_COLOR = { power: "#d03b3b", transport: "#2a78d6", ran: "#4a3aa7", other: "#1baf7a", unknown: "#A3ABB9" };
export const RESP_COLOR = { utility: "#d03b3b", internal: "#4a3aa7", battery: "#eb6834", generator: "#eda100", vendor: "#2a78d6", operational: "#1baf7a", utility_inferred: "#f2a3a3", unknown: "#A3ABB9" };
const Pill = ({ c, t, children, title }) => (
  <span title={title} className="inline-flex items-center gap-1 px-1.5 py-[1px] rounded text-[11px] font-semibold whitespace-nowrap" style={{ background: c, color: t }}>{children}</span>
);
export const LevelTag = ({ v, kind = "MBP" }) => { const L = LEVEL_KIND[kind][v]; return v && L ? <Pill {...L} title={`${kind === "MBP" ? "MBP response priority" : "BBS battery-action priority"} ${kind}-${v} (P1 = highest)`}><span aria-hidden>{L.i}</span>{kind}-{v}</Pill> : <span className="text-mut">—</span>; };
/** A3 — the only way a BBT value is rendered: status basis and number can never contradict */
export const BbtCell = ({ r, showStatus = false }) => {
  const d = bbtDisplay(r);
  return <span className="inline-flex items-center gap-1.5">{d.text ? <span className="text-slate">{d.text}</span> : fMin(d.value)}{showStatus && <StatusTag v={r.bbt_status} />}<EvTag v={d.evidence} /></span>;
};
export const bbtCsv = (r) => { const d = bbtDisplay(r); return d.text ? d.text : `${isNum(d.value) ? Math.round(d.value) : ""} ${d.evidence || ""}`.trim(); };
export const StatusTag = ({ v }) => { const s = STATUS[v] || STATUS.Unknown; return v ? <Pill {...s} title="Battery vs design"><span aria-hidden>{s.i}</span>{v}</Pill> : <span className="text-mut">—</span>; };
export const EvTag = ({ v }) => <Pill {...(EVID[v] || EVID.UNAVAILABLE)} title="Evidence level">{v || "UNAVAILABLE"}</Pill>;
export const Tag = ({ children, tone = "slate", title }) => {
  const m = { slate: "bg-slate/10 text-slate", crit: "bg-crit/10 text-[#9b1c1c]", warn: "bg-warn/25 text-ink", good: "bg-good/10 text-[#066b06]", mut: "bg-line text-slate" };
  return <span title={title} className={`inline-block px-1.5 py-[1px] rounded text-[11px] font-medium ${m[tone]}`}>{children}</span>;
};
export const GapTag = ({ v }) => (!isNum(v) ? <span className="text-mut">—</span> : v < 0
  ? <span className="text-[#9b1c1c] font-semibold tabular">▼ {fPP(v)}</span> : <span className="text-[#066b06] tabular">✔ {fPP(v)}</span>);
/** Availability · Target · Gap — always shown together */
export const AvailTriple = ({ a, t, g, compact }) => (
  <span className="tabular whitespace-nowrap">{fPct(a)}<span className="text-mut"> {compact ? "/" : "vs target"} {fPct(t)} </span><GapTag v={g} /></span>
);

/* ---------------- layout ---------------- */
export function Card({ title, sub, right, children, className = "" }) {
  return (
    <section className={`bg-card border border-line rounded-lg min-w-0 ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3">
          <div><h3 className="text-[14px] font-semibold text-navy">{title}</h3>{sub && <p className="text-[12px] text-mut mt-0.5">{sub}</p>}</div>
          {right}
        </header>
      )}
      <div className="p-4 pt-3">{children}</div>
    </section>
  );
}
export function Kpi({ label, value, sub, tone = "navy", scope }) {
  const c = { navy: "text-navy", crit: "text-[#b42318]", good: "text-[#066b06]", warn: "text-[#8a5a00]", slate: "text-slate" }[tone];
  return (
    <div className="bg-card border border-line rounded-lg px-4 py-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-mut font-semibold">{label}</div>
        {scope && <span className="text-[9.5px] uppercase tracking-wide text-mut border border-line rounded px-1" title={scope === "portfolio" ? "Not affected by the NOP / class filter" : "Follows the filter"}>{scope === "portfolio" ? "portfolio" : "filtered"}</span>}
      </div>
      <div className={`text-[22px] leading-tight font-bold tabular break-words ${c}`}>{value}</div>
      {sub && <div className="text-[11px] text-mut mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}
export function Note({ children, tone = "info" }) {
  const m = { info: "bg-s1/5 border-s1/30", warn: "bg-warn/10 border-warn/60", crit: "bg-crit/5 border-crit/30" };
  return <div className={`text-[12.5px] leading-relaxed border rounded-md px-3 py-2 text-ink ${m[tone]}`}>{children}</div>;
}
export function Empty({ children = "No active sites match this filter." }) {
  return <div role="status" className="border border-dashed border-slate/40 rounded-lg p-8 text-center text-slate bg-white"><div className="text-[15px] font-semibold text-navy">{children}</div><div className="text-[12.5px] mt-1">Zero values are not shown as operational data. Change the NOP / class filter, or include inactive sites.</div></div>;
}
export function Select({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-[12px] text-mut ${className}`}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-line rounded-md px-2 py-1.5 text-[13px] text-ink bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
        {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
      </select>
    </label>
  );
}
export function Chips({ label, options, value, onChange }) {
  const set = new Set(value);
  return (
    <div className="flex flex-col gap-1 text-[12px] text-mut" role="group" aria-label={typeof label === "string" ? label : undefined}>
      {label}
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = set.has(o);
          return (
            <button key={o} aria-pressed={on} onClick={() => { const n = new Set(set); on ? n.delete(o) : n.add(o); onChange([...n]); }}
              className={`px-2 py-1 rounded-md border text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${on ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`}>{on ? "✓ " : ""}{o}</button>
          );
        })}
      </div>
    </div>
  );
}
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 text-[12.5px] text-slate cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-navy w-4 h-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" />{label}
    </label>
  );
}
export function Slider({ label, value, onChange, min, max, step = 1, fmt = (v) => v }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-mut">
      <span className="flex justify-between gap-2"><span>{label}</span><span className="text-ink tabular font-semibold">{fmt(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-navy" />
    </label>
  );
}
export function Bar100({ parts, height = 14 }) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p.v), 0) || 1;
  return (
    <div className="w-full">
      <div className="flex w-full overflow-hidden rounded" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((100 * p.v) / tot)}%`).join(", ")}>
        {parts.map((p) => p.v > 0 && <div key={p.label} title={`${p.label}: ${Math.round((100 * p.v) / tot)}%`} style={{ width: `${(100 * p.v) / tot}%`, background: p.c }} className="border-r-2 border-white last:border-r-0" />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11.5px] text-slate">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.c }} />{p.label} {p.txt ?? `${Math.round((100 * p.v) / tot)}%`}</span>)}
      </div>
    </div>
  );
}
/** Metric → Actual value → Threshold → Rule (standard explanation pattern) */
export function EvidenceTable({ rows, action }) {
  if (!rows?.length) return <div className="text-mut text-[12px]">No rule triggered.</div>;
  return (
    <table className="w-full text-[12px]">
      <thead><tr className="text-slate text-left">{["Metric", "Actual value", "Threshold", "Rule"].map((h) => <th key={h} className="py-1 pr-2 border-b border-line font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((e, i) => <tr key={i} className="border-b border-line/60 align-top"><td className="py-1 pr-2 font-medium">{e.metric}</td><td className="py-1 pr-2 tabular">{String(e.value)}</td><td className="py-1 pr-2 text-slate">{e.threshold}</td><td className="py-1 text-slate">{e.rule}</td></tr>)}
        {action && <tr><td className="py-1 pr-2 font-semibold text-navy">→ Action</td><td colSpan={3} className="py-1 font-semibold text-navy">{action}</td></tr>}</tbody>
    </table>
  );
}

/* ---------------- table: compact, sortable, paginated, expandable rows, CSV of all filtered rows ---------------- */
export function exportCsv(rows, columns, filename) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(",")).join("\n");
  const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
export function DataTable({ rows, columns, initialSort, onRowClick, filename = "export.csv", pageSize = 100, dense = true, rowClass, expand, extraCsv = [] }) {
  const [sort, setSort] = useState(initialSort || { key: null, dir: -1 });
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => columns.some((c) => String(c.csv ? c.csv(r) : r[c.key] ?? "").toLowerCase().includes(s)));
  }, [rows, q, columns]);
  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const col = columns.find((c) => c.key === sort.key), val = col?.sortVal || ((r) => r[sort.key]);
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
  }, [filtered, sort, columns]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize)), p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, (p + 1) * pageSize);
  const toggle = (k) => setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const keyOf = (r, i) => r.site_id || r.mbp_id || r.cluster || i;
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search in table…" aria-label="Search in table"
          className="border border-line rounded-md px-2 py-1 text-[12.5px] w-56 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" />
        <div className="flex items-center gap-2 text-[12px] text-mut">
          <span className="tabular">{sorted.length.toLocaleString("en-US")} rows</span>
          <button onClick={() => exportCsv(sorted, [...columns, ...extraCsv], filename)} className="px-2 py-1 border border-line rounded-md bg-white text-slate hover:border-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">Export CSV</button>
        </div>
      </div>
      <div className="overflow-auto border border-line rounded-md max-h-[620px]">
        <table className="w-full text-[12px] tabular">
          <thead className="sticky top-0 bg-surface z-10">
            <tr>
              {expand && <th className="w-6 border-b border-line" aria-label="expand" />}
              {columns.map((c) => (
                <th key={c.key} scope="col" title={c.help} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                  className={`px-2 py-1.5 font-semibold text-slate border-b border-line whitespace-nowrap ${c.num ? "text-right" : "text-left"}`}>
                  <button className="hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 rounded" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const k = keyOf(r, i), isOpen = open.has(k);
              return (
                <Fragment key={k}>
                  <tr tabIndex={onRowClick || expand ? 0 : undefined}
                    onKeyDown={(e) => { if (e.key === "Enter") (expand ? toggle(k) : onRowClick?.(r)); }}
                    onClick={() => (expand ? toggle(k) : onRowClick?.(r))}
                    className={`border-b border-line/70 ${onRowClick || expand ? "cursor-pointer hover:bg-s1/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" : ""} ${isOpen ? "bg-s1/5" : ""} ${rowClass ? rowClass(r) : ""}`}>
                    {expand && <td className="px-1 text-slate" aria-hidden>{isOpen ? "▾" : "▸"}</td>}
                    {columns.map((c) => (
                      <td key={c.key} className={`px-2 ${dense ? "py-[3px]" : "py-1.5"} ${c.num ? "text-right" : ""} ${c.wrap ? "max-w-[360px] truncate" : "whitespace-nowrap"}`} title={c.wrap ? String(c.csv ? c.csv(r) : r[c.key] ?? "") : undefined}>
                        {c.render ? c.render(r) : r[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                  {expand && isOpen && <tr className="bg-surface/70 border-b border-line"><td /><td colSpan={columns.length} className="px-3 py-2">{expand(r)}</td></tr>}
                </Fragment>
              );
            })}
            {!view.length && <tr><td colSpan={columns.length + (expand ? 1 : 0)} className="px-3 py-6 text-center text-mut">No rows for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-2 text-[12px] text-slate">
          {[["«", 0], ["‹", p - 1]].map(([l, to]) => <button key={l} aria-label={l === "«" ? "first page" : "previous page"} disabled={p === 0} onClick={() => setPage(to)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">{l}</button>)}
          <span className="tabular">Page {p + 1} / {pages}</span>
          {[["›", p + 1], ["»", pages - 1]].map(([l, to]) => <button key={l} aria-label={l === "»" ? "last page" : "next page"} disabled={p >= pages - 1} onClick={() => setPage(to)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">{l}</button>)}
        </div>
      )}
    </div>
  );
}

/* ---------------- the 14 mandatory columns (management order) + availability triple ---------------- */
export const SITE14 = () => [
  { key: "mbp_priority_score", label: "1 · Priority", num: true, help: "MBP response priority (MBP-P1 highest)", render: (r) => <span className="inline-flex items-center gap-1.5"><LevelTag kind="MBP" v={r.mbp_priority_level} /><span>{f2(r.mbp_priority_score)}</span></span>, csv: (r) => `MBP-${r.mbp_priority_level} ${f2(r.mbp_priority_score)}` },
  { key: "site_id", label: "2 · Site ID", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
  { key: "site_name", label: "3 · Site Name" },
  { key: "site_class", label: "4 · Class" },
  { key: "dependency_children", label: "5 · Dependency (PROXY)", num: true, help: "PROXY: estimated child sites from the 'HUB Site' bucket in New_BBT. Needed for a real value: parent–child site topology (transmission hub → child site list).", render: (r) => (isNum(r.dependency_children) ? <span title={`HUB Site: ${r.hub_site} — PROXY. Real value needs parent–child site topology.`}>{r.dependency_children}</span> : "—") },
  { key: "nop", label: "6 · NOP" },
  { key: "bbt_design_min", label: "7 · BBT Design", num: true, help: "Per site: banks × Ah/bank (assumed) × DoD ÷ NE load. PROXY = class default (battery data missing).", render: (r) => <span title={r.bbt_design_basis} className="inline-flex items-center gap-1.5">{fMin(r.bbt_design_min)}<EvTag v={r.bbt_design_evidence} /></span>, csv: (r) => `${r.bbt_design_min} ${r.bbt_design_evidence}` },
  { key: "bbt_value_min", label: "8 · BBT Measured", num: true, sortVal: (r) => r.battery?.display?.value, render: (r) => <BbtCell r={r} />, csv: bbtCsv },
  { key: "pln_freq", label: "9 · PLN outage (freq)", num: true, render: (r) => fInt(r.pln_freq) },
  { key: "pln_total_h", label: "10 · Outage Duration", num: true, render: (r) => fH(r.pln_total_h) },
  { key: "dist_km", label: "11 · Distance to MBP", num: true, help: "Straight-line km to the assigned MBP (within radius) or, if none, to the nearest MBP", render: (r) => <span title={`${r.dist_mbp || ""}${r.dist_note ? " — " + r.dist_note : ""}`}>{isNum(r.dist_km) ? fKm(r.dist_km) : "no site coordinates"}</span>, csv: (r) => r.dist_km?.toFixed(1) },
  { key: "dist_eta_min", label: "12 · Travel time", num: true, help: "ESTIMATED (speed model). Red ✖ = cannot arrive before BBT. Island = indicative road-equivalent (sea access).",
    render: (r) => (isNum(r.dist_eta_min) ? <span className={r.can_arrive_before_bbt ? "" : "text-[#b42318] font-semibold"} title={r.dist_note || ""}>{r.can_arrive_before_bbt ? "" : "✖ "}{fMin(r.dist_eta_min)}{r.access_class === "island" ? <span className="text-mut font-normal text-[10px]"> sea access</span> : null}</span> : "no site coordinates"),
    csv: (r) => (isNum(r.dist_eta_min) ? Math.round(r.dist_eta_min) : "") },
  { key: "within_radius", label: "Within radius", render: (r) => (r.within_radius ? <Tag tone="good">✔ yes</Tag> : <Tag tone="crit">✖ no</Tag>), csv: (r) => (r.within_radius ? "yes" : "no") },
  { key: "mbp_deployments", label: "13 · Historical MBP", num: true, render: (r) => fInt(r.mbp_deployments) },
  { key: "mbp_backup_h", label: "14 · MBP backup time", num: true, render: (r) => fH(r.mbp_backup_h) },
  { key: "avail_delta_pp", label: "Availability · target · gap", num: true, sortVal: (r) => r.avail_delta_pp, render: (r) => <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact />, csv: (r) => `${f2(r.avail_wc_pct)} / ${f2(r.ran_target_pct)} / ${f2(r.avail_delta_pp)}` },
  { key: "dist_mbp", label: "MBP (assigned / nearest)" },
  { key: "can_arrive_before_bbt", label: "Arrives before BBT?", render: (r) => (r.can_arrive_before_bbt ? <Tag tone="good">✔ yes</Tag> : <Tag tone="crit">✖ no</Tag>), csv: (r) => (r.can_arrive_before_bbt ? "yes" : "no") },
];
