"use client";
import React, { useEffect, useState } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Legend } from "recharts";
import { loadDetail } from "@/lib/data";
import { LevelTag, BbtCell, ActionLabel, StatusTag, EvTag, Tag, Note, EvidenceTable, AvailTriple, Gloss, fInt, fMin, fH, fKm, fPct, fPP, f3, f1, fNum, fCoord, precisionNote, isNum, monthName } from "./ui";
import { t, tv, locale } from "@/lib/i18n";
import { te } from "@/lib/i18n-engine";
import { showCoverageGap } from "@/lib/view";
import { periodLabel } from "./PeriodBar";
import { parsePeriod } from "@/lib/period";

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-1 border-b border-line/60 text-[12.5px]"><span className="text-mut">{k}</span><span className="text-right text-ink">{v}</span></div>
);
const Box = ({ title, children }) => (<div className="bg-card border border-line rounded-lg p-4"><div className="text-[13px] font-semibold text-navy mb-1">{title}</div>{children}</div>);
const NA = () => <span className="text-mut" title={t("common.no_data")}>—</span>;

export default function SiteDrawer({ site, cfg, onClose }) {
  const [det, setDet] = useState(null);
  const [showComputed, setShowComputed] = useState(false);
  useEffect(() => {
    let alive = true; setDet(null);
    if (site) loadDetail(site.nop).then((d) => alive && setDet(d[site.site_id] || { m: [], tk: [], ev: [] }));
    return () => { alive = false; };
  }, [site]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  if (!site) return null;
  const s = site, av = s.av || {}, A = s.battery || {}, R = s.resp || {}, C = s.coverage || {};
  const design = s.bbt_criteria_design_min ?? cfg?.bbt?.design_minutes ?? 120;
  const evs = (det?.ev || []).map(([ts, mins, ex]) => ({ t: new Date(ts.replace(" ", "T")).getTime(), mins, ex }));
  const exh = evs.filter((e) => e.ex === 1), cen = evs.filter((e) => e.ex === 0);
  const prio = cfg.priority_levels;
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("drawer.aria", { id: s.site_id })}>
      <div className="absolute inset-0 bg-ink/30" />
      <aside className="relative w-full max-w-[780px] h-full overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-navy text-white px-5 py-3 flex items-start justify-between z-10">
          <div>
            <div className="text-[18px] font-bold">{s.site_id} · {s.site_name}</div>
            <div className="text-[12px] opacity-80">{s.site_class} · {s.nop} · {s.cluster_to} · {s.kecamatan ? `${t("col.kecamatan")} ${s.kecamatan} · ` : ""}{s.city} · {tv("access", s.access_class) || "—"} · {s.vip ? "VIP" : t("drawer.non_vip")} · {t(s.site_active ? "drawer.active" : "drawer.inactive")}</div>
          </div>
          <button autoFocus onClick={onClose} className="text-white/80 hover:text-white text-[22px] leading-none px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn" aria-label={t("drawer.close")}>×</button>
        </header>
        <div className="p-5 space-y-4">
          {s.period_key && <Note>{t("per.drawer", { p: periodLabel(parsePeriod(s.period_key)) })}</Note>}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[12px] text-mut">{t("col.mbp_priority")}</span><LevelTag kind="MBP" v={s.mbp_priority_level} />
            <span className="tabular text-[12px]" title={t("prio.cutoffs", { p1: prio.P1, p2: prio.P2, p3: prio.P3 })}>{f3(s.mbp_priority_score)}</span>
            <span className="text-[12px] text-mut ml-3">{t("col.bbs_priority")}</span>{s.bbs_priority_level ? <LevelTag kind="BBS" v={s.bbs_priority_level} /> : <span className="text-mut text-[12px]">{t("drawer.not_needed")}</span>}
            <StatusTag v={s.bbt_status} /><EvTag v={A.source} />
            {s.reach_risk === 1 && <Tag tone="crit">✖ {t("drawer.dark_before")}</Tag>}
            {!s.covered && <Tag tone="crit">{t("drawer.no_mbp_radius", { r: cfg?.mbp?.max_radius_km })}</Tag>}
            {s.nop_flag && <Tag tone="warn">{te(s.nop_flag, "nop_flag")}</Tag>}
            {s.offair && <Tag tone="crit" title={te(s.offair, "offair")}>{t("drawer.offair_tag")}</Tag>}
            {s.fixed_genset === "ACTIVE" && <Tag tone="good">⚡ {t("drawer.genset_tag")}</Tag>}
            {A.ticket && A.source !== "TICKET" && <Tag tone="warn">{t("drawer.ticket_flag", { n: s.tk_no_battery })}</Tag>}
          </div>
          {s.fixed_genset === "ACTIVE" && <Note>{t("drawer.genset_note", { b: s.fixed_genset_basis || "—", k: s.genset_kva ?? "—" })}</Note>}

          {s.offair && <Note tone="warn">{te(s.offair, "offair")}. {t("drawer.offair_note")}</Note>}
          <Box title={t("drawer.action")}>
            <div className="text-[14px]"><ActionLabel r={s} strong onNavigate={onClose} />{s.mbp_standby_flag ? <> <Tag tone="warn">{t("bbs.standby")}</Tag></> : null}</div>
            {s.bbs_priority_level && <div className="text-[12px] text-slate mt-0.5">{t(`batch.${s.bbs_priority_level}`)} · {t("ev.rule")} {te(s.rule, "rule")}{s.priority_floor ? ` · ${t("bbs.floor", { a: `BBS-${s.priority_floor}`, b: `BBS-${s.bbs_priority_level}` })}` : ""}</div>}
            {showCoverageGap(s) && <div className="mt-2"><Note tone="warn">{t("gap.drawer", { eta: fMin(s.dist_eta_min), bbt: fMin(s.bbt_effective_min), mbp: s.dist_mbp || "—", r: cfg?.mbp?.max_radius_km })}</Note></div>}
            {A.conflict && <div className="mt-2"><Note tone="warn"><b>{t("bbs.conflict")}:</b> {te(A.conflict, "conflict")}</Note></div>}
            <div className="mt-2"><EvidenceTable rows={s.evidence} action={s.evidence?.length ? s.recommended_action : null} /></div>
            <div className="text-[12px] text-mut mt-2">{t("drawer.mbp_drivers")}: {te(s.mbp_priority_drivers, "drivers") || "—"}</div>
            {s.bbs_priority_drivers && <div className="text-[12px] text-mut">{t("drawer.bbs_drivers")}: {te(s.bbs_priority_drivers, "drivers")}</div>}
          </Box>

          <div className="grid md:grid-cols-2 gap-4">
            <Box title={t("drawer.avail")}>
              {!av.available ? <div className="text-mut text-[12px]">{t("drawer.no_ran")}</div> : <>
                <Row k={t("col.avail_triple")} v={<AvailTriple a={av.avail} t={av.target} g={av.gap} compact />} />
                <Row k={t("drawer.net_down")} v={fH(av.outage)} />
                {["power", "transport", "ran", "other", "unknown"].map((c) => <Row key={c} k={c === "power" ? `… ${t("drawer.power_ran")}` : `… ${tv("cause", c)}`} v={`${fH(av.cause?.[c])}${av.gap < 0 ? ` · ${fPP(av.contrib?.[c])}` : ""}`} />)}
                {av.overlap && <div className="text-[11px] text-mut mt-1">{t("drawer.overlap")}</div>}
              </>}
            </Box>
            <Box title={t("drawer.resp")}>
              <Row k={t("acc.col.party")} v={R.primary ? tv("resp", R.primary) : "—"} />
              <Row k={t("col.basis")} v={R.kind && R.kind !== "NONE" ? <EvTag v={R.kind} /> : "—"} />
              <Row k={t("drawer.resp_tickets")} v={fInt(R.n)} />
              <div className="text-[12px] text-slate mt-1.5"><b className="text-ink">{t("common.why")}:</b> {te(R.why, "resp")}</div>
            </Box>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Box title={t("drawer.fields14")}>
              <Row k={t("col.s14.priority")} v={<span title={t("prio.cutoffs", { p1: prio.P1, p2: prio.P2, p3: prio.P3 })}><LevelTag kind="MBP" v={s.mbp_priority_level} /> {f3(s.mbp_priority_score)}</span>} />
              <Row k={t("drawer.id_name_class")} v={`${s.site_id} · ${s.site_name} · ${s.site_class}`} />
              <Row k={t("col.s14.dependency")} v={isNum(s.dependency_children) ? `${s.dependency_children} (PROXY: ${s.hub_site})` : <NA />} />
              <Row k={t("col.s14.nop")} v={s.nop} />
              <Row k={<>{t("col.s14.bbt_design")}<Gloss k="bbt_design" /></>} v={<span title={cfg.bbt.criteria_basis === "site" ? t("design.site_tip") : t("design.std_tip")}>{fMin(design)}</span>} />
              <Row k={t("col.s14.bbt_measured")} v={<BbtCell r={s} />} />
              <Row k={t("col.s14.pln_freq")} v={s.pln_known ? fInt(s.pln_freq) : <NA />} />
              <Row k={<span title={t("drawer.pln_dur_tip")}>{t("drawer.pln_dur")}<span className="text-s1 ml-0.5 cursor-help">ⓘ</span></span>} v={s.pln_known ? fH(s.pln_total_h) : <NA />} />
              {s.pln_known && (s.ran_power_down_h || 0) > 2 * (s.pln_total_h || 0) && (s.ran_power_down_h || 0) >= 1 &&
                <div className="text-[11px] text-[#8a5a00] bg-warn/10 rounded px-2 py-1 my-1">{t("drawer.pln_vs_power", { a: fH(s.pln_total_h), b: fH(s.ran_power_down_h) })}</div>}
              <Row k={t("col.s14.distance")} v={`${fKm(s.dist_km)} → ${s.dist_mbp || "—"}${s.within_radius ? "" : ` (${t("drawer.nearest_beyond")})`}`} />
              <Row k={t("drawer.eta_est")} v={`${fMin(s.dist_eta_min)}${s.access_class === "island" ? ` · ${t("drawer.sea_indicative")}` : ""}`} />
              <Row k={t("col.s14.hist_mbp")} v={s.mbp_hist_known ? t("drawer.deployments", { n: fInt(s.mbp_deployments) }) : <span title={t("drawer.not_in_ticket_file")}><NA /> {t("drawer.not_in_ticket_file_short")}</span>} />
              <Row k={t("col.s14.mbp_backup")} v={s.mbp_hist_known ? fH(s.mbp_backup_h) : <NA />} />
            </Box>
            <Box title={t("drawer.reach")}>
              <Row k={t("drawer.in_radius_n")} v={`${fInt(s.mbps_in_radius)} (≤ ${cfg?.mbp?.max_radius_km} km)`} />
              <Row k={t("drawer.nearest")} v={s.nearest_mbp ? `${s.nearest_mbp} · ${fKm(s.nearest_mbp_km)}` : "—"} />
              <Row k={t("drawer.can_arrive")} v={t("drawer.n_mbp", { n: fInt(s.feasible_mbps) })} />
              <Row k={t("drawer.assigned")} v={s.mbp_assigned || "—"} />
              <Row k={<>{t("drawer.eta_vs_bbt")}<Gloss k="eta_gap" /></>} v={isNum(s.eta_min) ? <span className={s.can_arrive_before_bbt ? "" : "text-[#b42318] font-semibold"}>{s.can_arrive_before_bbt ? "✔" : "✖"} {fMin(s.eta_min)} vs {fMin(s.bbt_effective_min)}</span> : "—"} />
              <Row k={t("drawer.eta_fastest", { m: cfg?.mbp?.response_target_min ?? 30 })} v={isNum(s.eta_fastest_min) ? <span className={s.eta_fastest_min <= (cfg?.mbp?.response_target_min ?? 30) ? "" : "text-[#8a5a00]"}>{fMin(s.eta_fastest_min)}</span> : "—"} />
              <Row k={t("drawer.eta_conf")} v={te(s.eta_confidence, "eta_conf")} />
              <Row k={t("drawer.access")} v={tv("access", s.access_class) || "—"} />
              <div className="text-[11.5px] text-slate mt-1">{t("drawer.access_basis")}: {te(s.access_basis, "access") || "—"}</div>
              <div className="text-[11.5px] text-slate mt-1"><b className="text-ink">{t("drawer.assign_basis")}:</b> {te(s.assignment_basis, "assign")}</div>
              {C.inRadius?.length > 0 && <div className="text-[11.5px] text-slate mt-1">{t("drawer.in_radius")}: {C.inRadius.slice(0, 6).map((m) => `${m.mbp_id} ${fKm(m.km)}`).join(" · ")}{C.nIn > 6 ? ` · +${C.nIn - 6}` : ""}</div>}
            </Box>
          </div>

          <Box title={t("drawer.battery")}>
            <Row k={t("drawer.precedence")} v={<span className="text-[11.5px]">{te(A.precedence, "prec")}</span>} />
            {A.display?.hidden_estimate != null && <Row k={t("drawer.hidden_est")} v={`${fMin(A.display.hidden_estimate)} ESTIMATED`} />}
            <Row k={t("drawer.pct_design")} v={`${fPct(s.bbt_pct_design, 0)} (${t("drawer.of_design", { d: fMin(design) })})`} />
            <Row k={<>{t("drawer.dark_months")}<Gloss k="dark_site" /></>} v={`${s.dark_months}/6${s.dark ? ` — ${t("drawer.dark_site")}` : ""}`} />
            <Row k={t("drawer.bbt_basis")} v={<span className="text-[11.5px]">{te(s.bbt_value_basis, "bbtbasis") || "—"}</span>} />
            {s.bbt_value_evidence === "ESTIMATED" && <Row k={t("drawer.est_range")} v={`${fMin(s.bbt_est_low_min)}–${fMin(s.bbt_est_high_min)} · ${te(s.bbt_est_confidence, "conf")}`} />}
            <Row k={t("drawer.events")} v={`${fInt(s.evt_exhaustion)} / ${fInt(s.evt_censored)}`} />
            <Row k={t("drawer.lower_bound")} v={fMin(s.bbt_lower_bound_min)} />
            <Row k={t("drawer.type_age")} v={`${s.battery_type || "—"} · ${isNum(s.battery_age_y) ? f1(s.battery_age_y) + " " + t("drawer.years") : "—"}`} />
            <Row k={t("drawer.load")} v={isNum(s.load_a) ? `${fInt(s.load_a)} A` : "—"} />
            <Row k={t("metric.'Tidak Ada Baterai' tickets")} v={fInt(s.tk_no_battery)} />
            <Row k={t("drawer.coords")} v={isNum(s.lat) ? `${fCoord(s.lat, s.coord_decimals)}, ${fCoord(s.lon, s.coord_decimals)} (${t("drawer.coord_precision", { p: precisionNote(s.coord_decimals) })})` : "UNAVAILABLE"} />
            <details className="mt-2 text-[12px]" open={showComputed} onToggle={(e) => setShowComputed(e.currentTarget.open)}>
              <summary className="cursor-pointer text-slate">{t("col.computed_design")}</summary>
              <div className="mt-1"><Row k={t("col.computed_design")} v={<span className="inline-flex items-center gap-1.5">{fMin(s.bbt_design_min)} <EvTag v={s.bbt_design_evidence} /> · {fPct(s.bbt_pct_site_design, 0)}</span>} />
                <div className="text-[11.5px] text-slate mt-1">{te(s.bbt_design_basis, "design")}</div>
                <div className="mt-1"><Note tone="warn">{t("design.computed_note")}</Note></div></div>
            </details>
          </Box>
          <div className="bg-card border border-line rounded-lg p-4">
            <div className="text-[13px] font-semibold text-navy mb-2">{t("drawer.monthly")}</div>
            {!det ? <div className="text-mut text-[12px]">{t("drawer.loading")}</div> : (
              <table className="w-full text-[12px] tabular">
                <thead><tr className="text-slate">{["month", "avail", "power", "transport", "pln_n", "pln_h", "exh", "cen", "bbt_med"].map((h) => <th key={h} className="text-right first:text-left px-1.5 py-1 border-b border-line font-semibold">{t(`drawer.m.${h}`)}</th>)}</tr></thead>
                <tbody>{det.m.map((m) => (
                  <tr key={m[0]} className="border-b border-line/60">
                    <td className="px-1.5 py-1">{monthName(m[0] - 1)}</td><td className="text-right px-1.5">{fPct(m[1], 2)}</td><td className="text-right px-1.5">{fH(m[2])}</td>
                    <td className="text-right px-1.5">{fH(m[3])}</td><td className="text-right px-1.5">{fInt(m[4])}</td><td className="text-right px-1.5">{fH(m[5])}</td>
                    <td className="text-right px-1.5">{fInt(m[6])}</td><td className="text-right px-1.5">{fInt(m[7])}</td><td className="text-right px-1.5">{fMin(m[8])}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
          {evs.length > 0 && (
            <div className="bg-card border border-line rounded-lg p-4">
              <div className="text-[13px] font-semibold text-navy">{t("drawer.ev_title", { n: evs.length })}</div>
              <div className="text-[11.5px] text-mut mb-1">{t("drawer.ev_legend")}</div>
              <ResponsiveContainer width="100%" height={230}>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#E3E7ED" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v).toLocaleDateString(locale(), { day: "2-digit", month: "short" })} tick={{ fontSize: 11, fill: "#6B7588" }} />
                  <YAxis dataKey="mins" unit={` ${t("unit.min")}`} tick={{ fontSize: 11, fill: "#6B7588" }} width={52} />
                  <Tooltip formatter={(v, n) => (n === "mins" ? fMin(v) : new Date(v).toLocaleString(locale()))} />
                  <ReferenceLine y={design} stroke="#1F2A44" strokeDasharray="4 3" label={{ value: t("est.design"), fontSize: 10, fill: "#1F2A44", position: "insideTopRight" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Scatter name={t("drawer.ev_exh")} data={exh} fill="#2a78d6" />
                  <Scatter name={t("drawer.ev_cen")} data={cen} fill="#A3ABB9" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          {det && det.tk.length > 0 && (
            <div className="bg-card border border-line rounded-lg p-4">
              <div className="text-[13px] font-semibold text-navy mb-2">{t("drawer.tk_title", { n: det.tk.length })}</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead><tr className="text-slate">{["occurred", "ticket", "rc1", "rc2", "resolution", "mbp", "takeover", "checkin", "rh", "status"].map((h) => <th key={h} className="text-left px-1.5 py-1 border-b border-line font-semibold whitespace-nowrap">{t(`drawer.tk.${h}`)}</th>)}</tr></thead>
                  <tbody>{det.tk.map((tk, i) => (
                    <tr key={i} className="border-b border-line/60">{tk.map((v, j) => <td key={j} className="px-1.5 py-1 whitespace-nowrap">{v == null ? "—" : j === 8 ? fNum(v, 1) : String(v)}</td>)}</tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
