# 10 · Glossary (EN ↔ ID)

| Term (EN) | Istilah (ID) | Meaning |
|---|---|---|
| AREA1 | AREA1 | Telkomsel area in scope (Sumatera), 17 NOPs |
| NOP | NOP | Network Operation & Productivity region (Regional operations unit) |
| Cluster (TO) | Cluster (TO) | Territory Operation inside a NOP; 37 in AREA1 |
| ENOM | ENOM | Managed-service contract for network operation & maintenance |
| PLN | PLN | State electricity company; PLN outage = mains power failure |
| MBP | MBP | Mobile Backup Power — portable genset sent to a site during a PLN outage |
| Base camp | Base camp | Location of an MBP team (PIC); the origin of MBP trips |
| PIC | PIC | Person in charge of an MBP team (name in tickets) |
| BBS | BBS | Battery Backup System at the site |
| BBT | BBT | Battery Backup Time — minutes the battery keeps the site up after PLN fails |
| BBT design | BBT desain | Expected backup time (120 min management design) |
| Mains-fail event | Kejadian mains-fail | A PLN outage seen by the site's alarms; one battery test |
| Exhausted / censored event | Kejadian baterai habis / tersensor | Battery ran out before PLN returned / PLN returned first |
| Kaplan-Meier (KM) | Kaplan-Meier (KM) | Survival method that uses censored events correctly; median = BBT |
| Lower bound | Batas bawah | Longest outage the battery is proven to have survived |
| Dead / Critical / Degraded / Below design / Meets design | Mati / Kritis / Menurun / Di bawah desain / Sesuai desain | Battery status vs design (≤ 5 min / < 25 % / < 50 % / < 100 % / ≥ 100 %) |
| Availability | Availability | 1 − outage ÷ hours (RAN, wall-clock) |
| Target | Target | Site's RAN availability target |
| Gap (pp) | Gap (pp) | Availability − target in percentage points |
| Wall-clock | Waktu nyata | Real elapsed time per site (NE-summed seconds ÷ number of NEs) |
| Power downtime | Downtime listrik | RAN downtime caused by power |
| PLN outage duration | Durasi padam PLN | Hours of PLN outage recorded (not the same as site downtime) |
| Dark month / dark site | Bulan mati / dark site | ≥ 8 h power downtime in a month / ≥ 2 such months of 6 |
| Off-air | Off-air | Suspected off-air, dismantled or data issue; excluded by default |
| Responsible party | Penanggung jawab | Who caused power downtime: PLN, internal, battery, genset, vendor, operational |
| OBSERVED / INFERRED / UNKNOWN | OBSERVED / INFERRED / UNKNOWN | Responsibility from ticket root cause / from alarms only / no record |
| Coverage radius | Radius cakupan | Max straight-line distance from a base camp (120 km) |
| ETA | ETA | Estimated travel time of an MBP (model, not routing) |
| Arrives before BBT | Tiba sebelum BBT habis | ETA ≤ effective BBT — the hard constraint |
| Coverage gap | Gap cakupan MBP | Battery OK but no MBP can arrive in time (or none in radius) |
| MBP-P1…P4 | MBP-P1…P4 | Response priority levels |
| BBS-P1…P4, Batch 1–4 | BBS-P1…P4, Batch 1–4 | Battery action priority and execution batch |
| Severity floor | Batas bawah prioritas | Measured Dead/Critical never below P2 |
| Under-served base camp | Base camp kurang terlayani | ≥ 2 of 4 criteria (many P1/P2, many dark before MBP, long ETA, high workload) |
| Placement / fleet size | Penempatan / jumlah armada | Where to add or move MBPs to reach the target share |
| Hero map | Peta utama | Map at the top of each menu |
| Legend filter | Filter legenda | Hiding a legend category filters the whole tab |
| Roll-up | Roll-up | Site → cluster → NOP aggregation (sums of sites) |
| Drilldown | Rincian | KPI total → evidence breakdown panel |
| Scope | Cakupan | Sites included by the filter bar |
| Portfolio | Portofolio | Whole AREA1, not affected by the filter |
| Full H1 | H1 penuh | Uses the full snapshot regardless of the period filter |
| what-if | what-if | Config change kept in the viewer's browser only |

## Evidence tags

| Tag | Meaning (EN) | Arti (ID) |
|---|---|---|
| ACTUAL | Observed at the site | Teramati langsung di site |
| DERIVED | Calculated from observed data | Dihitung dari data teramati |
| ESTIMATED | Modelled | Dimodelkan |
| PROXY | Stand-in for missing data | Pengganti data yang tidak ada |
| UNAVAILABLE | No data ("—", never 0) | Tidak ada data ("—", bukan 0) |
| TICKET | Status from a "Tidak Ada Baterai" ticket | Status dari tiket "Tidak Ada Baterai" |
| DERIVED-UNVERIFIED | Derived value not supported by site evidence | Nilai turunan yang tidak didukung bukti site |
