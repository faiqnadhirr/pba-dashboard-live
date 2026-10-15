"use client";
// PBA UI kit (2026-10-15) — ONE visual vocabulary for the four workflows. Presentation only: every badge reads an existing field /
// existing classification (lib/opstatus.js, lib/coverage.js, lib/bbsgroups.js); nothing is recomputed here.
//
//   concept            component      always shown as                       detailed label kept in
//   operational status OpBadge        colour dot + symbol + text            tooltip (definition)
//   reach (coverage)   ReachBadge     colour dot + ✔ / ✖ / ?                tooltip
//   failure reason     ReasonBadge    outlined chip                         tooltip (rule sentence)
//   battery condition  CondBadge      colour square + symbol + group        "· detailed status" + tooltip
//   evidence           EvBadge        group text + raw label (EvTag)        tooltip; estimates dashed + "≈"
//   priority           LevelTag       (ui.jsx — unchanged, symbol + level)
//   mode of a number   ModeBadge      "Estimasi model" / "Replay historis" / "Skenario hipotetis"
// Colour is never the only carrier: every badge has a symbol and text.
import React from "react";
import { EvTag, fMin, isNum } from "@/components/ui";
import { OP_COLOR } from "@/lib/opstatus";
import { STATUS_GROUP_COLOR, statusGroup, evGroup, evLabel } from "@/lib/bbsgroups";
import { reachTab } from "@/lib/coverage";
import { t, tv } from "@/lib/i18n";

export const OP_SYM = { check: "▲", movable: "⇄", ok: "✔", unrated: "?" };
export const REACH_SYM = { ok: "✔", no: "✖", unv: "?" };
export const REACH_COLOR = { ok: "#0ca30c", no: "#d03b3b", unv: "#A3ABB9" };
export const COND_SYM = { act: "✖", warn: "!", ok: "✔", unk: "?" };
export const EV_SYM = { measured: "●", estimated: "≈", unverified: "◌", none: "–" };

/** dot/square + symbol + text — the shared badge shape */
export function Chip({ c, sym, children, title, square = false, hollow = false, className = "" }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2 py-[1px] text-[11.5px] text-ink ${className}`}>
      <span aria-hidden className={`inline-flex items-center justify-center w-3.5 h-3.5 ${square ? "rounded-sm" : "rounded-full"} text-[9px] leading-none font-bold`}
        style={hollow ? { border: `2px solid ${c}`, color: c, background: "#fff" } : { background: c, color: "#fff" }}>{sym}</span>{children}</span>
  );
}

export const OpBadge = ({ op }) => <Chip c={OP_COLOR[op]} sym={OP_SYM[op]} title={t(`op.tip.${op}`)}>{t(`op.${op}`)}</Chip>;

export const ReachBadge = ({ s, tab }) => { const k = tab || reachTab(s);
  return <Chip c={REACH_COLOR[k]} sym={REACH_SYM[k]} hollow={k === "unv"} title={t(`cov.tab_tip.${k}`)}>{t(`rt.${k}`)}</Chip>; };

export const REASON_COLOR = { too_far: "#d03b3b", battery_short: "#eb6834", beyond: "#7a1414", island: "#334155" };
export const ReasonBadge = ({ r, cfg, more = [] }) => (!r ? null :
  <Chip c={REASON_COLOR[r]} sym="✖" square title={[t(`rw_tip.${r}`, { mob: cfg?.travel?.mobilization_minutes ?? "" }), ...more.map((x) => `${t("cov.p.also")}: ${t(`rw.${x}`)}`)].join("\n")}>
    {t(`rw.${r}`)}{more.length ? <span className="text-mut"> +{more.length}</span> : null}</Chip>);

/** condition group + the detailed status next to it (the original six statuses are never hidden) */
export const CondBadge = ({ s, detail = true }) => { const g = statusGroup(s);
  return <span className="inline-flex items-center gap-1 whitespace-nowrap">
    <Chip c={STATUS_GROUP_COLOR[g]} sym={COND_SYM[g]} square title={`${tv("status", s.bbt_status || "Unknown")} — ${t("status.tip")}`}>{t(`sg.${g}`).split(" (")[0]}</Chip>
    {detail && g !== "unk" && <span className="text-mut text-[11px]">{tv("status", s.bbt_status)}</span>}</span>; };

/** evidence group + the exact label; an estimate is drawn dashed so it never reads as a measurement */
export const EvBadge = ({ s, raw = true }) => { const g = evGroup(s), L = evLabel(s);
  return <span className="inline-flex items-center gap-1 whitespace-nowrap" title={t(`cond.evl.${L}`)}>
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[11.5px] ${g === "measured" ? "border border-[#2a78d6]/50 text-[#1d5aa3]" : g === "none" ? "border border-line text-mut" : "border border-dashed border-[#eb6834] text-[#9a3d12]"}`}>
      <span aria-hidden>{EV_SYM[g]}</span>{t(`eg.${g}`)}</span>{raw && <EvTag v={L} />}</span>; };

/** what kind of number this is: model estimate, historical replay, or a hypothetical scenario */
export const ModeBadge = ({ kind }) => (
  <span title={t(`mode.${kind}_tip`)} className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-[1px] text-[11px] font-semibold ${
    kind === "replay" ? "border-[#2a78d6]/50 text-[#1d5aa3] bg-[#2a78d6]/[0.06]" : kind === "scenario" ? "border-[#4a3aa7]/50 text-[#4a3aa7] bg-[#4a3aa7]/[0.06]" : "border-[#eb6834]/60 text-[#9a3d12] bg-[#eb6834]/[0.06]"}`}>
    <span aria-hidden>{kind === "replay" ? "↺" : kind === "scenario" ? "◇" : "≈"}</span>{t(`mode.${kind}`)}</span>);

/** ETA vs BBT at a glance: one bar scaled to max(ETA, BBT); the BBT is the line the MBP must beat */
export function EtaBbt({ eta, bbt, indicative = false }) {
  if (!isNum(eta) || !isNum(bbt)) return <div className="text-[12px] text-mut">{t("eb.na")}</div>;
  const M = Math.max(eta, bbt, 1), late = eta > bbt, w = (v) => `${Math.max(2, (100 * v) / M)}%`;
  if (indicative) return <div className="text-[12px]"><div className="tabular text-slate">ETA <b className="text-ink">{fMin(eta)}*</b> · BBT <b className="text-ink">{fMin(bbt)}</b></div>
    <div className="font-semibold text-[#334155]">{t("eb.island")}</div></div>;
  return (
    <div className="text-[12px]" aria-label={t(late ? "eb.late" : "eb.ok", { e: fMin(eta), b: fMin(bbt), d: fMin(Math.abs(eta - bbt)) })}>
      <div className="relative h-3 rounded bg-surface border border-line overflow-hidden">
        <div className={`absolute inset-y-0 left-0 ${late ? "bg-crit/70" : "bg-good/70"}`} style={{ width: w(eta) }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-ink" style={{ left: w(bbt) }} title={t("eb.bbt_line")} />
      </div>
      <div className="flex justify-between gap-2 mt-0.5 tabular text-slate">
        <span>ETA <b className="text-ink">{fMin(eta)}</b>{indicative ? "*" : ""}</span><span>BBT <b className="text-ink">{fMin(bbt)}</b></span></div>
      <div className={`font-semibold ${late ? "text-crit" : "text-good"}`}>{t(late ? "eb.late" : "eb.ok", { e: fMin(eta), b: fMin(bbt), d: fMin(Math.abs(eta - bbt)) })}</div>
    </div>
  );
}

/* ---------- entity detail panel: identity (Panel title) → status → one sentence → supporting values → next action ---------- */
export const PanelHead = ({ badges, why, children }) => (
  <div className="space-y-1">
    <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
    {why && <div className="text-[12.5px] text-ink leading-snug">{why}</div>}
    {children}
  </div>);
export const PanelLabel = ({ children }) => <div className="mt-2.5 mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate">{children}</div>;
export const Facts = ({ rows }) => (
  <table className="w-full text-[12px]"><tbody>
    {rows.filter(Boolean).map(([a, v]) => <tr key={typeof a === "string" ? a : a.key} className="border-b border-line/50"><td className="text-mut py-[3px] pr-2 align-top">{typeof a === "string" ? a.replace(/^\d+ · /, "") : a}</td><td className="text-right font-medium">{v}</td></tr>)}
  </tbody></table>);
/** only actions wired to a real workflow; a disabled action says why (title) */
export const NextActions = ({ items }) => { const L = items.filter(Boolean); if (!L.length) return null;
  return <div className="mt-3 space-y-1.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate">{t("panel.next")}</div>
    <div className="flex flex-wrap gap-1.5">{L.map((a) => <button key={a.label} onClick={a.onClick} disabled={a.disabled} title={a.title}
      className={`flex-1 min-w-[140px] rounded py-1.5 px-2 text-[12px] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${a.primary ? "bg-navy text-white" : "border border-navy text-navy bg-white hover:bg-navy/5"}`}>{a.label}</button>)}</div></div>; };
export const More = ({ title, children }) => (
  <details className="mt-2 text-[12px]"><summary className="cursor-pointer text-slate">{title || t("panel.more")}</summary><div className="mt-1">{children}</div></details>);
