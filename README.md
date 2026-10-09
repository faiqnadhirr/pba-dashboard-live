# PBA — Power Backup Analytic (v3.8)

Decision-support dashboard for Telkomsel **AREA1** power backup (ENOM · Triple-E).
Dasbor pendukung keputusan untuk backup daya Telkomsel **AREA1** (ENOM · Triple-E).

| | English | Bahasa Indonesia |
|---|---|---|
| Full documentation / Dokumentasi lengkap | [docs/en/00-INDEX.md](docs/en/00-INDEX.md) | [docs/id/00-INDEX.md](docs/id/00-INDEX.md) |
| User guide | [docs/en/02-user-guide.md](docs/en/02-user-guide.md) | [docs/id/02-panduan-pengguna.md](docs/id/02-panduan-pengguna.md) |
| Methodology & rules | [docs/en/04-methodology.md](docs/en/04-methodology.md) | [docs/id/04-metodologi.md](docs/id/04-metodologi.md) |
| Deployment & operations | [docs/en/07-deployment-operations.md](docs/en/07-deployment-operations.md) | [docs/id/07-deploy-operasional.md](docs/id/07-deploy-operasional.md) |
| Changelog | [docs/CHANGELOG.md](docs/CHANGELOG.md) | [docs/CHANGELOG.md](docs/CHANGELOG.md) |

---

## English

### What it does
- **MBP (Mobile Backup Power):** which sites need an MBP during a PLN outage, which base camp should go, and whether it arrives before the battery runs out; outage simulation; fleet size and placement.
- **BBS (Battery Backup System):** battery status vs the 120-min design (Kaplan-Meier BBT, estimates tested on unseen sites), a prioritised action list (replace / upgrade / test / verify) with the evidence behind each action, correlation with PLN outages.
- **Health & accountability:** availability vs target, causes of the gap, responsibility for power downtime, worst clusters and Q1→Q2 trend.
- **Every number is computed per site and rolled up** to cluster and NOP; every menu opens with a clickable hero map whose legend filters the tab, and a Site · Cluster · NOP justification panel.
- **v3.6 (ops feedback):** fixed-genset sites excluded from MBP analysis; 'No battery' tickets are a field-check flag, not a status; BBT design-vs-actual gap; 30-min response target with kecamatan-level placement and fleet dimensioning (concurrency); base-camp centre of gravity → kecamatan; MBP productivity tab.
- **v3.7:** MBP-first navigation (Overview hidden for presentations, `?full=1`); MBP overview per NOP; MBP performance & utilisation from H1 job tickets; relocation backtest (replay); static dispatch priority with audit; BBS action types incl. *check rectifier/LVD/BMS setting*.
- **v3.8:** AREA 4 (light) — availability & causes, weekly/monthly trend, battery from BBT Site Details, field staff (HW Master FME); *Data available* page with the feature matrix per AREA and the next data to send. Rebuild: `python engine/build_area4.py`.
- Every value carries its evidence: **ACTUAL · DERIVED · ESTIMATED · PROXY · UNAVAILABLE**. Bilingual UI (ID default, EN); CSV exports in English.

### Quick start (Windows)
```powershell
# Node.js 20.9+ (22 LTS recommended) — public/data is already included
cd C:\PBA\pba-dashboard
npm install
npm run dev          # http://localhost:3000
npm test             # 49 regression tests
```

### Rebuild the data (Python 3.11+)
```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
python -m pip install -r engine\requirements.txt
cd engine
python build.py --raw "D:\PBA raw"   # raw files → ..\public\data (runs npm test at the end)
python validate.py                   # 25 checks → ..\docs\VALIDATION_REPORT.md
```

### Deploy
Private GitHub repo → Vercel, with `BASIC_AUTH_USER` and `BASIC_AUTH_PASS` set **before** the first deploy (see [deployment guide](docs/en/07-deployment-operations.md)). Never commit raw Excel/CSV (`engine/data/` is git-ignored).

### Repository map
```text
app/          Next.js shell (page.jsx: menus, filters, period, URL state)
components/   UI, maps (MapView, MapHero, RollupPanel), drawers, tabs/
lib/          logic.js (rule engine), period.js, rollup.js, mapmodes.js, drill.js, i18n*
i18n/         en.json, id.json
engine/       Python pipeline, config/*.yaml
public/data/  generated JSON (sites, mbps, meta, detail/, period/)
tests/        logic.test.mjs
docs/         en/, id/, CHANGELOG, telemetry design, validation report
```

---

## Bahasa Indonesia

### Fungsinya
- **MBP (Mobile Backup Power):** site mana yang butuh MBP saat PLN padam, base camp mana yang berangkat, dan apakah MBP tiba sebelum baterai habis; simulasi padam; jumlah armada dan penempatan.
- **BBS (Battery Backup System):** status baterai vs desain 120 menit (BBT Kaplan-Meier, estimasi yang diuji pada site yang belum pernah dilihat model), daftar aksi berprioritas (ganti / upgrade / uji / verifikasi) beserta bukti tiap aksi, korelasi dengan padam PLN.
- **Kesehatan & akuntabilitas:** availability vs target, penyebab gap, penanggung jawab downtime listrik, cluster terburuk dan tren Q1→Q2.
- **Setiap angka dihitung per site lalu dijumlahkan** ke cluster dan NOP; setiap menu dibuka dengan peta utama yang bisa diklik, legenda yang memfilter tab, dan panel justifikasi Site · Cluster · NOP.
- **v3.6 (masukan ops):** site genset tetap dikecualikan dari analisa MBP; tiket 'Tidak Ada Baterai' hanya tanda cek lapangan, bukan status; gap BBT desain vs aktual; target respons 30 mnt dengan penempatan level kecamatan dan dimensioning armada (konkurensi); center of gravity base camp → kecamatan; tab produktivitas MBP.
- **v3.7:** navigasi MBP-first (Ringkasan disembunyikan untuk presentasi, `?full=1`); Ringkasan MBP per NOP; performa & utilisasi MBP dari tiket job H1; backtest relokasi (replay); prioritas dispatch statis dengan audit; jenis aksi BBS termasuk *cek setting rectifier/LVD/BMS*.
- **v3.8:** AREA 4 (ringan) — availability & penyebab, tren mingguan/bulanan, baterai dari BBT Site Details, tenaga lapangan (HW Master FME); halaman *Data tersedia* dengan matriks fitur per AREA dan data berikutnya yang perlu dikirim. Build ulang: `python engine/build_area4.py`.
- Setiap nilai membawa buktinya: **ACTUAL · DERIVED · ESTIMATED · PROXY · UNAVAILABLE**. Tampilan dua bahasa (default ID, ada EN); ekspor CSV berbahasa Inggris.

### Mulai cepat (Windows)
```powershell
# Node.js 20.9+ (disarankan 22 LTS) — public/data sudah disertakan
cd C:\PBA\pba-dashboard
npm install
npm run dev          # http://localhost:3000
npm test             # 49 tes regresi
```

### Membangun ulang data (Python 3.11+)
```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
python -m pip install -r engine\requirements.txt
cd engine
python build.py --raw "D:\PBA raw"   # file mentah → ..\public\data (menjalankan npm test di akhir)
python validate.py                   # 25 cek → ..\docs\VALIDATION_REPORT.md
```

### Deploy
Repo GitHub private → Vercel, dengan `BASIC_AUTH_USER` dan `BASIC_AUTH_PASS` di-set **sebelum** deploy pertama (lihat [panduan deploy](docs/id/07-deploy-operasional.md)). Jangan pernah commit Excel/CSV mentah (`engine/data/` ada di `.gitignore`).

---

Data: Telkomsel AREA1, 1 Jan – 30 Jun 2026 snapshot · 20,227 sites (18,407 in default scope: active, not off-air, no fixed genset) · 17 NOPs · 37 clusters · 319 MBP base camps.
Confidential — internal use by Telkomsel and Triple-E only. / Rahasia — hanya untuk penggunaan internal Telkomsel dan Triple-E.
