"use client";
import React, { useState } from "react";
import { Card, Note, DataTable, Slider, fMin, f2 } from "@/components/ui";
import { deriveSessions } from "@/lib/logic";

const COLS = ["mbp_id", "device_imei", "ts", "lat", "lon", "power_state", "battery_voltage", "speed_kmh"];
const SAMPLE = `mbp_id,device_imei,ts,lat,lon,power_state,battery_voltage,speed_kmh
MBP-OKI-AGUSSALIM,350000000000001,2026-07-01 08:00:00,-3.30,104.80,0,12.6,0
MBP-OKI-AGUSSALIM,350000000000001,2026-07-01 08:40:00,-3.35,104.85,0,12.6,42
MBP-OKI-AGUSSALIM,350000000000001,2026-07-01 09:05:00,-3.3600,104.8700,1,13.8,0
MBP-OKI-AGUSSALIM,350000000000001,2026-07-01 12:10:00,-3.3600,104.8700,0,12.4,0`;

function parse(text) {
  const [h, ...lines] = text.trim().split(/\r?\n/);
  const hd = h.split(",").map((x) => x.trim());
  const miss = COLS.filter((c) => !hd.includes(c));
  if (miss.length) throw new Error("missing columns: " + miss.join(", "));
  return lines.filter(Boolean).map((l) => { const v = l.split(","); const o = {}; hd.forEach((k, i) => (o[k] = v[i]?.trim())); o.mbp_id = o.mbp_id.toUpperCase(); return o; });
}

export default function Telemetry({ model: scored }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState(null), [gf, setGf] = useState(0.3);
  const load = (t) => { try { setRows(parse(t)); setErr(null); } catch (e) { setErr(String(e)); setRows(null); } };
  const ses = rows ? deriveSessions(rows, scored, gf) : [];
  return (
    <div className="space-y-4">
      <Card title="MBP telemetry — Teltonika FMC920 (design, future data feed)" sub="Goal: collect GPS location, MBP-on and MBP-off for every MBP so location & number of MBPs can be optimised with ACTUAL data.">
        <pre className="text-[12px] bg-surface border border-line rounded-md p-3 overflow-x-auto leading-relaxed">{`FMC920 on each MBP ──4G LTE (SIM)──►  Receiver service (TCP, Teltonika Codec 8 / 8E)
  GNSS + digital input (MBP on/off)        │ IMEI handshake → AVL records → ACK record count
                                           ▼
                                   Telemetry DB  ── mbp_telemetry (raw points) ── mbp_session (on→off, matched to site)
                                           │
                                           ▼
                                   REST API (token, read-only)  ──►  Watson PBA module`}</pre>
        <div className="grid md:grid-cols-3 gap-3 mt-3 text-[12.5px]">
          <div><b className="text-navy">MBP-on / off</b><br />Digital input wired to the MBP output / genset “running” signal (send on change). Validate wiring with vendor.</div>
          <div><b className="text-navy">What PBA gains</b><br />Columns 13–14 become ACTUAL; live MBP availability replaces the PROXY; travel time calibrated from real trips.</div>
          <div><b className="text-navy">Roll-out</b><br />Pilot 10–20 MBPs in one NOP for 4–6 weeks → compare with tickets → scale to all MBPs.</div>
        </div>
        <div className="text-[12px] text-mut mt-2">Full design (schema, API contract, JSON examples): <code>docs/MBP_TELEMETRY_DESIGN.md</code>.</div>
      </Card>
      <Card title="Try the data model" sub={`Upload a CSV with columns: ${COLS.join(", ")} — sessions are derived in the browser (nothing is uploaded).`}>
        <div className="flex flex-wrap items-end gap-4 mb-3">
          <input type="file" accept=".csv" onChange={(e) => e.target.files[0]?.text().then(load)} className="text-[12.5px]" />
          <button onClick={() => load(SAMPLE)} className="px-3 py-1.5 border border-line rounded-md text-[12.5px] bg-white hover:border-slate">Load sample</button>
          <div className="w-56"><Slider label="Geofence" value={gf} onChange={setGf} min={0.1} max={2} step={0.1} fmt={(v) => `${v} km`} /></div>
        </div>
        {err && <Note tone="crit">{err}</Note>}
        {rows && <>
          <div className="text-[12px] text-slate mb-1">{rows.length} telemetry points · {ses.length} sessions</div>
          <DataTable rows={ses} filename="mbp_sessions.csv" pageSize={20} columns={[
            { key: "mbp_id", label: "MBP" }, { key: "site_id", label: "Matched site", render: (r) => r.site_id || "— (outside geofence)" },
            { key: "on_ts", label: "MBP-on" }, { key: "off_ts", label: "MBP-off" },
            { key: "duration_h", label: "Duration", num: true, render: (r) => `${f2(r.duration_h)} h` }, { key: "match_km", label: "Distance to site", num: true, render: (r) => `${f2(r.match_km)} km` },
            { key: "evidence", label: "Evidence" }]} />
        </>}
      </Card>
    </div>
  );
}
