"use client";
import React, { useEffect, useState } from "react";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, Legend } from "recharts";
import { loadDetail } from "@/lib/data";
import { LevelTag, StatusTag, EvTag, Tag, Note, EvidenceTable, AvailTriple, fInt, fMin, fH, fKm, fPct, fPP, f2, f1, fCoord, precisionNote, isNum, MONTHS } from "./ui";
import { ACCESS_LABEL, RESP, CAUSE } from "@/lib/logic";

const Row = ({ k, v }) => (
  <div className="flex justify-between gap-3 py-1 border-b border-line/60 text-[12.5px]"><span className="text-mut">{k}</span><span className="text-right text-ink">{v}</span></div>
);

const Box = ({ title, children }) => (<div className="bg-card border border-line rounded-lg p-4"><div className="text-[13px] font-semibold text-navy mb-1">{title}</div>{children}</div>);

export default function SiteDrawer({ site, cfg, onClose }) {
  const [det, setDet] = useState(null);
  const design = cfg?.bbt?.design_minutes ?? 120;
  useEffect(() => {
    let alive = true; setDet(null);
    if (site) loadDetail(site.nop).then((d) => alive && setDet(d[site.site_id] || { m: [], tk: [], ev: [] }));
    return () => { alive = false; };
  }, [site]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  if (!site) return null;
  const s = site, av = s.av || {}, A = s.battery || {}, R = s.resp || {}, C = s.coverage || {};
  const evs = (det?.ev || []).map(([ts, mins, ex]) => ({ t: new Date(ts.replace(" ", "T")).getTime(), mins, ex }));
  const exh = evs.filter((e) => e.ex === 1), cen = evs.filter((e) => e.ex === 0);
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Site detail ${s.site_id}`}>
      <div className="absolute inset-0 bg-ink/30" />
      <aside className="relative w-full max-w-[780px] h-full overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="sticky top-0 bg-navy text-white px-5 py-3 flex items-start justify-between z-10">
          <div>
            <div className="text-[18px] font-bold">{s.site_id} · {s.site_name}</div>
            <div className="text-[12px] opacity-80">{s.site_class} · {s.nop} · {s.cluster_to} · {s.city} · {ACCESS_LABEL[s.access_class] || "—"} · {s.vip ? "VIP" : "non-VIP"} · {s.site_active ? "Active" : "Inactive"}</div>
          </div>
          <button autoFocus onClick={onClose} className="text-white/80 hover:text-white text-[22px] leading-none px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn" aria-label="Close (Esc)">×</button>
        </header>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[12px] text-mut">MBP priority</span><LevelTag v={s.mbp_priority_level} /><span className="tabular text-[12px]">{f2(s.mbp_priority_score)}</span>
            <span className="text-[12px] text-mut ml-3">Action priority</span>{s.bbs_priority_level ? <LevelTag v={s.bbs_priority_level} /> : <span className="text-mut text-[12px]">not needed</span>}
            <StatusTag v={s.bbt_status} /><EvTag v={A.source} />
            {s.reach_risk === 1 && <Tag tone="crit">✖ dark before MBP arrives</Tag>}
            {!s.covered && <Tag tone="crit">no MBP within {cfg?.mbp?.max_radius_km} km</Tag>}
            {s.nop_flag && <Tag tone="warn">{s.nop_flag}</Tag>}
          </div>

          <Box title="Recommended action">
            <div className="text-[14px] font-semibold">{s.recommended_action}{s.mbp_standby_flag ? <> <Tag tone="warn">MBP standby</Tag></> : null}</div>
            {s.action_batch && <div className="text-[12px] text-slate mt-0.5">{s.action_batch} · rule {s.rule}{s.priority_floor ? ` · score level ${s.priority_floor} raised to ${s.bbs_priority_level} (severity floor)` : ""}</div>}
            {A.conflict && <div className="mt-2"><Note tone="warn"><b>Evidence conflict:</b> {A.conflict}</Note></div>}
            <div className="mt-2"><EvidenceTable rows={s.evidence} action={s.evidence?.length ? s.recommended_action : null} /></div>
            <div className="text-[12px] text-mut mt-2">MBP priority drivers: {s.mbp_priority_drivers || "—"}</div>
            {s.bbs_priority_drivers && <div className="text-[12px] text-mut">Action priority drivers: {s.bbs_priority_drivers}</div>}
          </Box>

          <div className="grid md:grid-cols-2 gap-4">
            <Box title="Availability & cause">
              {!av.available ? <div className="text-mut text-[12px]">UNAVAILABLE — no RAN availability data for this site.</div> : <>
                <Row k="Availability · target · gap" v={<AvailTriple a={av.avail} t={av.target} g={av.gap} compact />} />
                <Row k="Network downtime (wall-clock)" v={fH(av.outage)} />
                {["power", "transport", "ran", "other", "unknown"].map((c) => <Row key={c} k={`… ${CAUSE[c]}`} v={`${fH(av.cause?.[c])}${av.gap < 0 ? ` · ${fPP(av.contrib?.[c])}` : ""}`} />)}
                {av.overlap && <div className="text-[11px] text-mut mt-1">Cause buckets overlap for this site; scaled proportionally to the observed downtime.</div>}
              </>}
            </Box>
            <Box title="Power responsibility">
              <Row k="Responsible party" v={R.primary ? RESP[R.primary] : "—"} />
              <Row k="Basis" v={R.kind && R.kind !== "NONE" ? <EvTag v={R.kind} /> : "—"} />
              <Row k="Power tickets with root cause" v={fInt(R.n)} />
              <div className="text-[12px] text-slate mt-1.5"><b className="text-ink">Why:</b> {R.why}</div>
            </Box>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Box title="14 mandatory fields">
              <Row k="1 · Priority" v={<span><LevelTag v={s.mbp_priority_level} /> {f2(s.mbp_priority_score)}</span>} />
              <Row k="2–4 · ID / Name / Class" v={`${s.site_id} · ${s.site_name} · ${s.site_class}`} />
              <Row k="5 · Dependency" v={isNum(s.dependency_children) ? `${s.dependency_children} (PROXY: ${s.hub_site})` : "—"} />
              <Row k="6 · NOP" v={s.nop} />
              <Row k="7 · BBT Design" v={`${design} min (PROXY)`} />
              <Row k="8 · BBT Measured" v={<span>{fMin(s.bbt_value_min)} <EvTag v={s.bbt_value_evidence} /></span>} />
              <Row k="9 · PLN outage (freq)" v={fInt(s.pln_freq)} />
              <Row k="10 · Outage duration" v={fH(s.pln_total_h)} />
              <Row k="11 · Distance to MBP" v={s.covered ? `${fKm(s.km_assigned)} → ${s.mbp_assigned}` : <Tag tone="crit">not covered</Tag>} />
              <Row k="12 · Travel time (ESTIMATED)" v={isNum(s.eta_min) ? fMin(s.eta_min) : s.access_class === "island" ? "island — no road ETA" : "—"} />
              <Row k="13 · Historical MBP" v={`${fInt(s.mbp_deployments)} deployments${s.in_ticket_file ? "" : " (site not in ticket file)"}`} />
              <Row k="14 · Total MBP backup time" v={fH(s.mbp_backup_h)} />
            </Box>
            <Box title="MBP reach">
              <Row k="MBPs within radius" v={`${fInt(s.mbps_in_radius)} (≤ ${cfg?.mbp?.max_radius_km} km)`} />
              <Row k="Nearest MBP" v={s.nearest_mbp ? `${s.nearest_mbp} · ${fKm(s.nearest_mbp_km)}` : "—"} />
              <Row k="Can arrive before BBT" v={`${fInt(s.feasible_mbps)} MBP(s)`} />
              <Row k="Assigned" v={s.mbp_assigned || "—"} />
              <Row k="ETA vs effective BBT" v={isNum(s.eta_min) ? <span className={s.can_arrive_before_bbt ? "" : "text-[#b42318] font-semibold"}>{s.can_arrive_before_bbt ? "✔" : "✖"} {fMin(s.eta_min)} vs {fMin(s.bbt_effective_min)}</span> : "—"} />
              <Row k="ETA confidence" v={s.eta_confidence} />
              <Row k="Access class" v={`${ACCESS_LABEL[s.access_class] || "—"}`} />
              <div className="text-[11.5px] text-slate mt-1">Access basis: {s.access_basis || "—"}</div>
              <div className="text-[11.5px] text-slate mt-1"><b className="text-ink">Assignment basis:</b> {s.assignment_basis}</div>
              {C.inRadius?.length > 0 && <div className="text-[11.5px] text-slate mt-1">In radius: {C.inRadius.slice(0, 6).map((m) => `${m.mbp_id} ${m.km.toFixed(0)} km${isNum(m.eta) ? ` / ${Math.round(m.eta)} min` : ""}`).join(" · ")}{C.nIn > 6 ? ` · +${C.nIn - 6} more` : ""}</div>}
            </Box>
          </div>

          <Box title="Battery evidence">
            <Row k="Status basis (precedence)" v={<span className="text-[11.5px]">{A.precedence}</span>} />
            <Row k="BBT basis" v={<span className="text-[11.5px]">{s.bbt_value_basis || "—"}</span>} />
            {s.bbt_value_evidence === "ESTIMATED" && <Row k="Estimate range · confidence" v={`${fMin(s.bbt_est_low_min)}–${fMin(s.bbt_est_high_min)} · ${s.bbt_est_confidence}`} />}
            <Row k="Battery events (exhausted / PLN back first)" v={`${fInt(s.evt_exhaustion)} / ${fInt(s.evt_censored)}`} />
            <Row k="Survived-outage lower bound" v={fMin(s.bbt_lower_bound_min)} />
            <Row k="Battery type · age" v={`${s.battery_type || "—"} · ${isNum(s.battery_age_y) ? f1(s.battery_age_y) + " y" : "—"}`} />
            <Row k="NE load" v={isNum(s.load_a) ? `${fInt(s.load_a)} A` : "—"} />
            <Row k="'Tidak Ada Baterai' tickets" v={fInt(s.tk_no_battery)} />
            <Row k="Coordinates" v={isNum(s.lat) ? `${fCoord(s.lat, s.coord_decimals)}, ${fCoord(s.lon, s.coord_decimals)} (source precision ${precisionNote(s.coord_decimals)})` : "UNAVAILABLE"} />
          </Box>
          <div className="bg-card border border-line rounded-lg p-4">
            <div className="text-[13px] font-semibold text-navy mb-2">Monthly (Jan–Jun 2026)</div>
            {!det ? <div className="text-mut text-[12px]">Loading…</div> : (
              <table className="w-full text-[12px] tabular">
                <thead><tr className="text-slate">{["Month", "Availability", "Power-down", "Transport-down", "PLN outages", "PLN hours", "Batt. exhausted", "PLN back first", "BBT median (exhausted)"].map((h) => <th key={h} className="text-right first:text-left px-1.5 py-1 border-b border-line font-semibold">{h}</th>)}</tr></thead>
                <tbody>{det.m.map((m) => (
                  <tr key={m[0]} className="border-b border-line/60">
                    <td className="px-1.5 py-1">{MONTHS[m[0] - 1]}</td><td className="text-right px-1.5">{fPct(m[1], 2)}</td><td className="text-right px-1.5">{fH(m[2])}</td>
                    <td className="text-right px-1.5">{fH(m[3])}</td><td className="text-right px-1.5">{fInt(m[4])}</td><td className="text-right px-1.5">{fH(m[5])}</td>
                    <td className="text-right px-1.5">{fInt(m[6])}</td><td className="text-right px-1.5">{fInt(m[7])}</td><td className="text-right px-1.5">{fMin(m[8])}</td>
                  </tr>))}</tbody>
              </table>
            )}
          </div>
          {evs.length > 0 && (
            <div className="bg-card border border-line rounded-lg p-4">
              <div className="text-[13px] font-semibold text-navy">Battery events (latest {evs.length})</div>
              <div className="text-[11.5px] text-mut mb-1">Blue = battery ran out (true BBT) · Gray = PLN came back first (battery lasted at least this long)</div>
              <ResponsiveContainer width="100%" height={230}>
                <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#E3E7ED" vertical={false} />
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v) => new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} tick={{ fontSize: 11, fill: "#6B7588" }} />
                  <YAxis dataKey="mins" unit=" m" tick={{ fontSize: 11, fill: "#6B7588" }} width={48} />
                  <Tooltip formatter={(v, n) => (n === "mins" ? `${Math.round(v)} min` : new Date(v).toLocaleString("en-GB"))} />
                  <ReferenceLine y={design} stroke="#1F2A44" strokeDasharray="4 3" label={{ value: "design", fontSize: 10, fill: "#1F2A44", position: "insideTopRight" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Scatter name="battery exhausted" data={exh} fill="#2a78d6" />
                  <Scatter name="PLN back first (≥)" data={cen} fill="#A3ABB9" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          {det && det.tk.length > 0 && (
            <div className="bg-card border border-line rounded-lg p-4">
              <div className="text-[13px] font-semibold text-navy mb-2">MBP / power tickets (latest {det.tk.length})</div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead><tr className="text-slate">{["Occurred", "Ticket", "RC1", "RC2", "Resolution", "MBP", "Take-over", "Check-in", "RH (h)", "Status"].map((h) => <th key={h} className="text-left px-1.5 py-1 border-b border-line font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>{det.tk.map((t, i) => (
                    <tr key={i} className="border-b border-line/60">{t.map((v, j) => <td key={j} className="px-1.5 py-1 whitespace-nowrap">{v == null ? "—" : j === 8 ? f1(v) : String(v)}</td>)}</tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
