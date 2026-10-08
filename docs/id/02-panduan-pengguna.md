# 02 · Panduan pengguna

Panduan ini membahas setiap layar. Tampilan default berbahasa Indonesia; ganti dengan **EN | ID** di kanan atas. Nama tab ditulis *Indonesia (Inggris)*.

## 1. Tata letak layar

```text
┌ PBA — Power Backup Analytic │ Snapshot 2026-01-01 → 2026-06-30 │ MODE DEMO │ cfg hash │ Ringkasan · MBP · BBS · Data & Config │ refresh │ EN|ID ┐
├ sub-tab menu aktif ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
├ NOP ▾ │ chip Kelas │ ☐ + non-aktif │ ☐ + off-air (180) │                                  Cakupan: 19.771 site · Semua NOP │ Reset filter ┤
├ PERIODE ⓘ  Harian · Mingguan · Bulanan · Kuartal · H1 penuh · Custom   ◀ Mei 2026 ▶        BBT, prioritas & aksi = H1 penuh              ┤
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  [chip filter legenda, bila aktif]
  Kartu KPI (klik ↗ untuk rincian)
  Peta utama (Site · Cluster · NOP)
  Grafik dan tabel tab
```

- **Badge header.** *Snapshot* = periode data. *MODE DEMO* = perubahan config hanya di browser Anda. *cfg xxxxxx* = hash konfigurasi aktif (merah dengan ✎ bila Anda mengubahnya), supaya dua orang bisa memastikan melihat aturan yang sama. *Refresh terakhir* = kapan data dibangun (data adalah snapshot, bukan "live").
- **Bar filter (menempel di atas).** Berlaku untuk semua tab:
  - **NOP** — satu NOP atau semua. Angka dalam kurung = jumlah site dalam cakupan.
  - **Kelas** — Diamond, Platinum, Gold, Silver, Bronze (bisa pilih beberapa).
  - **+ non-aktif** — sertakan site yang tidak aktif di Dapot.
  - **+ off-air** — sertakan site yang ditandai dugaan off-air / dibongkar / masalah data (default tidak disertakan; lihat [04 §13](04-metodologi.md#13-flag-off-air--masalah-data)).
  - **Chip Cakupan** — apa yang sedang disertakan; **Reset filter** menghapus NOP, kelas, toggle, periode dan preset Daftar site.
- **Badge KPI.** *terfilter* = mengikuti bar filter. *portofolio* = seluruh AREA1 tanpa filter (untuk statistik yang butuh banyak site, misalnya korelasi). *H1 penuh* (kuning) = angka ini bergantung pada BBT/prioritas/cakupan yang selalu memakai seluruh snapshot walaupun periode lebih pendek dipilih.

## 2. Filter periode

Tombol: **Harian · Mingguan · Bulanan · Kuartal · H1 penuh · Custom**.

- Harian / Mingguan / Bulanan / Kuartal menampilkan stepper **◀ label ▶** untuk pindah ke periode sebelum/berikutnya. Minggu dihitung Senin–Minggu (minggu pertama 1–4 Jan).
- **Custom** menampilkan dua kolom tanggal (1 Jan – 30 Jun 2026) dan jumlah harinya.
- Periode tersimpan di URL (`?per=…`), jadi link yang dibagikan membuka periode yang sama.

**Yang mengikuti periode:** availability dan gap, downtime per penyebab, downtime listrik, jumlah dan jam padam PLN, alarm mains-fail, penanggung jawab dari tiket listrik, pengerahan MBP dan jam backup.
**Yang selalu H1 penuh:** BBT dan status baterai, prioritas MBP/BBS, rekomendasi aksi, profil dark site, flag off-air, cakupan dan penugasan MBP. Semua ini butuh seluruh bukti; di periode pendek hasilnya akan loncat-loncat. Kartu yang bergantung padanya diberi badge *H1 penuh*.
**Tab yang tidak mengikuti periode** (ada catatan biru): Tren (tetap Q1 vs Q2), Simulasi, Penempatan, Estimasi BBT, Korelasi, Telemetri, Config.

Grafik bulanan di Kesehatan menandai bulan yang dipilih.

## 3. Peta utama (semua menu)

Setiap menu dibuka dengan peta semua site dalam cakupan. Perilakunya sama di mana pun.

| Kontrol | Fungsi |
|---|---|
| **Klik titik** | Membuka kartu angka utama site dan **"Kenapa warna ini"** — alasan satu baris milik site itu sendiri. Bisa di zoom berapa pun (toleransi klik 7 px), tidak perlu zoom dulu. |
| **Arahkan kursor** | Tooltip site dan alasannya. |
| **Warnai site menurut ▾** | Mengganti mode peta tab itu (misal Kesehatan: *Availability vs target* atau *Penyebab utama downtime*). |
| **Chip legenda** | Setiap kategori adalah toggle dengan jumlah site-nya. Kategori yang disembunyikan dicoret. **Menyembunyikan kategori memfilter seluruh tab** (KPI, grafik, tabel) dan memunculkan chip: "N kategori disembunyikan — semua isi tab ini memakai X dari Y site · Lihat X site → · Tampilkan semua". |
| **Ukuran titik** | Besaran untuk mode itu (misal downtime jaringan, downtime listrik, jam padam PLN). |
| **Cincin (titik kosong)** | Kategorinya berdasar bukti yang lebih lemah — misal BBS: status bukan hasil ukur; Akuntabilitas: pihak belum dikonfirmasi tiket; MBP: tidak ada MBP dalam radius. |
| **Site · Cluster · NOP** | Tombol level. Di Cluster/NOP setiap gelembung adalah **pie kategori site-site-nya**; angka di tengah = porsi site bermasalah (Tren menampilkan ▼ ◆ ▲ =). Ukuran gelembung ∝ jumlah site. |
| **Klik gelembung** | Membuka **panel roll-up (justifikasi)** — lihat §6. |
| **"Naik ke: cluster › NOP"** | Di kartu site, membuka panel cluster atau NOP site tersebut. |

Kontrol khusus MBP (Cakupan & peta, Penempatan): checkbox **Cakupan MBP** (menggambar radius di sekitar setiap base camp, dengan label km dari Config), slider **Radius cakupan** (mengubah radius di semua tempat — KPI, tabel, simulasi), toggle lapisan **Base camp MBP** dan **Site**. Klik base camp menampilkan radiusnya, site yang dilayani (garis) dan kartu beban kerjanya.

Mode peta per menu:

| Menu | Mode (warna) | Ukuran | Cincin |
|---|---|---|---|
| Kesehatan | Availability vs target: ≥ 1 pp di bawah / < 1 pp di bawah / memenuhi / tidak ada data RAN · Penyebab utama: listrik / transport / RAN / lainnya / tidak diketahui / tidak ada | downtime jaringan | — |
| Akuntabilitas | Penanggung jawab: PLN, internal, baterai, genset, vendor, operasional, dipicu PLN (disimpulkan), tidak diketahui, tidak ada | downtime listrik | pihak belum dikonfirmasi tiket |
| MBP | Prioritas MBP · Baterai vs desain · MBP tiba sebelum BBT habis? | downtime listrik | tidak ada MBP dalam radius / status bukan hasil ukur |
| BBS | Batch BBS P1–P4 / tidak perlu aksi · Baterai vs desain | jam padam PLN | status bukan hasil ukur |
| Tren | Tren cluster Q1→Q2 (level awal Cluster) | downtime listrik Q2 | — |
| Kualitas data | Input pertama yang kosong: tidak ada RAN → tidak ada bukti baterai → tidak ada data PLN → tidak ada riwayat MBP → lengkap | — | — |

## 4. Menu dan tab

### 4.1 Ringkasan › Kesehatan (Health)
- **KPI:** Availability (dengan target dan jumlah site yang punya data RAN) · Gap vs target (pp) · …karena listrik (pp gap akibat listrik) · Site di bawah target · Downtime jaringan (site-jam) · BBT terukur. Kartu bertanda ↗ membuka rincian (§5).
- **Peta utama:** availability vs target per site, atau penyebab utama.
- **Apa penyebab gap availability?** Target, aktual, gap dan kontribusi tiap penyebab dalam pp; segmen bar bisa diklik → Daftar site diurutkan menurut jam penyebab itu.
- **Availability vs target per bulan** dan **Downtime karena listrik per bulan** (periode terpilih ditandai).
- **Availability vs target per NOP** (per cluster bila satu NOP dipilih): klik baris NOP untuk mengatur filter NOP.

### 4.2 Ringkasan › Akuntabilitas (Accountability)
- **KPI:** Downtime listrik (jam; rincian per dasar bukti) · porsi OBSERVED (akar masalah tiket) · porsi INFERRED (alarm mains-fail, tanpa akar masalah) · porsi UNKNOWN.
- **Peta utama:** penanggung jawab per site.
- **Bar penanggung jawab** (klik pihak → Daftar site pihak itu), tabel jam/porsi/site per pihak dan **aturan pemetaan** (nilai tiket mana masuk pihak mana).
- Tabel **per NOP** dan tabel **Site** (buka baris untuk "Alasan"; buka drawer site).

### 4.3 Ringkasan › Dampak (Impact)
- **Cluster terburuk — site listrik mati:** skor keparahan dari porsi dark site, downtime listrik per site, gap availability dan porsi site MBP-P1/P2 yang mati (bobot ditampilkan). Klik cluster untuk melihat site-nya.
- **Top 15 site terburuk:** setiap komponen (gap availability, downtime listrik, risiko baterai, prioritas, keberulangan, kekritisan) adalah peringkat 0–1; pemicu utama/kedua disebutkan.

### 4.4 Ringkasan › Tren (Trend)
- Perbandingan tetap **Q1 (Jan–Mar) vs Q2 (Apr–Jun)**; tidak mengikuti filter periode.
- Chip jumlah (Memburuk / Campuran / Stabil / Membaik / Data tidak cukup) dan chip "vs jaringan".
- **Peta utama** di level Cluster (▼ ◆ ▲ =). Klik gelembung cluster untuk alasan dan site dengan downtime listrik Q2 terbesar.
- **Grafik dumbbell** 15 cluster dengan perubahan terburuk (titik kosong Q1 → titik penuh Q2); klik cluster untuk memfilter tabel.
- **Tabel cluster**: availability Q1/Q2, perubahan, dark site Q1/Q2, downtime listrik Q1/Q2 dan "Alasan" labelnya.

### 4.5 MBP › Cakupan & peta (Coverage & map)
- **KPI:** Site dalam radius MBP · MBP tiba sebelum BBT habis · Telat & site mati · BBT tidak diketahui · Rata-rata ETA (ditugaskan) · Base camp kurang terlayani (portofolio).
- **Rincian cakupan:** setiap site dihitung sekali di tepat satu dari lima segmen (tiba / telat & mati / telat tanpa bukti mati / BBT tidak diketahui / di luar radius); kelimanya selalu sama dengan cakupan.
- **Peta** dengan lapisan MBP (§3). Filter legenda di sini menggerakkan KPI dan rincian tab ini.
- **Analisis base camp** (pendukung keputusan): site ditugaskan, P1+P2, porsi mati sebelum MBP tiba, rata-rata km/ETA, beban kerja, sinyal (Kurang terlayani / Seimbang / Mungkin berlebih) beserta kriteria yang terpenuhi.
- **Usulan lokasi** MBP tambahan / relokasi (garis lurus, digeser ke site anchor nyata).

### 4.6 MBP › Daftar site (Site list)
- **Ringkas** (default; kolom yang dibutuhkan untuk bertindak, tanpa nomor kolom) dan **Detail (14 kolom)** — 14 kolom wajib manajemen berurutan: 1 Prioritas · 2 Site ID · 3 Nama site · 4 Kelas · 5 Dependensi (PROXY) · 6 NOP · 7 BBT desain · 8 BBT terukur · 9 Padam PLN (frekuensi) · 10 Durasi padam · 11 Jarak ke MBP · 12 Waktu tempuh · 13 Riwayat MBP · 14 Waktu backup MBP. Detail juga bisa menampilkan *desain terhitung (belum divalidasi)*.
- **Filter per MBP yang ditugaskan** (dropdown base camp).
- **Preset dari layar lain** muncul sebagai chip "Filter: … · N site ×" (`?sel=`): segmen drilldown, klik grafik, filter legenda, panel roll-up. Preset penyebab/pihak menambah kolom "Jam (filter)" dan mengurutkan menurut kolom itu.
- Kotak cari, kolom bisa diurutkan, klik baris → drawer site, **Ekspor CSV** (header bahasa Inggris; termasuk `coverage_gap` dan kolom konteks).
- Kolom Aksi menampilkan **"Baterai OK — gap cakupan MBP · Penempatan →"** bila baterai tidak perlu aksi tetapi tidak ada MBP yang bisa tiba tepat waktu (atau tidak ada MBP dalam radius).

### 4.7 MBP › Simulasi (Simulation)
- **Input:** site terdampak (Top-N menurut frekuensi padam PLN / padam area satu cluster TO dengan porsi site-nya / ketik ID site), durasi padam, jam berangkat (lalu lintas), MBP sibuk/tidak tersedia.
- **Skenario alternatif:** B — pindahkan satu base camp ke lokasi site; C — tambah N MBP yang disiagakan; D — durasi padam lain.
- **Perbandingan skenario:** terdampak, butuh MBP, terselamatkan, telat, tidak terlayani (sibuk / tanpa cakupan / pulau), tanpa MBP layak, rata-rata/maks ETA, ekspektasi downtime, **cakupan berbobot prioritas**.
- **Alokasi rekomendasi** (peta dan tabel per skenario) dengan "Alasan" langkah demi langkah tiap penugasan (kandidat dalam radius → bisa tiba sebelum BBT → MBP terpilih → cadangan).

### 4.8 MBP › Penempatan & jumlah armada (Placement & fleet size) — ESTIMASI
- Pilih NOP, **target porsi** site MBP-P1/P2 yang dicapai sebelum BBT, dan **maks MBP tambahan**.
- KPI: site MBP-P1/P2 yang terjangkau darat (+ pulau dan baterai lebih pendek dari mobilisasi, dilaporkan terpisah) · tercapai sekarang · base camp saat ini · MBP tambahan dibutuhkan · jumlah armada · kandidat relokasi.
- Peta lokasi usulan (NEW-n), grafik/tabel **marginal gain** (+1, +2, … MBP), site anchor usulan dengan koordinat, **kandidat relokasi** (diuji kumulatif), dan ringkasan jumlah armada untuk semua NOP.

### 4.9 MBP › Pilot telemetri (Telemetry pilot)
Desain sumber data Teltonika FMC920 (GPS, MBP-on/off), manfaat bagi PBA, rencana roll-out, dan kotak **"coba model data"** yang menurunkan sesi dari CSV di browser (tidak ada yang diunggah). Lihat [desain telemetri MBP](../MBP_TELEMETRY_DESIGN.md).

### 4.10 BBS › Kriteria masalah & aksi (Problem criteria & actions)
- **Catatan kriteria:** desain (120 mnt standar), Kritis < 25 %, Menurun < 50 %, Mati ≤ 5 mnt; urutan bukti; batas bawah prioritas.
- **KPI:** site yang perlu aksi · kartu batch BBS-P1…P4 (rincian per bukti baterai) · inspeksi & verifikasi.
- **Peta utama:** batch BBS atau status baterai; cincin = status bukan hasil ukur; ukuran = jam padam PLN.
- Tabel **Baterai vs desain**: per status, berapa yang terukur / tiket / belum terverifikasi / estimasi / tanpa data. Klik baris atau segmen bar → mengisi chip Status dan Dasar status di daftar aksi.
- **Daftar aksi:** chip prioritas, status, dasar status dan aksi; setiap baris bisa dibuka untuk tabel bukti (Metrik → Nilai → Ambang → Aturan) dan konflik; ekspor CSV.

### 4.11 BBS › Estimasi BBT (BBT estimation)
Cara menghitung BBT (Kaplan-Meier, sensor), **uji pada site yang tidak pernah dilihat model** (MAE, bias, akurasi status per metode) dan **kurva survival baterai** per kelas atau tipe baterai (portofolio).

### 4.12 BBS › Korelasi (Correlation)
Spearman ρ BBT terukur dengan tiap faktor (★ = diminta manajemen) dan tabel korelasi (n, Pearson r, Spearman ρ, kekuatan, ⚠ catatan). Portofolio — tidak terpengaruh filter, karena kelompok kecil hasil filter memberi koefisien yang tidak andal.

### 4.13 Data & Config › Kualitas data (Data quality)
Peta input yang kosong; sumber dan jumlah baris; **bukti per field** (klik field untuk rinciannya); jumlah site tanpa data PLN / riwayat MBP / padam 2025; % nilai kosong per field; ID yang tidak cocok; daftar off-air dengan alasannya; base camp tersembunyi; kelas akses; bukti desain BBT dan kalibrasi; site DERIVED-UNVERIFIED; pencocokan PIC → base camp dan dugaan duplikat; cek kewajaran build.

### 4.14 Data & Config › Config
Default hanya-baca. **Edit (what-if)** membuka pengaturan bobot, ambang prioritas, kriteria BBT, penanganan data kosong, model perjalanan, aturan, desain dari baterai, penempatan, sinyal base camp dan pemetaan dependensi. Perubahan langsung menghitung ulang semua tab dan hanya tersimpan di browser Anda (MODE DEMO). Ekspor/impor JSON untuk berbagi usulan; nilai yang disepakati lalu di-commit ke `engine/config/`. Lihat [05 · Konfigurasi](05-konfigurasi.md).

## 5. Panel rincian (KPI ↗)

Klik kartu KPI bertanda ↗ (Enter/Space juga bisa, Esc menutup) membuka panel samping:
- **Total** dan **rumusnya** dalam kalimat (misal "BBT terukur = ACTUAL (9.201) + DERIVED yang didukung bukti site (1.251) = 10.452 dari 19.771").
- **Donat** komposisi bukti (≤ 5 segmen, jumlah dan %); klik segmen untuk memilihnya.
- **Per NOP** (per cluster bila satu NOP dipilih) bar bertumpuk dengan segmen yang sama, diurutkan menurut porsi "Tidak ada data".
- **Lihat N site →** membuka Daftar site dengan filter yang persis sama (jumlahnya selalu cocok).

Tersedia di: BBT terukur, Site di bawah target, Downtime jaringan, …karena listrik, Downtime listrik, empat kartu cakupan, BBS-P1…P4, dan setiap field di Kualitas data › Bukti per field.

## 6. Panel roll-up (justifikasi) — NOP › cluster › site

Dibuka dengan klik gelembung Cluster/NOP, atau "Naik ke" di kartu site.
- **Navigasi** AREA1 › NOP › cluster (klik untuk naik).
- **Kenapa — dihitung dari site-nya:** misal "59 % site bermasalah (816 dari 1.374 …). Site itu menyumbang 188.353 jam dari total 212.260 jam downtime jaringan di unit ini (89 %)." Setiap angka adalah hitungan atau jumlah site di unit itu.
- **Bar kategori** unit tersebut.
- **Cluster di NOP ini** (terburuk dulu) — klik untuk turun level.
- **Site di baliknya** — 15 site bermasalah teratas, besaran terbesar dulu, masing-masing dengan **alasan satu barisnya sendiri** (misal "availability 71,59 % vs target 98,29 % (−26,70 pp) · penyebab utama listrik 945 jam dari 1.227 jam"). Klik → drawer site.
- **Lihat N site bermasalah →** (Daftar site untuk NOP dan kategori bermasalah) dan **Filter dasbor ke NOP**.

## 7. Drawer site

Dibuka dari baris site, kartu peta atau panel mana pun. Isinya dari atas ke bawah: identitas (kelas, NOP, cluster, kota, akses, VIP, aktif); prioritas MBP dan BBS beserta skor, status baterai dan tag bukti; **rekomendasi aksi** dengan tabel bukti dan pemicu prioritas; availability dan penyebab; penanggung jawab listrik dengan "Alasan"; 14 field wajib; jangkauan MBP (MBP dalam radius, terdekat, bisa tiba, MBP ditugaskan, keyakinan ETA, dasar akses, dasar penugasan); bukti baterai (dasar status, % desain, bulan mati, dasar BBT, kejadian, batas bawah, tipe/umur, beban NE, tiket tanpa baterai, koordinat dan presisinya); grafik bulanan, kejadian baterai dan tiket terbaru. Ada catatan yang menjelaskan beda *Durasi padam PLN (data gangguan PLN)* dan *Listrik (downtime RAN)* bila selisihnya besar. Bila periode selain H1 dipilih, ada catatan angka mana yang mengikuti periode.

## 8. Bahasa, link dan ekspor

- **EN | ID** mengganti semua teks, format angka (1.234,5 vs 1,234.5) dan alasan dari engine. Pilihan diingat; `?lang=en` di link akan menimpanya.
- **Setiap tampilan adalah link.** URL membawa tab, NOP, kelas, toggle, periode, preset Daftar site dan bahasa (`?view=mbp.sitelist&nop=NOP%20BATAM&per=m:202605&sel=…&lang=id`). Salin untuk berbagi persis apa yang Anda lihat; tombol Back/Forward berfungsi.
- **Ekspor CSV** selalu berbahasa Inggris dengan pemisah desimal `.`, supaya bisa dibuka rapi di Excel/Python apa pun bahasa tampilannya.
