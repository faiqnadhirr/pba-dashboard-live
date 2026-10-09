# 08 · Pengujian & QA

PBA punya tiga gerbang otomatis dan satu checklist manual. Semua tes otomatis berjalan pada **snapshot data nyata**, jadi yang diuji adalah keputusan yang benar-benar dilihat pengguna.

```text
python engine/build.py     → cek kewajaran build → npm test (38) → build gagal bila ada error
python engine/validate.py  → 25 cek              → docs/VALIDATION_REPORT.md
npm test                   → 48 tes regresi pada lib/logic.js dan helper UI
```

## 1. Tes regresi (`tests/logic.test.mjs`, `npm test`)

| # | Tes | Yang dijaga |
|---|---|---|
| 1 | helpers | peringkat persentil, proxy dependensi, skala status |
| 2 | travel | pulau tidak punya ETA; sungai lebih lambat dari daratan; akses tidak pernah disimpulkan dari ETA kosong |
| 3 | A · NTB020 | MBP yang ditugaskan tiba sebelum BBT (MBP historis tidak dipaksakan) |
| 4 | B · PMR107 | penugasan hanya dalam radius, di mana pun |
| 5 | C · AGR132 | BBT terukur mengalahkan tiket tanpa baterai; konflik ditampilkan; tidak ada pengadaan |
| 6 | D | P1/P2 tidak pernah "Pantau"; BBT ESTIMASI tidak pernah menghasilkan ganti/pengadaan/upgrade |
| 7 | E | cakupan per NOP membagi portofolio (jumlah, downtime, availability) |
| 8 | F | peta punya penanda site/MBP yang berbeda dan toggle lapisan yang independen |
| 9 | G | radius lebih kecil → site tercakup lebih sedikit, tidak pernah ditugaskan di luarnya |
| 10 | H | availability · target · gap konsisten di tingkat site dan agregat |
| 11 | I | penyebab berjumlah sama dengan downtime teramati; tidak diketahui ≥ 0; tumpang-tindih dikecilkan, bukan dikarang |
| 12 | J | tren cluster = Q2 vs Q1 |
| 13 | K | Top 15: komponen berjumlah sama dengan skor, pemicu disebut |
| 14 | Simulasi | MBP terpilih dalam radius; yang layak dulu; hasil terklasifikasi |
| 15 | A1 | tren: availability sinyal utama, porsi dark sinyal kedua, berlawanan → Campuran |
| 16 | A2 | dark site didefinisikan per bulan; porsi dark realistis |
| 17 | A3 | tidak ada baris yang statusnya bertentangan dengan dasar BBT yang ditampilkan |
| 18 | A4 | BBT turunan nol tanpa dukungan: tanpa batas bawah, Inspeksi & verifikasi, tidak masuk BBS-P1 |
| 19 | A5 | site off-air ditandai dan dikeluarkan dari cakupan default |
| 20 | A6 | jumlah bank baterai diekspor (Kualitas data dan korelasi memakai field yang sama) |
| 21 | B1 | desain per site bila jumlah bank diketahui; cadangan kelas hanya bila kosong |
| 22 | B2 | jarak dan ETA terisi untuk site berkoordinat (MBP terdekat walau di luar radius) |
| 23 | B3 | peta penggabungan base camp diterapkan |
| 24 | D1 | penempatan: marginal gain menurun, site anchor nyata, target dipatuhi |
| 25 | i18n | kamus EN/ID punya kunci yang sama; setiap kunci literal yang dipakai ada |
| 26 | 3b | data PLN / riwayat MBP yang kosong bukan nol: peringkat netral, ditandai |
| 27 | 3a | kolom 7 = desain yang dipakai kriteria; desain terhitung terpisah |
| 28 | 3e | segmen rincian cakupan berjumlah sama dengan cakupan |
| 29 | 3f | kandidat relokasi kumulatif dan dibatasi |
| 30 | 4 | "Alasan" simulasi memakai menit mati yang sama dengan ekspektasi downtime |
| 31 | 4 | hash config stabil dan tidak bergantung urutan kunci |
| 32 | 1 | navigasi: 4 grup, halaman awal = Ringkasan › Kesehatan, view di URL |
| 33 | 1a | "Tidak perlu aksi" dengan gap cakupan MBP diberi label gap cakupan (TBH048) |
| 34 | 1b | setiap string engine di snapshot tercakup pola bahasa Indonesia |
| 35 | 2a | total drilldown = filter Daftar site; ≤ 5 segmen; per NOP diurutkan menurut porsi "tidak ada data" |
| 36 | v3.4 periode | H1 dari file harian = snapshot; Q1 + Q2 = H1; hari berjumlah sama dengan bulan; keputusan tidak berubah |
| 37 | v3.4 legenda | filter legenda peta = filter Daftar site |
| 38 | v3.5 roll-up | untuk setiap mode peta, NOP = Σ cluster = Σ site; site pemicu adalah site bermasalah NOP itu |
| 39 | v3.6 genset tetap | site genset tidak pernah butuh MBP, bukan target penempatan |
| 40 | v3.6 gap BBT | rasio = terukur ÷ desain hanya untuk baterai terukur dengan desain terhitung |
| 41 | v3.6 target respons | jangkauan sekarang = site dengan ETA tercepat ≤ 30 mnt; lokasi baru = site kecamatan; tiap langkah menambah jangkauan |
| 42 | v3.6 center of gravity | rekomendasi = site kecamatan aktif nyata; tidak pernah lebih buruk pada jangkauan berbobot |
| 43 | v3.6 ekspor | persentil konkurensi berurutan; hitungan produktivitas konsisten |
| 44 | v3.7 performa MBP | setiap job dihitung sekali; kelas valid; tepat waktu hanya job PLN off; jumlah per NOP |
| 45 | v3.7 backtest | replay mencakup setiap job; pindah ke titik yang sama tidak mengubah apa pun; kandidat berurutan, filter cluster sama |
| 46 | v3.7 dispatch | yang bisa diselamatkan dulu, lalu skor; audit hanya saat ada job lain menunggu |
| 47 | v3.7 BBS | jenis aksi mencakup setiap aksi; Kritis baterai muda → cek setting (R6c) |
| 48 | v3.7 utilisasi ideal | kebutuhan dari histogram durasi (dibagi linear di BBT); serapan = job PLN off wilayah ÷ kebutuhan; rasio AREA wajar |

## 2. Cek validasi (`engine/validate.py`)

25 cek dalam empat kelompok, ditulis ke `docs/VALIDATION_REPORT.md`:
- **Data (6):** satu baris per site; tidak ada ID kosong; tanggal kejadian dalam periode; RAN mencakup 6 bulan, site-bulan unik; ID tidak cocok dilaporkan; koordinat MBP dalam kotak Sumatera.
- **Kewajaran (8):** downtime listrik/transport RAN ≤ jam dalam sebulan; availability 0–100 %; interval PLN hasil gabung tidak tumpang-tindih; jam PLN ≤ jam periode; BBT dalam 0–720 mnt; kategori penyebab tidak negatif; jam Q1 + Q2 ≈ total.
- **Analitik (4):** total kejadian, pengerahan MBP dan jam backup tidak berubah; estimator KM lebih tidak bias daripada median naif.
- **Keputusan (7):** kelas akses hanya dari Dapot; pencocokan PIC yang ragu tidak digabung; estimasi tidak pernah dilabeli ACTUAL/DERIVED dan sebaliknya; estimasi punya keyakinan dan metode; estimasi ≥ batas bawah yang sudah dilalui; pulau tanpa ETA darat.

## 3. Cek kewajaran build (`engine/build.py`)

n korelasi = field yang diekspor · jumlah bank baterai diekspor · base camp gabungan dihapus · tiket dipetakan ulang · ID base camp unik · seri listrik bulanan lengkap 6 bulan · downtime listrik bulanan ≤ jam dalam sebulan · koordinat > 3 desimal bila sumbernya punya. Ditampilkan di Kualitas data.

## 4. Checklist QA manual (sebelum membagikan versi baru)

1. Buka Ringkasan › Kesehatan dalam **ID** dan **EN**; tidak ada kalimat bahasa Inggris yang belum diterjemahkan di ID (kecuali istilah seperti "dark site", "mains-fail", tag bukti).
2. Di lebar **1366 px**: tidak ada scroll horizontal halaman; kolom Aksi di Daftar site terlihat.
3. Klik satu titik di setiap peta utama di zoom AREA → kartu site dengan "Kenapa warna ini".
4. Ganti ke level **NOP**, klik gelembung → panel; angka di kalimat cocok dengan bar kategori; buka satu cluster dan satu site.
5. Sembunyikan satu kategori legenda → chip muncul, KPI berubah, "Lihat N site" membuka Daftar site dengan jumlah yang sama.
6. Klik KPI ↗ → rincian; jumlah "Lihat N site" = jumlah baris daftar.
7. Periode: Bulanan ◀ ▶, Harian, Custom; Tren/Simulasi menampilkan catatan "tidak mengikuti periode"; badge *H1 penuh* muncul.
8. Ekspor CSV dari Daftar site dan daftar aksi BBS: header bahasa Inggris, kolom `coverage_gap` ada.
9. Salin URL ke jendela baru → tampilan, filter, periode dan bahasa sama.
10. Di Vercel: prompt login muncul di jendela Incognito.
