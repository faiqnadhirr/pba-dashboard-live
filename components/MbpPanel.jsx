"use client";
// v3.7 — MBP (base camp) detail drawer: capability (what it can reach) + performance (what it did in H1) + its site list
// with P1/P2 highlighted and per-site history + recent jobs. Opened from the map card, tables and lists.
import React, { useEffect, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { DataTable, LevelTag, Bar100, fInt, fH, fPct, fMin, fKm, fNum, isNum, monthName } from "@/components/ui";
import { PerfTag, UtilTag, OntimeTag, PerfFormula } from "@/components/perfUi";
import { minToDate } from "@/lib/mbpperf";
import { haversineKm, travelMinutes } from "@/lib/logic";
import { t, tv } from "@/lib/i18n";

const Box = ({ title, children, right }) => (<div className="bg-card border border-line rounded-lg p-4"><div className="flex items-center gap-2 mb-1"><div className="text-[13px] font-semibold text-navy">{title}</div><div className="ml-auto">{right}</div></div>{children}</div>);
const Stat = ({ k, v, sub }) => (<div className="border border-line rounded-md px-3 py-2 bg-white"><div className="text-[10.5px] uppercase tracking-wide text-mut">{k}</div><div className="text-[17px] font-bold text-ink tabular">{v}</div>{sub && <div className="text-[11px] text-mut">{sub}</div>}</div>);
const pct = (v, d = 0) => (isNum(v) ? fPct(100 * v, d) : "—");

export default function MbpPanel({ mbp, ctx, onClose }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const { model, perf, mbpStats, tickets, cfg, setPick, navigate } = ctx;
  const p = mbp ? perf.get(mbp.mbp_id) : null, st = mbp ? mbpStats.get(mbp.mbp_id) : null;
  const byId = useMemo(() => new Map(model.map((s) => [s.site_id, s])), [model]);
  const jobs = useMemo(() => (mbp ? tickets.filter((k) => k.mbp === mbp.mbp_id) : []), [tickets, mbp]);
  const siteRows = useMemo(() => {
    if (!mbp) return [];
    const ids = new Set(model.filter((s) => s.mbp_assigned === mbp.mbp_id).map((s) => s.site_id));
    jobs.forEach((k) => ids.add(k.site));
    const own = new Map(), all = new Map(), ok = new Map();
    for (const k of tickets) if (ids.has(k.site)) { all.set(k.site, (all.get(k.site) || 0) + 1); if (k.mbp === mbp.mbp_id) own.set(k.site, (own.get(k.site) || 0) + 1); }
    for (const k of jobs) { const s = byId.get(k.site); if (s && isNum(k.arr) && isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown" && k.arr <= s.bbt_effective_min) ok.set(k.site, (ok.get(k.site) || 0) + 1); }
    return [...ids].map((id) => byId.get(id)).filter(Boolean).map((s) => {
      const km = isNum(mbp.lat) && isNum(s.lat) ? haversineKm(s.lat, s.lon, mbp.lat, mbp.lon) : null;
      return { ...s, _assigned: s.mbp_assigned === mbp.mbp_id, _km: km, _eta: isNum(km) && km <= cfg.mbp.max_radius_km ? travelMinutes(km, s, cfg) : null,
        _own: own.get(s.site_id) || 0, _other: (all.get(s.site_id) || 0) - (own.get(s.site_id) || 0), _ok: ok.get(s.site_id) || 0 };
    });
  }, [mbp, model, jobs, tickets, byId, cfg]);
  if (!mbp) return null;
  const months = (p?.months || [0, 0, 0, 0, 0, 0]).map((v, i) => ({ m: monthName(i), v }));
  const recent = [...jobs].sort((a, b) => b.occ - a.occ).slice(0, 25).map((k) => { const s = byId.get(k.site);
    const bbt = s && isNum(s.bbt_effective_min) && s.bbt_status !== "Unknown" ? s.bbt_effective_min : null;
    return { ...k, name: s?.site_name, cls: s?.site_class, prio: s?.mbp_priority_level, bbt, res: !isNum(k.arr) ? "na" : bbt == null ? "unk" : k.arr <= bbt ? "ok" : "late" }; });
  const p12 = siteRows.filter((s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2").length;

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("mbpd.aria", { id: mbp.mbp_id })}>
      <div className="absolute inset-0 bg-ink/30" />
      <aside className="relative w-full max-w-[860px] h-full overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-navy text-white px-5 py-3 flex items-start justify-between z-10">
          <div>
            <div className="text-[18px] font-bold">🚚 {mbp.mbp_id}</div>
            <div className="text-[12px] opacity-80">{mbp.nop || "—"} · PIC {mbp.pic_name || "—"} · {isNum(mbp.lat) ? `${mbp.lat.toFixed(4)}, ${mbp.lon.toFixed(4)}` : t("mbp.loc_unavailable")}</div>
          </div>
          <button autoFocus onClick={onClose} className="text-white/80 hover:text-white text-[22px] leading-none px-2" aria-label={t("common.close")}>×</button>
        </header>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {p && <><PerfTag k={p.key} /><UtilTag k={p.util_key} /><OntimeTag k={p.ontime_key} />
              {p.score != null && <span className="text-[12px] text-slate">{t("mbpd.rank", { s: p.score, r: p.rank, n: p.rank_of })}</span>}</>}
            <span className="ml-auto flex gap-2">
              <button onClick={() => { onClose(); navigate({ view: "mbp.backtest", nop: mbp.nop, sel: mbp.mbp_id }); }} className="px-3 py-1 rounded bg-navy text-white text-[12px]">{t("mbpd.go_bt")}</button>
              <button onClick={() => { onClose(); navigate({ view: "mbp.dispatch", nop: mbp.nop, sel: mbp.mbp_id }); }} className="px-3 py-1 rounded border border-navy text-navy text-[12px]">{t("mbpd.go_disp")}</button>
            </span>
          </div>
          <Box title={t("mbpd.capability")}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat k={t("mbpd.in_radius", { r: cfg.mbp.max_radius_km })} v={fInt(p?.in_radius)} sub={t("mbpd.of_p12", { n: fInt(p?.in_radius_p12) })} />
              <Stat k={t("mbpd.assigned")} v={fInt(p?.area_sites)} sub={t("mbpd.of_p12", { n: fInt(p?.area_p12) })} />
              <Stat k={t("mbpd.avg_eta")} v={fMin(st?.avg_eta_min)} sub={fKm(st?.avg_km)} />
              <Stat k={t("mbpd.dark_before")} v={st ? `${fInt(st.at_risk_sites)}` : "—"} sub={st ? pct(st.risk_share) : ""} />
            </div>
          </Box>
          <Box title={t("mbpd.performance")}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat k={t("perf.col.jobs")} v={fInt(p?.jobs)} sub={t("mbpd.per_month", { n: fNum(p?.jobs_month, 1) })} />
              <Stat k={t("perf.col.busy")} v={pct(p?.busy, 1)} sub={t("mbpd.rh", { h: fH(p?.busy_h), m: fH(p?.busy_h_month) })} />
              <Stat k={t("perf.col.ontime")} v={pct(p?.ontime_rate)} sub={t("mbpd.ontime_sub", { a: fInt(p?.ontime), b: fInt(p?.late) })} />
              <Stat k={t("perf.col.capture")} v={pct(p?.capture)} sub={t("mbpd.capture_sub", { n: fInt(p?.area_jobs) })} />
            </div>
            {p?.plnoff > 0 && <div className="mt-3"><Bar100 height={12} parts={[
              { label: t("mbpd.out.ontime"), c: "#0ca30c", v: p.ontime, txt: fInt(p.ontime) }, { label: t("mbpd.out.late"), c: "#d03b3b", v: p.late, txt: fInt(p.late) },
              { label: t("mbpd.out.unknown"), c: "#A3ABB9", v: p.bbt_unknown, txt: fInt(p.bbt_unknown) }, { label: t("mbpd.out.nocheckin"), c: "#7a1414", v: p.no_checkin, txt: fInt(p.no_checkin) }]} /></div>}
            <div className="grid md:grid-cols-[1fr_1fr] gap-3 mt-3 items-start">
              <div><div className="text-[11.5px] text-slate mb-1">{t("mbpd.monthly")}</div>
                <ResponsiveContainer width="100%" height={120}><BarChart data={months} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="m" tick={{ fontSize: 10.5 }} /><YAxis tick={{ fontSize: 10.5 }} allowDecimals={false} /><Tooltip /><Bar dataKey="v" name={t("perf.col.jobs")} fill="#2b2370" /></BarChart></ResponsiveContainer></div>
              <div className="text-[12px] text-slate space-y-0.5">
                <div>{t("mbpd.backup_rate")}: <b className="text-ink">{pct(p?.backup_rate)}</b> · {t("mbpd.pln_back")}: <b className="text-ink">{fInt(p?.pln_back)}</b></div>
                <div>{t("perf.col.p12_share")}: <b className="text-ink">{pct(p?.p12_share)}</b> · {t("perf.col.hiclass")}: <b className="text-ink">{pct(p?.hiclass_share)}</b></div>
                <div>{t("perf.col.arr_median")}: <b className="text-ink">{fMin(p?.arr_median)}</b> · {t("perf.col.sites_served")}: <b className="text-ink">{fInt(p?.sites_served)}</b></div>
                <div className="pt-1"><PerfFormula cfg={cfg} /></div>
              </div>
            </div>
          </Box>
          <Box title={t("mbpd.sites", { n: fInt(siteRows.length), p: fInt(p12) })}>
            <DataTable rows={siteRows} pageSize={15} filename={`pba_mbp_sites_${mbp.mbp_id}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => setPick(r)} initialSort={{ key: "mbp_priority_score", dir: -1 }}
              rowClass={(r) => (r.mbp_priority_level === "P1" || r.mbp_priority_level === "P2" ? "bg-crit/5" : "")} columns={[
                { key: "mbp_priority_score", label: "col.mbp_priority", num: true, render: (r) => <LevelTag kind="MBP" v={r.mbp_priority_level} />, csv: (r) => r.mbp_priority_level },
                { key: "site_id", label: "col.site" }, { key: "site_name", label: "col.name" }, { key: "site_class", label: "col.class" },
                { key: "_assigned", label: "mbpd.col.assigned", render: (r) => (r._assigned ? "✔" : "—"), csv: (r) => (r._assigned ? "yes" : "no") },
                { key: "_eta", label: "mbpd.col.eta", num: true, render: (r) => fMin(r._eta), csv: (r) => (isNum(r._eta) ? r._eta.toFixed(0) : "") },
                { key: "bbt_effective_min", label: "mbpd.col.bbt", num: true, render: (r) => (r.bbt_status === "Unknown" ? "—" : fMin(r.bbt_effective_min)), csv: (r) => r.bbt_effective_min ?? "" },
                { key: "_own", label: "mbpd.col.own", num: true }, { key: "_ok", label: "mbpd.col.ok", num: true }, { key: "_other", label: "mbpd.col.other", num: true },
              ]} />
          </Box>
          <Box title={t("mbpd.recent")}>
            <DataTable rows={recent} pageSize={25} filename={`pba_mbp_jobs_${mbp.mbp_id}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => byId.get(r.site) && setPick(byId.get(r.site))} columns={[
              { key: "occ", label: "mbpd.col.when", render: (r) => minToDate(r.occ), csv: (r) => minToDate(r.occ) },
              { key: "site", label: "col.site" }, { key: "cls", label: "col.class" }, { key: "prio", label: "col.mbp_priority", render: (r) => <LevelTag kind="MBP" v={r.prio} />, csv: (r) => r.prio || "" },
              { key: "arr", label: "mbpd.col.arr", num: true, render: (r) => fMin(r.arr), csv: (r) => r.arr ?? "" }, { key: "bbt", label: "mbpd.col.bbt", num: true, render: (r) => fMin(r.bbt), csv: (r) => r.bbt ?? "" },
              { key: "res", label: "mbpd.col.res", render: (r) => <span className={r.res === "ok" ? "text-good" : r.res === "late" ? "text-crit" : "text-mut"}>{t(`mbpd.res.${r.res}`)}</span>, csv: (r) => r.res },
              { key: "out", label: "mbpd.col.out", render: (r) => t(`mbpd.outc.${r.out}`), csv: (r) => r.out }, { key: "job", label: "mbpd.col.job", num: true, render: (r) => fH(r.job), csv: (r) => r.job ?? "" },
            ]} />
          </Box>
        </div>
      </aside>
    </div>
  );
}
