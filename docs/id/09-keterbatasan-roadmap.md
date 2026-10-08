# 09 · Keterbatasan, asumsi & roadmap

## 1. Keterbatasan dan asumsi yang diketahui

| Item | Status | Dampak | Cara menyelesaikan |
|---|---|---|---|
| **Dependensi** (site anak per hub) | PROXY dari kategori "HUB Site" | Pentingnya hub hanya perkiraan | Ekspor topologi transmisi (hub → site anak) |
| **Desain BBT** | Desain manajemen 120 mnt (PROXY); desain per site memakai **asumsi 100 Ah per bank** | Desain terhitung belum divalidasi (terukur ≈ 25 % darinya) | Tambahkan Ah/model per bank baterai di New_BBT |
| **Inspeksi baterai** | Belum ada di data | Level bukti 2 kosong | Masukkan hasil uji kapasitas / inspeksi |
| **Waktu tempuh** | Model kecepatan (garis lurus × 1,35, kecepatan per area, pengali), bukan routing | ETA indikatif; pulau tidak punya ETA | Kalibrasi dari perjalanan telemetri atau API routing |
| **Ketersediaan MBP** | Tidak diketahui real-time; simulasi membiarkan pengguna menandai MBP sibuk | Rekomendasi mengasumsikan semua MBP bebas | Telemetri MBP (FMC920) |
| **Atribusi penyebab** | Proporsional terhadap jam | Menunjukkan kebersamaan, bukan sebab-akibat | Akar masalah di tingkat tiket untuk setiap outage |
| **Penanggung jawab** | Hanya bila tiket punya akar masalah; selain itu disimpulkan/tidak diketahui | Porsi besar disimpulkan (dipicu PLN, belum terkonfirmasi) | Akar masalah wajib diisi di tiket |
| **Sumber yang hanya bulanan** | Ringkasan BBT bulanan; PLN bulanan untuk site tanpa kejadian | Dibagi proporsional di dalam bulan pada filter periode (ditandai) | Data tingkat kejadian untuk semua site |
| **Rentang filter periode** | Dibuat untuk Jan–Jun 2026 | Periode baru butuh daftar tahun/bulan di `lib/period.js` | Buat rentang mengikuti data |
| **Korelasi** | Sebagian mekanis (sensor) | Tidak dipakai untuk mengestimasi BBT | — (catatan terdokumentasi) |
| **Cakupan** | Snapshot AREA1, H1-2026; bukan live | Keputusan mencerminkan snapshot | Pipeline terjadwal / API |
| **Tata kelola config** | What-if hanya di browser (DEMO) | Tidak ada jejak persetujuan di server | Mode operasional (di bawah) |

## 2. Mode demo vs operasional

PBA saat ini berjalan dalam mode **DEMO**. Mode **operasional** akan menambahkan: satu konfigurasi yang disetujui di server, peran pengguna, jejak audit/versi perubahan konfigurasi dan tanggal "berlaku mulai", refresh data terjadwal, serta login lewat identity provider perusahaan, bukan password basic-auth bersama.

## 3. Telemetri MBP (Teltonika FMC920)

Baru desain (lihat [desain telemetri MBP](../MBP_TELEMETRY_DESIGN.md)): lokasi GPS dan MBP-on/off untuk setiap MBP lewat 4G, disimpan sebagai titik mentah dan sesi turunan (berangkat, tiba, on, off, site). Manfaat: kolom 13–14 menjadi ACTUAL, ketersediaan MBP real-time menggantikan asumsi bahwa semua MBP bebas, dan waktu tempuh dikalibrasi dari perjalanan nyata. Roll-out: pilot 10–20 MBP di satu NOP selama 4–6 minggu, bandingkan dengan tiket, lalu perluas.

## 4. Integrasi dengan Watson (PHP / MySQL)

Bagian interaktif (peta, filter legenda, drilldown, periode, roll-up) berjalan di browser dan tetap JavaScript di semua opsi; yang bisa dipindah ke PHP adalah backend, data, login dan rule engine.

| Opsi | Isi | Perkiraan effort | Catatan |
|---|---|---|---|
| **A. Tempel di Watson** (disarankan dulu) | Watson (PHP/MySQL) menyediakan login, peran dan endpoint API yang mengembalikan bentuk JSON yang sama; frontend PBA hasil build dipasang di halaman Watson; pipeline Python menulis ke MySQL, bukan file JSON | 1–2 minggu | Semua fitur dan tes tetap; data tidak lagi di repo/Vercel |
| **B. Port rule engine ke PHP** | A + `lib/logic.js` ditulis ulang di PHP agar modul Watson lain (misal work order) bisa memakai keputusannya; hasil dihitung sekali dan disimpan di MySQL | + 2–3 minggu | Wajib golden test: output PHP identik dengan JS di snapshot; hindari dua engine berjalan bersamaan |
| **C. Tulis ulang total** | Halaman PHP yang di-render server, JS hanya untuk peta/grafik | 1,5–2,5 bulan | Biaya dan risiko tertinggi; fitur dibangun ulang dari nol |

Patokan: **hanya boleh ada satu rule engine yang memutuskan**. Bila engine pindah ke PHP, frontend sebaiknya hanya membaca hasilnya.

## 5. Usulan roadmap

1. **Data:** Ah per bank baterai, topologi hub, akar masalah wajib di tiket, hasil inspeksi.
2. **Operasional:** tempel di Watson (opsi A), refresh terjadwal, SSO dan peran.
3. **Pilot telemetri** di satu NOP; masukkan lokasi/ketersediaan MBP yang ACTUAL.
4. **Tata kelola:** konfigurasi yang disetujui di server beserta riwayatnya.
5. **Umpan balik:** catat aksi yang dilakukan (diganti, diuji, MBP dikirim) dan ukur dampaknya terhadap availability di periode berikutnya.
