"use client";
// v3.8 — AREA 4 (Kalimantan · Sulawesi · Maluku-Papua): what the current AREA 4 data supports — availability vs target and causes
// (site → cluster → NOP), monthly / weekly trend, battery status from the BBT Site Details snapshot, field staff (BPS / PM / TS) and
// BPS reach, plus the data inventory. Screens that need MBP tickets / battery inventory / PLN intervals stay AREA 1 until those arrive.
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend, BarChart, Bar } from "recharts";
import { Card, Kpi, Note, DataTable, Select, Chips, StatusTag, EvTag, Bar100, fInt, fH, fPct, fPP, fMin, fNum, isNum, monthName } from "@/components/ui";
import { fromColumnar } from "@/lib/data";
import { a4Model, a4Rollup, a4Field, A4_STATUS, A4_PROBLEM, GAP_KEYS, CAUSE_KEYS } from "@/lib/area4";
import { CAUSE_COLOR, STATUS } from "@/components/ui";
import { t, tv } from "@/lib/i18n";
import DataInventory from "@/components/DataInventory";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const TABS = ["overview", "avail", "battery", "field", "data"];
const CLASSES = ["Diamond", "Platinum", "Gold", "Silver", "Bronze"];
const GAP_C = { big: "#b42318", small: "#ec835a", meets: "#0ca30c", nodata: "#C9CFD9" };
const CAUSE_C = { ...CAUSE_COLOR, none: "#E3E7ED" };
const BAT_C = { Dead: "#7a1414", Critical: "#d03b3b", Degraded: "#fab219", "Below design": "#9DB7DE", held: "#1baf7a", "Meets design": "#0ca30c", Unknown: "#C9CFD9" };
const ROLE_C = { BPS: "#1F2A44", TS: "#2a78d6", PM: "#eda100" };
const MODES = {
  gap: { keys: GAP_KEYS, c: GAP_C, key: (s) => s.gap_key, label: (k) => t(`map.gap.${k}`) },
  cause: { keys: CAUSE_KEYS, c: CAUSE_C, key: (s) => s.cause_key, label: (k) => (k === "none" ? t("map.none_down") : tv("cause", k)) },
  battery: { keys: A4_STATUS, c: BAT_C, key: (s) => s.bbt_status, label: (k) => (k === "held" ? t("a4.bat.held") : `${STATUS[k]?.i || ""} ${tv("status", k)}`) },
};
const pc = (a, b, d = 0) => (b ? fPct((100 * a) / b, d) : "—");

export default function Area4({ cfg, setRadius, setPick, meta1 }) {
  const [raw, setRaw] = useState(null), [err, setErr] = useState(null);
  useEffect(() => {
    const get = (f) => fetch(`/data/a4/${f}`).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
    Promise.all([get("meta.json"), get("sites.json"), get("weekly.json"), get("fme.json")])
      .then(([meta, sites, weekly, fme]) => setRaw({ meta, sites: fromColumnar(sites), weekly: fromColumnar(weekly), fme: fromColumnar(fme) })).catch((e) => setErr(String(e)));
  }, []);
  const [tab, setTab] = useState(() => { try { const v = window.__pbaA4 || new URLSearchParams(window.location.search).get("a4"); return TABS.includes(v) ? v : "overview"; } catch { return "overview"; } });
  useEffect(() => { try { const q = new URLSearchParams(window.location.search); q.set("a4", tab); window.history.replaceState({}, "", `?${q}`); window.__pbaA4 = tab; } catch {} }, [tab]);
  const [nop, setNop] = useState("ALL"), [cls, setCls] = useState([]), [gen, setGen] = useState(false);
  const all = useMemo(() => (raw ? a4Model(raw.sites, cfg) : []), [raw, cfg]);
  const nops = useMemo(() => [...new Set(all.map((s) => s.nop).filter(Boolean))].sort(), [all]);
  const scope = useMemo(() => all.filter((s) => (nop === "ALL" || s.nop === nop) && (!cls.length || cls.includes(s.site_class)) && (gen || !s.genset_protected)), [all, nop, cls, gen]);
  const fme = useMemo(() => (raw ? raw.fme.filter((p) => nop === "ALL" || p.nop === nop) : []), [raw, nop]);
  const [mode, setMode] = useState("gap"), [hidden, setHidden] = useState([]);
  useEffect(() => setHidden([]), [mode]);
  const M = MODES[mode];
  const vis = useMemo(() => (hidden.length ? scope.filter((s) => !hidden.includes(M.key(s))) : scope), [scope, hidden, M]);
  if (err) return <div className="p-6 text-crit">{t("a4.load_error", { e: err })}</div>;
  if (!raw) return <div className="p-10 text-slate" role="status">{t("app.loading")}</div>;

  const R = cfg.mbp.max_radius_km;
  const T = a4Rollup(vis, "nop").reduce((a, r) => { for (const k of ["sites", "ran", "hours", "out", "pw", "tr", "ran_h", "oth", "below", "bbt", "prob", "dead", "genset"]) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  const tgt = (() => { const v = vis.map((s) => s.ran_target_pct).filter(isNum).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null; })();
  const avail = T.hours ? 100 * (1 - T.out / T.hours) : null;
  const legend = M.keys.map((k) => ({ k, c: M.c[k], label: M.label(k) }));
  const cardRows = (s) => [[t("health.kpi.avail"), fPct(s.avail_pct)], [t("common.target"), fPct(s.ran_target_pct)], [t("common.gap"), fPP(s.avail_delta_pp)],
    [t("col.power_downtime"), fH(s.ran_power_down_h)], [t("a4.col.bbt"), s.battery.value == null ? "—" : `${fMin(s.battery.value)} · ${s.battery.evidence}`], [t("status.tip"), s.bbt_status === "held" ? t("a4.bat.held") : tv("status", s.bbt_status)],
    [t("col.kecamatan"), s.kecamatan || "—"], [t("a4.col.genset"), s.genset_protected ? "✔" : "—"], [t("a4.col.last_pm"), s.last_pm || "—"]];
  const tt = (s) => `${M.label(M.key(s))} · ${fPct(s.avail_pct)} / ${fPct(s.ran_target_pct)} · ${fH(s.ran_power_down_h)} ${t("a4.power_short")}`;
  const map = (h = 560, extra = {}) => (
    <MapView sites={scope} mbps={[]} cfg={cfg} onRadius={setRadius} fitKey={nop + mode} height={h} colorOverride={(s) => M.c[M.key(s)] || "#55627A"} legendOverride={legend}
      keyOverride={M.key} hidden={hidden} onHidden={setHidden} hollowOverride={(s) => !isNum(s.avail_pct)} hollowLabel={t("a4.hollow")} ttOverride={tt} cardRows={cardRows} showMbpLayers={false} {...extra} />
  );
  const ModeSel = () => (
    <div className="flex rounded-md overflow-hidden border border-line" role="group" aria-label={t("map.colour_by")}>
      {Object.keys(MODES).map((k) => <button key={k} aria-pressed={mode === k} onClick={() => setMode(k)} className={`px-2.5 py-1 text-[12.5px] ${mode === k ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`a4.mode.${k}`)}</button>)}</div>);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
        {TABS.map((k) => <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === k ? "bg-navy text-white font-semibold" : "text-slate hover:text-navy"}`}>{t(`a4.tab.${k}`)}</button>)}
      </div>
      {tab !== "data" && <div className="flex flex-wrap items-end gap-4 text-[12.5px]">
        <div className="w-64"><Select label={t("filter.nop")} value={nop} onChange={setNop} options={[{ value: "ALL", label: t("a4.all_nops", { n: fInt(all.length) }) }, ...nops.map((n) => ({ value: n, label: n }))]} /></div>
        <Chips label={t("filter.class")} options={CLASSES} value={cls} onChange={setCls} />
        <label className="inline-flex items-center gap-1.5 self-end pb-1"><input type="checkbox" checked={gen} onChange={(e) => setGen(e.target.checked)} className="accent-navy" /> {t("a4.genset_toggle", { n: fInt(all.filter((s) => s.genset_protected).length) })}</label>
        <span className="self-end pb-1 text-mut">{t("a4.period", { m: `${monthName(0)} – Jul 2026` })}</span>
      </div>}
      {hidden.length > 0 && tab !== "data" && <div role="status" className="flex items-center gap-2 text-[12.5px] border border-s1/40 bg-s1/5 rounded-md px-3 py-1.5"><b>{t("map.legfilter.title")}</b> {t("map.legfilter.tab", { h: hidden.length, n: fInt(vis.length), N: fInt(scope.length) })}<button onClick={() => setHidden([])} className="ml-auto underline text-slate">{t("map.leg_all")}</button></div>}

      {tab === "overview" && <>
        <Note>{t("a4.note")}</Note>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <Kpi label={t("a4.kpi.sites")} value={fInt(T.sites)} sub={t("a4.kpi.sites_sub", { r: fInt(T.ran), g: fInt(all.filter((x) => x.genset_protected && (nop === "ALL" || x.nop === nop)).length) })} />
          <Kpi label={t("health.kpi.avail")} value={fPct(avail)} sub={t("a4.kpi.avail_sub", { t: fPct(tgt), g: fPP(isNum(avail) && isNum(tgt) ? avail - tgt : null) })} tone={avail >= tgt ? "good" : "crit"} />
          <Kpi label={t("a4.kpi.below")} value={pc(T.below, T.ran)} sub={t("a4.kpi.of", { a: fInt(T.below), n: fInt(T.ran) })} tone="warn" />
          <Kpi label={t("a4.kpi.power")} value={pc(T.pw, T.out)} sub={t("a4.kpi.power_sub", { h: fH(T.pw), tr: pc(T.tr, T.out) })} tone="crit" />
          <Kpi label={t("a4.kpi.bat")} value={pc(T.prob, T.bbt)} sub={t("a4.kpi.bat_sub", { a: fInt(T.prob), n: fInt(T.bbt), d: fInt(T.dead) })} tone="crit" help={t("a4.kpi.bat_help")} />
          <Kpi label={t("a4.kpi.bps")} value={fInt(fme.filter((p) => p.role === "BPS").length)} sub={t("a4.kpi.bps_sub", { ts: fInt(fme.filter((p) => p.role === "TS").length), pm: fInt(fme.filter((p) => p.role === "PM").length) })} />
          <Kpi label={t("a4.kpi.nops")} value={fInt(new Set(vis.map((s) => s.nop)).size)} sub={t("a4.kpi.nops_sub", { c: fInt(new Set(vis.map((s) => s.cluster_to)).size), k: fInt(new Set(vis.map((s) => s.kecamatan)).size) })} />
        </div>
        <Card title={t("a4.map.title")} sub={t("a4.map.sub")} right={<ModeSel />}>{map(600)}</Card>
        <NopTable rows={a4Rollup(vis, "nop")} onPick={(n) => setNop(n === nop ? "ALL" : n)} cur={nop} />
      </>}

      {tab === "avail" && <AvailTab vis={vis} weekly={raw.weekly} nop={nop} map={map} ModeSel={ModeSel} />}
      {tab === "battery" && <BatteryTab vis={vis} cfg={cfg} map={map} setMode={setMode} mode={mode} ModeSel={ModeSel} />}
      {tab === "field" && <FieldTab vis={vis} fme={fme} cfg={cfg} R={R} setRadius={setRadius} nop={nop} legend={legend} M={M} cardRows={cardRows} tt={tt} ModeSel={ModeSel} />}
      {tab === "data" && <DataInventory meta1={meta1} meta4={raw.meta} />}
    </div>
  );
}

function NopTable({ rows, onPick, cur, title, idLabel = "col.nop" }) {
  return (
    <Card title={title || t("a4.nop.title")} sub={t("a4.nop.sub")}>
      <DataTable rows={rows} pageSize={20} filename="pba_area4_nop.csv" initialSort={{ key: "gap", dir: 1 }} onRowClick={onPick ? (r) => onPick(r.id) : undefined}
        rowClass={(r) => (r.id === cur ? "bg-warn/10 font-semibold" : "")} columns={[
          { key: "id", label: idLabel }, { key: "sites", label: "col.sites_scope", num: true },
          { key: "avail", label: "health.kpi.avail", num: true, render: (r) => fPct(r.avail), csv: (r) => r.avail?.toFixed(3) },
          { key: "target", label: "common.target", num: true, render: (r) => fPct(r.target), csv: (r) => r.target },
          { key: "gap", label: "common.gap", num: true, render: (r) => <span className={r.gap < 0 ? "text-crit font-semibold" : "text-good"}>{fPP(r.gap)}</span>, csv: (r) => r.gap?.toFixed(3) },
          { key: "below_share", label: "a4.col.below", num: true, render: (r) => `${fInt(r.below)} · ${pc(r.below, r.ran)}`, csv: (r) => r.below },
          { key: "power_share", label: "a4.col.power_share", num: true, render: (r) => pc(r.pw, r.out), csv: (r) => (r.power_share == null ? "" : (100 * r.power_share).toFixed(1)) },
          { key: "power_h_site", label: "a4.col.power_h_site", num: true, render: (r) => fH(r.power_h_site), csv: (r) => r.power_h_site?.toFixed(1) },
          { key: "prob_share", label: "a4.col.bat_problem", num: true, render: (r) => `${fInt(r.prob)} · ${pc(r.prob, r.bbt)}`, csv: (r) => r.prob },
          { key: "genset", label: "a4.col.genset", num: true },
        ]} />
    </Card>
  );
}

function AvailTab({ vis, weekly, nop, map, ModeSel }) {
  const W = useMemo(() => { const area = weekly.filter((w) => w.level === "area"), mine = nop === "ALL" ? [] : weekly.filter((w) => w.level === "nop" && w.id === nop);
    return area.map((a) => { const m = mine.find((x) => x.week === a.week); return { wk: `W${a.week.slice(-2)}`, area: a.avail, target: a.target, nop: m?.avail ?? null, power: (m || a).power, transport: (m || a).transport, other: (m || a).other }; }); }, [weekly, nop]);
  const months = useMemo(() => ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul"].map((lbl, i) => { let h = 0, o = 0, p = 0;
    for (const s of vis) { if (!Array.isArray(s.m_out) || s.m_out[i] == null) continue; const hrs = [31, 28, 31, 30, 31, 30, 31][i] * 24; h += hrs; o += s.m_out[i]; p += s.m_pw?.[i] || 0; }
    return { m: lbl, avail: h ? 100 * (1 - o / h) : null, power: h ? (100 * p) / h : null }; }), [vis]);
  const clusters = useMemo(() => a4Rollup(vis, "cluster_to").filter((r) => r.ran >= 5), [vis]);
  const kec = useMemo(() => a4Rollup(vis, "kecamatan").filter((r) => r.ran >= 5), [vis]);
  return (
    <div className="space-y-4">
      <Card title={t("a4.map.title")} sub={t("a4.map.sub")} right={<ModeSel />}>{map(480)}</Card>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card title={t("a4.week.title")} sub={t("a4.week.sub")}>
          <ResponsiveContainer width="100%" height={260}><LineChart data={W} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#E3E7ED" vertical={false} /><XAxis dataKey="wk" tick={{ fontSize: 10.5 }} interval={2} /><YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => fPct(v, 1)} />
            <Tooltip formatter={(v) => fPct(Number(v), 2)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="area" name="AREA 4" stroke="#2b2370" strokeWidth={2} dot={false} />{nop !== "ALL" && <Line dataKey="nop" name={nop} stroke="#eb6834" strokeWidth={2} dot={false} />}
            <Line dataKey="target" name={t("common.target")} stroke="#d03b3b" strokeDasharray="4 3" dot={false} />
          </LineChart></ResponsiveContainer>
        </Card>
        <Card title={t("a4.month.title")} sub={t("a4.month.sub")}>
          <ResponsiveContainer width="100%" height={260}><BarChart data={months} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#E3E7ED" vertical={false} /><XAxis dataKey="m" tick={{ fontSize: 11 }} /><YAxis yAxisId="a" domain={[(v) => Math.floor(v * 10 - 3) / 10, (v) => Math.min(100, Math.ceil(v * 10 + 3) / 10)]} allowDataOverflow tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => fPct(v, 1)} />
            <Tooltip formatter={(v) => fPct(Number(v), 2)} /><Bar yAxisId="a" dataKey="avail" name={t("health.kpi.avail")} fill="#2b2370" />
          </BarChart></ResponsiveContainer>
          <div className="text-[11px] text-mut">{t("a4.month.foot")}</div>
        </Card>
      </div>
      <div className="grid xl:grid-cols-2 gap-4">
        <NopTable rows={clusters} title={t("a4.cluster.title")} idLabel="col.cluster" />
        <NopTable rows={kec} title={t("a4.kec.title")} idLabel="col.kecamatan" />
      </div>
    </div>
  );
}

function BatteryTab({ vis, cfg, map, mode, setMode, ModeSel }) {
  useEffect(() => { if (mode !== "battery") setMode("battery"); }, []); // eslint-disable-line
  const counts = A4_STATUS.map((k) => ({ k, n: vis.filter((s) => s.bbt_status === k).length }));
  const tot = counts.reduce((a, c) => a + c.n, 0), known = tot - (counts.find((c) => c.k === "Unknown")?.n || 0);
  const list = useMemo(() => vis.filter((s) => A4_PROBLEM.has(s.bbt_status)).sort((a, b) => (b.ran_power_down_h || 0) - (a.ran_power_down_h || 0)), [vis]);
  const short = vis.filter((s) => s.bbt_category === "BBT" && isNum(s.bbt_median_min)), le5 = short.filter((s) => s.bbt_median_min <= cfg.bbt.dead_max_minutes).length;
  return (
    <div className="space-y-4">
      <Note tone="warn"><b>{t("a4.bat.note_title")}</b> {t("a4.bat.note", { p: pc(le5, short.length), d: cfg.bbt.dead_max_minutes, n: fInt(short.length) })}</Note>
      <Card title={t("a4.bat.dist")} sub={t("a4.bat.dist_sub", { d: cfg.bbt.design_minutes })}>
        <Bar100 height={16} parts={counts.filter((c) => c.n).map((c) => ({ label: c.k === "held" ? t("a4.bat.held") : tv("status", c.k), c: BAT_C[c.k], v: c.n, txt: `${fInt(c.n)} · ${pc(c.n, tot)}` }))} />
        <div className="text-[11.5px] text-mut mt-1">{t("a4.bat.known", { a: fInt(known), n: fInt(tot) })}</div>
      </Card>
      <Card title={t("a4.map.title")} sub={t("a4.bat.map_sub")} right={<ModeSel />}>{map(480)}</Card>
      <Card title={t("a4.bat.list")} sub={t("a4.bat.list_sub")}>
        <DataTable rows={list} pageSize={25} filename="pba_area4_battery_problems.csv" initialSort={{ key: "ran_power_down_h", dir: -1 }} columns={[
          { key: "site_id", label: "col.site" }, { key: "site_name", label: "col.name" }, { key: "site_class", label: "col.class" }, { key: "nop", label: "col.nop" }, { key: "cluster_to", label: "col.cluster" },
          { key: "bbt_status", label: "status.tip", render: (r) => <StatusTag v={r.bbt_status} />, csv: (r) => r.bbt_status },
          { key: "bbt_median_min", label: "a4.col.bbt", num: true, render: (r) => fMin(r.bbt_median_min), csv: (r) => r.bbt_median_min?.toFixed(1) },
          { key: "pln_events", label: "a4.col.pln_events", num: true }, { key: "pln_down_total_h", label: "a4.col.pln_h", num: true, render: (r) => fH(r.pln_down_total_h), csv: (r) => r.pln_down_total_h?.toFixed(1) },
          { key: "ran_power_down_h", label: "col.power_downtime", num: true, render: (r) => fH(r.ran_power_down_h), csv: (r) => r.ran_power_down_h?.toFixed(1) },
          { key: "avail_delta_pp", label: "common.gap", num: true, render: (r) => fPP(r.avail_delta_pp), csv: (r) => r.avail_delta_pp?.toFixed(3) },
          { key: "last_pm", label: "a4.col.last_pm" },
        ]} />
        <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("a4.bat.foot")} <EvTag v="ACTUAL" /></div>
      </Card>
    </div>
  );
}

function FieldTab({ vis, fme, cfg, R, setRadius, nop, legend, M, cardRows, tt, ModeSel }) {
  const F = useMemo(() => a4Field(vis, fme, R), [vis, fme, R]);
  const [roles, setRoles] = useState(["BPS", "TS", "PM"]);
  const people = fme.filter((p) => isNum(p.lat)).map((p) => ({ mbp_id: `${p.role} · ${p.name}`, lat: p.lat, lon: p.lon, nop: p.nop, role: p.role, pic_name: p.subcluster }));
  const T = F.rows.reduce((a, r) => { for (const k of ["sites", "within", "BPS", "PM", "TS", "prob", "below"]) a[k] = (a[k] || 0) + r[k]; return a; }, {});
  const RP = cfg.mbp.radius_presets || [20, 30, 40, 60, 120];
  return (
    <div className="space-y-4">
      <Note>{t("a4.field.note")}</Note>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]"><span className="text-slate">{t("mgmt.radius")}</span>
        <div className="flex rounded-md overflow-hidden border border-line">{RP.map((km) => <button key={km} aria-pressed={R === km} onClick={() => setRadius(km)} className={`px-2.5 py-1 ${R === km ? "bg-navy text-white" : "bg-white text-slate"}`}>{km} km</button>)}</div></div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="BPS" value={fInt(T.BPS)} sub={t("a4.field.per", { n: fNum(T.BPS ? T.sites / T.BPS : null, 0) })} />
        <Kpi label="TS" value={fInt(T.TS)} sub={t("a4.field.per", { n: fNum(T.TS ? T.sites / T.TS : null, 0) })} />
        <Kpi label="PM" value={fInt(T.PM)} sub={t("a4.field.per", { n: fNum(T.PM ? T.sites / T.PM : null, 0) })} />
        <Kpi label={t("a4.field.within", { r: R })} value={pc(T.within, T.sites)} sub={t("a4.kpi.of", { a: fInt(T.within), n: fInt(T.sites) })} tone={T.within / Math.max(1, T.sites) >= 0.9 ? "good" : "warn"} help={t("a4.field.within_help")} />
        <Kpi label={t("a4.field.prob_ts")} value={fNum(T.TS ? T.prob / T.TS : null, 1)} sub={t("a4.field.prob_ts_sub", { p: fInt(T.prob) })} />
        <Kpi label={t("a4.field.moved")} value={fInt(fme.filter((p) => p.nop_old && p.nop && p.nop_old !== p.nop).length)} sub={t("a4.field.moved_sub")} />
      </div>
      <Card title={t("a4.field.map")} sub={t("a4.field.map_sub")} right={<ModeSel />}>
        <div className="mb-2"><Chips label={t("a4.field.roles")} options={["BPS", "TS", "PM"]} value={roles} onChange={setRoles} /></div>
        <MapView sites={vis} mbps={people.filter((p) => roles.includes(p.role))} cfg={cfg} onRadius={setRadius} fitKey={nop + "field"} height={560}
          colorOverride={(s) => M.c[M.key(s)] || "#55627A"} legendOverride={legend} keyOverride={M.key} hollowOverride={(s) => !isNum(s.avail_pct)} hollowLabel={t("a4.hollow")} ttOverride={tt} cardRows={cardRows}
          mbpLegendTitle={t("a4.field.role_legend")} mbpKeyOf={(m) => m.role} mbpLegend={["BPS", "TS", "PM"].map((k) => ({ k, c: ROLE_C[k], label: t(`a4.role.${k}`) }))} />
      </Card>
      <Card title={t("a4.field.table")} sub={t("a4.field.table_sub", { r: R })}>
        <DataTable rows={F.rows} pageSize={20} filename="pba_area4_field_staff.csv" initialSort={{ key: "within_pct", dir: 1 }} columns={[
          { key: "nop", label: "col.nop" }, { key: "sites", label: "col.sites_scope", num: true }, { key: "BPS", label: "BPS", num: true }, { key: "TS", label: "TS", num: true }, { key: "PM", label: "PM", num: true },
          { key: "sites_per_bps", label: "a4.col.sites_bps", num: true, render: (r) => fNum(r.sites_per_bps, 0), csv: (r) => r.sites_per_bps?.toFixed(1) },
          { key: "sites_per_ts", label: "a4.col.sites_ts", num: true, render: (r) => fNum(r.sites_per_ts, 0), csv: (r) => r.sites_per_ts?.toFixed(1) },
          { key: "within_pct", label: "a4.col.within", num: true, render: (r) => `${fInt(r.within)} · ${pc(r.within, r.sites)}`, csv: (r) => r.within },
          { key: "prob", label: "a4.col.bat_problem", num: true }, { key: "prob_per_ts", label: "a4.col.prob_ts", num: true, render: (r) => fNum(r.prob_per_ts, 1), csv: (r) => r.prob_per_ts?.toFixed(2) },
          { key: "below", label: "a4.col.below", num: true },
        ]} />
      </Card>
    </div>
  );
}
