"use client";
import React, { Fragment, useMemo, useState } from "react";
import { searchRows, sortRows, pageOfKey, rowKey } from "@/lib/table";
import { bbtDisplay } from "@/lib/logic";
import { t, tv, locale, withEnglish } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { showCoverageGap } from "@/lib/view";
import { Go } from "@/lib/nav";

/* ---------------- format (never None / nan; counts as integers; precision follows the data) ---------------- */
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const nf = (v, d) => v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
export const fInt = (v) => (isNum(v) ? nf(Math.round(v), 0) : "—");
export const f1 = (v) => (isNum(v) ? nf(v, 1) : "—");
export const f2 = (v) => (isNum(v) ? nf(v, 2) : "—");
export const f3 = (v) => (isNum(v) ? nf(v, 3) : "—");
export const fNum = (v, d = 1) => (isNum(v) ? nf(v, d) : "—");
export const fMin = (v) => (isNum(v) ? `${nf(Math.round(v), 0)} ${t("unit.min")}` : "—");
export const fH = (v) => (isNum(v) ? `${v < 10 ? nf(v, 1) : nf(Math.round(v), 0)} ${t("unit.h")}` : "—");
export const fKm = (v) => (isNum(v) ? `${nf(v, 1)} km` : "—");
export const fPct = (v, d = 2) => (isNum(v) ? `${nf(v, d)}%` : "—");
export const fPP = (v, d = 2) => (isNum(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)} pp` : "—");
/** coordinate exactly at the number of decimals that is actually published (no padding) */
export const fCoord = (v, dec = 3) => (isNum(v) ? v.toFixed(Math.max(0, Math.min(6, dec ?? 3))) : "—");
export const precisionNote = (dec) => (dec >= 6 ? "≈ ±0.1 m" : dec >= 5 ? "≈ ±1 m" : dec === 4 ? "≈ ±11 m" : dec === 3 ? "≈ ±110 m" : dec === 2 ? "≈ ±1.1 km" : dec === 1 ? "≈ ±11 km" : t("coord.unknown_precision"));
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
export const monthName = (i) => t(`month.${i}`);
/** glossary tooltip (ⓘ) — plain language, max 2 sentences, both languages */
export const Gloss = ({ k }) => (
  <span tabIndex={0} role="img" aria-label={t(`gloss.${k}`)} title={t(`gloss.${k}`)}
    className="inline-block align-super ml-0.5 text-[10px] leading-none text-s1 cursor-help rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">ⓘ</span>
);

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
export const LevelTag = ({ v, kind = "MBP" }) => { const L = LEVEL_KIND[kind][v]; return v && L ? <Pill {...L} title={t(kind === "MBP" ? "prio.mbp_tip" : "prio.bbs_tip", { v: `${kind}-${v}` })}><span aria-hidden>{L.i}</span>{kind}-{v}</Pill> : <span className="text-mut">—</span>; };
/** 1a — action label: "No action" from the BBS engine is shown as "Battery OK — MBP coverage gap" when MBP cannot arrive in time */
export const ActionLabel = ({ r, strong = false, onNavigate }) => {
  if (showCoverageGap(r)) return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span className={`text-[#8a5a00] ${strong ? "font-semibold" : "font-medium"}`} title={t("gap.tip")}>{t("gap.label")}</span>
      <Go to={{ view: "mbp.placement", nop: r.nop }} onBefore={onNavigate} className="text-s1 underline text-[11.5px] whitespace-nowrap" title={t("gap.link_tip", { nop: r.nop })}>{t("gap.link")} →</Go>
    </span>);
  const a = r.recommended_action;
  return a && a !== "No action" ? <span className={strong ? "font-semibold" : ""}>{tv("action", a)}</span> : <span className="text-mut">{tv("action", a) || "—"}</span>;
};
/** A3 — the only way a BBT value is rendered: status basis and number can never contradict */
export const BbtCell = ({ r, showStatus = false, statusFirst = false, noEv = false }) => {
  const d = bbtDisplay(r);
  // an estimate / unverified value is prefixed "≈" (presentation only) so it never reads as a measurement
  const est = d.evidence === "ESTIMATED" || d.evidence === "DERIVED-UNVERIFIED";
  const v = d.text ? <span className="text-slate">{t("bbt.no_battery_ticket")}</span> : <span className="tabular" title={est ? t("bbt.est_tip") : undefined}>{est && isNum(d.value) ? "≈ " : ""}{fMin(d.value)}</span>;
  return <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">{statusFirst && <StatusTag v={r.bbt_status} />}{v}{showStatus && !statusFirst && <StatusTag v={r.bbt_status} />}{!noEv && <EvTag v={d.evidence} />}</span>;
};
export const bbtCsv = (r) => { const d = bbtDisplay(r); return d.text ? d.text : `${isNum(d.value) ? Math.round(d.value) : ""} ${d.evidence || ""}`.trim(); };
export const StatusTag = ({ v }) => { const s = STATUS[v] || STATUS.Unknown; return v ? <Pill {...s} title={t("status.tip")}><span aria-hidden>{s.i}</span>{tv("status", v)}</Pill> : <span className="text-mut">—</span>; };
export const EvTag = ({ v }) => <Pill {...(EVID[v] || EVID.UNAVAILABLE)} title={t("evid.tip")}>{v || "UNAVAILABLE"}</Pill>;
export const Tag = ({ children, tone = "slate", title }) => {
  const m = { slate: "bg-slate/10 text-slate", crit: "bg-crit/10 text-[#9b1c1c]", warn: "bg-warn/25 text-ink", good: "bg-good/10 text-[#066b06]", mut: "bg-line text-slate" };
  return <span title={title} className={`inline-block px-1.5 py-[1px] rounded text-[11px] font-medium ${m[tone]}`}>{children}</span>;
};
export const GapTag = ({ v }) => (!isNum(v) ? <span className="text-mut">—</span> : v < 0
  ? <span className="text-[#9b1c1c] font-semibold tabular">▼ {fPP(v)}</span> : <span className="text-[#066b06] tabular">✔ {fPP(v)}</span>);
/** Availability · Target · Gap — always shown together */
export const AvailTriple = ({ a, t: tg, g, compact }) => (
  <span className="tabular whitespace-nowrap">{fPct(a)}<span className="text-mut"> {compact ? "/" : t("avail.vs_target")} {fPct(tg)} </span><GapTag v={g} /></span>
);

/* ---------------- layout ---------------- */
export function Card({ title, sub, right, children, className = "" }) {
  return (
    <section className={`bg-card border border-line rounded-lg min-w-0 ${className}`}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
          <div><h3 className="text-[14px] font-semibold text-navy">{title}</h3>{sub && <p className="text-[12px] text-mut mt-0.5">{sub}</p>}</div>
          {right}
        </header>
      )}
      <div className="p-4 pt-3">{children}</div>
    </section>
  );
}
export function Kpi({ label, value, sub, tone = "navy", scope, help, onClick, fixed }) {
  const c = { navy: "text-navy", crit: "text-[#b42318]", good: "text-[#066b06]", warn: "text-[#8a5a00]", slate: "text-slate" }[tone];
  // 2a: a clickable card opens the drilldown panel (pointer, hover, ↗, Enter/Space)
  const click = onClick ? { role: "button", tabIndex: 0, onClick, title: t("drill.open"), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } } : {};
  return (
    <div {...click} className={`relative bg-card border border-line rounded-lg px-4 py-3 min-w-0 ${onClick ? "cursor-pointer hover:border-s1 hover:shadow-md hover:bg-s1/[0.03] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" : ""}`}>
      {onClick && <span aria-hidden className="absolute right-1.5 bottom-1 text-[12px] text-s1">↗</span>}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide text-mut font-semibold" title={help}>{label}{help && <span className="normal-case ml-0.5 text-s1 cursor-help" aria-label={help}>ⓘ</span>}</div>
        {fixed && <span className="text-[9.5px] uppercase tracking-wide text-[#8a5a00] bg-warn/15 border border-warn/50 rounded px-1 whitespace-nowrap" title={t("per.fixed_tip")}>{t("per.full_badge")}</span>}
        {!fixed && scope && <span className="text-[9.5px] uppercase tracking-wide text-mut border border-line rounded px-1" title={t(scope === "portfolio" ? "kpi.portfolio_tip" : "kpi.filtered_tip")}>{t(scope === "portfolio" ? "kpi.portfolio" : "kpi.filtered")}</span>}
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
export function Empty({ children }) {
  return <div role="status" className="border border-dashed border-slate/40 rounded-lg p-8 text-center text-slate bg-white"><div className="text-[15px] font-semibold text-navy">{children ?? t("empty.no_sites")}</div><div className="text-[12.5px] mt-1">{t("empty.hint")}</div></div>;
}
/** v4.0 — long lists (base camps, kecamatan) get a search box: type to narrow the options, the current value always stays */
export function Select({ label, value, onChange, options, className = "" }) {
  const [q, setQ] = React.useState("");
  const norm = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const ql = q.trim().toLowerCase();
  const shown = ql ? norm.filter((o) => String(o.value) === String(value) || String(o.label).toLowerCase().includes(ql)) : norm;
  return (
    <label className={`flex flex-col gap-1 text-[12px] text-mut ${className}`}>
      {label}
      <div className="flex gap-1">
        {norm.length > 15 && <input value={q} onChange={(e) => { setQ(e.target.value); const L = e.target.value.trim().toLowerCase(); const hit = L && norm.find((o) => String(o.label).toLowerCase().includes(L)); if (hit) onChange(hit.value); }}
          placeholder={t("common.search")} aria-label={t("common.search")} className="w-24 border border-line rounded-md px-2 py-1.5 text-[13px] text-ink bg-white" />}
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 border border-line rounded-md px-2 py-1.5 text-[13px] text-ink bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1">
          {shown.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
        </select>
      </div>
    </label>
  );
}
export function Chips({ label, options, value, onChange, fmt = (o) => o }) {
  const set = new Set(value);
  return (
    <div className="flex flex-col gap-1 text-[12px] text-mut" role="group" aria-label={typeof label === "string" ? label : undefined}>
      {label}
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const on = set.has(o);
          return (
            <button key={o} aria-pressed={on} onClick={() => { const n = new Set(set); on ? n.delete(o) : n.add(o); onChange([...n]); }}
              className={`px-2 py-1 rounded-md border text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${on ? "bg-navy text-white border-navy" : "bg-white text-slate border-line hover:border-slate"}`}>{on ? "✓ " : ""}{fmt(o)}</button>
          );
        })}
      </div>
    </div>
  );
}
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12.5px] text-slate cursor-pointer select-none whitespace-nowrap shrink-0">
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
export function Bar100({ parts, height = 14, onSeg, legend = true }) {
  const tot = parts.reduce((a, p) => a + Math.max(0, p.v), 0) || 1;
  // 2b: with onSeg every segment (and legend item) is a button → "Click to view sites"
  const hint = onSeg ? ` — ${t("chart.click_sites")}` : "";
  const seg = (p) => (onSeg ? { role: "button", tabIndex: 0, onClick: (e) => { e.stopPropagation(); onSeg(p); }, onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSeg(p); } } } : {});
  return (
    <div className="w-full">
      <div className="flex w-full overflow-hidden rounded" style={{ height }} role={onSeg ? "group" : "img"} aria-label={parts.map((p) => `${p.label} ${Math.round((100 * p.v) / tot)}%`).join(", ")}>
        {parts.map((p) => p.v > 0 && <div key={p.label} {...seg(p)} title={`${p.label}: ${p.txt ?? `${Math.round((100 * p.v) / tot)}%`}${hint}`} style={{ width: `${(100 * p.v) / tot}%`, background: p.c }}
          className={`border-r-2 border-white last:border-r-0 ${onSeg ? "cursor-pointer hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink" : ""}`} />)}
      </div>
      {legend && <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11.5px] text-slate">
        {parts.map((p) => onSeg && p.v > 0
          ? <button key={p.label} onClick={() => onSeg(p)} title={t("chart.click_sites")} className="inline-flex items-center gap-1 hover:text-navy hover:underline"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.c }} />{p.label} {p.txt ?? `${Math.round((100 * p.v) / tot)}%`} <span aria-hidden className="text-s1">↗</span></button>
          : <span key={p.label} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.c }} />{p.label} {p.txt ?? `${Math.round((100 * p.v) / tot)}%`}</span>)}
      </div>}
    </div>
  );
}
/** Metric → Actual value → Threshold → Rule (standard explanation pattern) */
export function EvidenceTable({ rows, action }) {
  if (!rows?.length) return <div className="text-mut text-[12px]">{t("ev.none")}</div>;
  return (
    <table className="w-full text-[12px]">
      <thead><tr className="text-slate text-left">{[t("ev.metric"), t("ev.value"), t("ev.threshold"), t("ev.rule")].map((h) => <th key={h} className="py-1 pr-2 border-b border-line font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((e, i) => <tr key={i} className="border-b border-line/60 align-top"><td className="py-1 pr-2 font-medium">{tv("metric", e.metric)}</td><td className="py-1 pr-2 tabular">{te(String(e.value), "ev")}</td><td className="py-1 pr-2 text-slate">{te(e.threshold, "ev")}</td><td className="py-1 text-slate">{te(e.rule, "ev")}</td></tr>)}
        {action && <tr><td className="py-1 pr-2 font-semibold text-navy">→ {t("ev.action")}</td><td colSpan={3} className="py-1 font-semibold text-navy">{tv("action", action)}</td></tr>}</tbody>
    </table>
  );
}

/* ---------------- table: compact, sortable, paginated, expandable rows, CSV of all filtered rows ---------------- */
/** CSV is always English ('.' decimals, English headers) so downstream consumers get a stable format */
export function exportCsv(rows, columns, filename) {
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const { head, body } = withEnglish(() => ({
    head: columns.map((c) => esc(t(c.label))).join(","),
    body: rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(",")).join("\n"),
  }));
  const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
/** v5.0 — selectedKey / onSelect make the table one half of a map + table workspace: the selected record is highlighted, its page
 *  is opened and the row scrolled into view; clicking a row selects it (and still opens its expandable detail when there is one).
 *  Search → sort → page run through lib/table.js, the same pipeline the CSV export uses. */
export function DataTable({ rows, columns, initialSort, onRowClick, filename = "export.csv", pageSize = 100, dense = true, rowClass, expand, extraCsv = [], selectedKey = null, onSelect, keyFn, maxH = 620 }) {
  const [sort, setSort] = useState(initialSort || { key: null, dir: -1 });
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const filtered = useMemo(() => searchRows(rows, q, columns), [rows, q, columns]);
  const sorted = useMemo(() => sortRows(filtered, sort, columns), [filtered, sort, columns]);
  const keyOf = keyFn || rowKey;
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const selPage = useMemo(() => pageOfKey(sorted, selectedKey, pageSize, keyOf), [sorted, selectedKey, pageSize]); // eslint-disable-line
  // follow the selection to its page (only when the selection changes, so the user can still page away from it)
  React.useEffect(() => { if (selPage != null) setPage(selPage); }, [selectedKey]); // eslint-disable-line
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, (p + 1) * pageSize);
  const selRow = React.useRef(null), box = React.useRef(null);
  React.useEffect(() => { const el = selRow.current, b = box.current; if (el && b) { const top = el.offsetTop - b.clientHeight / 2; b.scrollTo({ top: Math.max(0, top), behavior: "auto" }); } }, [selectedKey, p]);
  const toggle = (k) => setOpen((o) => { const n = new Set(o); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const click = (r, k) => { if (onSelect) onSelect(r); if (expand) toggle(k); else if (!onSelect) onRowClick?.(r); };
  // frozen (sticky-left) columns: c.freeze = width in px
  const lefts = []; { let x = expand ? 24 : 0; for (const c of columns) { lefts.push(c.freeze ? x : null); if (c.freeze) x += c.freeze; } }
  const fz = (i, bg) => (columns[i].freeze ? { className: `sticky z-[5] ${bg}`, style: { left: lefts[i], minWidth: columns[i].freeze, maxWidth: columns[i].freeze } } : { className: "", style: undefined });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={t("table.search")} aria-label={t("table.search")}
          className="border border-line rounded-md px-2 py-1 text-[12.5px] w-56 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" />
        <div className="flex items-center gap-2 text-[12px] text-mut">
          <span className="tabular">{t("table.rows", { n: fInt(sorted.length) })}</span>
          <button onClick={() => exportCsv(sorted, [...columns, ...extraCsv], filename)} className="px-2 py-1 border border-line rounded-md bg-white text-slate hover:border-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" title={t("table.export_tip")}>{t("table.export")}</button>
        </div>
      </div>
      {selectedKey != null && selPage == null && rows.some((r, i) => keyOf(r, i) === selectedKey) && <div role="status" className="mb-2 text-[12px] text-[#8a5a00] bg-warn/10 border border-warn/40 rounded px-2 py-1">
        {t("table.sel_hidden_search", { k: selectedKey })} <button className="underline" onClick={() => setQ("")}>{t("table.clear_search")}</button></div>}
      <div ref={box} className="overflow-auto border border-line rounded-md relative" style={{ maxHeight: maxH }}>
        <table className="w-full text-[12px] tabular">
          <thead className="sticky top-0 bg-surface z-10">
            <tr>
              {expand && <th className="w-6 border-b border-line" aria-label={t("table.expand")} />}
              {columns.map((c, ci) => (
                <th key={c.key} scope="col" title={c.help ? t(c.help) : undefined} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} style={fz(ci).style}
                  className={`px-2 py-1.5 font-semibold text-slate border-b border-line whitespace-nowrap ${c.num ? "text-right" : "text-left"} ${fz(ci, "bg-surface").className}`}>
                  <button className="hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 rounded" onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}>
                    {c.short ? <span title={t(c.label)}>{c.short}</span> : c.plain ? t(c.label).replace(/^\d+ · /, "") : t(c.label)}{c.help ? <span className="text-s1 ml-0.5" aria-hidden>ⓘ</span> : null}{sort.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const k = keyOf(r, p * pageSize + i), isOpen = open.has(k), isSel = selectedKey != null && k === selectedKey;
              return (
                <Fragment key={k}>
                  <tr tabIndex={onRowClick || expand || onSelect ? 0 : undefined} ref={isSel ? selRow : undefined} aria-selected={onSelect ? isSel : undefined}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(r, k); } }}
                    onClick={() => click(r, k)}
                    className={`border-b border-line/70 ${onRowClick || expand || onSelect ? "cursor-pointer hover:bg-s1/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1" : ""} ${isSel ? "!bg-warn/25 outline outline-2 outline-[#eda100] -outline-offset-2" : isOpen ? "bg-s1/5" : ""} ${rowClass ? rowClass(r) : ""}`}>
                    {expand && <td className="px-1 text-slate" aria-hidden>{isOpen ? "▾" : "▸"}</td>}
                    {columns.map((c, ci) => { const v = c.render ? c.render(r) : r[c.key] ?? "—";
                      // tooltip of a truncated cell = the displayed (translated) text when it is plain text, else the CSV value
                      const tip = c.wrap && !c.tdClass ? String(typeof v === "string" || typeof v === "number" ? v : c.csv ? c.csv(r) : r[c.key] ?? "") : undefined;
                      return (
                      <td key={c.key} style={fz(ci).style} className={`px-2 ${dense ? "py-[3px]" : "py-1.5"} ${c.num ? "text-right" : ""} ${c.tdClass ?? (c.wrap ? "max-w-[360px] truncate" : "whitespace-nowrap")} ${fz(ci, "bg-white").className}`} title={tip}>
                        {v}
                      </td>); })}
                  </tr>
                  {expand && isOpen && <tr className="bg-surface/70 border-b border-line"><td /><td colSpan={columns.length} className="px-3 py-2">{expand(r)}</td></tr>}
                </Fragment>
              );
            })}
            {!view.length && <tr><td colSpan={columns.length + (expand ? 1 : 0)} className="px-3 py-6 text-center text-mut">{t("table.no_rows")}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-2 text-[12px] text-slate">
          {[["«", 0], ["‹", p - 1]].map(([l, to]) => <button key={l} aria-label={t(l === "«" ? "table.first" : "table.prev")} disabled={p === 0} onClick={() => setPage(to)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">{l}</button>)}
          <span className="tabular">{t("table.page", { p: p + 1, n: pages })}</span>
          {[["›", p + 1], ["»", pages - 1]].map(([l, to]) => <button key={l} aria-label={t(l === "»" ? "table.last" : "table.next")} disabled={p >= pages - 1} onClick={() => setPage(to)} className="px-2 py-0.5 border border-line rounded disabled:opacity-40">{l}</button>)}
        </div>
      )}
    </div>
  );
}

const actionTitle = (r) => (showCoverageGap(r) ? `${t("gap.label")} — ${t("gap.link")}` : tv("action", r.recommended_action) || "");
/* ---------------- site list columns: "Ringkas/Compact" (default) and "Detail" (14 mandatory columns, management order) ---------------- */
const NA = () => <span className="text-mut" title={t("common.no_data")}>—</span>;
const prioTip = (cfg) => t("prio.cutoffs", { p1: cfg.priority_levels.P1, p2: cfg.priority_levels.P2, p3: cfg.priority_levels.P3 });
const C = (cfg) => ({
  priority: { key: "mbp_priority_score", label: "col.s14.priority", num: true, freeze: 128, help: "col.s14.priority_tip",
    render: (r) => <span className="inline-flex items-center gap-1.5" title={prioTip(cfg)}><LevelTag kind="MBP" v={r.mbp_priority_level} /><span>{f3(r.mbp_priority_score)}</span></span>, csv: (r) => `MBP-${r.mbp_priority_level} ${r.mbp_priority_score?.toFixed(3)}` },
  site_id: { key: "site_id", label: "col.s14.site_id", freeze: 84, render: (r) => <span className="font-semibold text-navy">{r.site_id}</span> },
  site_name: { key: "site_name", label: "col.s14.site_name", render: (r) => <span className="inline-block max-w-[190px] truncate align-bottom" title={r.site_name}>{r.site_name}</span> },
  site_class: { key: "site_class", label: "col.s14.class" },
  dependency: { key: "dependency_children", label: "col.s14.dependency", num: true, help: "col.s14.dependency_tip", render: (r) => (isNum(r.dependency_children) ? <span title={t("col.s14.dependency_cell", { hub: r.hub_site })}>{r.dependency_children}</span> : <NA />) },
  nop: { key: "nop", label: "col.s14.nop" },
  // 3a — column 7 is the design the problem criteria actually use (standard 120 min unless Config says per-site)
  design: { key: "bbt_criteria_design_min", label: "col.s14.bbt_design", num: true, help: "col.s14.bbt_design_tip",
    render: (r) => <span title={cfg.bbt.criteria_basis === "site" ? t("design.site_tip") : t("design.std_tip")}>{fMin(r.bbt_criteria_design_min)}</span>, csv: (r) => r.bbt_criteria_design_min },
  computed: { key: "bbt_design_min", label: "col.computed_design", num: true, help: "col.computed_design_tip",
    render: (r) => <span title={r.bbt_design_basis} className="inline-flex items-center gap-1.5 text-slate">{fMin(r.bbt_design_min)}<EvTag v={r.bbt_design_evidence} /></span>, csv: (r) => `${r.bbt_design_min} ${r.bbt_design_evidence}` },
  bbt: { key: "bbt_value_min", label: "col.s14.bbt_measured", num: true, sortVal: (r) => r.battery?.display?.value, render: (r) => <BbtCell r={r} />, csv: bbtCsv },
  bbt_short: { key: "bbt_value_min", label: "col.bbt", num: true, sortVal: (r) => r.battery?.display?.value, render: (r) => <BbtCell r={r} showStatus />, csv: (r) => `${bbtCsv(r)} ${r.bbt_status}` },
  // 3b — unknown is "—", never 0
  pln_freq: { key: "pln_freq", label: "col.s14.pln_freq", num: true, sortVal: (r) => (r.pln_known ? r.pln_freq : null), render: (r) => (r.pln_known ? fInt(r.pln_freq) : <NA />), csv: (r) => (r.pln_known ? r.pln_freq : "") },
  pln_dur: { key: "pln_total_h", label: "col.s14.pln_dur", num: true, sortVal: (r) => (r.pln_known ? r.pln_total_h : null), render: (r) => (r.pln_known ? fH(r.pln_total_h) : <NA />), csv: (r) => (r.pln_known ? r.pln_total_h?.toFixed(1) : "") },
  distance: { key: "dist_km", label: "col.s14.distance", num: true, help: "col.s14.distance_tip",
    render: (r) => (isNum(r.dist_km) ? <span title={`${r.dist_mbp || ""}${r.dist_note ? " — " + r.dist_note : ""}`} className={r.within_radius ? "" : "text-[#b42318]"}>{r.within_radius ? "" : "✖ "}{fKm(r.dist_km)}</span> : t("site.no_coords")), csv: (r) => r.dist_km?.toFixed(1) },
  eta: { key: "dist_eta_min", label: "col.s14.eta", num: true, help: "col.s14.eta_tip",
    render: (r) => {
      if (!isNum(r.dist_eta_min)) return t("site.no_coords");
      const unknown = r.bbt_status === "Unknown", late = !r.can_arrive_before_bbt && !unknown;
      return <span className={late ? "text-[#b42318] font-semibold" : ""} title={unknown ? t("eta.bbt_unknown") : late ? t("eta.late") : te(r.dist_note, "dist_note") || ""}>
        {late ? "✖ " : unknown ? <span className="text-mut">? </span> : ""}{fMin(r.dist_eta_min)}{r.access_class === "island" ? <span className="text-mut font-normal text-[10px]"> {t("site.sea_access")}</span> : null}</span>;
    }, csv: (r) => (isNum(r.dist_eta_min) ? Math.round(r.dist_eta_min) : "") },
  within: { key: "within_radius", label: "col.within_radius", render: (r) => (r.within_radius ? <Tag tone="good">✔ {t("common.yes")}</Tag> : <Tag tone="crit">✖ {t("common.no")}</Tag>), csv: (r) => (r.within_radius ? "yes" : "no") },
  hist: { key: "mbp_deployments", label: "col.s14.hist_mbp", num: true, sortVal: (r) => (r.mbp_hist_known ? r.mbp_deployments : null), render: (r) => (r.mbp_hist_known ? fInt(r.mbp_deployments) : <NA />), csv: (r) => (r.mbp_hist_known ? r.mbp_deployments : "") },
  backup: { key: "mbp_backup_h", label: "col.s14.mbp_backup", num: true, sortVal: (r) => (r.mbp_hist_known ? r.mbp_backup_h : null), render: (r) => (r.mbp_hist_known ? fH(r.mbp_backup_h) : <NA />), csv: (r) => (r.mbp_hist_known ? r.mbp_backup_h?.toFixed(1) : "") },
  avail: { key: "avail_delta_pp", label: "col.avail_triple", num: true, sortVal: (r) => r.avail_delta_pp, render: (r) => <AvailTriple a={r.avail_wc_pct} t={r.ran_target_pct} g={r.avail_delta_pp} compact />, csv: (r) => (isNum(r.avail_wc_pct) ? `${r.avail_wc_pct.toFixed(2)} / ${r.ran_target_pct.toFixed(2)} / ${r.avail_delta_pp.toFixed(2)}` : "") },
  mbp: { key: "dist_mbp", label: "col.mbp_assigned_nearest" },
  mbp_assigned: { key: "mbp_assigned", label: "col.mbp_assigned", render: (r) => r.mbp_assigned || <span className="text-mut" title={t("eta.beyond_radius")}>{t("common.none_in_radius")}</span>, csv: (r) => r.mbp_assigned || "" },
  arrives: { key: "can_arrive_before_bbt", label: "col.arrives_before_bbt", render: (r) => (r.bbt_status === "Unknown" ? <Tag tone="mut">? {t("eta.bbt_unknown_short")}</Tag> : r.can_arrive_before_bbt ? <Tag tone="good">✔ {t("common.yes")}</Tag> : <Tag tone="crit">✖ {t("common.no")}</Tag>), csv: (r) => (r.can_arrive_before_bbt ? "yes" : "no") },
  action: { key: "recommended_action", label: "col.action", wrap: true, render: (r) => <ActionLabel r={r} />, csv: (r) => r.recommended_action },
});
export function siteColumns(cfg, mode = "compact", { showComputed = false } = {}) {
  const c = C(cfg);
  // compact: no column numbers (numbers only in Detail), narrower text columns so Action is visible at ~1350 px without scrolling
  if (mode === "compact") {
    const clip = (w, f) => (r) => { const v = f(r); return <span className="inline-block truncate align-bottom" style={{ maxWidth: w }} title={typeof v === "string" ? v : undefined}>{v}</span>; };
    return [c.priority, c.site_id, { ...c.site_name, render: clip(130, (r) => r.site_name) }, c.site_class, { ...c.nop, render: (r) => <span title={r.nop}>{String(r.nop || "").replace(/^NOP /, "")}</span> },
      { ...c.bbt_short, tdClass: "whitespace-normal", render: (r) => <span className="inline-flex flex-wrap items-center gap-1 max-w-[150px]"><BbtCell r={r} showStatus /></span> },
      { ...c.mbp_assigned, render: (r) => (r.mbp_assigned ? clip(130, (x) => x.mbp_assigned)(r) : <span className="text-mut" title={t("eta.beyond_radius")}>—</span>) },
      { ...c.eta, render: (r) => (isNum(r.dist_eta_min) ? c.eta.render(r) : <span className="text-mut" title={t("site.no_coords")}>—</span>) },
      { ...c.action, tdClass: "whitespace-normal", render: (r) => <span className="block line-clamp-2 min-w-[140px] max-w-[220px]" title={actionTitle(r)}><ActionLabel r={r} /></span> }].map((x) => ({ ...x, plain: true }));
  }
  return [c.priority, c.site_id, c.site_name, c.site_class, c.dependency, c.nop, c.design, ...(showComputed ? [c.computed] : []), c.bbt, c.pln_freq, c.pln_dur,
    c.distance, c.eta, c.within, c.hist, c.backup, c.avail, c.mbp, c.arrives];
}

/** v4.2 (FIX-15) — field with > 50 % of sites empty: shown wherever the field is used */
export const LowCov = ({ field }) => <span title={t("lowcov.tip", { f: field || "" })} className="ml-1 text-[10px] px-1 py-[1px] rounded bg-warn/25 text-[#8a5a00] align-middle whitespace-nowrap">{t("lowcov.badge")}</span>;

/* ===================================================================== vNext — shared building blocks */
/** semantic colours (one meaning each): good / warning / critical / unknown / proposed. Scenario-change colours are separate (SCN). */
export const SEM = { good: "#0ca30c", warn: "#eda100", crit: "#d03b3b", unk: "#A3ABB9", prop: "#4a3aa7", ink: "#141821" };
/** scenario vs baseline: green = better, red = worse, purple = new unit / location, grey = unchanged (with text) or unknown (hollow) */
export const SCN = { gain: "#0ca30c", lost: "#d03b3b", new: "#4a3aa7", same_ok: "#8A94A6", same_no: "#55627A", unk: "#D5DAE2" };

/** ⓘ with a native tooltip — definitions stay out of the main text */
export const InfoTip = ({ text, label }) => (
  <span className="inline-flex items-center gap-0.5 cursor-help" title={text} aria-label={text}>{label}<span className="text-s1" aria-hidden>ⓘ</span></span>
);

/** one detail-panel surface for map selections (base camp / site): light surface, white body, navy title strip */
export function Panel({ title, sub, onClose, children, className = "", empty }) {
  return (
    <aside className={`rounded-md border border-line bg-surface text-[12.5px] overflow-hidden ${className}`}>
      {title ? <div className="flex items-start gap-2 px-3 py-2 border-b border-line bg-navy/[0.04]">
        <div className="flex-1 min-w-0"><div className="font-semibold text-navy text-[14px] truncate">{title}</div>{sub && <div className="text-slate truncate">{sub}</div>}</div>
        {onClose && <button onClick={onClose} className="text-slate text-[18px] leading-none" aria-label={t("ws.clear_sel")}>×</button>}</div> : null}
      <div className="p-3 bg-white/70">{title ? children : <div className="text-mut">{empty}</div>}</div>
    </aside>
  );
}

/** progress toward a target: segments [{k,label,v,c,hollow?}] over a denominator; optional click per segment */
export function Meter({ parts, total, onSeg, active = [], height = 12, showLegend = true }) {
  const T = total || parts.reduce((a, p) => a + p.v, 0) || 1;
  return (
    <div>
      <div className="flex w-full rounded overflow-hidden bg-line/60" style={{ height }} role="img" aria-label={parts.map((p) => `${p.label} ${fInt(p.v)}`).join(", ")}>
        {parts.map((p) => p.v > 0 && <div key={p.k} title={`${p.label}: ${fInt(p.v)} (${fPct((100 * p.v) / T, 0)})`} onClick={onSeg ? () => onSeg(p.k) : undefined}
          className={`border-r-2 border-white last:border-r-0 ${onSeg ? "cursor-pointer hover:opacity-80" : ""} ${active.length && !active.includes(p.k) ? "opacity-30" : ""}`}
          style={{ width: `${(100 * p.v) / T}%`, background: p.hollow ? `repeating-linear-gradient(45deg, ${p.c}, ${p.c} 3px, #fff 3px, #fff 6px)` : p.c }} />)}
      </div>
      {showLegend && <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11.5px] text-slate">
        {parts.map((p) => { const on = !active.length || active.includes(p.k); const inner = <><span className="w-2.5 h-2.5 rounded-sm inline-block border border-navy/20" style={{ background: p.c }} />{p.label} <b className="tabular text-ink">{fInt(p.v)}</b></>;
          return onSeg ? <button key={p.k} onClick={() => onSeg(p.k)} disabled={!p.v && !active.includes(p.k)} aria-pressed={!!active.length && active.includes(p.k)} className={`inline-flex items-center gap-1 rounded px-1 ${active.includes(p.k) ? "bg-navy/10 ring-1 ring-navy/40" : "hover:bg-surface"} ${on ? "" : "opacity-50"} disabled:cursor-default disabled:opacity-50`}>{inner}</button>
            : <span key={p.k} className="inline-flex items-center gap-1">{inner}</span>; })}
      </div>}
    </div>
  );
}

/** segmented control for mutually exclusive choices */
export function Seg({ value, onChange, options, label, size = "sm" }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-line shrink-0" role="group" aria-label={label}>
      {options.map(([v, l, tip]) => <button key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)} title={tip}
        className={`${size === "sm" ? "px-2 py-0.5 text-[12px]" : "px-2.5 py-1.5 text-[12.5px]"} whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${value === v ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{l}</button>)}
    </div>
  );
}

/** vNext — radius: Config presets (25 / 50 / 100 km) + Custom (number input, applied on Enter / blur). The value is cfg.mbp.max_radius_km
 *  (the preferred radius); it never changes the reach-before-BBT KPI (search limit = reach_cap_km). */
export const RADIUS_PRESETS = [25, 50, 100];   // fallback when Config has no mbp.radius_presets
export function RadiusControl({ value, onChange, def, presets = RADIUS_PRESETS, max = 100 }) {
  const custom = !presets.includes(value);
  const [open, setOpen] = React.useState(false), [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const v = Math.round(Number(draft)); if (Number.isFinite(v) && v >= 5 && v <= max && v !== value) onChange?.(v); else setDraft(String(value)); };
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={t("map.radius")}>
      <span className="text-mut">{t("map.radius")}</span>
      <div className="flex rounded-md overflow-hidden border border-line">
        {presets.map((r) => <button key={r} aria-pressed={value === r} onClick={() => { setOpen(false); onChange?.(r); }}
          className={`px-2 py-0.5 text-[12px] tabular ${value === r ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{r} km</button>)}
        <button aria-pressed={custom || open} onClick={() => setOpen(true)} className={`px-2 py-0.5 text-[12px] ${custom ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>
          {custom ? `${value} km` : t("map.radius_custom")}</button>
      </div>
      {open && <input type="number" min={5} max={max} step={5} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} aria-label={t("map.radius_custom")} className="w-16 border border-line rounded px-1.5 py-0.5 text-[12px] tabular" />}
      {def != null && value !== def && <button onClick={() => onChange?.(def)} className="text-s1 underline text-[11.5px]" title={t("map.radius_def_tip")}>{t("map.radius_def", { r: def })}</button>}
    </div>
  );
}
/** vNext — method / assumption text folded away from the main view (still one click away, never removed) */
export function Method({ children, title, tone = "info", open = false }) {
  return (
    <details open={open} className="text-[12.5px]">
      <summary className="cursor-pointer text-slate hover:text-navy select-none">{title || t("common.method")} <span className="text-s1">ⓘ</span></summary>
      <div className="mt-1"><Note tone={tone}>{children}</Note></div>
    </details>
  );
}
