"use client";
import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, Select, Slider, Toggle, LevelTag, EvTag, Tag, fInt, fMin, fKm, fH, f2, fPct, isNum } from "@/components/ui";
import { simulate, kmeans } from "@/lib/logic";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const OUT = {
  saved: { label: "saved — MBP arrives before battery runs out", c: "#0ca30c" },
  late: { label: "late — site dark until MBP arrives", c: "#ec835a" },
  unserved_busy: { label: "unserved — no free MBP", c: "#d03b3b" },
  unserved_island: { label: "unserved — island (needs sea logistics, not modelled)", c: "#4a3aa7" },
  no_need: { label: "no MBP needed — battery covers the outage", c: "#A3ABB9" },
};

export default function SimTab({ scored, data, cfg, nop: gNop, setPick }) {
  const nops = useMemo(() => [...new Set(scored.map((s) => s.nop).filter(Boolean))].sort(), [scored]);
  const [nop, setNop] = useState(gNop !== "All NOPs" ? gNop : "NOP PALEMBANG");
  const inNop = useMemo(() => scored.filter((s) => s.nop === nop && s.site_active === 1), [scored, nop]);
  const clusters = useMemo(() => [...new Set(inNop.map((s) => s.cluster_to).filter(Boolean))].sort(), [inNop]);
  const [mode, setMode] = useState("top");
  const [n, setN] = useState(20);
  const [cluster, setCluster] = useState("");
  const [share, setShare] = useState(30);
  const [picked, setPicked] = useState("");
  const [hours, setHours] = useState(4);
  const [hour, setHour] = useState(17);
  const [busy, setBusy] = useState([]);
  const [moveOn, setMoveOn] = useState(false);
  const [moveMbp, setMoveMbp] = useState("");
  const [moveTo, setMoveTo] = useState("");
  const [addN, setAddN] = useState(2);
  const [altH, setAltH] = useState(8);
  const [res, setRes] = useState(null);
  const [show, setShow] = useState(null);
  const mbpsNop = useMemo(() => data.mbps.filter((m) => m.nop === nop), [data.mbps, nop]);
  const cl = cluster || clusters[0];

  const affected = useMemo(() => {
    if (mode === "top") return [...inNop].sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)).slice(0, n).map((s) => s.site_id);
    if (mode === "cluster") { const c = inNop.filter((s) => s.cluster_to === cl).sort((a, b) => (b.pln_freq || 0) - (a.pln_freq || 0)); return c.slice(0, Math.max(1, Math.round((c.length * share) / 100))).map((s) => s.site_id); }
    const ids = new Set(inNop.map((s) => s.site_id));
    return picked.toUpperCase().split(/[\s,;]+/).filter((x) => ids.has(x));
  }, [mode, inNop, n, cl, share, picked]);

  const run = () => {
    const ctx = { fam: data.fam }, b = new Set(busy), out = {};
    const base = simulate(scored, affected, hours, data.mbps, ctx, cfg, { departHour: hour, busy: b });
    out["A · Current"] = base;
    if (moveOn && moveMbp && moveTo) {
      const t = scored.find((s) => s.site_id === moveTo);
      if (t) out[`B · ${moveMbp} → ${moveTo}`] = simulate(scored, affected, hours, data.mbps, ctx, cfg, { departHour: hour, busy: b,
        movedMbps: data.mbps.map((m) => (m.mbp_id === moveMbp ? { ...m, lat: t.lat, lon: t.lon } : m)) });
    }
    if (addN > 0) {
      const need = base.rows.filter((r) => r.outcome === "late" || r.outcome === "unserved_busy");
      const pts = need.map((r) => scored.find((s) => s.site_id === r.site_id)).filter((s) => s && isNum(s.lat) && s.is_island === 0).map((s) => ({ lat: s.lat, lon: s.lon, w: s.mbp_priority_score }));
      const cen = kmeans(pts, addN);
      const extra = cen.map((c, i) => ({ mbp_id: `NEW-MBP-${i + 1}`, lat: c[0], lon: c[1], nop, is_new: true, mbp_tickets_h1: 0 }));
      if (extra.length) out[`C · +${extra.length} MBP pre-positioned`] = { ...simulate(scored, affected, hours, data.mbps, ctx, cfg, { departHour: hour, busy: b, extra }), extra };
    }
    out[`D · outage ${altH} h`] = simulate(scored, affected, altH, data.mbps, ctx, cfg, { departHour: hour, busy: b });
    setRes(out); setShow("A · Current");
  };

  const cur = res && res[show];
  const kRows = res ? Object.entries(res).map(([k, v]) => ({ scenario: k, ...v.kpi })) : [];
  const siteMap = useMemo(() => new Map(scored.map((s) => [s.site_id, s])), [scored]);

  return (
    <div className="space-y-4">
      <Note>Scenario-based allocation, not autonomous optimisation. Sites are served in priority order; each picks the best free MBP (ETA, then familiarity with the site, then workload). One MBP serves one site per run. ETA is ESTIMATED (road factor × speed × traffic); MBP availability is PROXY — all available unless you mark them busy. Island sites have no road ETA and are reported separately.</Note>
      <div className="grid xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
        <Card title="Scenario inputs">
          <div className="space-y-3">
            <Select label="NOP" value={nop} onChange={(v) => { setNop(v); setRes(null); setBusy([]); setMoveMbp(""); setMoveTo(""); }} options={nops} />
            <Select label="Affected sites (PLN outage)" value={mode} onChange={setMode} options={[{ value: "top", label: "Top-N sites by PLN outage frequency" }, { value: "cluster", label: "Area outage (cluster TO)" }, { value: "pick", label: "Type site IDs" }]} />
            {mode === "top" && <Slider label="N sites" value={n} onChange={setN} min={1} max={100} />}
            {mode === "cluster" && <><Select label="Cluster TO" value={cl || ""} onChange={setCluster} options={clusters} /><Slider label="Share of cluster sites affected" value={share} onChange={setShare} min={5} max={100} step={5} fmt={(v) => `${v}%`} /></>}
            {mode === "pick" && <label className="flex flex-col gap-1 text-[12px] text-mut">Site IDs (comma / space separated)<textarea value={picked} onChange={(e) => setPicked(e.target.value)} rows={3} className="border border-line rounded-md p-2 text-[12.5px] text-ink" placeholder="PBI027, SKY047" /></label>}
            <div className="text-[12px] text-slate"><b>{affected.length}</b> affected active site(s)</div>
            <Slider label="Outage duration" value={hours} onChange={setHours} min={0.5} max={24} step={0.5} fmt={(v) => `${v} h`} />
            <Slider label="Departure hour (traffic)" value={hour} onChange={setHour} min={0} max={23} fmt={(v) => `${String(v).padStart(2, "0")}:00`} />
            <details className="text-[12px]">
              <summary className="cursor-pointer text-slate">MBPs busy / unavailable ({busy.length})</summary>
              <div className="max-h-40 overflow-y-auto border border-line rounded-md mt-1 p-1.5 space-y-0.5">
                {mbpsNop.map((m) => <Toggle key={m.mbp_id} label={`${m.mbp_id}${m.lat == null ? " (no location)" : ""}`} checked={busy.includes(m.mbp_id)} onChange={(c) => setBusy(c ? [...busy, m.mbp_id] : busy.filter((x) => x !== m.mbp_id))} />)}
              </div>
            </details>
            <div className="border-t border-line pt-3 space-y-3">
              <div className="text-[12px] font-semibold text-navy">Alternative scenarios</div>
              <Toggle label="B · Move one base camp" checked={moveOn} onChange={setMoveOn} />
              {moveOn && <>
                <Select label="MBP to move" value={moveMbp} onChange={setMoveMbp} options={[{ value: "", label: "— choose —" }, ...mbpsNop.filter((m) => m.lat != null).map((m) => m.mbp_id)]} />
                <Select label="…to the location of site" value={moveTo} onChange={setMoveTo} options={[{ value: "", label: "— choose —" }, ...[...inNop].sort((a, b) => b.mbp_priority_score - a.mbp_priority_score).slice(0, 300).map((s) => ({ value: s.site_id, label: `${s.site_id} · ${s.site_name} (${s.mbp_priority_level})` }))]} />
              </>}
              <Slider label="C · Additional MBPs (pre-positioned)" value={addN} onChange={setAddN} min={0} max={10} />
              <Slider label="D · Alternative outage duration" value={altH} onChange={setAltH} min={0.5} max={24} step={0.5} fmt={(v) => `${v} h`} />
            </div>
            <button onClick={run} disabled={!affected.length} className="w-full bg-navy text-white rounded-md py-2 text-[13px] font-semibold disabled:opacity-40">Run simulation</button>
          </div>
        </Card>
        <div className="space-y-4 min-w-0">
          {!res ? <Card title="Results"><div className="text-mut text-[13px]">Choose the affected sites and press <b>Run simulation</b>.</div></Card> : <>
            <Card title="Scenario comparison" sub="Priority-weighted coverage = share of affected-site priority that is saved or needs no MBP.">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] tabular">
                  <thead><tr className="text-slate">{["Scenario", "Affected", "Need MBP", "Saved", "Late", "Unserved (no MBP)", "Unserved (island)", "Avg ETA", "Max ETA", "Expected downtime", "Priority-weighted coverage"].map((h) => <th key={h} className="px-2 py-1.5 border-b border-line text-right first:text-left whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>{kRows.map((r) => (
                    <tr key={r.scenario} onClick={() => setShow(r.scenario)} className={`border-b border-line/60 cursor-pointer ${show === r.scenario ? "bg-s1/10" : "hover:bg-s1/5"}`}>
                      <td className="px-2 py-1.5 font-semibold">{r.scenario}</td><td className="text-right px-2">{r.sites_affected}</td><td className="text-right px-2">{r.sites_need_mbp}</td>
                      <td className="text-right px-2 text-good font-semibold">{r.saved}</td><td className="text-right px-2">{r.late}</td><td className="text-right px-2 text-crit">{r.unserved_busy}</td>
                      <td className="text-right px-2 text-s7">{r.unserved_island}</td><td className="text-right px-2">{fMin(r.avg_eta_min)}</td><td className="text-right px-2">{fMin(r.max_eta_min)}</td>
                      <td className="text-right px-2">{fH(r.expected_downtime_h)}</td><td className="text-right px-2 font-semibold">{fPct(r.priority_weighted_coverage_pct, 0)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              {kRows[0]?.unserved_island > 0 && <div className="mt-2"><Note tone="warn">{kRows[0].unserved_island} affected site(s) are island sites: road travel time is UNAVAILABLE, so extra land MBPs (scenario C) cannot reduce them. They need sea / crossing logistics or a permanent backup (battery upgrade / fixed genset).</Note></div>}
            </Card>
            <Card title={`Recommended allocation — ${show}`} right={<Select value={show} onChange={setShow} options={Object.keys(res)} />}>
              <MapView fitKey={show} onPick={setPick}
                sites={cur.rows.map((r) => ({ ...siteMap.get(r.site_id), _o: r.outcome }))}
                colorOf={(s) => OUT[s._o].c} sizeOf={() => 6}
                mbps={[...data.mbps.filter((m) => cur.rows.some((r) => r.mbp === m.mbp_id)), ...(cur.extra || [])]}
                legend={Object.values(OUT).map((o) => ({ label: o.label, c: o.c }))} height={380} />
              <div className="mt-3">
                <DataTable rows={cur.rows} filename={`pba_simulation_${show}.csv`.replace(/[^\w.]+/g, "_")} onRowClick={(r) => setPick(siteMap.get(r.site_id))} columns={[
                  { key: "priority", label: "Priority", num: true, render: (r) => <span className="inline-flex gap-1.5 items-center"><LevelTag v={r.priority_level} />{f2(r.priority)}</span>, csv: (r) => `${r.priority_level} ${f2(r.priority)}` },
                  { key: "site_id", label: "Site ID" }, { key: "site_name", label: "Site name" }, { key: "site_class", label: "Class" },
                  { key: "bbt_min", label: "BBT", num: true, render: (r) => <span className="inline-flex gap-1.5 items-center">{fMin(r.bbt_min)}<EvTag v={String(r.bbt_evidence).split(" ")[0]} /></span> },
                  { key: "mbp", label: "Recommended MBP", render: (r) => r.mbp || "—" }, { key: "km", label: "Distance", num: true, render: (r) => fKm(r.km) },
                  { key: "eta_min", label: "ETA", num: true, render: (r) => fMin(r.eta_min) }, { key: "served_before", label: "Served before", num: true },
                  { key: "outcome", label: "Outcome", render: (r) => <Tag tone={r.outcome === "saved" ? "good" : r.outcome === "no_need" ? "mut" : "crit"}>{OUT[r.outcome].label.split(" — ")[0]}</Tag>, csv: (r) => OUT[r.outcome].label },
                  { key: "expected_down_min", label: "Expected down", num: true, render: (r) => fMin(r.expected_down_min) },
                  { key: "reasons", label: "Why", wrap: true },
                ]} />
              </div>
            </Card>
          </>}
        </div>
      </div>
    </div>
  );
}
