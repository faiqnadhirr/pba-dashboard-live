"use client";
// v3.5 — justification of a map unit (NOP or cluster), built bottom-up from its sites: share of problem sites, the clusters
// behind a NOP, and the sites that drive it, each with its own one-line reason. Breadcrumb AREA › NOP › cluster › site.
import React, { useEffect, useMemo } from "react";
import { fInt, fH, fPct, Bar100 } from "./ui";
import { t } from "@/lib/i18n";
import { Go } from "@/lib/nav";
import { MAP_MODES } from "@/lib/mapmodes";
import { justify } from "@/lib/rollup";
import { keyLabel, keyColor, siteWhy } from "./mapModes";

export default function RollupPanel({ unit, sites, mode, onOpen, onClose, onPickSite, onFilterNop, area = "AREA1", periodText }) {
  useEffect(() => { if (!unit) return; const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [unit, onClose]);
  const J = useMemo(() => (unit ? justify(sites, unit.level, unit.id, mode) : null), [unit, sites, mode]);
  if (!unit || !J) return null;
  const M = MAP_MODES[mode], u = J.unit, hrs = M.sizeUnit === "h";
  const badLabels = M.bad.filter((k) => u.counts[k]).map((k) => keyLabel(mode, k)).join(", ");
  const badKeys = M.bad.filter((k) => u.counts[k]);
  const sel = mode !== "trend" && badKeys.length ? `map_${mode}~${badKeys.join("+")}` : null;
  const crumb = (
    <nav className="text-[12px] opacity-90 flex flex-wrap items-center gap-1" aria-label={t("roll.crumb")}>
      <button onClick={onClose} className="underline hover:opacity-100">{area}</button><span>›</span>
      {unit.level === "cluster" ? <><button onClick={() => onOpen({ level: "nop", id: u.nop })} className="underline">{u.nop}</button><span>›</span><span className="font-semibold">{u.id}</span></>
        : <span className="font-semibold">{u.id}</span>}
    </nav>);
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={u.id}>
      <div className="absolute inset-0 bg-ink/30" />
      <aside className="relative w-full max-w-[820px] h-full overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-navy text-white px-5 py-3 flex items-start justify-between z-10">
          <div className="min-w-0">
            {crumb}
            <div className="text-[18px] font-bold mt-0.5">{u.id}</div>
            <div className="text-[12px] opacity-80">{t(`roll.level.${unit.level}`)} · {t("roll.mode", { m: t(`map.mode.${mode}`) })}{periodText ? ` · ${periodText}` : ""}</div>
          </div>
          <button autoFocus onClick={onClose} className="text-white/80 hover:text-white text-[22px] leading-none px-2" aria-label={t("drawer.close")}>×</button>
        </header>
        <div className="p-5 space-y-4">
          <div className="bg-card border border-line rounded-lg p-4">
            <div className="text-[11px] uppercase tracking-wide text-mut font-semibold">{t("roll.why_title")}</div>
            <div className="text-[15px] text-ink mt-1 leading-snug">
              {t("roll.why", { p: fPct(100 * u.badShare, 0), b: fInt(u.bad), n: fInt(u.n), k: badLabels || "—" })}
              {M.size && u.size > 0 && <> {t(hrs ? "roll.size_h" : "roll.size", { v: fH(u.sizeBad), all: fH(u.size), p: fPct((100 * u.sizeBad) / u.size, 0), m: t(`map.size.${mode}`) })}</>}
            </div>
            <div className="text-[11.5px] text-mut mt-1">{t("roll.basis")}</div>
            <div className="mt-3"><Bar100 height={14} parts={J.keys.map((k) => ({ k, label: keyLabel(mode, k), c: keyColor(mode, k), v: u.counts[k], txt: `${fInt(u.counts[k])} · ${fPct((100 * u.counts[k]) / u.n, 0)}` }))} /></div>
            <div className="flex flex-wrap gap-2 mt-3">
              {sel && <Go to={{ view: "mbp.sitelist", sel, nop: u.nop }} onBefore={onClose} className="inline-flex items-center gap-1 bg-navy text-white rounded-md px-3 py-1.5 text-[12.5px] font-semibold hover:bg-s1">{unit.level === "nop" ? t("roll.view_sites", { n: fInt(u.bad) }) : t("roll.view_sites_nop", { nop: u.nop })}</Go>}
              {onFilterNop && <button onClick={() => { onFilterNop(u.nop); onClose(); }} className="px-3 py-1.5 rounded-md border border-line bg-white text-[12.5px] text-navy hover:border-slate">{t("roll.filter_nop", { nop: u.nop })}</button>}
            </div>
            {unit.level === "cluster" && <div className="text-[11px] text-mut mt-1">{t("roll.cluster_list_note")}</div>}
          </div>

          {J.child && J.child.length > 1 && (
            <div className="bg-card border border-line rounded-lg p-4">
              <div className="text-[13px] font-semibold text-navy">{t("roll.children")}</div>
              <div className="text-[11.5px] text-mut mb-2">{t("roll.children_sub")}</div>
              <div className="space-y-1">
                {J.child.map((c) => (
                  <button key={c.id} onClick={() => onOpen({ level: "cluster", id: c.id })} className="w-full grid grid-cols-[200px_minmax(0,1fr)_110px] items-center gap-2 text-[12px] text-left hover:bg-s1/5 rounded px-1 py-0.5" title={t("roll.open_cluster")}>
                    <span className="truncate text-s1 underline">{c.id}</span>
                    <span className="flex h-3 rounded overflow-hidden bg-line/40">{MAP_MODES[mode].keys.filter((k) => c.counts[k]).map((k) => <span key={k} style={{ width: `${(100 * c.counts[k]) / c.n}%`, background: keyColor(mode, k) }} />)}</span>
                    <span className="tabular text-right">{fPct(100 * c.badShare, 0)} · {fInt(c.n)}</span>
                  </button>))}
              </div>
            </div>)}

          <div className="bg-card border border-line rounded-lg p-4">
            <div className="text-[13px] font-semibold text-navy">{t("roll.drivers", { n: fInt(J.drivers.length), N: fInt(J.nDrivers) })}</div>
            <div className="text-[11.5px] text-mut mb-2">{t(M.size ? "roll.drivers_sub" : "roll.drivers_sub_nosize", { m: M.size ? t(`map.size.${mode}`) : "" })}</div>
            {!J.drivers.length ? <div className="text-[12px] text-mut">{t("roll.no_drivers")}</div> : (
              <ul className="divide-y divide-line/70">
                {J.drivers.map((s) => (
                  <li key={s.site_id}><button onClick={() => onPickSite?.(s)} className="w-full text-left py-1.5 hover:bg-s1/5 rounded px-1">
                    <div className="flex items-center gap-2 text-[12.5px]">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: keyColor(mode, M.key(s)) }} />
                      <b className="text-navy">{s.site_id}</b><span className="text-slate truncate">{s.site_name}</span>
                      <span className="text-mut text-[11px] truncate">{s.cluster_to}</span>
                      {M.size && <span className="ml-auto tabular text-[11.5px] text-ink whitespace-nowrap">{fH(M.size(s))}</span>}
                    </div>
                    <div className="text-[11.5px] text-slate pl-4.5 ml-[18px] line-clamp-2">{siteWhy(mode, s)}</div>
                  </button></li>))}
              </ul>)}
          </div>
        </div>
      </aside>
    </div>
  );
}
