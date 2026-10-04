"use client";
// 2a — one generic "Total → breakdown" side panel (same shell as the site drawer). Opened from clickable KPI cards / fields.
import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { EvTag, fInt, fH, fPct } from "./ui";
import { t, tv } from "@/lib/i18n";
import { Go } from "@/lib/nav";
import { DRILLS, drillModel, applySel, parseSel } from "@/lib/drill";

const baseId = (id) => (id.startsWith("bbs_") ? "bbs" : id.startsWith("field_") ? "field" : id);
export function segLabel(id, k, extra) {
  if (k === "other") return t("drill.seg.other", { l: extra || "" });
  if (id === "downtime") return tv("cause", k);
  if (id === "cov") return t(`mbp.seg.${k}`);
  if (id.startsWith("field_")) return k === "UNAVAILABLE" ? `${k} · ${t("drill.seg.none")}` : k;
  return t(`drill.seg.${k}`);
}

/** human label of a ?sel= Site-list preset (chip in the Site list) */
export function selLabel(sel) {
  const p = parseSel(sel); if (!p) return null;
  const { id, seg } = p;
  if (id === "cause") return t("drill.chip.cause", { c: tv("cause", seg) });
  if (id === "resp") return t("drill.chip.resp", { r: tv("resp", seg) });
  const title = id.startsWith("bbs_") ? t("drill.bbs.title", { p: id.slice(4) }) : id.startsWith("field_") ? t("drill.field.title", { f: t(`dq.field.${id.slice(6)}`) }) : t(`drill.${baseId(id)}.title`);
  if (seg === "total") return title;
  return `${title} › ${DRILLS[id].groups?.[seg] ? t(`drill.group.${seg}`) : seg.split("+").map((k) => segLabel(id, k)).join(", ")}`;
}

export default function DrillPanel({ drill, scope, nop, cfg, onClose }) {
  const id = drill?.id;
  const [seg, setSeg] = useState("total");
  useEffect(() => { setSeg(drill?.focus || "total"); }, [drill]);
  useEffect(() => { if (!drill) return; const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [drill, onClose]);
  const groupKey = nop === "All NOPs" ? "nop" : "cluster_to";
  const M = useMemo(() => (id && DRILLS[id] ? drillModel(id, scope, groupKey) : null), [id, scope, groupKey]);
  if (!drill || !M) return null;
  const { d, segs, all, rows } = M;
  const hours = d.unit === "hours", fmt = (v) => (hours ? fH(v) : fInt(v));
  const pct = (v) => fPct((100 * v) / Math.max(all, 1e-9), 0);
  const selKeys = seg === "total" ? null : seg === "other" ? segs.find((x) => x.k === "other")?.of.join("+") : seg;
  const sel = selKeys ? `${id}~${selKeys}` : drill.focus && drill.focus !== "total" ? `${id}~${drill.focus}` : id;
  const N = applySel(scope, sel).rows.length;
  const B = baseId(id);
  const cnt = Object.fromEntries(segs.map((x) => [x.k, fInt(x.n)]));
  const vars = { ...cnt, n: fInt(M.totalSites), u: fInt(M.universe), v: fmt(M.totalValue), r: cfg.mbp.max_radius_km, p: id.slice(4), f: id.startsWith("field_") ? t(`dq.field.${id.slice(6)}`) : "" };
  const title = id.startsWith("bbs_") ? t("drill.bbs.title", { p: id.slice(4) }) : id.startsWith("field_") ? t("drill.field.title", { f: vars.f }) : t(`drill.${B}.title`);
  const lbl = (x) => segLabel(id, x.k, x.of?.map((k) => segLabel(id, k)).join(", "));
  const active = (k) => seg === "total" || seg === k || !!d.groups?.[seg]?.includes(k);
  const donut = segs.length <= 5;
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/30" />
      <aside className="relative w-full max-w-[860px] h-full overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-navy text-white px-5 py-3 flex items-start justify-between z-10">
          <div>
            <div className="text-[18px] font-bold">{title}</div>
            <div className="text-[12px] opacity-80">{t("drill.scope", { s: nop === "All NOPs" ? t("filter.all_nops") : nop })} · <span className="uppercase tracking-wide text-[10.5px] border border-white/40 rounded px-1">{t("kpi.filtered")}</span></div>
          </div>
          <button autoFocus onClick={onClose} className="text-white/80 hover:text-white text-[22px] leading-none px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn" aria-label={t("drawer.close")}>×</button>
        </header>
        <div className="p-5 space-y-4">
          <div className="bg-card border border-line rounded-lg p-4 relative">
            <Go to={{ view: "mbp.sitelist", sel }} onBefore={onClose} className="absolute right-4 top-4 inline-flex items-center gap-1 bg-navy text-white rounded-md px-3 py-1.5 text-[13px] font-semibold hover:bg-s1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn">{t("drill.view_sites", { n: fInt(N) })}</Go>
            <div className="text-[11px] uppercase tracking-wide text-mut font-semibold">{t("drill.total")}</div>
            <div className="text-[28px] font-bold text-navy tabular leading-tight">{fmt(M.totalValue)}{hours && <span className="text-[13px] font-medium text-slate ml-2">{t("drill.in_sites", { n: fInt(M.totalSites) })}</span>}</div>
            <div className="text-[12px] text-slate mt-0.5">{seg === "total" ? t("drill.sel_total") : t("drill.sel_seg", { s: d.groups?.[seg] ? t(`drill.group.${seg}`) : lbl(segs.find((x) => x.k === seg) || { k: seg }) })}</div>
            <div className="text-[12.5px] text-slate mt-1"><b className="text-ink">{t("drill.formula")}:</b> {t(`drill.${B}.formula`, vars)}</div>
          </div>
          <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4">
            <div className="bg-card border border-line rounded-lg p-4">
              <div className="text-[13px] font-semibold text-navy">{t(hours ? "drill.composition_h" : "drill.composition")}</div>
              {donut && <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={segs} dataKey="v" nameKey="k" innerRadius={46} outerRadius={74} paddingAngle={1} isAnimationActive={false}
                    label={({ v }) => (v / all >= 0.04 ? pct(v) : "")} labelLine={false} onClick={(x) => setSeg(x.k === seg ? "total" : x.k)}>
                    {segs.map((x) => <Cell key={x.k} fill={x.c} opacity={active(x.k) ? 1 : 0.3} cursor="pointer" />)}
                  </Pie>
                  <Tooltip formatter={(v, n, p) => [`${fmt(v)} · ${pct(v)}`, lbl(p.payload)]} />
                </PieChart>
              </ResponsiveContainer>}
              <ul className="space-y-1 mt-1" aria-label={t("drill.hint")}>
                {segs.map((x) => (
                  <li key={x.k}><button onClick={() => setSeg(x.k === seg ? "total" : x.k)} aria-pressed={seg === x.k}
                    className={`w-full flex items-start gap-2 text-left text-[12px] rounded px-1 py-0.5 hover:bg-s1/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-s1 ${seg === x.k ? "bg-s1/10 font-semibold" : ""}`}>
                    <span className="w-2.5 h-2.5 rounded-sm mt-1 shrink-0" style={{ background: x.c }} />
                    <span className="flex-1 min-w-0">{d.evtags && x.k !== "other" ? <EvTag v={x.k} /> : lbl(x)}</span>
                    <span className="tabular text-right whitespace-nowrap">{fmt(x.v)} · {pct(x.v)}</span>
                  </button></li>))}
              </ul>
              <div className="text-[11px] text-mut mt-1">{t("drill.hint")}</div>
            </div>
            <div className="bg-card border border-line rounded-lg p-4 min-w-0">
              <div className="text-[13px] font-semibold text-navy">{t(groupKey === "nop" ? "drill.by_nop" : "drill.by_cluster")}</div>
              <div className="text-[11.5px] text-mut mb-2">{t("drill.sorted_by", { s: lbl(segs.find((x) => x.k === d.none) || { k: d.none }) })}</div>
              <div className="space-y-1 max-h-[440px] overflow-y-auto pr-1">
                {rows.map((r) => (
                  <div key={r.unit} className="grid grid-cols-[130px_minmax(0,1fr)_64px] items-center gap-2 text-[11.5px]">
                    <span className="truncate" title={r.unit}>{r.unit.replace(/^NOP /, "")}</span>
                    <div className="flex h-3.5 rounded overflow-hidden bg-line/40">
                      {segs.map((x) => { const v = r.v[x.k] || 0; return v > 0 && <div key={x.k} style={{ width: `${(100 * v) / r.sum}%`, background: x.c, opacity: active(x.k) ? 1 : 0.3 }}
                        title={`${r.unit} · ${lbl(x)}: ${fmt(v)} (${fPct((100 * v) / r.sum, 0)})`} className="border-r border-white last:border-r-0" />; })}
                    </div>
                    <span className="tabular text-right text-slate">{fPct(100 * r.noneShare, 0)}</span>
                  </div>))}
              </div>
              <div className="text-[10.5px] text-mut mt-1 text-right">{t("drill.none_share_col", { s: lbl(segs.find((x) => x.k === d.none) || { k: d.none }) })}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
