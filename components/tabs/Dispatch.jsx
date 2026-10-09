"use client";
// v3.7 — dispatch guidance for the MBP operator (STATIC priority — tickets are not real-time yet):
// a punch list per base camp, "which site first" for the sites that are down now, and an audit of past choices.
import React, { useEffect, useMemo, useState } from "react";
import { Card, Kpi, Note, DataTable, Select, LevelTag, EvTag, fInt, fPct, fMin, fNum, isNum, exportCsv } from "@/components/ui";
import { dispatchOrder, dispatchAudit, dispatchScore, minToDate } from "@/lib/mbpperf";
import { t } from "@/lib/i18n";
const pct = (v, d = 0) => (isNum(v) ? fPct(100 * v, d) : "—");

export default function Dispatch({ model, data, cfg, nop: gNop, allNops, tickets, sel, setPick, perf }) {
  const preset = sel ? data.mbps.find((m) => m.mbp_id === sel) : null;
  const [nop, setNop] = useState(preset?.nop || (gNop !== "All NOPs" ? gNop : "NOP BENGKULU"));
  useEffect(() => { if (gNop !== "All NOPs" && !preset) setNop(gNop); }, [gNop]); // eslint-disable-line
  const mbpsN = useMemo(() => data.mbps.filter((m) => m.nop === nop && isNum(m.lat)), [data.mbps, nop]);
  const [camp, setCamp] = useState(preset?.mbp_id || null);
  useEffect(() => { if (!camp || !mbpsN.some((m) => m.mbp_id === camp)) setCamp([...mbpsN].sort((a, b) => (perf.get(b.mbp_id)?.jobs || 0) - (perf.get(a.mbp_id)?.jobs || 0))[0]?.mbp_id || null); }, [nop, mbpsN]); // eslint-disable-line
  const C = data.mbps.find((m) => m.mbp_id === camp);
  const byId = useMemo(() => new Map(model.map((s) => [s.site_id, s])), [model]);
  // v3.7 — the camp's sites = assigned by the coverage rule and/or served by it in H1 (operators know their real area from history)
  const [areaMode, setAreaMode] = useState("both");
  const served = useMemo(() => new Set(tickets.filter((k) => k.mbp === camp).map((k) => k.site)), [tickets, camp]);
  const area = useMemo(() => model.filter((s) => s.site_active === 1 && !s.offair && !s.genset_protected &&
    (areaMode === "assigned" ? s.mbp_assigned === camp : areaMode === "served" ? served.has(s.site_id) : s.mbp_assigned === camp || served.has(s.site_id))), [model, camp, served, areaMode]);
  const punch = useMemo(() => (C ? dispatchOrder(area, C, cfg) : []), [area, C, cfg]);
  const [down, setDown] = useState([]), [paste, setPaste] = useState("");
  useEffect(() => { setDown([]); setPaste(""); }, [camp]);
  const toggle = (id) => setDown(down.includes(id) ? down.filter((x) => x !== id) : [...down, id]);
  const addPaste = () => { const ids = paste.toUpperCase().split(/[\s,;]+/).filter((x) => byId.has(x)); setDown([...new Set([...down, ...ids])]); setPaste(""); };
  const [hour, setHour] = useState(new Date().getHours());
  const order = useMemo(() => (C ? dispatchOrder(down.map((id) => byId.get(id)).filter(Boolean), C, cfg, hour) : []), [down, C, cfg, hour, byId]);
  // audit over the NOP's history
  const ticketsN = useMemo(() => { const ids = new Set(model.filter((s) => s.nop === nop).map((s) => s.site_id)); return tickets.filter((k) => ids.has(k.site)); }, [tickets, model, nop]);
  const audit = useMemo(() => dispatchAudit(ticketsN, byId, cfg), [ticketsN, byId, cfg]);
  const perCamp = useMemo(() => { const m = new Map(); for (const d of audit) { const r = m.get(d.mbp) || m.set(d.mbp, { mbp_id: d.mbp, n: 0, ok: 0 }).get(d.mbp); r.n++; if (d.followed) r.ok++; }
    return [...m.values()].map((r) => ({ ...r, rate: r.ok / r.n })); }, [audit]);
  const mine = audit.filter((d) => d.mbp === camp && !d.followed).sort((a, b) => b.T - a.T).slice(0, 50).map((d) => ({ ...d, cs: byId.get(d.chosen), bs: byId.get(d.best_site) }));
  const ok = audit.filter((d) => d.followed).length, mineAll = audit.filter((d) => d.mbp === camp), mineOk = mineAll.filter((d) => d.followed).length;
  const depActual = model.filter((s) => s.nop === nop && isNum(s.dep_children_actual)).length;
  const D = cfg.dispatch || {};
  const template = () => exportCsv(model.filter((s) => s.nop === nop && s.site_active === 1).sort((a, b) => (a.cluster_to || "").localeCompare(b.cluster_to || "") || a.site_id.localeCompare(b.site_id)),
    [{ key: "site_id", label: "site_id" }, { key: "site_name", label: "site_name" }, { key: "nop", label: "nop" }, { key: "cluster_to", label: "cluster" }, { key: "kecamatan", label: "kecamatan" },
     { key: "site_class", label: "site_class" }, { key: "hub_site", label: "hub_site_current" }, { key: "dep_role", label: "dependency_role", csv: (r) => r.dep_role || "" },
     { key: "dep_children_actual", label: "child_sites", csv: (r) => (isNum(r.dep_children_actual) ? r.dep_children_actual : "") }, { key: "_ids", label: "child_site_ids", csv: () => "" }],
    `site_dependency_template_${nop.replace(/\s+/g, "_")}.csv`);
  const reason = (r) => (r.eta == null ? t("disp.r.beyond") : r.savable === true ? t("disp.r.savable", { e: fMin(r.eta), b: fMin(r.bbt) }) : r.savable === null ? t("disp.r.unknown", { e: fMin(r.eta) }) : t("disp.r.late", { e: fMin(r.eta), b: fMin(r.bbt) }));

  return (
    <div className="space-y-4">
      <Note>{t("disp.note", { c: D.w_class ?? 0.4, d: D.w_dependency ?? 0.3, p: D.w_priority ?? 0.3 })}</Note>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-60"><Select label={t("filter.nop")} value={nop} onChange={setNop} options={allNops} /></div>
        <div className="w-[380px] max-w-full"><Select label={t("disp.camp")} value={camp || ""} onChange={setCamp} options={[...mbpsN].sort((a, b) => a.mbp_id.localeCompare(b.mbp_id)).map((m) => ({ value: m.mbp_id, label: `${m.mbp_id} (${fInt(model.filter((s) => s.mbp_assigned === m.mbp_id).length)} site)` }))} /></div>
        <div><div className="text-[11.5px] text-slate mb-1">{t("disp.area")}</div>
          <div className="flex rounded-md overflow-hidden border border-line" role="group">{["both", "assigned", "served"].map((v) =>
            <button key={v} aria-pressed={areaMode === v} onClick={() => setAreaMode(v)} className={`px-2.5 py-1.5 text-[12.5px] whitespace-nowrap ${areaMode === v ? "bg-navy text-white" : "bg-white text-slate hover:text-navy"}`}>{t(`disp.area.${v}`)}</button>)}</div></div>
        <button onClick={template} className="px-3 py-1.5 rounded border border-navy text-navy text-[12.5px]" title={t("disp.template_tip")}>{t("disp.template")}</button>
        <span className="text-[11.5px] text-mut">{t("disp.dep_status", { n: fInt(depActual) })}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi fixed label={t("disp.kpi.area")} value={fInt(area.length)} sub={t("disp.kpi.area_sub", { p: fInt(area.filter((s) => s.mbp_priority_level === "P1" || s.mbp_priority_level === "P2").length) })} />
        <Kpi fixed label={t("disp.kpi.savable")} value={fInt(punch.filter((r) => r.savable === true).length)} sub={t("disp.kpi.savable_sub")} />
        <Kpi fixed label={t("disp.kpi.audit_nop")} value={audit.length ? pct(ok / audit.length) : "—"} sub={t("disp.kpi.audit_sub", { n: fInt(audit.length) })} tone={ok / Math.max(1, audit.length) >= 0.8 ? "good" : "warn"} help={t("disp.kpi.audit_help")} />
        <Kpi fixed label={t("disp.kpi.audit_camp")} value={mineAll.length ? pct(mineOk / mineAll.length) : "—"} sub={t("disp.kpi.audit_sub", { n: fInt(mineAll.length) })} />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
        <Card title={t("disp.punch.title")} sub={t("disp.punch.sub")}>
          <DataTable rows={punch} pageSize={15} filename={`pba_punchlist_${camp}.csv`.replace(/\s+/g, "_")} onRowClick={(r) => toggle(r.site.site_id)}
            rowClass={(r) => (down.includes(r.site.site_id) ? "bg-warn/15" : "")} columns={[
              { key: "pick", label: "disp.col.down", render: (r) => <input type="checkbox" checked={down.includes(r.site.site_id)} onChange={() => toggle(r.site.site_id)} onClick={(e) => e.stopPropagation()} aria-label={r.site.site_id} />, csv: () => "" },
              { key: "order", label: "disp.col.rank", num: true },
              { key: "site", label: "col.site", sortVal: (r) => r.site.site_id, render: (r) => <button className="text-s1 underline" onClick={(e) => { e.stopPropagation(); setPick(r.site); }}>{r.site.site_id}</button>, csv: (r) => r.site.site_id },
              { key: "cls", label: "col.class", sortVal: (r) => r.cls, render: (r) => r.site.site_class, csv: (r) => r.site.site_class },
              { key: "dep", label: "disp.col.dep", num: true, render: (r) => <span>{fInt(r.dep * 15)} <span className="text-[10px] text-mut">{r.depEvidence}</span></span>, csv: (r) => `${Math.round(r.dep * 15)} ${r.depEvidence}` },
              { key: "pr", label: "col.mbp_priority", num: true, render: (r) => <LevelTag kind="MBP" v={r.site.mbp_priority_level} />, csv: (r) => r.site.mbp_priority_level },
              { key: "score", label: "disp.col.score", num: true, render: (r) => fNum(r.score, 2), csv: (r) => r.score.toFixed(3) },
              { key: "eta", label: "disp.col.eta", num: true, render: (r) => fMin(r.eta), csv: (r) => (isNum(r.eta) ? r.eta.toFixed(0) : "") },
              { key: "bbt", label: "mbpd.col.bbt", num: true, render: (r) => fMin(r.bbt), csv: (r) => r.bbt ?? "" },
              { key: "savable", label: "disp.col.savable", render: (r) => (r.savable === true ? "✔" : r.savable === false ? "✖" : "?"), csv: (r) => String(r.savable) },
            ]} />
        </Card>
        <Card title={t("disp.now.title")} sub={t("disp.now.sub")}>
          <div className="flex flex-wrap gap-2 items-end mb-2">
            <label className="flex-1 min-w-[200px] text-[11.5px] text-slate">{t("disp.paste")}
              <input value={paste} onChange={(e) => setPaste(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPaste()} placeholder="BKL001, BKL023 …" className="mt-1 w-full border border-line rounded px-2 py-1 text-[12.5px] text-ink" /></label>
            <button onClick={addPaste} className="px-3 py-1.5 rounded bg-navy text-white text-[12.5px]">{t("disp.add")}</button>
            <label className="text-[11.5px] text-slate">{t("disp.hour")}<select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="ml-1 border border-line rounded px-1 py-1 text-ink">{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></label>
            {down.length > 0 && <button onClick={() => setDown([])} className="text-s1 underline text-[12px]">{t("disp.clear")}</button>}
          </div>
          {!order.length ? <div className="text-mut text-[12.5px] border border-dashed border-line rounded p-4">{t("disp.now.empty")}</div> :
            <ol className="space-y-2">{order.map((r) => (
              <li key={r.site.site_id} className={`border rounded-md p-2.5 bg-white ${r.order === 1 ? "border-navy ring-1 ring-navy/30" : "border-line"}`}>
                <div className="flex items-center gap-2"><span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold ${r.order === 1 ? "bg-navy text-white" : "bg-surface text-ink border border-line"}`}>{r.order}</span>
                  <button className="font-semibold text-ink underline decoration-dotted" onClick={() => setPick(r.site)}>{r.site.site_id}</button><span className="text-mut truncate">{r.site.site_name}</span>
                  <span className="ml-auto"><LevelTag kind="MBP" v={r.site.mbp_priority_level} /></span></div>
                <div className={`text-[12px] mt-1 ${r.savable === true ? "text-good" : r.savable === false || r.eta == null ? "text-crit" : "text-slate"}`}>{reason(r)}</div>
                <div className="text-[11.5px] text-slate">{t("disp.why", { c: r.site.site_class, d: fInt(r.dep * 15), e: r.depEvidence, p: r.site.mbp_priority_level, s: fNum(r.score, 2) })}</div>
              </li>))}</ol>}
          <div className="mt-2 text-[11px] text-mut">{t("disp.now.foot")}</div>
        </Card>
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-4">
        <Card title={t("disp.audit.title", { nop })} sub={t("disp.audit.sub")}>
          <DataTable rows={perCamp} pageSize={15} filename={`pba_dispatch_audit_${nop}.csv`.replace(/\s+/g, "_")} initialSort={{ key: "rate", dir: 1 }} onRowClick={(r) => setCamp(r.mbp_id)}
            rowClass={(r) => (r.mbp_id === camp ? "bg-warn/10 font-semibold" : "")} columns={[
              { key: "mbp_id", label: "col.basecamp" }, { key: "n", label: "disp.col.decisions", num: true }, { key: "ok", label: "disp.col.followed", num: true },
              { key: "rate", label: "disp.col.rate", num: true, render: (r) => <span className={r.rate < 0.6 ? "text-crit font-semibold" : ""}>{pct(r.rate)}</span>, csv: (r) => (100 * r.rate).toFixed(1) },
            ]} />
        </Card>
        <Card title={t("disp.viol.title", { c: camp || "—" })} sub={t("disp.viol.sub")}>
          {!mine.length ? <div className="text-mut text-[12.5px]">{t("disp.viol.none")}</div> :
            <DataTable rows={mine} pageSize={10} filename={`pba_dispatch_exceptions_${camp}.csv`.replace(/\s+/g, "_")} columns={[
              { key: "T", label: "disp.col.when", render: (r) => minToDate(r.T), csv: (r) => minToDate(r.T) },
              { key: "chosen", label: "disp.col.chosen", render: (r) => `${r.chosen} · ${r.cs?.site_class || "—"} · ${r.cs?.mbp_priority_level || ""}`, csv: (r) => r.chosen },
              { key: "best_site", label: "disp.col.better", render: (r) => <span className="text-crit">{r.best_site} · {r.bs?.site_class || "—"} · {r.bs?.mbp_priority_level || ""}</span>, csv: (r) => r.best_site },
              { key: "gap", label: "disp.col.gap", num: true, sortVal: (r) => r.best_score - r.chosen_score, render: (r) => fNum(r.best_score - r.chosen_score, 2), csv: (r) => (r.best_score - r.chosen_score).toFixed(3) },
              { key: "waiting", label: "disp.col.waiting", num: true },
            ]} />}
          <div className="mt-1 text-[11px] text-mut inline-flex items-center gap-1">{t("disp.audit.foot")} <EvTag v="ACTUAL" /></div>
        </Card>
      </div>
    </div>
  );
}
