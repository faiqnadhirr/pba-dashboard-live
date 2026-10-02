"use client";
import React, { useMemo, useState } from "react";

/* ---------------- format (never shows None / nan / 8.00 for counts) ---------------- */
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const fInt = (v) => (isNum(v) ? Math.round(v).toLocaleString("en-US") : "—");
export const f1 = (v) => (isNum(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—");
export const f2 = (v) => (isNum(v) ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
export const fMin = (v) => (isNum(v) ? `${Math.round(v)} min` : "—");
export const fH = (v) => (isNum(v) ? `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} h` : "—");
export const fKm = (v) => (isNum(v) ? `${v.toFixed(1)} km` : "—");
export const fPct = (v, d = 1) => (isNum(v) ? `${v.toFixed(d)}%` : "—");
export const fCoord = (v) => (isNum(v) ? v.toFixed(5) : "—");
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/* ---------------- colours: status palette for states (always with a label), categorical for evidence ---------------- */
export const LEVEL = {
  P1: { c: "#d03b3b", t: "white", label: "P1" }, P2: { c: "#ec835a", t: "#141821", label: "P2" },
  P3: { c: "#fab219", t: "#141821", label: "P3" }, P4: { c: "#C9CFD9", t: "#141821", label: "P4" },
};
export const STATUS = {
  Dead: { c: "#8f1d1d", t: "white" }, Critical: { c: "#d03b3b", t: "white" }, Degraded: { c: "#fab219", t: "#141821" },
  OK: { c: "#0ca30c", t: "white" }, Unknown: { c: "#C9CFD9", t: "#141821" },
};
export const EVID = {
  ACTUAL: { c: "#2a78d6", t: "white" }, DERIVED: { c: "#1baf7a", t: "#0b2b1f" }, ESTIMATED: { c: "#eb6834", t: "white" },
  PROXY: { c: "#4a3aa7", t: "white" }, UNAVAILABLE: { c: "#C9CFD9", t: "#141821" },
};
const Pill = ({ c, t, children, title }) => (
  <span title={title} className="inline-block px-1.5 py-[1px] rounded text-[11px] font-semibold whitespace-nowrap" style={{ background: c, color: t }}>{children}</span>
);
export const LevelTag = ({ v, prefix = "" }) => (v ? <Pill {...LEVEL[v]}>{prefix}{v}</Pill> : <span className="text-mut">—</span>);
export const StatusTag = ({ v }) => (v ? <Pill {...(STATUS[v] || STATUS.Unknown)}>Battery: {v}</Pill> : <span className="text-mut">—</span>);
export const EvTag = ({ v }) => <Pill {...(EVID[v] || EVID.UNAVAILABLE)}>{v || "UNAVAILABLE"}</Pill>;
export const Tag = ({ children, tone = "slate" }) => {
  const m = { slate: "bg-slate/10 text-slate", crit: "bg-crit/10 text-crit", warn: "bg-warn/20 text-ink", good: "bg-good/10 text-good", mut: "bg-line text-mut" };
  return <span className={`inline-block px-1.5 py-[1px] rounded text-[11px] font-medium ${m[tone]}`}>{children}</span>;
};

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
export function Kpi({ label, value, sub, tone = "navy" }) {
  const c = { navy: "text-navy", crit: "text-crit", good: "text-good", warn: "text-[#9a6a00]", slate: "text-slate" }[tone];
  return (
    <div className="bg-card border border-line rounded-lg px-4 py-3 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-mut font-semibold">{label}</div>
      <div className={`text-[22px] leading-tight font-bold tabular truncate ${c}`} title={typeof value === "string" ? value : undefined}>{value}</div>
      {sub && <div className="text-[11px] text-mut mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}
export function Note({ children, tone = "info" }) {
  const m = { info: "bg-s1/5 border-s1/30", warn: "bg-warn/10 border-warn/50", crit: "bg-crit/5 border-crit/30" };
  return <div className={`text-[12.5px] leading-relaxed border rounded-md px-3 py-2 text-ink ${m[tone]}`}>{children}</div>;
}
export function Select({ label, value, onChange, options, className = "" }) {
  return (
    <label className={`flex flex-col gap-1 text-[12px] text-mut ${className}`}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-line rounded-md px-2 py-1.5 text-[13px] text-ink bg-white focus:outline-none focus:ring-2 focus:ring-s1/40">
        {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </label>
  );
}
export function Chips({ label, options, value, onChange }) {
  const set = new Set(value);
  return (
    <div className="flex flex-col gap-1 text-[12px] text-mut">
      {label}
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = set.has(o);
          return (
            <button key={o} onClick={() => { const n = new Set(set); on ? n.delete(o) : n.add(o); onChange([...n]); }}
              className={`px-2 py-1 rounded-md border text-[12px] ${on ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`}>{o}</button>
          );
        })}
      </div>
    </div>
  );
}
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-2 text-[12.5px] text-slate cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-navy w-4 h-4" />{label}
    </label>
  );
}
export function Slider({ label, value, onChange, min, max, step = 1, fmt = (v) => v }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-mut">
      <span className="flex justify-between"><span>{label}</span><span className="text-ink tabular font-semibold">{fmt(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-navy" />
    </label>
  );
}

/* ---------------- table: sortable, paginated (no row cap), CSV export of all filtered rows ---------------- */
export function exportCsv(rows, columns, filename) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(",")).join("\n");
  const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
export function DataTable({ rows, columns, initialSort, onRowClick, filename = "export.csv", pageSize = 50, dense = false, rowClass }) {
  const [sort, setSort] = useState(initialSort || { key: null, dir: -1 });
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
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
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search in table…"
          className="border border-line rounded-md px-2 py-1 text-[12.5px] w-56 focus:outline-none focus:ring-2 focus:ring-s1/40" />
        <div className="flex items-center gap-2 text-[12px] text-mut">
          <span className="tabular">{sorted.length.toLocaleString("en-US")} rows</span>
          <button onClick={() => exportCsv(sorted, columns, filename)} className="px-2 py-1 border border-line rounded-md bg-white text-slate hover:border-slate">Export CSV</button>
        </div>
      </div>
      <div className="overflow-auto border border-line rounded-md max-h-[640px]">
        <table className="w-full text-[12.5px] tabular">
          <thead className="sticky top-0 bg-surface z-10">
            <tr>
              {columns.map((c) => (
                <th key={c.key} onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))} title={c.help}
                  className={`px-2 py-2 font-semibold text-slate border-b border-line cursor-pointer whitespace-nowrap select-none ${c.num ? "text-right" : "text-left"}`}>
                  {c.label}{sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.site_id || r.mbp_id || i} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`border-b border-line/70 ${onRowClick ? "cursor-pointer hover:bg-s1/5" : ""} ${rowClass ? rowClass(r) : ""}`}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-2 ${dense ? "py-1" : "py-1.5"} ${c.num ? "text-right" : ""} ${c.wrap ? "min-w-[260px]" : "whitespace-nowrap"}`}>
                    {c.render ? c.render(r) : r[c.key] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {!view.length && <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-mut">No rows for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-2 text-[12px] text-slate">
          <button disabled={p === 0} onClick={() => setPage(0)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">«</button>
          <button disabled={p === 0} onClick={() => setPage(p - 1)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">‹</button>
          <span className="tabular">Page {p + 1} / {pages}</span>
          <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">›</button>
          <button disabled={p >= pages - 1} onClick={() => setPage(pages - 1)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">»</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- the 14 mandatory columns (management order) ---------------- */
export const SITE14 = (design) => [
  { key: "mbp_priority_score", label: "1 · Priority", num: true, help: "MBP priority score (P1 highest): class, dependency, outage frequency, travel distance + ETA vs BBT + availability",
    render: (r) => <span className="inline-flex items-center gap-1.5"><LevelTag v={r.mbp_priority_level} /><span>{f2(r.mbp_priority_score)}</span></span>,
    csv: (r) => `${r.mbp_priority_level} ${f2(r.mbp_priority_score)}` },
  { key: "site_id", label: "2 · Site ID", render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
  { key: "site_name", label: "3 · Site Name" },
  { key: "site_class", label: "4 · Class" },
  { key: "dependency_children", label: "5 · Dependency", num: true, help: "Children sites — PROXY from the HUB Site bucket (no topology list in the data)",
    render: (r) => (isNum(r.dependency_children) ? <span title={r.hub_site}>{r.dependency_children} <span className="text-mut text-[10px]">PROXY</span></span> : "—") },
  { key: "nop", label: "6 · NOP" },
  { key: "bbt_design_min", label: "7 · BBT Design", num: true, render: () => <span>{design} min <span className="text-mut text-[10px]">PROXY</span></span>, csv: () => design },
  { key: "bbt_value_min", label: "8 · BBT Measured", num: true, help: "ACTUAL = Kaplan-Meier median of own events · DERIVED = monthly summary · ESTIMATED = comparable-site KM",
    render: (r) => <span className="inline-flex items-center gap-1.5">{r.bbt_is_lower_bound === 1 ? "≥ " : ""}{fMin(r.bbt_value_min)}<EvTag v={r.bbt_value_evidence} /></span>,
    csv: (r) => `${isNum(r.bbt_value_min) ? Math.round(r.bbt_value_min) : ""} ${r.bbt_value_evidence}` },
  { key: "pln_freq", label: "9 · PLN outage (freq)", num: true, render: (r) => fInt(r.pln_freq), help: "Distinct PLN outages Jan–Jun 2026 (overlaps merged)" },
  { key: "pln_total_h", label: "10 · Outage Duration", num: true, render: (r) => fH(r.pln_total_h) },
  { key: "km_assigned", label: "11 · Distance to MBP", num: true, render: (r) => fKm(r.km_assigned) },
  { key: "eta_min", label: "12 · Travel time", num: true, help: "ESTIMATED (road factor × speed by area + mobilisation). Island = no road ETA",
    render: (r) => (isNum(r.eta_min) ? <span className={r.eta_min > (r.bbt_value_min || 0) ? "text-crit font-semibold" : ""}>{fMin(r.eta_min)}</span> : <Tag tone="mut">{r.is_island ? "island" : "n/a"}</Tag>),
    csv: (r) => (isNum(r.eta_min) ? Math.round(r.eta_min) : r.is_island ? "island" : "") },
  { key: "mbp_deployments", label: "13 · Historical MBP", num: true, render: (r) => fInt(r.mbp_deployments) },
  { key: "mbp_backup_h", label: "14 · MBP backup time", num: true, render: (r) => fH(r.mbp_backup_h) },
  { key: "mbp_assigned", label: "Assigned MBP" },
  { key: "avail_wc_pct", label: "Availability", num: true, render: (r) => fPct(r.avail_wc_pct, 2) },
  { key: "reach_risk", label: "ETA > BBT", render: (r) => (r.reach_risk ? <Tag tone="crit">dark before MBP</Tag> : ""), csv: (r) => (r.reach_risk ? "yes" : "") },
];
