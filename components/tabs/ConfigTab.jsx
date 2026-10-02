"use client";
import React, { useState } from "react";
import { Card, Note, Slider } from "@/components/ui";

const clone = (o) => JSON.parse(JSON.stringify(o));
const LBL = { availability_gap: "Availability gap", power_downtime: "Power downtime", bbt_risk: "BBT risk", priority: "Priority", recurrence: "Recurrence (PLN outages)", criticality: "Criticality (class/dependency)",
  share_dark: "Share of dark sites", power_downtime_per_site: "Power downtime per site", p1p2_dark_share: "Share P1/P2 dark sites", class: "Site class", dependency: "Dependency (PROXY)", outage_frequency: "PLN outage frequency", travel_distance: "Travel distance",
  eta_gap: "ETA > BBT (MBP arrives late)", site_condition: "Availability below target", vip: "VIP", outage_duration: "PLN outage duration",
  mbp_history: "MBP deployment history", bbt_severity: "BBT gap vs design", pln_exposure: "Historical PLN outage", eta: "ETA", familiarity: "Familiarity with site", workload: "MBP workload" };

function Weights({ title, obj, onChange, note }) {
  const tot = Object.values(obj).reduce((a, v) => a + (v > 0 ? v : 0), 0) || 1;
  return (
    <Card title={title} sub={note}>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {Object.entries(obj).map(([k, v]) => (
          <Slider key={k} label={`${LBL[k] || k} — ${Math.round((100 * (v > 0 ? v : 0)) / tot)}%`} value={v} min={0} max={0.5} step={0.05} onChange={(x) => onChange({ ...obj, [k]: x })} fmt={(x) => x.toFixed(2)} />
        ))}
      </div>
    </Card>
  );
}

export default function ConfigTab({ cfg, saveCfg, data }) {
  const [d, setD] = useState(clone(cfg));
  const set = (path, v) => { const n = clone(d); let o = n; path.slice(0, -1).forEach((p) => (o = o[p])); o[path.at(-1)] = v; setD(n); };
  const dirty = JSON.stringify(d) !== JSON.stringify(cfg);
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...d, __exported: new Date().toISOString() }, null, 2)], { type: "application/json" })); a.download = "pba_config.json"; a.click(); };
  const upload = (f) => f.text().then((t) => { try { const j = JSON.parse(t); delete j.__exported; delete j.__built_at; setD(j); } catch { alert("Invalid config file"); } });
  return (
    <div className="space-y-4">
      <Note tone="warn"><b>DEMO MODE.</b> Settings apply to <b>this browser only</b> (saved locally) and recalculate every priority, status and action instantly — use this for what-if analysis. <b>OPERATIONAL MODE</b> (not built yet) needs: one approved config stored server-side, role-based edit rights, version history / audit trail, and an "effective from" date so reports are reproducible. Until then, export the JSON, get it agreed, and commit it to <code>engine/config/</code> so the pipeline uses the same values.</Note>
      <div className="flex flex-wrap gap-2 sticky top-[92px] z-[400] bg-surface py-2">
        <button disabled={!dirty} onClick={() => saveCfg(d)} className="px-4 py-1.5 rounded-md bg-navy text-white text-[13px] font-semibold disabled:opacity-40">Apply</button>
        <button onClick={() => setD(clone(data.meta.config))} className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px]">Reset to defaults</button>
        <button onClick={download} className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px]">Export JSON</button>
        <label className="px-3 py-1.5 rounded-md border border-line bg-white text-[13px] cursor-pointer">Import JSON<input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files[0] && upload(e.target.files[0])} /></label>
        {dirty && <span className="text-[12px] text-[#9a6a00] self-center">Unapplied changes</span>}
      </div>
      <div className="grid xl:grid-cols-2 gap-4">
        <Weights title="MBP site priority — weights" note="First four = management factors. Weights are re-normalised to 100%." obj={d.mbp_priority} onChange={(v) => set(["mbp_priority"], v)} />
        <Weights title="BBS priority — weights" note="Applied to sites needing action." obj={d.bbs_priority} onChange={(v) => set(["bbs_priority"], v)} />
        <Weights title="Candidate MBP ranking (simulation)" note="Lower cost wins: ETA and workload add cost, familiarity reduces it." obj={d.mbp_candidate} onChange={(v) => set(["mbp_candidate"], v)} />
        <Card title="Priority cut-offs (score → P1…P4)">
          <div className="grid sm:grid-cols-3 gap-4">
            {["P1", "P2", "P3"].map((p) => <Slider key={"m" + p} label={`MBP-${p} ≥`} value={d.priority_levels[p]} min={0.1} max={0.9} step={0.01} onChange={(v) => set(["priority_levels", p], v)} fmt={(x) => x.toFixed(2)} />)}
            {["P1", "P2", "P3"].map((p) => <Slider key={"b" + p} label={`BBS-${p} ≥`} value={d.bbs_priority_levels[p]} min={0.1} max={0.9} step={0.01} onChange={(v) => set(["bbs_priority_levels", p], v)} fmt={(x) => x.toFixed(2)} />)}
          </div>
        </Card>
        <Card title="BBT criteria">
          <div className="grid sm:grid-cols-2 gap-4">
            <Slider label="BBT design" value={d.bbt.design_minutes} min={30} max={480} step={10} onChange={(v) => set(["bbt", "design_minutes"], v)} fmt={(v) => `${v} min`} />
            <Slider label="OK ≥ % of design" value={d.bbt.ok_pct} min={0.1} max={1} step={0.05} onChange={(v) => set(["bbt", "ok_pct"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Critical < % of design" value={d.bbt.degraded_pct} min={0.05} max={0.9} step={0.05} onChange={(v) => set(["bbt", "degraded_pct"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Dead ≤" value={d.bbt.dead_max_minutes} min={0} max={30} onChange={(v) => set(["bbt", "dead_max_minutes"], v)} fmt={(v) => `${v} min`} />
            {Object.keys(d.battery_age_replace_years).map((k) => <Slider key={k} label={`Replace ${k} at age`} value={d.battery_age_replace_years[k]} min={1} max={15} onChange={(v) => set(["battery_age_replace_years", k], v)} fmt={(v) => `${v} y`} />)}
            <Slider label="High NE load (upgrade)" value={d.load_high_ampere} min={10} max={150} step={5} onChange={(v) => set(["load_high_ampere"], v)} fmt={(v) => `${v} A`} />
            <Slider label="Availability gap for full condition score" value={d.site_condition.full_gap_pp} min={0.5} max={10} step={0.5} onChange={(v) => set(["site_condition", "full_gap_pp"], v)} fmt={(v) => `${v} pp`} />
          </div>
        </Card>
        <Card title="Travel-time model (ESTIMATED)">
          <div className="grid sm:grid-cols-2 gap-4">
            <Slider label="Road factor (straight → road km)" value={d.travel.road_factor} min={1} max={2} step={0.05} onChange={(v) => set(["travel", "road_factor"], v)} fmt={(v) => v.toFixed(2)} />
            <Slider label="Mobilisation" value={d.travel.mobilization_minutes} min={0} max={90} step={5} onChange={(v) => set(["travel", "mobilization_minutes"], v)} fmt={(v) => `${v} min`} />
            {Object.keys(d.travel.speed_kmh).map((k) => <Slider key={k} label={`Speed ${k.replace("_", " ")}`} value={d.travel.speed_kmh[k]} min={10} max={80} onChange={(v) => set(["travel", "speed_kmh", k], v)} fmt={(v) => `${v} km/h`} />)}
            <Slider label="Peak multiplier (urban)" value={d.travel.peak_multiplier_urban} min={1} max={3} step={0.05} onChange={(v) => set(["travel", "peak_multiplier_urban"], v)} fmt={(v) => `×${v.toFixed(2)}`} />
            <Slider label="Peak multiplier (rural)" value={d.travel.peak_multiplier_rural} min={1} max={3} step={0.05} onChange={(v) => set(["travel", "peak_multiplier_rural"], v)} fmt={(v) => `×${v.toFixed(2)}`} />
            <Slider label="Night multiplier" value={d.travel.night_multiplier} min={1} max={3} step={0.05} onChange={(v) => set(["travel", "night_multiplier"], v)} fmt={(v) => `×${v.toFixed(2)}`} />
            <Slider label="Coverage radius (uncovered beyond)" value={d.mbp.max_radius_km} min={20} max={300} step={10} onChange={(v) => set(["mbp", "max_radius_km"], v)} fmt={(v) => `${v} km`} />
          </div>
        </Card>
        <Card title="Access, availability & severity rules">
          <div className="grid sm:grid-cols-2 gap-4">
            {["riverine_delta", "remote"].map((k) => <Slider key={k} label={`ETA multiplier — ${k.replace("_", " / ")}`} value={d.travel.access_multiplier[k]} min={1} max={4} step={0.1} onChange={(v) => set(["travel", "access_multiplier", k], v)} fmt={(v) => `×${v.toFixed(1)}`} />)}
            <Slider label="Trend: availability change counted (primary)" value={d.availability.trend_pp} min={0.05} max={2} step={0.05} onChange={(v) => set(["availability", "trend_pp"], v)} fmt={(v) => `${v.toFixed(2)} pp`} />
            <Slider label="Trend: min. sites per cluster" value={d.availability.min_cluster_sites} min={1} max={30} onChange={(v) => set(["availability", "min_cluster_sites"], v)} />
            <Slider label="Dark month = power downtime ≥" value={d.availability.dark_month_h} min={0.5} max={48} step={0.5} onChange={(v) => set(["availability", "dark_month_h"], v)} fmt={(v) => `${v} h`} />
            <Slider label="Dark site = dark months ≥ (of 6)" value={d.availability.dark_min_months} min={1} max={6} onChange={(v) => set(["availability", "dark_min_months"], v)} />
            <Slider label="Dark in a quarter = dark months ≥ (of 3)" value={d.availability.dark_quarter_min_months} min={1} max={3} onChange={(v) => set(["availability", "dark_quarter_min_months"], v)} />
            <Slider label="Trend: dark-share change counted" value={d.availability.trend_dark_share_pp} min={0.5} max={20} step={0.5} onChange={(v) => set(["availability", "trend_dark_share_pp"], v)} fmt={(v) => `${v} pp of sites`} />
            <Slider label="Off-air: downtime share of period ≥" value={d.offair.max_outage_share} min={0.1} max={0.9} step={0.05} onChange={(v) => set(["offair", "max_outage_share"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Off-air: a month down ≥" value={d.offair.full_month_share} min={0.5} max={1} step={0.05} onChange={(v) => set(["offair", "full_month_share"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Off-air: downtime with no alarms/tickets ≥" value={d.offair.no_alarm_min_share} min={0.02} max={0.5} step={0.02} onChange={(v) => set(["offair", "no_alarm_min_share"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <label className="flex flex-col gap-1 text-[12px] text-mut">Measured Dead/Critical priority floor
              <select value={d.severity_floor.measured_dead_critical} onChange={(e) => set(["severity_floor", "measured_dead_critical"], e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink">{["P1", "P2", "P3", "P4"].map((p) => <option key={p} value={p}>BBS-{p}</option>)}</select></label>
          </div>
        </Card>
        <Card title="BBT design & evidence rules" sub="Source files have no Ah capacity: Ah per bank is an assumption — replace with the real module rating.">
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-[12px] text-mut">Problem criteria measured against
              <select value={d.bbt.criteria_basis} onChange={(e) => set(["bbt", "criteria_basis"], e.target.value)} className="border border-line rounded-md px-2 py-1 text-[12.5px] text-ink">
                <option value="standard">standard design ({d.bbt.design_minutes} min, management order)</option><option value="site">per-site design (col 7)</option></select></label>
            {Object.keys(d.bbt.design_from_battery.ah_per_bank).map((k) => <Slider key={"ah" + k} label={`Ah per bank — ${k}`} value={d.bbt.design_from_battery.ah_per_bank[k]} min={25} max={300} step={5} onChange={(v) => set(["bbt", "design_from_battery", "ah_per_bank", k], v)} fmt={(v) => `${v} Ah`} />)}
            {Object.keys(d.bbt.design_from_battery.usable_dod).map((k) => <Slider key={"dod" + k} label={`Usable depth of discharge — ${k}`} value={d.bbt.design_from_battery.usable_dod[k]} min={0.3} max={1} step={0.05} onChange={(v) => set(["bbt", "design_from_battery", "usable_dod", k], v)} fmt={(v) => `${Math.round(v * 100)}%`} />)}
            <Slider label="Derived Dead/Critical trusted with ≥ exhausted events" value={d.bbt.derived_support.min_exhaustion_events} min={1} max={10} onChange={(v) => set(["bbt", "derived_support", "min_exhaustion_events"], v)} />
            <Slider label="…or power downtime ≥" value={d.bbt.derived_support.min_power_h} min={0} max={24} step={0.5} onChange={(v) => set(["bbt", "derived_support", "min_power_h"], v)} fmt={(v) => `${v} h`} />
            <Slider label="…and ≥ share of PLN outage hours" value={d.bbt.derived_support.min_share_of_pln} min={0} max={1} step={0.05} onChange={(v) => set(["bbt", "derived_support", "min_share_of_pln"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </Card>
        <Card title="Placement & fleet size" sub="Defaults for the Placement page.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Slider label="Target share of MBP-P1/P2 reached" value={d.placement.target_share} min={0.5} max={1} step={0.05} onChange={(v) => set(["placement", "target_share"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Max additional MBPs" value={d.placement.max_new} min={1} max={30} onChange={(v) => set(["placement", "max_new"], v)} />
            <Slider label="Relocation: removal loses <" value={d.placement.relocation_max_loss_pp} min={0} max={5} step={0.1} onChange={(v) => set(["placement", "relocation_max_loss_pp"], v)} fmt={(v) => `${v} pp`} />
          </div>
        </Card>
        <Card title="Base camp signal (under-served rule)" sub="Under-served when at least N criteria are met.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Slider label="Criteria needed (of 4)" value={d.basecamp_signal.criteria_needed} min={1} max={4} onChange={(v) => set(["basecamp_signal", "criteria_needed"], v)} />
            <Slider label="P1/P2 sites ≥" value={d.basecamp_signal.p1p2_sites_min} min={1} max={60} onChange={(v) => set(["basecamp_signal", "p1p2_sites_min"], v)} />
            <Slider label="Share dark before MBP ≥" value={d.basecamp_signal.reach_risk_share_min} min={0.05} max={1} step={0.05} onChange={(v) => set(["basecamp_signal", "reach_risk_share_min"], v)} fmt={(v) => `${Math.round(v * 100)}%`} />
            <Slider label="Average ETA ≥" value={d.basecamp_signal.avg_eta_min} min={15} max={240} step={5} onChange={(v) => set(["basecamp_signal", "avg_eta_min"], v)} fmt={(v) => `${v} min`} />
            <Slider label="Workload ≥ percentile" value={d.basecamp_signal.workload_quantile} min={0.5} max={0.99} step={0.01} onChange={(v) => set(["basecamp_signal", "workload_quantile"], v)} fmt={(v) => `p${Math.round(v * 100)}`} />
          </div>
        </Card>
        <Weights title="Top 15 worst sites — weights" note="Composite of availability gap, power downtime, BBT risk, priority, recurrence and criticality." obj={d.top15_weights} onChange={(v) => set(["top15_weights"], v)} />
        <Weights title="Worst clusters — severity weights" note="Share of dark sites, power downtime per site, availability gap, share of P1/P2 dark sites." obj={d.worst_cluster_weights} onChange={(v) => set(["worst_cluster_weights"], v)} />
        <Card title="Dependency proxy (HUB Site bucket → children)" sub="No parent→child topology in the data — adjust these numbers to your network knowledge.">
          <div className="grid sm:grid-cols-3 gap-2">
            {Object.entries(d.dependency_children).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-[12.5px] border border-line rounded px-2 py-1">{k}
                <input type="number" min={0} max={50} value={v} onChange={(e) => set(["dependency_children", k], Number(e.target.value))} className="w-16 border border-line rounded px-1 text-right" /></label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
