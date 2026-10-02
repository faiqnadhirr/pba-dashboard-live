"use client";
import React, { useState } from "react";
import { Card, Note, Slider } from "@/components/ui";

const clone = (o) => JSON.parse(JSON.stringify(o));
const LBL = { class: "Site class", dependency: "Dependency (PROXY)", outage_frequency: "PLN outage frequency", travel_distance: "Travel distance",
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
      <Note tone="warn">Settings apply to <b>this browser only</b> (saved locally) and recalculate every priority, status and action instantly. There is no login/role/audit trail yet — to make a setting official, export it and agree it with the team (governance belongs in the Watson integration).</Note>
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
            {["P1", "P2", "P3"].map((p) => <Slider key={"m" + p} label={`MBP ${p} ≥`} value={d.priority_levels[p]} min={0.1} max={0.9} step={0.01} onChange={(v) => set(["priority_levels", p], v)} fmt={(x) => x.toFixed(2)} />)}
            {["P1", "P2", "P3"].map((p) => <Slider key={"b" + p} label={`BBS ${p} ≥`} value={d.bbs_priority_levels[p]} min={0.1} max={0.9} step={0.01} onChange={(v) => set(["bbs_priority_levels", p], v)} fmt={(x) => x.toFixed(2)} />)}
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
