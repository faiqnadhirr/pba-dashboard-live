# 01 · Gambaran umum

## 1. Tujuan

PBA (Power Backup Analytic) mengubah data operasional enam bulan — master site, availability RAN, kejadian baterai BBT, padam PLN, tiket MBP — menjadi **keputusan yang bisa dijelaskan** untuk backup daya di Telkomsel AREA1:

- **Respons MBP**: site mana yang butuh Mobile Backup Power saat PLN padam, base camp mana yang mengirim, dan apakah MBP bisa tiba sebelum baterai site habis.
- **Armada MBP**: berapa MBP yang dibutuhkan dan di mana menempatkan (atau memindahkan) MBP supaya sebagian besar site prioritas tinggi bisa dijangkau tepat waktu.
- **Daftar aksi BBS**: baterai mana yang perlu diganti, di-upgrade, diuji kapasitas atau diverifikasi, dalam batch prioritas.
- **Kesehatan & akuntabilitas**: di mana availability di bawah target, penyebab apa (listrik, transport, RAN, lainnya) yang mendorong gap, dan siapa penanggung jawab downtime listrik (PLN, internal, baterai, genset, vendor, operasional).

PBA adalah **pendukung keputusan**, bukan dispatcher otomatis. Setiap rekomendasi menampilkan bukti dan aturannya supaya engineer NOP bisa memverifikasi.

## 2. Pengguna

| Pengguna | Penggunaan umum |
|---|---|
| **NOP Regional** (pengguna utama) | Review harian/mingguan NOP: site bermasalah, gap cakupan MBP, batch baterai; telusur dari NOP ke cluster ke site |
| **Manajemen area** | Tampilan portofolio lintas NOP; justifikasi anggaran baterai atau MBP tambahan; bandingkan periode |
| **Analis** | Validasi data, uji ambang (what-if), ekspor daftar, siapkan laporan |
| **Engineering ENOM / Triple-E** | Merawat pipeline, deploy, mengembangkan ke Watson |

Tampilan dirancang untuk layar desktop (berfungsi mulai lebar 1366 px). Tidak ada tampilan mobile.

## 3. Cakupan snapshot saat ini

| Item | Nilai |
|---|---|
| Area | AREA1 (Sumatera) — 17 NOP, 37 cluster (TO) |
| Periode | 1 Jan – 30 Jun 2026 (H1-2026) |
| Site (master Dapot) | 20.227; **19.771** di cakupan default (aktif, tidak ditandai off-air); 180 ditandai off-air |
| Base camp MBP | 319 setelah penggabungan 8 pasangan duplikat yang sudah direview (284 berkoordinat aktual, 6 diperbaiki, 29 tanpa lokasi) |
| Kejadian baterai BBT | 227.155 (setelah dedup) → 223.857 interval padam PLN setelah digabung |
| Tiket MBP / listrik | 47.210 baris bersih; 97,5 % cocok ke base camp |
| Availability RAN | harian, per site, 6 bulan (972.565 site-hari dengan downtime) |

## 4. Empat menu dan pertanyaan yang dijawab

| Menu | Tab | Pertanyaan |
|---|---|---|
| **Ringkasan** | Kesehatan · Akuntabilitas · Dampak · Tren | Di mana availability kurang dan kenapa? Siapa penyebab downtime listrik? Cluster mana paling terdampak, dan mana yang memburuk? |
| **MBP** | Cakupan & peta · Daftar site · Simulasi · Penempatan & jumlah armada · Pilot telemetri | Bisakah MBP mencapai tiap site sebelum baterai habis? Apa yang terjadi di skenario padam? Berapa MBP dibutuhkan dan di mana? |
| **BBS** | Kriteria masalah & aksi · Estimasi BBT · Korelasi | Baterai mana dikerjakan dulu dan bagaimana? Bagaimana BBT diestimasi untuk site yang tidak terukur? Bagaimana hubungan BBT dengan padam PLN? |
| **Data & Config** | Kualitas data · Config | Seberapa lengkap dan andal datanya? Ambang apa yang menentukan keputusan? |

Setiap menu dibuka dengan **peta utama (hero map)**: semua site sebagai titik yang bisa diklik, chip legenda yang berfungsi sebagai filter untuk seluruh tab, dan tombol level **Site · Cluster · NOP** yang gelembungnya adalah jumlah site-nya.

## 5. Prinsip desain

1. **Site dulu, baru dijumlahkan.** Setiap KPI, grafik dan gelembung peta adalah hitungan atau jumlah site. Angka NOP selalu bisa dibuka ke cluster dan site-nya.
2. **Bukti selalu terlihat.** Setiap nilai punya tag — ACTUAL, DERIVED, ESTIMATED, PROXY, UNAVAILABLE — dan estimasi tidak pernah memicu penggantian baterai.
3. **Kosong bukan nol.** Data yang tidak ada ditampilkan "—", mendapat peringkat netral di skor, dan didaftar di Kualitas data.
4. **Satu rule engine.** Semua status, prioritas dan aksi diputuskan di satu tempat (`lib/logic.js`), sehingga semua tab, ekspor dan tes selalu sama.
5. **Syarat wajib tetap wajib.** Radius MBP dan "tiba sebelum baterai habis" tidak pernah dilonggarkan diam-diam.
6. **Jelaskan, bukan sekadar skor.** Setiap rekomendasi menampilkan Metrik → Nilai → Ambang → Aturan → Aksi, plus "Alasan" dalam bahasa sederhana.
7. **Dua bahasa.** Seluruh tampilan tersedia dalam bahasa Indonesia (default) dan Inggris; ekspor CSV tetap bahasa Inggris.

## 6. Cara kerja (satu paragraf)

Pipeline Python (`engine/`) membaca file mentah, membersihkannya, meringkas setiap sumber menjadi **satu baris per site**, mengestimasi BBT dengan analisis survival Kaplan-Meier, lalu menulis JSON ringkas ke `public/data/`. Aplikasi web Next.js memuat JSON itu dan menghitung sisanya **di browser** dengan satu rule engine: status baterai, prioritas, penugasan MBP, aturan aksi, simulasi, penempatan, drilldown, filter periode dan roll-up. Mengubah ambang di tab Config langsung menghitung ulang semua tab (what-if, tersimpan di browser penggunanya). Lihat [06 · Arsitektur](06-arsitektur.md).
