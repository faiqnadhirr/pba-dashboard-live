"use client";
import React, { useState } from "react";
import { Card, Note, Slider, fPct, fNum } from "@/components/ui";
import { configHash } from "@/lib/logic";
import { t } from "@/lib/i18n";

const clone = (o) => JSON.parse(JSON.stringify(o));
const W = (k) => t(`cfgw.${k}`);   // weight labels (factor names)

function Weights({ title, obj, onChange, note }) {
  const tot = Object.values(obj).reduce((a, v) => a + (v > 0 ? v : 0), 0) || 1;
  return (
    <Card title={title} sub={note}>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {Object.entries(obj).map(([k, v]) => (
          <Slider key={k} label={`${W(k)} — ${fPct((100 * (v > 0 ? v : 0)) / tot, 0)}`} value={v} min={0} max={0.5} step={0.05} onChange={(x) => onChange({ ...obj, [k]: x })} fmt={(x) => fNum(x, 2)} />
        ))}
      </div>
    </Card>
  );
}

export default function ConfigTab({ cfg, saveCfg, data }) {
  const [d, setD] = useState(clone(cfg));
  const [edit, setEdit] = useState(false);
  const set = (path, v) => { const n = clone(d); let o = n; path.slice(0, -1).forEach((p) => (o = o[p])); o[path.at(-1)] = v; setD(n); };
  const dirty = JSON.stringify(d) !== JSON.stringify(cfg);
  const isDefault = configHash(cfg) === configHash(data.meta.config);
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...d, __exported: new Date().toISOString(), __hash: configHash(d) }, null, 2)], { type: "application/json" })); a.download = `pba_config_${configHash(d)}.json`; a.click(); };
  const upload = (f) => f.text().then((txt) => { try { const j = JSON.parse(txt); delete j.__exported; delete j.__built_at; delete j.__hash; setD(j); setEdit(true); } catch { window.alert(t("cfg.invalid")); } });
  const P = (v) => fPct(v * 100, 0), M = (v) => `${v} ${t("unit.min")}`, H = (v) => `${fNum(v, 1)} ${t("unit.h")}`;
  const S = (path, key, min, max, step = 1, fmt) => {
    let v = d; path.forEach((p) => (v = v[p]));
    return <Slider key={path.join(".")} label={t(key)} value={v} min={min} max={max} step={step} onChange={(x) => set(path, x)} fmt={fmt} />;
  };
  return (
    <div className="space-y-4">
      <div className={`rounded-lg border px-4 py-3 ${edit ? "bg-warn/15 border-warn" : "bg-white border-line"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[13px]">
            <b>{t(edit ? "cfg.banner.edit" : "cfg.banner.ro")}</b> {t("cfg.banner.body")}
          </div>
          <div className="ml-auto text-[12px] text-slate tabular" title={t("cfg.hash_tip")}>{t("cfg.version")}: <b className="text-ink">{configHash(cfg)}</b> · {t(isDefault ? "cfg.is_default" : "cfg.is_edited")}</div>
        </div>
      </div>
      <Note>{t("cfg.governance")}</Note>
      <div className="flex flex-wrap gap-2 sticky top-[118px] z-[400] bg-surface py-2">
        {!edit ? <button onClick={() => setEdit(true)} className="px-4 py-1.5 rounded-md bg-navy text-white text-[13px] font-semibold">{t("cfg.edit")}</button> : <>
          <button disabled={!dirty} onClick={() => { saveCfg(d); }} className="px-4 py-1.5 rounded-md bg-navy text-white text-[13px] font-semibold disabled:opacity-40">{t("cfg.apply")}</button>
          <button onClick={() => { setD(clone(cfg)); setEdit(false); }} className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px]">{t("cfg.done")}</button>
          <button onClick={() => setD(clone(data.meta.config))} className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px]">{t("cfg.reset")}</button>
        </>}
        <button onClick={download} className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px]">{t("cfg.export")}</button>
        <label className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px] cursor-pointer">{t("cfg.import")}<input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} /></label>
        {dirty && <span className="text-[12px] text-[#9a6a00] self-center">{t("cfg.unapplied")}</span>}
      </div>
      <fieldset disabled={!edit} className={`grid xl:grid-cols-2 gap-4 min-w-0 ${edit ? "" : "opacity-80"}`}>
        <Weights title={t("cfg.w.mbp")} note={t("cfg.w.mbp_note")} obj={d.mbp_priority} onChange={(v) => set(["mbp_priority"], v)} />
        <Weights title={t("cfg.w.bbs")} note={t("cfg.w.bbs_note")} obj={d.bbs_priority} onChange={(v) => set(["bbs_priority"], v)} />
        <Weights title={t("cfg.w.cand")} note={t("cfg.w.cand_note")} obj={d.mbp_candidate} onChange={(v) => set(["mbp_candidate"], v)} />
        <Card title={t("cfg.cutoffs")}>
          <div className="grid sm:grid-cols-3 gap-4">
            {["P1", "P2", "P3"].map((p) => <Slider key={"m" + p} label={`MBP-${p} ≥`} value={d.priority_levels[p]} min={0.1} max={0.9} step={0.01} onChange={(v) => set(["priority_levels", p], v)} fmt={(x) => fNum(x, 2)} />)}
            {["P1", "P2", "P3"].map((p) => <Slider key={"b" + p} label={`BBS-${p} ≥`} value={d.bbs_priority_levels[p]} min={0.1} max={0.9} step={0.01} onChange={(v) => set(["bbs_priority_levels", p], v)} fmt={(x) => fNum(x, 2)} />)}
          </div>
        </Card>
        <Card title={t("cfg.bbt")}>
          <div className="grid sm:grid-cols-2 gap-4">
            {S(["bbt", "design_minutes"], "cfg.bbt.design", 30, 480, 10, M)}
            {S(["bbt", "ok_pct"], "cfg.bbt.ok", 0.1, 1, 0.05, P)}
            {S(["bbt", "degraded_pct"], "cfg.bbt.crit", 0.05, 0.9, 0.05, P)}
            {S(["bbt", "dead_max_minutes"], "cfg.bbt.dead", 0, 30, 1, M)}
            {Object.keys(d.battery_age_replace_years).map((k) => <Slider key={k} label={t("cfg.bbt.age", { k })} value={d.battery_age_replace_years[k]} min={1} max={15} onChange={(v) => set(["battery_age_replace_years", k], v)} fmt={(v) => `${v} ${t("drawer.years")}`} />)}
            {S(["load_high_ampere"], "cfg.bbt.load", 10, 150, 5, (v) => `${v} A`)}
            {S(["site_condition", "full_gap_pp"], "cfg.bbt.cond", 0.5, 10, 0.5, (v) => `${fNum(v, 1)} pp`)}
          </div>
        </Card>
        <Card title={t("cfg.unknown")} sub={t("cfg.unknown_sub")}>
          <div className="grid sm:grid-cols-2 gap-4">{S(["unknown_handling", "neutral_rank"], "cfg.unknown.rank", 0, 1, 0.05, (v) => fNum(v, 2))}</div>
        </Card>
        <Card title={t("cfg.travel")}>
          <div className="grid sm:grid-cols-2 gap-4">
            {S(["travel", "road_factor"], "cfg.travel.road", 1, 2, 0.05, (v) => fNum(v, 2))}
            {S(["travel", "mobilization_minutes"], "cfg.travel.mob", 0, 90, 5, M)}
            {Object.keys(d.travel.speed_kmh).map((k) => <Slider key={k} label={t(`cfg.travel.speed.${k}`)} value={d.travel.speed_kmh[k]} min={10} max={80} onChange={(v) => set(["travel", "speed_kmh", k], v)} fmt={(v) => `${v} km/h`} />)}
            {S(["travel", "peak_multiplier_urban"], "cfg.travel.peak_u", 1, 3, 0.05, (v) => `×${fNum(v, 2)}`)}
            {S(["travel", "peak_multiplier_rural"], "cfg.travel.peak_r", 1, 3, 0.05, (v) => `×${fNum(v, 2)}`)}
            {S(["travel", "night_multiplier"], "cfg.travel.night", 1, 3, 0.05, (v) => `×${fNum(v, 2)}`)}
            {S(["mbp", "max_radius_km"], "cfg.travel.radius", 20, 300, 10, (v) => `${v} km`)}
          </div>
        </Card>
        <Card title={t("cfg.rules")}>
          <div className="grid sm:grid-cols-2 gap-4">
            {["riverine_delta", "remote"].map((k) => <Slider key={k} label={t("cfg.rules.access", { k: t(`access.${k}`) })} value={d.travel.access_multiplier[k]} min={1} max={4} step={0.1} onChange={(v) => set(["travel", "access_multiplier", k], v)} fmt={(v) => `×${fNum(v, 1)}`} />)}
            {S(["availability", "trend_pp"], "cfg.rules.trend_pp", 0.05, 2, 0.05, (v) => `${fNum(v, 2)} pp`)}
            {S(["availability", "min_cluster_sites"], "cfg.rules.min_cluster", 1, 30)}
            {S(["availability", "dark_month_h"], "cfg.rules.dark_month", 0.5, 48, 0.5, H)}
            {S(["availability", "dark_min_months"], "cfg.rules.dark_site", 1, 6)}
            {S(["availability", "dark_quarter_min_months"], "cfg.rules.dark_q", 1, 3)}
            {S(["availability", "trend_dark_share_pp"], "cfg.rules.trend_dark", 0.5, 20, 0.5, (v) => `${fNum(v, 1)} pp`)}
            {S(["offair", "max_outage_share"], "cfg.rules.off_share", 0.1, 0.9, 0.05, P)}
            {S(["offair", "full_month_share"], "cfg.rules.off_month", 0.5, 1, 0.05, P)}
            {S(["offair", "no_alarm_min_share"], "cfg.rules.off_noalarm", 0.02, 0.5, 0.02, P)}
            <label className="flex flex-col gap-1 text-[12px] text-mut">{t("cfg.rules.floor")}
              <select value={d.severity_floor.measured_dead_critical} onChange={(e) => set(["severity_floor", "measured_dead_critical"], e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink bg-white">{["P1", "P2", "P3", "P4"].map((p) => <option key={p} value={p}>BBS-{p}</option>)}</select></label>
          </div>
        </Card>
        <Card title={t("cfg.design")} sub={t("cfg.design_sub")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-[12px] text-mut">{t("cfg.design.basis")}
              <select value={d.bbt.criteria_basis} onChange={(e) => set(["bbt", "criteria_basis"], e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink bg-white">
                <option value="standard">{t("cfg.design.std", { d: d.bbt.design_minutes })}</option><option value="site">{t("cfg.design.site")}</option></select></label>
            {Object.keys(d.bbt.design_from_battery.ah_per_bank).map((k) => <Slider key={"ah" + k} label={t("cfg.design.ah", { k })} value={d.bbt.design_from_battery.ah_per_bank[k]} min={25} max={300} step={5} onChange={(v) => set(["bbt", "design_from_battery", "ah_per_bank", k], v)} fmt={(v) => `${v} Ah`} />)}
            {Object.keys(d.bbt.design_from_battery.usable_dod).map((k) => <Slider key={"dod" + k} label={t("cfg.design.dod", { k })} value={d.bbt.design_from_battery.usable_dod[k]} min={0.3} max={1} step={0.05} onChange={(v) => set(["bbt", "design_from_battery", "usable_dod", k], v)} fmt={P} />)}
            {S(["bbt", "derived_support", "min_exhaustion_events"], "cfg.design.sup_ev", 1, 10)}
            {S(["bbt", "derived_support", "min_power_h"], "cfg.design.sup_h", 0, 24, 0.5, H)}
            {S(["bbt", "derived_support", "min_share_of_pln"], "cfg.design.sup_share", 0, 1, 0.05, P)}
          </div>
        </Card>
        <Card title={t("cfg.place")} sub={t("cfg.place_sub")}>
          <div className="grid sm:grid-cols-2 gap-4">
            {S(["placement", "target_share"], "cfg.place.target", 0.5, 1, 0.05, P)}
            {S(["placement", "max_new"], "cfg.place.max", 1, 30)}
            {S(["placement", "relocation_max_loss_pp"], "cfg.place.loss", 0, 5, 0.1, (v) => `${fNum(v, 1)} pp`)}
            {S(["placement", "relocation_max_candidates"], "cfg.place.maxreloc", 1, 10)}
          </div>
        </Card>
        <Card title={t("cfg.signal")} sub={t("cfg.signal_sub")}>
          <div className="grid sm:grid-cols-2 gap-4">
            {S(["basecamp_signal", "criteria_needed"], "cfg.signal.n", 1, 4)}
            {S(["basecamp_signal", "p1p2_sites_min"], "cfg.signal.p12", 1, 60)}
            {S(["basecamp_signal", "reach_risk_share_min"], "cfg.signal.risk", 0.05, 1, 0.05, P)}
            {S(["basecamp_signal", "avg_eta_min"], "cfg.signal.eta", 15, 240, 5, M)}
            {S(["basecamp_signal", "workload_quantile"], "cfg.signal.wl", 0.5, 0.99, 0.01, (v) => `p${Math.round(v * 100)}`)}
          </div>
        </Card>
        <Weights title={t("cfg.w.top15")} note={t("cfg.w.top15_note")} obj={d.top15_weights} onChange={(v) => set(["top15_weights"], v)} />
        <Weights title={t("cfg.w.cluster")} note={t("cfg.w.cluster_note")} obj={d.worst_cluster_weights} onChange={(v) => set(["worst_cluster_weights"], v)} />
        <Card title={t("cfg.dep")} sub={t("cfg.dep_sub")}>
          <div className="grid sm:grid-cols-3 gap-2">
            {Object.entries(d.dependency_children).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-[12.5px] border border-line rounded px-2 py-1">{k}
                <input type="number" min={0} max={50} value={v} onChange={(e) => set(["dependency_children", k], Number(e.target.value))} className="w-16 border border-line rounded px-1 text-right" /></label>
            ))}
          </div>
        </Card>
      </fieldset>
    </div>
  );
}
