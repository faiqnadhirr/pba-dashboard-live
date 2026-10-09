"use client";
// v3.7 — relocation backtest ("like a stock backtest"): move one base camp to a kecamatan site and REPLAY the NOP's H1 PLN-off jobs.
// Baseline and scenario use the same replay rule, so the difference is the effect of the move. No extra unit is added.
import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Kpi, Note, DataTable, Select, EvTag, fInt, fPct, fNum, isNum } from "@/components/ui";
import { backtestMove, PERF_KEYS } from "@/lib/mbpperf";
import { kecamatanAnchors } from "@/lib/logic";
import { perfLegend, PerfTag, UtilTag, PERF_COLOR } from "@/components/perfUi";
import { t } from "@/lib/i18n";
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const pct = (v, d = 0) => (isNum(v) ? fPct(100 * v, d) : "—");

export default function Backtest({ model, data, cfg, nop: gNop, allNops, perf, tickets, sel, setPick, setRadius, openMbp }) {
  const preset = sel ? data.mbps.find((m) => m.mbp_id === sel) : null;
  const [nop, setNop] = useState(preset?.nop || (gNop !== "All NOPs" ? gNop : "NOP BENGKULU"));
  useEffect(() => { if (gNop !== "All NOPs" && !preset) setNop(gNop); }, [gNop]); // eslint-disable-line
  const sitesN = useMemo(() => model.filter((s) => s.nop === nop && s.site_active === 1 && !s.offair), [model, nop]);
  const mbpsN = useMemo(() => data.mbps.filter((m) => m.nop === nop && isNum(m.lat)), [data.mbps, nop]);
  const ticketsN = useMemo(() => { const ids = new Set(sitesN.map((s) => s.site_id)); return tickets.filter((k) => ids.has(k.site)); }, [tickets, sitesN]);
  const order = { none: 0, under: 1, low: 2, watch: 3, nodata: 4, good: 5, high: 6 };
  const campOpts = useMemo(() => [...mbpsN].sort((a, b) => (order[perf.get(a.mbp_id)?.key] ?? 9) - (order[perf.get(b.mbp_id)?.key] ?? 9) || (perf.get(a.mbp_id)?.jobs || 0) - (perf.get(b.mbp_id)?.jobs || 0))
    .map((m) => { const p = perf.get(m.mbp_id); return { value: m.mbp_id, label: `${m.mbp_id} — ${t(`perf.key.${p?.key || "none"}`)} · ${fInt(p?.jobs)} job` }; }), [mbpsN, perf]); // eslint-disable-line
  const [camp, setCamp] = useState(preset?.mbp_id || null);
  useEffect(() => { if (!camp || !mbpsN.some((m) => m.mbp_id === camp)) setCamp(campOpts[0]?.value || null); }, [nop, campOpts]); // eslint-disable-line
  const anchors = useMemo(() => kecamatanAnchors(sitesN).sort((a, b) => a.kecamatan.localeCompare(b.kecamatan)), [sitesN]);
  const [dest, setDest] = useState("auto"), [same, setSame] = useState(true);
  useEffect(() => setDest("auto"), [nop]);
  const bt = useMemo(() => (camp ? backtestMove(sitesN, mbpsN, ticketsN, cfg, camp, { candidates: 10, dest: dest === "auto" ? null : dest, sameCluster: same }) : null), [sitesN, mbpsN, ticketsN, cfg, camp, dest, same]);
  const [pickI, setPickI] = useState(0);
  useEffect(() => setPickI(0), [bt]);
  const res = bt?.results || [];
  const S = dest !== "auto" ? res.find((r) => r.site_id === dest) || res[0] : res[pickI];
  const B = bt?.base.total;
  // map: scenario keys per base camp; the moved camp drawn at its new place (★), old place as a ghost
  const keyMap = S ? S.per : bt?.base.per;
  const mbpKeyOf = useMemo(() => (m) => (m.is_new ? "high" : keyMap?.get(m.mbp_id)?.key || "none"), [keyMap]);
  const shownMbps = useMemo(() => mbpsN.filter((m) => !S || m.mbp_id !== camp), [mbpsN, S, camp]);
  const extra = S ? [{ mbp_id: camp, lat: S.lat, lon: S.lon, nop, is_new: true, new_label: t("bt.map.new") }] : [];
  const [batch, setBatch] = useState(null);
  const runBatch = () => {
    const under = mbpsN.filter((m) => ["under", "none"].includes(perf.get(m.mbp_id)?.key));
    setBatch(under.map((m) => { const r = backtestMove(sitesN, mbpsN, ticketsN, cfg, m.mbp_id, { candidates: 6, sameCluster: same }); const b = r.results[0];
      return { mbp_id: m.mbp_id, was_key: perf.get(m.mbp_id)?.key, was_jobs: perf.get(m.mbp_id)?.jobs, best: b?.kecamatan || null, city: b?.city, site_id: b?.site_id, shift_km: b?.shift_km,
        gain: b?.ontime_gain ?? 0, unserved_change: b?.unserved_change ?? 0, me_jobs: b?.me_jobs ?? 0, me_util: b?.me_util, me_key: b?.me_key }; }).sort((a, b) => b.gain - a.gain));
  };
  useEffect(() => setBatch(null), [nop, same]);

  return (
    <div className="space-y-4">
      <Note tone="warn"><b>{t("bt.note.title")}</b> {t("bt.note.body", { r: cfg.mbp.max_radius_km, cap: cfg.mbp_perf?.dispatch_lag_cap_min ?? 240 })}</Note>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-60"><Select label={t("filter.nop")} value={nop} onChange={setNop} options={allNops} /></div>
        <div className="w-[420px] max-w-full"><Select label={t("bt.camp")} value={camp || ""} onChange={setCamp} options={campOpts} /></div>
        <div className="w-72"><Select label={t("bt.dest")} value={dest} onChange={setDest} options={[{ value: "auto", label: t("bt.dest_auto") }, ...anchors.map((a) => ({ value: a.site.site_id, label: `${a.kecamatan} · ${a.city || ""} (${a.site.site_id})` }))]} /></div>
        <div><div className="text-[11.5px] text-slate mb-1">{t("bt.scope")}</div>
          <div className="flex rounded-md overflow-hidden border border-line" role="group">{[[true, t("bt.scope.cluster", { c: bt?.homeCluster || "—" })], [false, t("bt.scope.nop")]].map(([v, l]) =>
            <button key={String(v)} aria-pressed={same === v} onClick={() => setSame(v)} className={`px-2.5 py-1.5 text-[12.5px] whitespace-nowrap ${same === v ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{l}</button>)}</div></div>
        {camp && <button onClick={() => openMbp(data.mbps.find((m) => m.mbp_id === camp))} className="px-3 py-1.5 rounded border border-navy text-navy text-[12.5px]">{t("bt.open_camp")}</button>}
      </div>
      {bt && B && <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi fixed label={t("bt.kpi.jobs")} value={fInt(B.tickets)} sub={t("bt.kpi.jobs_sub", { i: fInt(B.island), n: fInt(mbpsN.length) })} />
        <Kpi fixed label={t("bt.kpi.base")} value={pct(B.ok_share)} sub={t("bt.kpi.base_sub", { a: fInt(B.ontime), u: fInt(B.busy + B.beyond) })} />
        <Kpi fixed label={t("bt.kpi.after")} value={S ? pct(S.ok_share) : "—"} sub={S ? t("bt.kpi.after_sub", { g: `${S.ontime_gain >= 0 ? "+" : ""}${fInt(S.ontime_gain)}`, k: S.kecamatan }) : t("bt.none")} tone={S && S.ontime_gain > 0 ? "good" : "slate"} />
        <Kpi fixed label={t("bt.kpi.camp_jobs")} value={S ? `${fInt(S.was_jobs)} → ${fInt(S.me_jobs)}` : "—"} sub={S ? t("bt.kpi.camp_busy", { a: pct(S.was_busy, 1), b: pct(S.me_busy, 1) }) : ""} />
        <Kpi fixed label={t("bt.kpi.camp_color")} value={S ? <span className="inline-flex items-center gap-1 text-[15px]"><Dot k={S.was_key} />→<Dot k={S.me_key} /></span> : "—"} sub={S ? `${t(`perf.key.${S.was_key}`)} → ${t(`perf.key.${S.me_key}`)}` : ""} />
        <Kpi fixed label={t("bt.kpi.shift")} value={S && isNum(S.shift_km) ? `${fNum(S.shift_km, 0)} km` : "—"} sub={S ? `${S.kecamatan} · ${S.city || ""}` : ""} />
      </div>}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <Card title={t("bt.map.title")} sub={t("bt.map.sub")}>
          <MapView sites={sitesN.filter((s) => !s.genset_protected)} mbps={shownMbps} extraMbps={extra} cfg={cfg} onRadius={setRadius} onPickSite={setPick} fitKey={nop + "bt"} height={480}
            defaultMode="survival" modes={["survival", "priority"]} mbpKeyOf={mbpKeyOf} mbpLegend={perfLegend()} onOpenMbp={openMbp} />
        </Card>
        <Card title={t("bt.cand.title")} sub={t("bt.cand.sub")}>
          {!res.length ? <div className="text-mut text-[12.5px]">{t("bt.none")}</div> :
            <DataTable rows={res.map((r, i) => ({ ...r, _i: i }))} pageSize={10} filename={`pba_backtest_${camp}.csv`.replace(/\s+/g, "_")} initialSort={{ key: "ontime_gain", dir: -1 }}
              rowClass={(r) => (S && r.site_id === S.site_id ? "bg-good/10 font-semibold" : "")} onRowClick={(r) => { setDest("auto"); setPickI(r._i); }} columns={[
                { key: "kecamatan", label: "col.kecamatan", render: (r) => <span>★ {r.kecamatan}<span className="text-mut"> · {r.city || ""}</span></span>, csv: (r) => r.kecamatan },
                { key: "site_id", label: "col.anchor_site" },
                { key: "shift_km", label: "col.shift_km", num: true, render: (r) => fNum(r.shift_km, 0), csv: (r) => r.shift_km?.toFixed(1) },
                { key: "ontime_gain", label: "bt.col.gain", num: true, render: (r) => <span className={r.ontime_gain > 0 ? "text-good font-semibold" : r.ontime_gain < 0 ? "text-crit" : ""}>{r.ontime_gain > 0 ? "+" : ""}{fInt(r.ontime_gain)}</span>, csv: (r) => r.ontime_gain },
                { key: "unserved_change", label: "bt.col.unserved", num: true, render: (r) => `${r.unserved_change > 0 ? "+" : ""}${fInt(r.unserved_change)}`, csv: (r) => r.unserved_change },
                { key: "me_jobs", label: "bt.col.camp_jobs", num: true, render: (r) => `${fInt(r.was_jobs)} → ${fInt(r.me_jobs)}`, csv: (r) => r.me_jobs },
                { key: "me_key", label: "bt.col.color", render: (r) => <span className="inline-flex items-center gap-1"><Dot k={r.was_key} />→<Dot k={r.me_key} /> <UtilTag k={r.me_util} /></span>, csv: (r) => `${r.was_key}->${r.me_key}` },
              ]} />}
          <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("bt.foot")} <EvTag v="ESTIMATED" /></div>
        </Card>
      </div>
      <Card title={t("bt.batch.title", { nop })} sub={t("bt.batch.sub")} right={<button onClick={runBatch} className="px-3 py-1.5 rounded bg-navy text-white text-[12.5px]">{t("bt.batch.run")}</button>}>
        {!batch ? <div className="text-mut text-[12.5px]">{t("bt.batch.hint")}</div> : !batch.length ? <div className="text-mut text-[12.5px]">{t("bt.batch.none")}</div> :
          <DataTable rows={batch} pageSize={20} filename={`pba_backtest_underutilised_${nop}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => { setCamp(r.mbp_id); setDest("auto"); window.scrollTo({ top: 0, behavior: "smooth" }); }} columns={[
            { key: "mbp_id", label: "col.basecamp" }, { key: "was_key", label: "col.mbp_status", render: (r) => <PerfTag k={r.was_key} />, csv: (r) => r.was_key },
            { key: "was_jobs", label: "perf.col.jobs", num: true },
            { key: "best", label: "bt.col.best", render: (r) => (r.best ? <span>★ {r.best}<span className="text-mut"> · {r.city || ""}</span></span> : "—"), csv: (r) => r.best || "" },
            { key: "shift_km", label: "col.shift_km", num: true, render: (r) => fNum(r.shift_km, 0), csv: (r) => r.shift_km?.toFixed(1) ?? "" },
            { key: "gain", label: "bt.col.gain", num: true, render: (r) => `${r.gain > 0 ? "+" : ""}${fInt(r.gain)}`, csv: (r) => r.gain },
            { key: "me_jobs", label: "bt.col.camp_jobs", num: true, render: (r) => `${fInt(r.was_jobs)} → ${fInt(r.me_jobs)}`, csv: (r) => r.me_jobs },
            { key: "me_key", label: "bt.col.color", render: (r) => (r.me_key ? <span className="inline-flex items-center gap-1"><Dot k={r.was_key} />→<Dot k={r.me_key} /></span> : "—"), csv: (r) => r.me_key || "" },
          ]} />}
      </Card>
    </div>
  );
}
const Dot = ({ k }) => <span title={t(`perf.key.${k}`)} className="w-3 h-3 rounded-sm inline-block border border-navy/40 align-middle" style={{ background: PERF_COLOR[k] || "#E3E7ED" }} />;
