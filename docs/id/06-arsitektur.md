# 06 · Arsitektur & kode

## 1. Stack

| Lapisan | Teknologi |
|---|---|
| Pipeline | Python 3.11+ — pandas, polars, numpy, scikit-learn, openpyxl/calamine, pyyaml |
| Aplikasi web | Next.js 16 (App Router) · React 19 · Tailwind CSS 3 · Leaflet 1.9 + react-leaflet 5 · Recharts 2 |
| Tes | Test runner bawaan Node (`node --test`) pada snapshot data nyata; skrip validasi Python |
| Hosting | Vercel (data statis di `public/data`, basic auth di `proxy.js`) |

Tidak ada database dan tidak ada logika bisnis di server: server hanya menyajikan file di balik login.

## 2. Struktur repositori

```text
pba-dashboard/
├─ app/
│  ├─ layout.jsx, globals.css
│  └─ page.jsx              ← kerangka: header, menu, bar filter, bar periode, state URL, model + overlay periode, drawer
├─ components/
│  ├─ ui.jsx                ← UI bersama: Kpi, Card, DataTable, tag, formatter, kolom daftar site, ActionLabel
│  ├─ MapView.jsx           ← peta Leaflet: lapisan site canvas, legenda toggle, level Site/Cluster/NOP, lapisan MBP
│  ├─ MapHero.jsx           ← kartu peta utama + useMapLegend() (legenda = filter tab) + LegendChip
│  ├─ mapModes.jsx          ← warna, label legenda dan alasan satu baris per site untuk tiap mode peta
│  ├─ RollupPanel.jsx       ← panel justifikasi NOP › cluster › site
│  ├─ DrillPanel.jsx        ← panel KPI "Total → rincian"
│  ├─ PeriodBar.jsx         ← tombol periode, stepper, tanggal custom, label
│  ├─ SiteDrawer.jsx        ← detail site
│  └─ tabs/                 ← satu file per tab (Health, Accountability, Impact, Trend, MbpTab, SimTab, Placement,
│                              Telemetry, BbsActions, BbsAnalysis, DataQuality, ConfigTab)
├─ lib/
│  ├─ logic.js              ← RULE ENGINE (status, prioritas, penugasan, aksi, simulasi, penempatan, analitik)
│  ├─ data.js               ← akses data (loadAll, loadDetail) — satu-satunya tempat yang mengambil /data
│  ├─ period.js             ← parsing/stepper periode, memuat file periode, penjumlahan ulang, overlay ke model
│  ├─ mapmodes.js           ← mode peta: site → kunci kategori, besaran, kunci "bermasalah" (murni)
│  ├─ rollup.js             ← roll-up site → cluster → NOP dan justifikasi (murni)
│  ├─ drill.js              ← definisi drilldown dan preset Daftar site (?sel=) (murni)
│  ├─ view.js               ← helper tampilan (gap cakupan)
│  ├─ nav.jsx               ← context navigasi dan link <Go>
│  ├─ i18n.js, i18n-dicts.js← t(), tv(), bahasa, format angka lokal, bahasa Inggris untuk CSV
│  ├─ i18n-engine.js        ← terjemahan teks engine (Inggris) ke Indonesia, pola demi pola
│  └─ maplegend.js          ← urutan kunci legenda per mode
├─ i18n/en.json, id.json    ← kamus UI (kunci sama; ~1.270 masing-masing)
├─ engine/                  ← pipeline Python (lihat 03)
│  ├─ build.py, validate.py, requirements.txt
│  ├─ config/thresholds.yaml, scoring.yaml, basecamp_merge.csv
│  └─ src/ingestion, normalization, analytics, bbs, mbp, telemetry
├─ public/data/             ← JSON hasil build (sites, mbps, familiarity, meta, detail/, period/)
├─ tests/logic.test.mjs     ← 38 tes regresi
├─ proxy.js                 ← basic auth untuk semua path (bila env var di-set)
└─ docs/                    ← dokumentasi ini (en/, id/), changelog, desain telemetri, laporan validasi
```

## 3. Alur data saat berjalan (browser)

```text
loadAll() ─► data {sites, mbps, familiarity, meta}
              │
cfg (meta.config, atau what-if dari localStorage)
              │
buildModel(sites, mbps, cfg)  ── lib/logic.js ──►  model: satu objek per site berisi semua keputusan
              │                                    (baterai, status, cakupan, penugasan, prioritas, aksi, resp, av …)
periode ≠ H1 ? loadPeriodFiles → periodAgg → applyPeriod(model)  ──► pmodel (metrik teramati diganti)
              │
filter (non-aktif, off-air, NOP, kelas) ──► scope
              │
tiap tab: useMapLegend(scope) ──► vis (filter legenda) ──► KPI / grafik / tabel / peta / roll-up / drill
```

- **Satu model** dibangun sekali per konfigurasi; semua tab membaca objek site yang sama.
- `useMemo` membuat perhitungan ulang ringan: membangun model ~20 ribu site jauh di bawah satu detik; menjumlahkan ulang periode ~0,1 detik plus ~0,5 detik untuk overlay.
- File detail dimuat per NOP saat drawer site dibuka; file periode per bulan saat periode dipilih (di-cache).

## 4. State URL

Semua state navigasi ada di query string, sehingga setiap tampilan bisa dibagikan dan Back/Forward berfungsi:

| Parameter | Contoh | Arti |
|---|---|---|
| `view` | `mbp.sitelist` | Menu.tab; nilai yang tidak dikenal kembali ke tab pertama grupnya dengan pemberitahuan |
| `nop` | `NOP BATAM` | Filter NOP |
| `cls` | `Diamond,Gold` | Filter kelas |
| `inactive`, `offair` | `1` | Sertakan site non-aktif / off-air |
| `per` | `m:202605`, `w:20260511`, `d:20260512`, `q:2`, `r:20260501-20260520` | Periode (kosong = H1 penuh) |
| `sel` | `bbt_measured~actual`, `cause~power`, `map_gap~big+small` | Preset Daftar site (drilldown, klik grafik, filter legenda, roll-up) |
| `lang` | `id` / `en` | Bahasa (selalu dibawa) |

`page.jsx` membangun link dengan `hrefFor()` dan mengubah state dengan `navigate()`; komponen memakai `<Go to={{view, nop, sel}}>`, yang menghasilkan `<a href>` asli (klik tengah dan salin link berfungsi).

## 5. Internasionalisasi

- `i18n/en.json` dan `i18n/id.json` adalah kamus datar dengan kunci identik (ada tes yang memastikan kesamaan kunci dan bahwa setiap kunci literal yang dipakai di kode benar-benar ada).
- `t(key, vars)` mengisi `{var}`; `tv(prefix, value)` menerjemahkan enumerasi (status, aksi, penyebab, pihak…).
- Format angka mengikuti bahasa (`1.234,5` di ID, `1,234.5` di EN).
- Ekspor CSV dijalankan dengan `withEnglish()`, jadi header dan nilainya tetap bahasa Inggris dengan desimal `.`.
- **Teks engine** (aturan, alasan, bukti, pemicu, dasar penugasan, langkah simulasi, alasan tren…) dihasilkan dalam bahasa Inggris oleh `lib/logic.js` dan diterjemahkan **di UI** oleh `lib/i18n-engine.js` (pola regex berurutan → kunci `eng.*`). Dengan begitu output engine dan CSV identik byte-per-byte di kedua bahasa. Tes `1b` menjalankan setiap string engine dari snapshot melalui pola tersebut dan gagal bila ada potongan yang belum diterjemahkan.

## 6. Keputusan desain utama

| Keputusan | Alasan |
|---|---|
| Rule engine di browser (JS), pipeline hanya menyiapkan bukti | Config what-if langsung menghitung ulang; satu sumber kebenaran untuk UI, ekspor dan tes |
| JSON kolumnar, file detail/periode lazy | ~20 ribu site dimuat cepat; data berat hanya saat dibutuhkan |
| Lapisan site canvas tanpa clustering | Semua titik bisa diklik di zoom AREA; cepat dengan 20 ribu titik |
| Legenda = filter tab; roll-up = jumlah site | Setiap angka di layar bisa ditelusuri ke site; konsistensinya bisa diuji |
| Terjemahan teks engine di frontend | Keputusan dan CSV tidak berubah; tes cakupan mencegah regresi |
| Overlay periode, bukan engine yang sadar periode | Metrik teramati mengikuti periode; keputusan tetap memakai bukti lengkap |

## 7. Mengembangkan PBA

- **Tab baru:** buat komponen di `components/tabs/`, daftarkan di `GROUPS` di `app/page.jsx`, tambahkan kunci `nav.*` ke kedua kamus.
- **Mode peta baru:** tambahkan di `lib/mapmodes.js` (kunci dari yang terburuk, `bad`, `key`, `size`, `hollow`), warna/label/alasan di `components/mapModes.jsx`, kunci i18n `map.mode.*`, `map.size.*`, `map.hollow.*`; masukkan ke `modes` di `MapHero`. Tes roll-up otomatis mencakupnya.
- **Drilldown KPI baru:** tambahkan entri di `DRILLS` (`lib/drill.js`) dan kunci `drill.<id>.title/formula`; panggil `openDrill(id)` dari kartunya.
- **Aturan atau ambang baru:** ubah `lib/logic.js` + YAML; tambahkan tes regresi; pastikan `1b` tetap lulus (tambahkan pola `eng.*` untuk kalimat engine baru).
- **Pindah ke API / Watson:** ganti fetch di `lib/data.js` (dan `loadPeriodFiles` di `lib/period.js`) dengan endpoint yang mengembalikan bentuk JSON yang sama. Lihat [09 §4](09-keterbatasan-roadmap.md#4-integrasi-dengan-watson-php--mysql).
