"use client";
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Note, DataTable, Select, Slider, Toggle, LevelTag, EvTag, Tag, fInt, fMin, fKm, fH, f3, fPct, fNum, isNum } from "@/components/ui";
import { t, tv } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { simulate, kmeans } from "@/lib/logic";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const OUT = { saved: "#0ca30c", late: "#ec835a", unserved_busy: "#d03b3b", unserved_no_coverage: "#7a1414", unserved_island: "#4a3aa7", no_need: "#A3ABB9" };
const OUT_EN = {   // CSV value (English, stable)
  saved: "saved — MBP arrives before battery runs out", late: "late — site dark until MBP arrives", unserved_busy: "unserved — all MBPs in radius busy",
  unserved_no_coverage: "unserved — no MBP within coverage radius", unserved_island: "unserved — island (needs sea logistics, not modelled)", no_need: "no MBP needed — battery covers the outage",
};

export default function SimTab({ model: scored, data, cfg, nop: gNop, setPick, setRadius }) {
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
    const A = t("sim.sc.a"); out[A] = base;
    if (moveOn && moveMbp && moveTo) {
      const tgt = scored.find((s) => s.site_id === moveTo);
      if (tgt) out[`B · ${moveMbp} → ${moveTo}`] = simulate(scored, affected, hours, data.mbps, ctx, cfg, { departHour: hour, busy: b,
        movedMbps: data.mbps.map((m) => (m.mbp_id === moveMbp ? { ...m, lat: tgt.lat, lon: tgt.lon } : m)) });
    }
    if (addN > 0) {
      const need = base.rows.filter((r) => r.outcome === "late" || r.outcome === "unserved_busy" || r.outcome === "unserved_no_coverage");
      const pts = need.map((r) => scored.find((s) => s.site_id === r.site_id)).filter((s) => s && isNum(s.lat) && s.access_class !== "island").map((s) => ({ lat: s.lat, lon: s.lon, w: s.mbp_priority_score }));
      // priority-weighted centres, snapped to the nearest site that needs an MBP (a real, reachable location — not a calculated point)
      const cen = kmeans(pts, addN).map((c) => pts.reduce((b, p) => ((p.lat - c[0]) ** 2 + (p.lon - c[1]) ** 2 < (b.lat - c[0]) ** 2 + (b.lon - c[1]) ** 2 ? p : b), pts[0]));
      const uniq = [...new Map(cen.map((p) => [p.lat + "," + p.lon, p])).values()];
      const extra = uniq.map((c, i) => ({ mbp_id: `NEW-MBP-${i + 1}`, lat: c.lat, lon: c.lon, nop, is_new: true, mbp_tickets_h1: 0 }));
      if (extra.length) out[t("sim.sc.c", { n: extra.length })] = { ...simulate(scored, affected, hours, data.mbps, ctx, cfg, { departHour: hour, busy: b, extra }), extra };
    }
    out[t("sim.sc.d", { h: fNum(altH, 1) })] = simulate(scored, affected, altH, data.mbps, ctx, cfg, { departHour: hour, busy: b });
    setRes(out); setShow(A);
  };

  // C5 — pre-run the default scenario (top-20 PLN-frequency sites, 4 h outage) whenever the NOP changes, so the page is never empty
  useEffect(() => { if (inNop.length && mode === "top") run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [nop, inNop.length]);
  const cur = res && res[show];
  const kRows = res ? Object.entries(res).map(([k, v]) => ({ scenario: k, ...v.kpi })) : [];
  const siteMap = useMemo(() => new Map(scored.map((s) => [s.site_id, s])), [scored]);

  return (
    <div className="space-y-4">
      <Note>{t("sim.note")}</Note>
      <div className="grid xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
        <Card title={t("sim.inputs")}>
          <div className="space-y-3">
            <Select label={t("filter.nop")} value={nop} onChange={(v) => { setNop(v); setRes(null); setBusy([]); setMoveMbp(""); setMoveTo(""); }} options={nops} />
            <Select label={t("sim.affected")} value={mode} onChange={setMode} options={[{ value: "top", label: t("sim.mode.top") }, { value: "cluster", label: t("sim.mode.cluster") }, { value: "pick", label: t("sim.mode.pick") }]} />
            {mode === "top" && <Slider label={t("sim.n_sites")} value={n} onChange={setN} min={1} max={100} />}
            {mode === "cluster" && <><Select label={t("sim.cluster")} value={cl || ""} onChange={setCluster} options={clusters} /><Slider label={t("sim.share")} value={share} onChange={setShare} min={5} max={100} step={5} fmt={(v) => fPct(v, 0)} /></>}
            {mode === "pick" && <label className="flex flex-col gap-1 text-[12px] text-mut">{t("sim.ids")}<textarea value={picked} onChange={(e) => setPicked(e.target.value)} rows={3} className="border border-line rounded-md p-2 text-[12.5px] text-ink" placeholder="PBI027, SKY047" /></label>}
            <div className="text-[12px] text-slate">{t("sim.n_affected", { n: fInt(affected.length) })}</div>
            <Slider label={t("sim.duration")} value={hours} onChange={setHours} min={0.5} max={24} step={0.5} fmt={(v) => fH(v)} />
            <Slider label={t("sim.depart")} value={hour} onChange={setHour} min={0} max={23} fmt={(v) => `${String(v).padStart(2, "0")}:00`} />
            <details className="text-[12px]">
              <summary className="cursor-pointer text-slate">{t("sim.busy", { n: busy.length })}</summary>
              <div className="max-h-40 overflow-y-auto border border-line rounded-md mt-1 p-1.5 space-y-0.5">
                {mbpsNop.map((m) => <Toggle key={m.mbp_id} label={`${m.mbp_id}${m.lat == null ? ` (${t("sim.no_location")})` : ""}`} checked={busy.includes(m.mbp_id)} onChange={(c) => setBusy(c ? [...busy, m.mbp_id] : busy.filter((x) => x !== m.mbp_id))} />)}
              </div>
            </details>
            <div className="border-t border-line pt-3 space-y-3">
              <div className="text-[12px] font-semibold text-navy">{t("sim.alt")}</div>
              <Toggle label={t("sim.b")} checked={moveOn} onChange={setMoveOn} />
              {moveOn && <>
                <Select label={t("sim.b_mbp")} value={moveMbp} onChange={setMoveMbp} options={[{ value: "", label: t("common.choose") }, ...mbpsNop.filter((m) => m.lat != null).map((m) => m.mbp_id)]} />
                <Select label={t("sim.b_to")} value={moveTo} onChange={setMoveTo} options={[{ value: "", label: t("common.choose") }, ...[...inNop].sort((a, b) => b.mbp_priority_score - a.mbp_priority_score).slice(0, 300).map((s) => ({ value: s.site_id, label: `${s.site_id} · ${s.site_name} (MBP-${s.mbp_priority_level})` }))]} />
              </>}
              <Slider label={t("sim.c")} value={addN} onChange={setAddN} min={0} max={10} />
              <Slider label={t("sim.d")} value={altH} onChange={setAltH} min={0.5} max={24} step={0.5} fmt={(v) => fH(v)} />
            </div>
            <button onClick={run} disabled={!affected.length} className="w-full bg-navy text-white rounded-md py-2 text-[13px] font-semibold disabled:opacity-40">{t("sim.run")}</button>
          </div>
        </Card>
        <div className="space-y-4 min-w-0">
          {!res ? <Card title={t("sim.results")}><div className="text-mut text-[13px]">{t("sim.running_default")}</div></Card> : <>
            <Card title={t("sim.cmp.title")} sub={t("sim.cmp.sub")}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] tabular">
                  <thead><tr className="text-slate">{["scenario", "affected", "need", "saved", "late", "no_feasible", "busy", "no_cov", "island", "avg_eta", "max_eta", "exp_down", "pw_cov"].map((k) => t(`sim.cmp.${k}`)).map((h) => <th key={h} className="px-2 py-1.5 border-b border-line text-right first:text-left whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>{kRows.map((r) => (
                    <tr key={r.scenario} onClick={() => setShow(r.scenario)} className={`border-b border-line/60 cursor-pointer ${show === r.scenario ? "bg-s1/10" : "hover:bg-s1/5"}`}>
                      <td className="px-2 py-1.5 font-semibold">{r.scenario}</td><td className="text-right px-2">{r.sites_affected}</td><td className="text-right px-2">{r.sites_need_mbp}</td>
                      <td className="text-right px-2 text-good font-semibold">{r.saved}</td><td className="text-right px-2">{r.late}</td><td className="text-right px-2 text-warn">{r.no_feasible}</td><td className="text-right px-2 text-crit">{r.unserved_busy}</td><td className="text-right px-2 text-crit">{r.unserved_no_coverage}</td>
                      <td className="text-right px-2 text-s7">{r.unserved_island}</td><td className="text-right px-2">{fMin(r.avg_eta_min)}</td><td className="text-right px-2">{fMin(r.max_eta_min)}</td>
                      <td className="text-right px-2">{fH(r.expected_downtime_h)}</td><td className="text-right px-2 font-semibold">{fPct(r.priority_weighted_coverage_pct, 0)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              {kRows[0]?.unserved_island > 0 && <div className="mt-2"><Note tone="warn">{t("sim.island_note", { n: kRows[0].unserved_island })}</Note></div>}
            </Card>
            <Card title={t("sim.alloc", { s: show })} right={<Select value={show} onChange={setShow} options={Object.keys(res)} />}>
              <MapView fitKey={show} onPickSite={setPick} cfg={cfg} onRadius={setRadius} compact
                sites={cur.rows.map((r) => ({ ...siteMap.get(r.site_id), _o: r.outcome }))}
                colorOverride={(s) => OUT[s._o]} keyOverride={(s) => s._o}
                mbps={data.mbps.filter((m) => cur.rows.some((r) => r.mbp === m.mbp_id))} extraMbps={cur.extra || []}
                legendOverride={Object.entries(OUT).map(([k, c]) => ({ k, label: t(`sim.out.${k}`), c }))} height={380} />
              <div className="mt-3">
                <DataTable rows={cur.rows} filename={`pba_simulation_${show}.csv`.replace(/[^\w.]+/g, "_")} onRowClick={(r) => setPick(siteMap.get(r.site_id))} columns={[
                  { key: "priority", label: "col.mbp_priority", num: true, render: (r) => <span className="inline-flex gap-1.5 items-center"><LevelTag kind="MBP" v={r.priority_level} />{f3(r.priority)}</span>, csv: (r) => `MBP-${r.priority_level} ${r.priority.toFixed(3)}` },
                  { key: "site_id", label: "col.site_id" }, { key: "site_name", label: "col.site_name" }, { key: "site_class", label: "col.class" },
                  { key: "bbt_min", label: "col.bbt", num: true, render: (r) => <span className="inline-flex gap-1.5 items-center">{r.bbt_text ? <span className="text-slate">{t("bbt.no_battery_ticket")}</span> : fMin(r.bbt_shown)}<EvTag v={String(r.bbt_evidence).split(" ")[0]} /></span>, csv: (r) => r.bbt_text || `${isNum(r.bbt_shown) ? Math.round(r.bbt_shown) : ""} ${r.bbt_evidence}` },
                  { key: "mbp", label: "col.recommended_mbp", render: (r) => r.mbp || "—" }, { key: "km", label: "col.distance", num: true, render: (r) => fKm(r.km), csv: (r) => r.km?.toFixed(1) },
                  { key: "eta_min", label: "col.eta", num: true, render: (r) => fMin(r.eta_min), csv: (r) => (isNum(r.eta_min) ? Math.round(r.eta_min) : "") }, { key: "served_before", label: "col.served_before", num: true },
                  { key: "feasible", label: "col.arrives_before_bbt", render: (r) => (r.feasible === true ? <Tag tone="good">✔ {t("common.yes")}</Tag> : r.feasible === false ? <Tag tone="crit">✖ {t("sim.no_fallback")}</Tag> : "—"), csv: (r) => (r.feasible == null ? "" : r.feasible ? "yes" : "no") },
                  { key: "outcome", label: "col.outcome", render: (r) => <Tag tone={r.outcome === "saved" ? "good" : r.outcome === "no_need" ? "mut" : "crit"} title={t(`sim.out.${r.outcome}`)}>{t(`sim.out.${r.outcome}`).split(" — ")[0]}</Tag>, csv: (r) => OUT_EN[r.outcome] },
                  { key: "expected_down_min", label: "col.expected_down", num: true, render: (r) => fMin(r.expected_down_min), csv: (r) => Math.round(r.expected_down_min) },
                  { key: "reasons", label: "col.why", wrap: true, render: (r) => te(r.reasons, "sim"), csv: (r) => r.reasons },
                ]} />
              </div>
            </Card>
          </>}
        </div>
      </div>
    </div>
  );
}
