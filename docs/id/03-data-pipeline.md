# 03 · Data & pipeline

## 1. Alur ujung ke ujung

```text
 File mentah (Excel/CSV/ZIP)        engine/  (Python 3.11+)                          public/data/  (JSON)                 Browser (Next.js)
 ───────────────────────────        ─────────────────────────────────────           ─────────────────────                ─────────────────────
 Dapot ALL Site            ─┐       1 ingestion/load.py   baca menurut pola nama     sites.json   (1 baris / site)       lib/data.js  loadAll()
 Tracking Ticket MBP        │       2 normalization/clean  ID, duplikat, koordinat,  mbps.json    (base camp)             lib/logic.js buildModel()
 New_BBT 2026               ├────►    tiket, kejadian, kelas akses, cocok PIC  ──►   familiarity.json                ──►    satu rule engine →
 BBT Site Details (6 bln)   │       3 analytics/kpi        KPI per site              meta.json    (config, QA, grafik)    semua tab, peta, ekspor
 BBT Export monthly (event) │       4 bbs/survival+model   Kaplan-Meier, estimasi    detail/<nop>.json (drawer, lazy)     lib/period.js (periode)
 Avail RAN harian (6 bln)  ─┘       5 mbp/*                base camp, pencocokan     period/<YYYYMM>.json (lazy)          lib/rollup.js (roll-up)
                                    6 build.py → JSON + cek kewajaran + npm test
                                    7 validate.py → docs/VALIDATION_REPORT.md
```

Pipeline dijalankan **sekali per refresh data** (sekitar 2 menit, ditambah ~30 detik untuk file periode harian). Aplikasi web tidak pernah membaca file mentah.

## 2. File sumber

File dicari menurut **pola nama** di folder mentah (sub-folder boleh). Folder default: `engine/data/raw/`, atau `python build.py --raw "D:\PBA raw"`.

| Pola | File | Grain | Dipakai untuk |
|---|---|---|---|
| `*Dapot*ALL*Site*.xlsx` | Dapot ALL Site TSEL | site | Master (filter AREA1), kelas, NOP, cluster TO, kota/kabupaten, koordinat, flag "Kepulauan", kategori HUB, VIP, aktif |
| `*Tracking*Ticket*MBP*.xlsx` (sheet *MBP Team*, *Tracking Site*) | Tracking Ticket MBP Jan–Jun | base camp; tiket | Base camp dan nama PIC, koordinat; tiket listrik/MBP dengan RC owner, RC 1/RC 2, PIC MBP, RH start/stop, status |
| `*New*BBT*.xlsx` | New_BBT_2026 | site | Tipe baterai, umur, jumlah bank, kuantitas, beban NE (A), kategori HUB |
| `*BBT*Site*Details*.csv` (satu per bulan) | BBT Site Details Jan…Jun | site-bulan | Ringkasan BBT bulanan (median), jumlah "Repetitive" PLN dan total jam PLN-down (cadangan) |
| `*BBT*Export*monthly*.xlsx` | BBT_Exportmonthly_AREA1 | kejadian | Setiap kejadian mains-fail: mulai, clear, NE-down clear, menit backup, flag LOW BATT/NE DOWN (habis) |
| `*Avail*RAN*.zip` **atau** `*.csv` hasil ekstrak (jangan keduanya) | Avail_RAN_BeforeRecon_site_ne_base_AREA1_daily | site-hari | Availability, target, outage dan durasi per penyebab (listrik, transport, RAN, lainnya), NE-detik |

File mentah **rahasia Telkomsel**: tidak pernah di-commit (`engine/data/` ada di `.gitignore`) dan tidak pernah dipublikasikan.

## 3. Pembersihan dan normalisasi

| Langkah | Aturan | Hasil saat ini |
|---|---|---|
| Kunci kanonik | `site_id = upper(trim(Site ID))` di setiap sumber | 100 % tersambung ke master |
| Cakupan | Baris Dapot dengan Area = AREA1 | 20.236 baris → 20.227 site (9 ID duplikat dihapus) |
| Koordinat | Di luar kotak Sumatera → null; dipublikasi sesuai presisi sumber (sampai 6 desimal) | 8 site koordinat salah |
| Base camp | Sheet MBP Team; titik desimal yang hilang diperbaiki; peta penggabungan yang direview `engine/config/basecamp_merge.csv` | 327 → 319 base camp (8 pasangan digabung); setelah digabung 284 aktual, 6 diperbaiki, 29 tanpa lokasi |
| Tiket | Duplikat persis dihapus; tiket batal tidak dihitung sebagai pengerahan; selisih RH hour-meter > 48 jam = outlier | 47.249 → 47.210 baris; RH valid 99,65 % |
| PIC → base camp | EXACT → HIGH (nama dinormalisasi) → MEDIUM (fuzzy ≥ 0,92, NOP sama, unik) → NEEDS REVIEW (tidak dipakai) → UNMATCHED | 97,5 % tiket cocok; nama yang ambigu tidak pernah digabung |
| Kejadian BBT | Duplikat persis dihapus; tanggal dalam periode | 227.538 → 227.155 kejadian; 31,7 % baterai habis |
| Interval PLN | Kejadian digabung per site bila tumpang-tindih/bersentuhan; akhir = mains-fail clear, kalau tidak NE-down clear, kalau tidak mulai + backup | 3.298 kejadian tumpang-tindih digabung → 223.857 interval |
| RAN | NE-detik ÷ jumlah NE (= denum / 86.400), maksimal 86.400 detik per site-hari → **waktu nyata** | 6 bulan, 1 baris per site-hari |
| Kelas akses | Hanya dari "Kepulauan" Dapot + nama kabupaten (tidak pernah dari ETA yang kosong) | daratan 18.311 · tidak diketahui 1.229 · sungai/delta 330 · pulau 286 · terpencil 71 |
| Dependensi | Kategori HUB Site → jumlah site anak (PROXY, pemetaan bisa diubah) | — |
| Ringkasan BBT bulanan | Ditolak bila bertentangan dengan padam yang terbukti sudah dilalui baterai | 1.156 nilai ditolak |

## 4. Agregasi per site

**Setiap sumber diringkas menjadi satu baris per site sebelum digabung**, sehingga penggabungan tidak pernah menggandakan baris. Field utama per site:

- **Identitas:** site_id, nama, kelas, NOP, cluster_to, kota, aktif, VIP, lat/lon + jumlah desimal, flag urban, kelas akses + dasarnya, kategori HUB.
- **Bukti baterai:** tipe, umur, beban, jumlah bank, kuantitas; nilai BBT + bukti + dasarnya; nilai terukur; batas bawah; estimasi rendah/tinggi + keyakinan; jumlah kejadian (total, habis, tersensor, flag flapping); jumlah tiket "Tidak Ada Baterai".
- **Listrik / PLN:** frekuensi dan total jam padam PLN (+ sumber: interval kejadian atau ringkasan bulanan), bulan anomali, jam padam 2025.
- **Availability (RAN, waktu nyata):** availability %, target %, jam, outage dan downtime per penyebab; seri bulanan (jam, outage, listrik) dan total Q1/Q2 untuk tren.
- **Riwayat MBP:** ada di file tiket, MBP utama historis, jumlah pengerahan, jam backup; jumlah akar masalah per kelas penanggung jawab (`rc_*`).

## 5. File output (`public/data/`)

| File | Ukuran* | Dimuat | Isi |
|---|---|---|---|
| `sites.json` | 12 MB | saat mulai | Kolumnar `{cols, rows}`, satu baris per site (field di atas) |
| `mbps.json` | 0,1 MB | saat mulai | Base camp dengan koordinat, status, PIC, asal gabungan, beban kerja |
| `familiarity.json` | 0,5 MB | saat mulai | Seberapa sering tiap MBP melayani tiap site (site × MBP → jumlah) |
| `meta.json` | 0,1 MB | saat mulai | Config efektif, status snapshot dan sumber, penghitung QA, cek kewajaran build, seri bulanan per NOP, analitik BBS (korelasi, kurva KM, uji estimator), pencocokan PIC, duplikat, ID tidak cocok |
| `detail/<nop>.json` | total 19 MB | saat drawer site dibuka | Per site: angka bulanan, tiket terbaru, kejadian baterai |
| `period/<YYYYMM>.json` | total 29 MB (≈1 MB terkompresi per bulan) | hanya bila periode selain H1 penuh dipilih | Seri site-hari sparse: downtime RAN per penyebab (detik), hari tersedia, interval PLN, PLN ringkasan bulanan, alarm mains-fail, tiket (hari, kelas akar masalah, pengerahan, jam RH) |

\* tanpa kompresi; Vercel menyajikannya terkompresi.

## 6. Tingkat bukti

| Tag | Arti | Contoh |
|---|---|---|
| **ACTUAL** | Teramati langsung di site | BBT = median Kaplan-Meier kejadian site sendiri; koordinat base camp sesuai catatan; akar masalah di tiket |
| **DERIVED** | Dihitung dari data teramati | Ringkasan BBT bulanan (bila didukung); interval PLN; availability waktu nyata; jam backup MBP |
| **ESTIMATED** | Dimodelkan | BBT dari Kaplan-Meier site sejenis; waktu tempuh; penempatan |
| **PROXY** | Pengganti data yang tidak ada | Dependensi (kategori HUB); desain 120 mnt; desain dari asumsi Ah per bank |
| **UNAVAILABLE** | Tidak ada data | Ditampilkan "—", tidak pernah 0 |
| *TICKET* / *DERIVED-UNVERIFIED* | Status baterai dari tiket "Tidak Ada Baterai" / nilai turunan yang tidak didukung bukti site | lihat [04 §3](04-metodologi.md#3-status-baterai-dan-urutan-bukti) |

## 7. Gerbang kualitas

1. **Cek kewajaran build** (`build.py`): n korelasi = field yang diekspor; jumlah bank baterai diekspor; base camp yang digabung sudah dihapus dan tiket dipetakan ulang; ID base camp unik; seri listrik bulanan lengkap 6 bulan dan tidak pernah melebihi jam dalam sebulan; koordinat mempertahankan presisinya.
2. **Tes aturan JS** (`npm test`, 47 tes) dijalankan otomatis di akhir `build.py`; build gagal bila ada tes yang gagal (lewati hanya dengan `PBA_SKIP_JS_TESTS=1`).
3. **Validasi** (`validate.py`, 25 cek dalam kelompok data / kewajaran / analitik / keputusan) → `docs/VALIDATION_REPORT.md`.

## 8. Cara membangun ulang data

```powershell
cd C:\PBA\pba-dashboard
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r engine\requirements.txt
cd engine
python build.py --raw "D:\PBA raw"      # ~2–3 menit → ..\public\data\*.json (+ menjalankan npm test)
python validate.py                      # 25 cek → ..\docs\VALIDATION_REPORT.md
```

Environment variable opsional (mempercepat build berulang saat pengembangan):

| Variable | Efek |
|---|---|
| `PBA_RAW_CACHE=C:\tmp\raw.pkl` | Cache file mentah yang sudah diparse (dipakai ulang bila ada — hapus bila file mentah berubah) |
| `PBA_DAILY_CACHE=C:\tmp\daily.pkl` | Cache pembacaan RAN harian untuk file periode |
| `PBA_SKIP_JS_TESTS=1` | Tidak menjalankan `npm test` di akhir (bukan untuk build produksi) |

Setelah build ulang, commit/unggah file `public/data/` yang berubah; Vercel otomatis deploy ulang (lihat [07](07-deploy-operasional.md)).

## 9. Field tambahan v3.6
- Site: `fixed_genset` (ACTIVE / OFF / NONE) + `fixed_genset_basis`, `genset_kva`, `kecamatan`, `desa` (Dapot Subdistrict / Village), `battery_brand`, `tk_plnoff_n`, `tk_plnoff_visit_n`, `tk_plnoff_rh_h` (tiket PLN off, yang punya check-in, jam RH; canceled dikecualikan).
- Base camp: `prod_tickets`, `prod_plnoff`, `prod_visits`, `prod_sites`, `prod_rh_total_h`, `prod_rh_mean_h`, `prod_rh_median_h`, `prod_resp_median_h`.
- `meta.mbp.concurrency`: per NOP jumlah job, maks, p99, p95, p90, rata-rata, median jam job.

## 10. Output dan input tambahan v3.7
- `public/data/tickets.json` (≈ 2,4 MB): job MBP — `site, mbp, occ, to, arr, job, out, rc` (menit sejak 2026-01-01; lihat 04 §17).
- Input opsional `engine/data/site_dependency.csv` (di-.gitignore): `site_id, dependency_role, child_sites` dari NOP officer (template di MBP › Prioritas dispatch) → field site `dep_children_actual`, `dep_role` (dependensi ACTUAL).
