# 10 · Glosarium (ID ↔ EN)

| Istilah (ID) | Term (EN) | Arti |
|---|---|---|
| AREA1 | AREA1 | Area Telkomsel dalam cakupan (Sumatera), 17 NOP |
| NOP | NOP | Network Operation & Productivity — unit operasi regional |
| Cluster (TO) | Cluster (TO) | Territory Operation di dalam NOP; 37 di AREA1 |
| ENOM | ENOM | Kontrak managed service untuk operasi & pemeliharaan jaringan |
| PLN | PLN | Perusahaan listrik negara; padam PLN = listrik utama mati |
| MBP | MBP | Mobile Backup Power — genset portabel yang dikirim ke site saat PLN padam |
| Base camp | Base camp | Lokasi tim MBP (PIC); titik berangkat MBP |
| PIC | PIC | Penanggung jawab tim MBP (nama di tiket) |
| BBS | BBS | Battery Backup System di site |
| BBT | BBT | Battery Backup Time — berapa menit baterai menahan site setelah PLN padam |
| BBT desain | BBT design | Waktu backup yang diharapkan (desain manajemen 120 mnt) |
| Kejadian mains-fail | Mains-fail event | Padam PLN yang terlihat dari alarm site; satu kali uji baterai |
| Kejadian habis / tersensor | Exhausted / censored event | Baterai habis sebelum PLN kembali / PLN kembali lebih dulu |
| Kaplan-Meier (KM) | Kaplan-Meier (KM) | Metode survival yang memakai kejadian tersensor dengan benar; median = BBT |
| Batas bawah | Lower bound | Padam terlama yang terbukti sudah dilalui baterai |
| Mati / Kritis / Menurun / Di bawah desain / Sesuai desain | Dead / Critical / Degraded / Below design / Meets design | Status baterai vs desain (≤ 5 mnt / < 25 % / < 50 % / < 100 % / ≥ 100 %) |
| Availability | Availability | 1 − outage ÷ jam (RAN, waktu nyata) |
| Target | Target | Target availability RAN site |
| Gap (pp) | Gap (pp) | Availability − target dalam poin persentase |
| Waktu nyata | Wall-clock | Waktu sebenarnya per site (NE-detik ÷ jumlah NE) |
| Downtime listrik | Power downtime | Downtime RAN yang disebabkan listrik |
| Durasi padam PLN | PLN outage duration | Jam padam PLN yang tercatat (tidak sama dengan downtime site) |
| Bulan mati / dark site | Dark month / dark site | ≥ 8 jam downtime listrik dalam sebulan / ≥ 2 bulan seperti itu dari 6 |
| Off-air | Off-air | Dugaan off-air, dibongkar atau masalah data; default dikeluarkan |
| Penanggung jawab | Responsible party | Penyebab downtime listrik: PLN, internal, baterai, genset, vendor, operasional |
| OBSERVED / INFERRED / UNKNOWN | OBSERVED / INFERRED / UNKNOWN | Penanggung jawab dari akar masalah tiket / hanya dari alarm / tidak ada catatan |
| Radius cakupan | Coverage radius | Jarak garis lurus maksimal dari base camp (120 km) |
| ETA | ETA | Perkiraan waktu tempuh MBP (model, bukan routing) |
| Tiba sebelum BBT habis | Arrives before BBT | ETA ≤ BBT efektif — syarat wajib |
| Gap cakupan MBP | Coverage gap | Baterai OK tetapi tidak ada MBP yang bisa tiba tepat waktu (atau tidak ada dalam radius) |
| MBP-P1…P4 | MBP-P1…P4 | Level prioritas respons |
| BBS-P1…P4, Batch 1–4 | BBS-P1…P4, Batch 1–4 | Prioritas aksi baterai dan batch pelaksanaan |
| Batas bawah prioritas | Severity floor | Mati/Kritis terukur tidak pernah di bawah P2 |
| Base camp kurang terlayani | Under-served base camp | ≥ 2 dari 4 kriteria (banyak P1/P2, banyak mati sebelum MBP, ETA panjang, beban kerja tinggi) |
| Penempatan / jumlah armada | Placement / fleet size | Di mana menambah atau memindahkan MBP untuk mencapai porsi target |
| Peta utama | Hero map | Peta di bagian atas setiap menu |
| Filter legenda | Legend filter | Menyembunyikan kategori legenda memfilter seluruh tab |
| Roll-up | Roll-up | Agregasi site → cluster → NOP (jumlah site) |
| Rincian | Drilldown | Panel total KPI → rincian bukti |
| Cakupan | Scope | Site yang disertakan oleh bar filter |
| Portofolio | Portfolio | Seluruh AREA1, tidak terpengaruh filter |
| H1 penuh | Full H1 | Memakai seluruh snapshot apa pun filter periodenya |
| what-if | what-if | Perubahan config yang hanya tersimpan di browser pengguna |

## Tag bukti

| Tag | Arti (ID) | Meaning (EN) |
|---|---|---|
| ACTUAL | Teramati langsung di site | Observed at the site |
| DERIVED | Dihitung dari data teramati | Calculated from observed data |
| ESTIMATED | Dimodelkan | Modelled |
| PROXY | Pengganti data yang tidak ada | Stand-in for missing data |
| UNAVAILABLE | Tidak ada data ("—", bukan 0) | No data ("—", never 0) |
| TICKET | Status dari tiket "Tidak Ada Baterai" | Status from a "Tidak Ada Baterai" ticket |
| DERIVED-UNVERIFIED | Nilai turunan yang tidak didukung bukti site | Derived value not supported by site evidence |
