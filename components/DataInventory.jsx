"use client";
// v3.8 — which data each AREA has, which screens it feeds, and which extra file unlocks what (so the next upload is targeted)
import React from "react";
import { Card, DataTable, Note, fInt } from "@/components/ui";
import { t } from "@/lib/i18n";

// feature × area: 2 = full, 1 = partial, 0 = not yet (key → i18n inv.f.<key>, need → i18n inv.need.<key>)
export const FEATURES = [
  ["avail", 2, 2, null], ["period", 2, 1, "ran_daily"], ["resp", 2, 0, "tickets"], ["bbt", 2, 1, "bbt_events"],
  ["bbs", 2, 0, "newbbt"], ["coverage", 2, 1, "basecamp"], ["perf", 2, 0, "tickets"], ["need", 2, 0, "pln"],
  ["genset", 2, 1, "swfm"], ["kec", 2, 2, null], ["field", 0, 2, "fme1"], ["pm", 1, 1, null], ["dependency", 1, 0, "dependency"], ["gps", 0, 0, "gps"],
];
const Mark = ({ v }) => <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-[12px] font-bold ${v === 2 ? "bg-good/15 text-good" : v === 1 ? "bg-warn/20 text-[#8a5a00]" : "bg-crit/10 text-crit"}`}
  title={t(`inv.mark.${v}`)}>{v === 2 ? "✔" : v === 1 ? "◐" : "✖"}</span>;

export default function DataInventory({ meta1, meta4 }) {
  const src1 = (meta1?.snapshot?.sources || []).map((r) => ({ area: "AREA 1", source: r.source, rows: r.files ? `${r.files} file` : "—", period: meta1?.scope ? `${meta1.scope.period_start} → ${meta1.scope.period_end}` : "", status: r.status }));
  const tr = (v) => { const k = { "snapshot": "inv.s.snapshot", "snapshot — period not written in the file": "inv.s.no_period", "OK (period to confirm)": "inv.s.confirm",
    "OK (NOP / cluster level)": "inv.s.nop_level", "OK (e-mail / phone not exported)": "inv.s.no_pii", "update 9 Sep 2026": "inv.s.fme_update" }[v]; return k ? t(k) : v; };
  const src4 = (meta4?.inventory || []).map((r) => ({ area: "AREA 4", source: r.source, rows: fInt(r.rows), period: tr(r.period), status: tr(r.status) }));
  const next = ["tickets4", "bbt_events4", "newbbt4", "pln4", "ran_daily4", "fme1", "swfm", "gps", "ah", "powerbi"];
  return (
    <div className="space-y-4">
      <Note>{t("inv.note")}</Note>
      <Card title={t("inv.matrix.title")} sub={t("inv.matrix.sub")}>
        <div className="overflow-x-auto"><table className="w-full text-[12.5px] min-w-[720px]">
          <thead><tr className="text-left text-slate border-b border-line"><th className="py-1.5 pr-2">{t("inv.col.feature")}</th><th className="text-center">AREA 1</th><th className="text-center">AREA 4</th><th className="pl-3">{t("inv.col.need")}</th></tr></thead>
          <tbody>{FEATURES.map(([k, a1, a4, need]) => <tr key={k} className="border-b border-line/60">
            <td className="py-1.5 pr-2"><b className="text-ink">{t(`inv.f.${k}`)}</b><div className="text-[11.5px] text-mut">{t(`inv.f.${k}_sub`)}</div></td>
            <td className="text-center"><Mark v={a1} /></td><td className="text-center"><Mark v={a4} /></td>
            <td className="pl-3 text-[12px] text-slate">{need ? t(`inv.need.${need}`) : "—"}</td></tr>)}</tbody>
        </table></div>
        <div className="mt-2 text-[11.5px] text-mut">✔ {t("inv.mark.2")} · ◐ {t("inv.mark.1")} · ✖ {t("inv.mark.0")}</div>
      </Card>
      <Card title={t("inv.src.title")} sub={t("inv.src.sub")}>
        <DataTable rows={[...src1, ...src4]} pageSize={30} filename="pba_data_inventory.csv" columns={[
          { key: "area", label: "inv.col.area" }, { key: "source", label: "inv.col.source" }, { key: "rows", label: "inv.col.rows" }, { key: "period", label: "inv.col.period" }, { key: "status", label: "inv.col.status" }]} />
      </Card>
      <Card title={t("inv.next.title")} sub={t("inv.next.sub")}>
        <ol className="list-decimal pl-5 space-y-1.5 text-[12.5px]">
          {next.map((k) => <li key={k}><b className="text-ink">{t(`inv.next.${k}`)}</b> — <span className="text-slate">{t(`inv.next.${k}_why`)}</span></li>)}
        </ol>
      </Card>
    </div>
  );
}
