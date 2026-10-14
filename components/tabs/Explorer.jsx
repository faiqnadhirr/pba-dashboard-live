"use client";
// MBP › Coverage & Site Explorer — Bucket 2 (2026-10-14): ONE question — which priority sites are NOT reached in time, and why?
//   tabs on the P1/P2 sites in scope: Keburu · Tidak keburu (default) · Belum bisa dinilai   (lib/coverage.js › reachTab = KPI rule)
//   reasons for "Tidak keburu": pulau · di luar jangkauan · baterai < mobilisasi · terlalu jauh  (lib/coverage.js › reachReasons)
//   one map colouring (reason / tab), base camps neutral; one column set sorted by ETA − BBT; CSV keeps every detailed field.
// Drill presets from other pages (?sel=…, e.g. Data quality rows) still land here and replace the tabs with their own filter chip.
// Moved away: battery-condition colouring (→ BBS), base-camp performance colours (→ Fleet), dispatch panel (→ Planning › outage).
import React, { useMemo } from "react";
import Workspace from "@/components/Workspace";
import { siteColumns, BbtCell, LevelTag, InfoTip, fInt, fMin, fKm, isNum } from "@/components/ui";
import { applySel } from "@/lib/drill";
import { selLabel } from "@/components/DrillPanel";
import { REACH_TABS, REASONS, reachTab, reachReasons, etaGap, nearestCamps, reachBreakdown, isP12 } from "@/lib/coverage";
import { campCode } from "@/lib/mbpperf";
import { t } from "@/lib/i18n";

const TAB_COLOR = { ok: "#0ca30c", no: "#d03b3b", unv: "#C4CAD4" };
const WHY_COLOR = { too_far: "#d03b3b", battery_short: "#eb6834", beyond: "#7a1414", island: "#334155" };

export default function Explorer(ctx) {
  const { scope, cfg, sel: drillSel, setSel: setDrillSel, nop, names } = ctx;
  const reachSel = !drillSel || String(drillSel).startsWith("reach_p12~");
  const tab = reachSel ? (drillSel ? String(drillSel).split("~")[1].split("+")[0] : "no") : null;
  const why = reachSel && drillSel && String(drillSel).split("~")[2] ? String(drillSel).split("~")[2] : null;
  const setTab = (x) => setDrillSel(x === "no" ? null : `reach_p12~${x}`);
  const setWhy = (w) => setDrillSel(w && w !== why ? `reach_p12~no~${w}` : null);
  const B = useMemo(() => reachBreakdown(scope, cfg), [scope, cfg]);
  // the record set: P1/P2 of the tab (+ reason) — or the rows of a foreign drill preset
  const rows = useMemo(() => {
    const base = reachSel ? scope.filter((s) => isP12(s) && reachTab(s) === (REACH_TABS.includes(tab) ? tab : "no")) : applySel(scope, drillSel).rows;
    return base.map((s) => { const R = reachReasons(s, cfg); return { ...s, _why: R[0] || null, _whys: R, _gap: etaGap(s) }; }).filter((s) => !why || s._why === why);
  }, [scope, cfg, reachSel, tab, why, drillSel]);
  const nm = (id) => (id ? (names ? id : campCode(id)) : "—");
  const T = cfg.travel;
  const cols = [
    { key: "site_id", label: "col.site", render: (r) => <span className="inline-block max-w-[220px] truncate align-bottom" title={r.site_name}><b className="text-navy">{r.site_id}</b> <span className="text-slate">{r.site_name}</span></span>, csv: (r) => r.site_id },
    { key: "mbp_priority_score", label: "col.mbp_priority", num: true, render: (r) => <LevelTag v={r.mbp_priority_level} />, csv: (r) => `MBP-${r.mbp_priority_level} ${r.mbp_priority_score?.toFixed(3) ?? ""}` },
    { key: "bbt_effective_min", label: "col.bbt", num: true, sortVal: (r) => r.battery?.display?.value ?? null, render: (r) => <BbtCell r={r} />, csv: (r) => r.battery?.display?.value ?? "" },
    { key: "dist_mbp", label: "cov.col.nearest", render: (r) => nm(r.dist_mbp), csv: (r) => r.dist_mbp || "" },
    { key: "eta", label: "cov.col.eta", num: true, sortVal: (r) => r.eta_min ?? r.dist_eta_min ?? null, render: (r) => fMin(r.eta_min ?? r.dist_eta_min), csv: (r) => { const e = r.eta_min ?? r.dist_eta_min; return isNum(e) ? Math.round(e) : ""; } },
    { key: "_gap", label: "cov.col.gap", num: true, sortVal: (r) => r._gap, render: (r) => (isNum(r._gap) ? <span className={r._gap > 0 ? "text-crit font-semibold" : "text-good"}>{r._gap > 0 ? "+" : "−"}{fMin(Math.abs(r._gap))}</span> : <span className="text-mut" title={t("cov.gap_na")}>{t("common.na")}</span>), csv: (r) => (isNum(r._gap) ? Math.round(r._gap) : "") },
    { key: "_why", label: "cov.col.why", sortVal: (r) => (r._why ? REASONS.indexOf(r._why) : reachTab(r) === "unv" ? 8 : 9), render: (r) => (r._why ? <span className="text-[12px]">{t(`rw.${r._why}`)}{r._whys.length > 1 && <span className="text-mut" title={r._whys.map((x) => t(`rw.${x}`)).join(" · ")}> +{r._whys.length - 1}</span>}</span> : <span className="text-[12px] text-mut">{t(`rt.${reachTab(r)}`)}</span>), csv: (r) => (r._whys || []).join("+") || reachTab(r) },
  ];
  const detailCols = useMemo(() => siteColumns(cfg, "detail", { showComputed: true }).filter((c) => !cols.some((x) => x.key === c.key)), [cfg]); // eslint-disable-line
  const keyOfMode = (s) => s._why || reachTab(s);
  const legend = [...REASONS.filter((r) => B.reason[r]).map((k) => ({ k, c: WHY_COLOR[k], label: t(`rw.${k}`) })), { k: "unv", c: TAB_COLOR.unv, label: t("rt.unv") }, { k: "ok", c: TAB_COLOR.ok, label: t("rt.ok") }];
  return (
    <div className="space-y-3">
      <section className="bg-white border border-line rounded-lg px-4 py-3" aria-label={t("cov.title")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-2">
          <h2 className="text-[15px] font-semibold text-navy">{t("cov.title")}</h2>
          <span className="text-[12.5px] text-slate">{t("cov.scope", { n: fInt(B.tab.ok + B.tab.no + B.tab.unv) })}</span>
          <span className="ml-auto text-[12px]"><InfoTip label={<b className="text-ink">{t("ex.eta_label")}</b>} text={t("ex.eta_note", { rf: T.road_factor, mob: T.mobilization_minutes, r: cfg.mbp.max_radius_km, cap: cfg.mbp.reach_cap_km ?? 250 })} /></span>
        </div>
        {reachSel ? <>
          <div className="grid grid-cols-3 gap-2 max-w-[760px]" role="tablist" aria-label={t("cov.tabs")}>
            {["ok", "no", "unv"].map((x) => <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)} title={t(`cov.tab_tip.${x}`)}
              className={`text-left rounded-md border px-3 py-2 ${tab === x ? "border-navy ring-1 ring-navy/40 bg-navy/[0.03]" : "border-line hover:border-slate"}`}>
              <div className="flex items-center gap-1.5 text-[11.5px] text-slate"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: TAB_COLOR[x] }} />{t(`rt.${x}`)}</div>
              <div className="text-[22px] font-bold tabular text-ink leading-tight">{fInt(B.tab[x])}</div></button>)}
          </div>
          {tab === "no" && <div className="mt-2.5">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-slate mb-1"><InfoTip label={t("cov.why_title")} text={t("cov.why_tip", { mob: T.mobilization_minutes })} /></div>
            <div className="flex flex-wrap gap-1.5">{REASONS.map((r) => <button key={r} onClick={() => setWhy(r)} aria-pressed={why === r} disabled={!B.reason[r]} title={t(`rw_tip.${r}`, { mob: T.mobilization_minutes })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[12.5px] disabled:opacity-40 ${why === r ? "border-navy ring-1 ring-navy/40" : "border-line bg-white hover:border-slate"}`}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: WHY_COLOR[r] }} />{t(`rw.${r}`)} <b className="tabular">{fInt(B.reason[r])}</b></button>)}
              {why && <button onClick={() => setWhy(null)} className="text-s1 underline text-[12px]">{t("cond.reset")}</button>}</div>
            <div className="text-[11px] text-mut mt-1">{t("cov.why_note", { a: fInt(Object.values(B.any).reduce((a, v) => a + v, 0) - B.tab.no) })}</div>
          </div>}
        </> : <div className="flex flex-wrap items-center gap-2 text-[12.5px]" role="status">
          <span className="inline-flex items-center gap-1.5 bg-s1/10 border border-s1/40 text-navy rounded-full pl-3 pr-1 py-0.5">
            <b>{t("drill.chip.filter")}:</b> {selLabel(drillSel)} · {t("filter.scope_sites", { n: fInt(rows.length) })}
            <button onClick={() => setDrillSel(null)} aria-label={t("drill.chip.clear")} className="w-5 h-5 rounded-full hover:bg-s1/20 leading-none">×</button></span>
          <button onClick={() => setDrillSel(null)} className="text-s1 underline">{t("cov.back_tabs")}</button></div>}
      </section>
      <Workspace ctx={ctx} rows={rows} modes={["reachwhy"]} defaultMode="reachwhy" columns={cols} extraCsv={detailCols}
        title={t("cov.map.title")} sub={t("cov.map.sub")} tableTitle={t("cov.table.title", { n: fInt(rows.length) })} filename={`pba_sites_${String(nop).replace(/\s+/g, "_")}_${tab || "filter"}.csv`}
        initialSort={tab === "no" ? { key: "_gap", dir: -1 } : { key: "mbp_priority_score", dir: -1 }}
        mapProps={{ colorOverride: (s) => (s._why ? WHY_COLOR[s._why] : TAB_COLOR[reachTab(s)]), keyOverride: keyOfMode, legendOverride: legend, hollowOverride: (s) => reachTab(s) === "unv",
          ttOverride: (s) => `${s._why ? t(`rw.${s._why}`) : t(`rt.${reachTab(s)}`)} · ETA ${fMin(s.eta_min ?? s.dist_eta_min)} · BBT ${fMin(s.bbt_effective_min)}`, hollowLabel: t("cov.hollow") }}
        detail={(s) => <SiteBriefCov s={s} ctx={ctx} />} tableSub={t(tab === "no" ? "cov.table_sub_no" : "cov.table_sub")} />
    </div>
  );
}

/** site panel: primary reason (+ others), BBT + evidence, 3 nearest base camps with the existing travel model, two actions */
export function SiteBriefCov({ s, ctx }) {
  const { cfg, names } = ctx;
  const R = reachReasons(s, cfg), tb = reachTab(s), N = nearestCamps(s, cfg, 3);
  const nm = (id) => (names ? id : campCode(id));
  return <div className="space-y-2">
    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate">{t("cov.p.status")}</div>
      <div className="font-semibold text-ink">{R.length ? t(`rw.${R[0]}`) : t(`rt.${tb}`)}</div>
      <div className="text-[12px] text-slate">{R.length ? t(`rw_tip.${R[0]}`, { mob: cfg.travel.mobilization_minutes }) : t(`cov.tab_tip.${tb}`)}</div>
      {R.length > 1 && <div className="text-[11.5px] text-mut">{t("cov.p.also")}: {R.slice(1).map((x) => t(`rw.${x}`)).join(" · ")}</div>}</div>
    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate">BBT</div><BbtCell r={s} /></div>
    <div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate">{t("cov.p.nearest")}</div>
      {!N.length ? <div className="text-mut text-[12px]">{t("cov.p.none")}</div> :
        <table className="w-full text-[12px] tabular"><tbody>{N.map((x) => <tr key={x.mbp_id} className="border-b border-line/50">
          <td className="py-[2px]">{nm(x.mbp_id)}</td><td className="text-right">{fKm(x.km)}</td>
          <td className={`text-right ${x.before === false ? "text-crit" : x.before ? "text-good" : "text-mut"}`}>{isNum(x.eta) ? fMin(x.eta) : t("common.na")}{x.indicative ? "*" : ""}</td></tr>)}</tbody></table>}
      <div className="text-[11px] text-mut mt-0.5">{t("cov.p.nearest_note")}</div></div>
    <div className="flex gap-2 pt-1">
      <button onClick={() => { try { window.__pbaPlan = "sandbox"; } catch {} ctx.navigate({ view: "mbp.plan", nop: s.nop }); }} className="flex-1 border border-navy text-navy rounded py-1 text-[12px]">{t("cov.p.plan")}</button>
      <button onClick={() => ctx.navigate({ view: s._why === "battery_short" && (s.bbs_priority_level || s.action_type === "DATA") ? "bbs.actions" : "bbs.risk" })} title={s._why === "battery_short" ? t("cov.p.bat_fa_tip") : undefined} className="flex-1 border border-navy text-navy rounded py-1 text-[12px]">{t("cov.p.bat")}</button></div>
  </div>;
}
