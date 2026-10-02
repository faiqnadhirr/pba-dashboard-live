# MBP telemetry design — Teltonika FMC920 (design only)

Goal: collect **GPS location, MBP-on, MBP-off** for every MBP so PBA can replace today's PROXY/DERIVED MBP data (base camp location, availability, deployment history, backup hours) with **ACTUAL** data, and optimise the number and placement of MBPs.

> Items marked **[validate]** must be confirmed with the Teltonika datasheet / vendor before purchase. Protocol facts below come from the Teltonika wiki "Codec" page.

## 1. Architecture (keep it simple)

```text
 FMC920 on each MBP ──4G LTE Cat 1 (SIM, APN)──►  Receiver service (TCP, Codec 8 / 8E)
   GNSS + I/O                                         │  parse AVL records, ACK record count
                                                      ▼
                                              Telemetry DB (MySQL / Postgres)
                                              ├─ mbp_telemetry (raw points)
                                              └─ mbp_session   (derived on/off sessions)
                                                      │
                                                      ▼
                                              REST API (read-only, token)
                                                      │
                                                      ▼
                                              Watson PBA module (PHP/MySQL)
```

- **Device → server:** device opens TCP, sends IMEI; server replies `0x01` (accept) / `0x00` (reject). Device then sends AVL packets (Codec 8 / Codec 8 Extended); server replies with a 4-byte count of accepted records, otherwise the device resends. Each AVL record = timestamp (UNIX ms), priority, GPS element (lon, lat, altitude, angle, satellites, speed), IO elements.
- **Receiver:** one small service (Python asyncio or an off-the-shelf open-source Teltonika parser) on a VM with a public IP / port. Store every record; no business logic.
- **Recording profile [validate]:** on-change of the MBP-on input (high priority = immediate send), every 60 s while moving, every 10–15 min while parked; buffer when no coverage (device stores records and resends).
- **Volume:** 327 MBP × ~300 records/day ≈ 100k rows/day → trivial for MySQL.

## 2. How MBP-on / MBP-off is captured [validate]
Options, best first:
1. **Digital input (DIN1)** wired to a relay / voltage-sense on the MBP AC output or the genset "running" signal → `power_state = 1` when the MBP is supplying the site. Configure DIN1 as an event I/O (send on change).
2. **Analog input** reading the MBP battery/output voltage → threshold rule on the server (`voltage > X` = on).
3. Device **ignition source** set to DIN1 or power-voltage sensing, and use the ignition IO element as MBP-on.
Avoid accelerometer-based ignition (MBP vibration ≠ supplying power).

## 3. Database schema

```sql
CREATE TABLE mbp_device (
  device_imei     VARCHAR(20) PRIMARY KEY,
  mbp_id          VARCHAR(80) NOT NULL,       -- = PBA mbp_id (upper(trim(MBP Team name)))
  installed_at    DATETIME, sim_msisdn VARCHAR(20), active TINYINT DEFAULT 1
);
CREATE TABLE mbp_telemetry (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_imei VARCHAR(20) NOT NULL, mbp_id VARCHAR(80) NOT NULL,
  ts DATETIME NOT NULL,                       -- device GNSS time, stored in WIB
  lat DECIMAL(9,6), lon DECIMAL(9,6), speed_kmh SMALLINT, satellites TINYINT,
  power_state TINYINT,                        -- 1 = MBP supplying power (from DIN1 / rule)
  battery_voltage DECIMAL(5,2), external_voltage DECIMAL(5,2),
  io_json JSON,                               -- all other IO elements, raw
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (mbp_id, ts), INDEX (ts)
);
CREATE TABLE mbp_session (                    -- derived every 5 min by a job
  session_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  mbp_id VARCHAR(80), site_id VARCHAR(10),    -- nearest site within geofence (default 300 m), NULL if none
  on_ts DATETIME, off_ts DATETIME, duration_h DECIMAL(6,2),
  depart_ts DATETIME,                         -- last time speed > 5 km/h leaving base before on_ts
  arrive_ts DATETIME,                         -- first stop inside the site geofence
  travel_min DECIMAL(6,1), match_km DECIMAL(6,3),
  evidence VARCHAR(12) DEFAULT 'ACTUAL',
  INDEX (mbp_id, on_ts), INDEX (site_id)
);
```
The MVP already contains `mbp_telemetry` and `mbp_session` (empty) and a stub (`src/telemetry/ingest.py`) that loads a CSV in this shape and derives sessions; try it on the **MBP Telemetry (future)** page with `data/sample/mbp_telemetry_sample.csv`.

## 4. API contract (for Watson)
All endpoints `GET`, JSON, bearer token, times in WIB (`Asia/Jakarta`).

| Endpoint | Purpose |
|---|---|
| `/api/v1/mbp/positions` | latest position + state of every MBP |
| `/api/v1/mbp/{mbp_id}/track?from=&to=` | raw points for one MBP |
| `/api/v1/sessions?from=&to=&nop=&site_id=` | MBP-on/off sessions (deployments) |
| `/api/v1/kpi/site?from=&to=` | per site: deployments, backup hours, avg travel min |
| `/api/v1/kpi/mbp?from=&to=` | per MBP: utilisation %, sessions, km driven, idle hours |

```json
GET /api/v1/mbp/positions
[{"mbp_id":"MBP-OKI-AGUSSALIM","ts":"2026-07-01 09:05:00","lat":-3.36,"lon":104.87,
  "power_state":1,"status":"ON_SITE_SUPPLYING","site_id":"OKI179","speed_kmh":0}]

GET /api/v1/sessions?from=2026-07-01&to=2026-07-31&nop=NOP%20PALEMBANG
[{"session_id":1201,"mbp_id":"MBP-OKI-AGUSSALIM","site_id":"OKI179",
  "depart_ts":"2026-07-01 08:00:00","arrive_ts":"2026-07-01 09:01:00","travel_min":61,
  "on_ts":"2026-07-01 09:05:00","off_ts":"2026-07-01 12:10:00","duration_h":3.08,"evidence":"ACTUAL"}]
```
`status` values: `AT_BASE`, `MOVING`, `ON_SITE_SUPPLYING`, `ON_SITE_IDLE`, `OFFLINE` (no record > 30 min).

## 5. How PBA uses it

| PBA item | Today | With telemetry |
|---|---|---|
| Col 13 Historical MBP deployments | DERIVED from tickets | **ACTUAL** sessions |
| Col 14 Total MBP backup time | DERIVED from RH meter | **ACTUAL** on→off duration |
| MBP availability in simulation | PROXY (all available) | **ACTUAL** live status |
| Travel time (col 12) | ESTIMATED (speed model) | calibrated from real `travel_min` per NOP / road class / hour |
| Base camp location | MBP Team sheet (29 missing) | actual night-parking location |
| MBP count & placement | scenario analysis | utilisation + demand heat-map → evidence-based relocation |

## 6. Roll-out suggestion
Pilot 10–20 MBPs in one NOP (e.g. Palembang, highest ticket volume) for 4–6 weeks → validate the on/off wiring and data quality → compare ticket vs telemetry deployments → scale to all 327.
