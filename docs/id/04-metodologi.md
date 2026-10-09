# 04 · Metodologi & aturan

Semua keputusan di bawah diimplementasikan satu kali, di `lib/logic.js` (rule engine), dan dipakai oleh setiap tab, ekspor, simulasi dan tes. Ambang yang ditulis *miring* bisa diubah (lihat [05](05-konfigurasi.md)); yang ditampilkan adalah nilai default.

## 1. Prinsip

- **Grain site.** Setiap sumber diringkas menjadi satu baris per site sebelum digabung. Agregat (cluster, NOP, AREA) adalah jumlah atau hitungan site.
- **Urutan bukti.** Terukur mengalahkan inspeksi, mengalahkan tiket, mengalahkan turunan, mengalahkan estimasi. Estimasi boleh menaikkan prioritas atau meminta uji, tetapi tidak pernah memicu penggantian atau upgrade.
- **Kosong ≠ nol.** Nilai yang tidak diketahui ditampilkan "—". Di skor berbasis peringkat persentil, site itu mendapat peringkat netral (*`unknown_handling.neutral_rank` = 0,5*) dan ditandai.
- **Syarat wajib.** Radius MBP dan "tiba sebelum baterai habis" diterapkan sebelum preferensi apa pun.
- **Bisa dijelaskan.** Setiap rekomendasi menyimpan Metrik → Nilai → Ambang → Aturan dan "Alasan" sederhana.

## 2. BBT — battery backup time

Setiap kejadian mains-fail adalah uji baterai:
- **Habis** (LOW BATT / NE DOWN sebelum PLN kembali): kejadian itu menunjukkan waktu backup sebenarnya.
- **Tersensor** (PLN kembali lebih dulu — sekitar 68 % kejadian): baterai bertahan *minimal* selama itu.

Menganggap kejadian tersensor sebagai waktu backup akan meremehkan baterai. Karena itu PBA memakai **analisis survival Kaplan-Meier**, yang menangani sensor dengan benar.

Cara memilih nilai BBT sebuah site:

| Urutan | Sumber | Bukti | Aturan |
|---|---|---|---|
| 1 | Median Kaplan-Meier dari **kejadian site sendiri** | ACTUAL | Dipakai bila median benar-benar tercapai (≥ *`bbt.min_exhaustion_events`* = 1 kejadian habis) |
| 2 | Baterai bertahan lebih lama dari sebagian besar padam (median tidak tercapai) | → estimasi | Hanya **batas bawah** yang diketahui (651 site); estimasi tidak boleh di bawah padam terlama yang sudah dilalui |
| 3 | Ringkasan BBT bulanan (median bulan) | DERIVED | Dipakai hanya bila tidak bertentangan dengan kejadian; 1.156 nilai ditolak karena lebih pendek dari padam yang terbukti dilalui baterai |
| 4 | Kaplan-Meier site sejenis | ESTIMATED | Kelompok paling spesifik dengan ≥ 200 kejadian: kelas × tipe baterai × NOP, lalu kelompok yang lebih kasar; *bersyarat* pada apa yang sudah dilalui site; rentang ± MAE; keyakinan Sedang-Rendah (punya batas bawah) atau Rendah |
| 5 | Tidak ada | UNAVAILABLE | Tidak ada kejadian, ringkasan maupun atribut baterai → aksi "Kumpulkan data" |

**DERIVED yang didukung (A4).** Nilai DERIVED Mati/Kritis hanya dipercaya bila ada bukti site: ≥ *2* kejadian habis, **atau** downtime listrik ≥ *1 jam* **dan** ≥ *50 %* dari jam padam PLN. Kalau tidak, nilainya menjadi **DERIVED-UNVERIFIED**: tanpa batas bawah prioritas, severity BBT 0,5, aksi "Inspeksi & verifikasi" (aturan R2b).

**Uji estimator pada site yang tidak pernah dilihat** (belajar dari kejadian Jan–Apr 70 % site, memprediksi median KM Mei–Jun 30 % site lainnya):

| Metode | MAE | Bias | Akurasi status |
|---|---|---|---|
| **KM site sejenis (dipakai)** | 36,9 mnt | −3,9 mnt | 69 % |
| Median naif kejadian habis | 40,2 mnt | −22,6 mnt | 62 % |
| Gradient boosting fitur site | 38,1 mnt | −9,3 mnt | 59 % |
| Riwayat site sendiri Jan–Apr (acuan) | 30,3 mnt | +1,2 mnt | 70 % |

Metode naif sangat bias ke bawah (mengabaikan sensor); estimator KM hampir tidak bias.

**Desain BBT.** Kriteria masalah memakai desain manajemen *120 mnt* (`bbt.criteria_basis = standard`). **Desain terhitung** per site juga dihitung — bank × Ah per bank × DoD yang bisa dipakai ÷ beban NE (A) × 60, dibatasi *30–480 mnt* — tetapi **Ah per bank diasumsikan** (100 Ah; sumber tidak punya field Ah), jadi ditampilkan terpisah sebagai "desain terhitung (belum divalidasi)". Buktinya: DERIVED (bank dan beban diketahui), ESTIMATED (beban kosong → median beban tipe baterai itu), PROXY (tanpa bank → default kelas). Kualitas data menampilkan cek kalibrasi (BBT terukur ≈ 25 % dari desain terhitung → asumsi Ah perlu dikonfirmasi).

## 3. Status baterai dan urutan bukti

Status adalah **skala terpisah dari prioritas**:

| Status | Aturan (desain D = 120 mnt) |
|---|---|
| ✖ Mati | BBT ≤ *5 mnt* (tiket "Tidak Ada Baterai" hanya dihitung kalau `ticket_sets_status: true`; default v3.6: hanya tanda, lihat §16) |
| ▲ Kritis | BBT < *25 %* D |
| ◆ Menurun | BBT < *50 %* D |
| ◐ Di bawah desain | BBT < D |
| ✔ Sesuai desain | BBT ≥ D |
| ? Tidak diketahui | tidak ada bukti |

**Urutan bukti** (yang tertinggi menang): 1 BBT terukur (ACTUAL/DERIVED) · 2 inspeksi tervalidasi (belum ada di data) · 3 bukti tiket ("Tidak Ada Baterai") · 4 inferensi turunan · 5 estimasi. Ketidaksesuaian ditampilkan sebagai konflik (misal AGR132: terukur 27 mnt dan tiket tanpa baterai → tetap Kritis berdasarkan pengukuran, ditandai "verifikasi tiket"). Satu fungsi (`batteryAssessment`) memutuskan status, bukti dan BBT yang ditampilkan, sehingga tidak ada baris yang statusnya bertentangan dengan sel BBT-nya.

## 4. Availability, gap dan penyebab

- Sumber: feed RAN harian yang dikonversi ke **waktu nyata** (NE-detik ÷ jumlah NE, maksimal 24 jam per site-hari).
- **Availability** = 1 − jam outage ÷ (24 jam × hari yang punya data). **Target** = target RAN site. **Gap (pp)** = availability − target (negatif = di bawah target). Ketiganya selalu ditampilkan bersama.
- **Dekomposisi penyebab:** outage = listrik + transport + RAN + lainnya + **tidak diketahui** (jam outage tanpa penyebab). Bila kategori penyebab tumpang-tindih (jumlah > outage), semuanya dikecilkan proporsional dan tidak diketahui = 0 (dinyatakan di tampilan).
- Gap dibagi ke penyebab **sesuai porsi jamnya** — kebersamaan, bukan sebab-akibat.
- **Penyebab utama** site (peta Kesehatan) = penyebab dengan jam terbanyak (tidak diketahui bila jam tanpa penyebab lebih besar).

## 5. Penanggung jawab listrik

Dari tiket listrik/MBP site itu sendiri (RC owner, RC 1, RC 2):

| Pihak | Bukti tiket |
|---|---|
| PLN / utilitas | PLN OFF, EAS, trafo |
| Sistem listrik internal | MCB / KWH / kabel, rectifier |
| Baterai | Tidak Ada Baterai |
| Genset | genset |
| Vendor | TI/TP, Sewa Daya |
| Operasional | token, aktivitas |

- **OBSERVED** — tiket dengan akar masalah: downtime listrik site dibagi sesuai porsi tiket per pihak; mayoritas = pihak utama.
- **INFERRED (dipicu PLN, belum terkonfirmasi)** — ada alarm mains-fail dan downtime listrik, tetapi tidak ada akar masalah di tiket.
- **UNKNOWN** — ada downtime listrik tanpa tiket maupun alarm.
- Baterai lemah atau padam PLN yang panjang **tidak pernah** dipakai sendirian untuk menunjuk pihak yang salah.

## 6. Cakupan MBP, waktu tempuh dan penugasan

**Radius cakupan (syarat wajib).** Site *tercakup* bila minimal satu base camp berlokasi dalam *`mbp.max_radius_km`* = **120 km** (garis lurus). Site yang tidak tercakup tidak pernah ditugaskan. Radius bisa diubah (slider peta atau Config).

**Waktu tempuh (ESTIMASI).**
- Km jalan = km garis lurus × *1,35*. ETA = mobilisasi *15 mnt* + km jalan ÷ kecepatan.
- Kecepatan: kota *25 km/jam*; desa *35 km/jam* bila < 15 km jalan, *45 km/jam* bila lebih.
- Pengali: berangkat di jam sibuk (*7, 8, 16–18*) × *1,4* kota / × *1,15* desa; malam (*22–04*) × *1,2*; kelas akses sungai/delta × *1,5*, terpencil × *2,0*.
- **Site pulau tidak punya ETA darat** (logistik laut, tidak dimodelkan); tabel menampilkan indikasi setara jalan darat (× 3) dengan tanda "akses laut". Kelas akses hanya dari Dapot/kabupaten, tidak pernah dari ETA yang kosong.
- Keyakinan ETA: ESTIMASI · kelas akses tidak diketahui · keyakinan rendah (akses sulit) · UNAVAILABLE (pulau).

**Penugasan (logika sama dengan simulasi).**
1. Kandidat = base camp dalam radius yang punya ETA darat.
2. **Syarat wajib:** hanya yang tiba sebelum BBT efektif (Mati = 0 mnt).
3. Di antara itu: MBP utama historis site, kalau tidak MBP tercepat di NOP yang sama, kalau tidak MBP tercepat dalam radius (NOP lain).
4. Bila tidak ada yang bisa tiba tepat waktu: cadangan = yang tiba paling cepat, ditandai "TIDAK ADA MBP yang bisa tiba sebelum BBT habis".

**Mati sebelum MBP tiba (`reach_risk`)** = MBP tidak bisa tiba sebelum BBT **dan** site benar-benar mati karena listrik (dark site, §11) atau baterainya pernah habis minimal sekali.

**Rincian cakupan** (Cakupan & peta): setiap site masuk tepat satu dari — MBP tiba sebelum BBT · telat & site mati · telat tanpa bukti mati · BBT tidak diketahui · di luar radius.

**Label gap cakupan.** Bila aksi BBS "Tidak perlu aksi" tetapi BBT diketahui dan MBP tidak bisa tiba tepat waktu (atau tidak ada MBP dalam radius), aksi menampilkan **"Baterai OK — gap cakupan MBP"** dengan link ke Penempatan; diekspor sebagai `coverage_gap = true`.

## 7. Prioritas MBP (prioritas respons)

Skor 0–1 = jumlah berbobot faktor (bobot dinormalisasi ke 100 %):

| Faktor | Bobot | Definisi |
|---|---|---|
| Kelas site | 25 | Diamond 1,0 · Platinum 0,8 · Gold 0,6 · Silver 0,4 · Bronze 0,2 · Tidak diketahui 0,3 |
| Frekuensi padam PLN | 20 | peringkat persentil di antara site yang punya data PLN (netral 0,5 bila tidak diketahui) |
| Gap ETA − BBT | 20 | max(0, ETA − BBT) ÷ desain, maksimal 1; 1 bila tidak tercakup |
| Dependensi (PROXY) | 15 | site anak ÷ 15, maksimal 1 |
| Jarak ke MBP | 10 | km ÷ radius; 1 bila tidak tercakup |
| Gap availability | 10 | gap ÷ *3 pp*, maksimal 1 |
| VIP, durasi padam, riwayat MBP | 0 | tersedia, bobot default 0 |

Level: **P1 ≥ 0,55 · P2 ≥ 0,42 · P3 ≥ 0,30 · selain itu P4**. Tiga pemicu teratas ditampilkan per site ("Pemicu prioritas MBP").

## 8. Prioritas BBS dan daftar aksi

**Masuk daftar** (butuh aksi BBS): status Mati/Kritis/Menurun, **atau** hub (dependensi > 0) yang mati sebelum MBP tiba.

**Skor:**

| Faktor | Bobot | Definisi |
|---|---|---|
| Severity BBT | 35 | 1 − BBT ÷ desain (Mati = 1; belum terverifikasi/tidak diketahui = 0,5) |
| Paparan PLN | 25 | 0,5 × peringkat frekuensi + 0,35 × peringkat durasi + 0,15 × peringkat padam 2025 |
| Kelas | 15 | seperti di atas |
| Dependensi | 15 | seperti di atas |
| Gap availability | 10 | seperti di atas |

Level: **P1 ≥ 0,63 · P2 ≥ 0,54 · P3 ≥ 0,45 · selain itu P4**. **Batas bawah prioritas:** baterai Mati/Kritis yang *terukur* tidak pernah di bawah **P2**. Batch: P1 = Batch 1 (≤ 2 minggu) · P2 = Batch 2 (bulan ini) · P3 = Batch 3 (siklus PM berikutnya) · P4 = Batch 4 (kuartal berikutnya).

**Aturan aksi** — yang pertama cocok yang dipakai:

| Aturan | Kondisi | Aksi |
|---|---|---|
| R1 | Mati dari tiket "Tidak Ada Baterai", tidak ada BBT terukur | Pengadaan — pasang baterai |
| R2 | Status masalah berdasarkan ESTIMASI | Inspeksi & verifikasi (uji kapasitas) — jangan pernah ganti berdasarkan estimasi |
| R2b | DERIVED Mati/Kritis tanpa dukungan bukti site | Inspeksi & verifikasi |
| R3 / R3b | Mati terukur (R3b: beban NE ≥ *45 A*) | Penggantian baterai (R3b: kapasitas lebih besar) |
| R4 | Kritis terukur dan umur ≥ umur ganti (*VRLA 4 th, Lithium 8 th, lainnya 5 th*) | Penggantian baterai |
| R5 | Kritis/Menurun dan beban NE ≥ *45 A* | Upgrade baterai (tambah kapasitas) |
| R6 / R6b | Kritis terukur, lebih muda dari umur ganti / umur tidak diketahui | Uji kapasitas → ganti/upgrade / Penggantian baterai |
| R7 | Menurun dan frekuensi padam PLN di kuartil teratas site yang masuk daftar | Upgrade baterai |
| R8 | Menurun di P1/P2 | Uji kapasitas → ganti/upgrade (tidak boleh "Pantau" di prioritas tinggi) |
| R9 | Menurun di P3/P4, paparan PLN tidak tinggi | Pantau — uji ulang di PM berikutnya |
| R10 | Hub dengan ETA > BBT | MBP siaga + upgrade baterai |
| R0 / R-data | Tidak ada yang berlaku / tidak ada bukti BBT | Tidak perlu aksi / Kumpulkan data |

**Flag MBP siaga:** Mati/Kritis dengan paparan PLN tinggi, atau R10.

## 9. Simulasi (MBP › Simulasi)

1. Site terdampak diurutkan menurut prioritas MBP. Site butuh MBP bila durasi padam lebih panjang dari BBT efektifnya.
2. **Putaran 1 (hanya yang layak):** setiap site, berurutan menurut prioritas, mendapat MBP *bebas* terbaik yang bisa tiba sebelum BBT-nya. Di antara MBP yang layak, biayanya 0,7 × ETA (dinormalisasi) − 0,2 × keakraban (berapa kali melayani site itu) + 0,1 × beban kerja.
3. **Putaran 2 (cadangan):** MBP bebas yang tersisa diberikan ke site yang tidak bisa diselamatkan siapa pun, yang tiba paling cepat dulu. Ini mencegah site yang sudah tidak tertolong mengambil satu-satunya MBP yang bisa menyelamatkan site lain.
4. **Hasil:** terselamatkan · telat (mati sampai MBP tiba, dibatasi durasi padam) · tidak terlayani – sibuk · tidak terlayani – tanpa cakupan · tidak terlayani – pulau · tidak butuh MBP.
5. **Ekspektasi downtime** = Σ menit mati; **cakupan berbobot prioritas** = porsi prioritas site terdampak yang terselamatkan atau tidak butuh MBP.
6. Skenario: A kondisi sekarang · B pindahkan satu base camp · C +N MBP disiagakan (k-means berbobot dari site yang butuh, digeser ke site nyata) · D durasi padam lain.

## 10. Penempatan & jumlah armada (ESTIMASI)

Per NOP, target = site MBP-P1/P2 (aktif, bukan off-air) yang terjangkau darat dan BBT-nya lebih panjang dari waktu mobilisasi; site pulau dan baterai yang terlalu pendek dilaporkan terpisah.
- Terjangkau = km garis lurus ≤ radius **dan** ETA ≤ BBT efektif.
- Greedy: tambahkan satu MBP setiap kali di lokasi (digeser ke site MBP-P1/P2 nyata) yang menjangkau target belum terjangkau terbanyak, sampai *90 %* target tercapai atau *+15* MBP.
- Kandidat relokasi: base camp yang bila dipindahkan, diuji **kumulatif**, kehilangan jangkauan < *0,5 pp* (maksimal *3*).

**Sinyal base camp:** *Kurang terlayani* bila ≥ *2* dari: site P1/P2 ≥ *15* · ≥ *30 %* site-nya mati sebelum MBP tiba · rata-rata ETA ≥ *60 mnt* · beban kerja ≥ *p80*. *Mungkin berlebih:* beban kerja rendah, ≤ *2* site P1/P2 dan rata-rata ETA < 30 mnt.

## 11. Dark site, dampak dan tren

- **Bulan mati** = downtime karena listrik ≥ *8 jam* (RAN, waktu nyata) dalam sebulan. **Dark site** = ≥ *2* bulan mati dari 6. **Mati di satu kuartal** = ≥ *2* dari 3 bulan.
- **Cluster terburuk** (Dampak): keparahan = peringkat persentil berbobot dari porsi dark site (*30*), downtime listrik per site (*25*), gap availability (*30*), porsi site MBP-P1/P2 yang mati (*15*); cluster dengan < *5* site tidak dihitung.
- **Top 15 site terburuk:** gap availability *30* · downtime listrik *25* · risiko baterai *20* · prioritas MBP *10* · keberulangan PLN *10* · kelas *5*; pemicu utama/kedua disebutkan.
- **Tren Q1 → Q2** (per cluster): sinyal utama = perubahan availability, ≥ +*0,5 pp* Membaik, ≤ −*0,5 pp* Memburuk; sinyal kedua = perubahan porsi dark site, ±*2 pp*. Bila kedua sinyal berlawanan, atau availability stabil tetapi porsi dark site bergeser → **Campuran** beserta alasannya. < *5* site dengan data di kedua kuartal → Data tidak cukup. **vs jaringan** membandingkan perubahan tiap cluster dengan perubahan seluruh cakupan (−0,76 pp di H1-2026, kejadian Mei).

## 12. Korelasi (permintaan manajemen)

Spearman ρ (dan Pearson r) BBT terukur dengan tiap faktor, untuk site yang punya BBT terukur dan nilai faktornya (portofolio). Saat ini: frekuensi PLN 0,19 · total durasi 0,30 · rata-rata durasi 0,39 · padam terlama 0,55; umur baterai, jumlah bank, beban, VIP, tiket |ρ| < 0,07. **Catatan:** BBT dan durasi PLN berasal dari feed kejadian yang sama — padam yang lebih panjang justru yang memungkinkan baterai yang lebih kuat teramati — sehingga sebagian korelasinya mekanis (sensor). Karena itu riwayat PLN dipakai untuk **paparan/prioritas**, bukan untuk mengestimasi BBT.

## 13. Flag off-air / masalah data

Site ditandai bila salah satu berlaku: downtime ≥ *30 %* periode · ada bulan dengan downtime ≥ *90 %* jamnya · downtime ≥ *10 %* tanpa alarm baterai dan tanpa tiket. Site yang ditandai dikeluarkan dari semua KPI kecuali "+ off-air" dicentang, dan didaftar beserta alasannya di Kualitas data.

## 14. Semantik filter periode (v3.4)

Besaran teramati yang bertanggal dijumlahkan ulang untuk hari yang dipilih dari `period/YYYYMM.json`: detik waktu nyata RAN per penyebab (batas per hari sama dengan angka bulanan), interval PLN menurut hari mulai, alarm mains-fail per hari, tiket menurut hari kejadian. Availability = 1 − outage ÷ (24 jam × hari RAN yang ada di periode); target = target H1 site; penanggung jawab memakai tiket dan alarm periode itu. Site yang data PLN-nya ringkasan bulanan dibagi proporsional di dalam bulan (ditandai). **BBT, status, prioritas, aksi, profil dark site, off-air dan cakupan tidak dihitung ulang per periode.** Diuji: H1 yang dijumlahkan dari file harian sama dengan snapshot; Q1 + Q2 = H1; hari-hari dalam sebulan berjumlah sama dengan bulan itu.

## 15. Drilldown dan roll-up (v3.3 / v3.5)

- **Drilldown:** setiap KPI adalah partisi site dalam cakupan menjadi ≤ 5 segmen bukti; "Lihat N site" menerapkan predikat yang persis sama di Daftar site.
- **Mode peta:** setiap site mendapat satu kunci kategori per mode (misal Kesehatan: ≥ 1 pp di bawah / < 1 pp di bawah / memenuhi / tidak ada data); kategori bermasalah ditentukan per mode.
- **Roll-up:** cluster atau NOP adalah kumpulan site-nya: jumlah per kategori, jumlah dan porsi site bermasalah, jumlah besaran (jam). Panel justifikasi menampilkan cluster di sebuah NOP dan site bermasalah dengan besaran terbesar, masing-masing dengan alasannya sendiri. Diuji untuk setiap mode: NOP = Σ cluster = Σ site.

## 16. Masukan ops (v3.7)

Perubahan yang disepakati dengan operasional (Ayatullah, Pak Nizar), semuanya dihitung per site lalu dijumlahkan.

**Genset tetap.** `fixed_genset` = ACTIVE kalau Dapot punya *Genset Active* dengan tipe BACKUP/MAIN POWER, atau New_BBT punya *Genset Fix Telkomsel* 1/2, state GENSET ACTIVE, backup power = GENSET atau main power mengandung GENSET; OFF kalau teksnya menyebut power off / shutdown / dismantle / rusak. Site ACTIVE (1.378; 1.134 dari Dapot, 244 hanya dari New_BBT) menjadi `genset_protected`: tidak ada risiko jangkauan, tidak pernah "butuh MBP" di simulasi, bukan target penempatan, tidak diberi label gap cakupan, dan **dikecualikan dari cakupan default** (filter *+ genset tetap*). Sumber akan diganti ke ekspor genset tetap SWFM begitu tersedia (`thresholds.yaml › fixed_genset`).

**Status baterai tanpa tiket RC.** `bbt.ticket_sets_status: false`: tiket "Tidak Ada Baterai" tidak lagi membuat baterai *Mati*; tiket ditampilkan sebagai tanda ("perlu cek lapangan") dan estimasi BBT tetap dipakai. Penanggung jawab (Akuntabilitas) tetap memakai akar masalah tiket. Nilai `true` mengembalikan aturan lama (R1 "pasang baterai").

**Gap BBT — desain vs aktual.** Desain = jumlah bank × Ah per bank × DoD ÷ beban NE × 60 (Ah per bank **diasumsikan** 100 sampai ada data kapasitas). `bbt_gap_ratio` = BBT terukur ÷ desain, hanya untuk baterai terukur dengan desain non-PROXY; `bbt_gap_min` = desain − terukur. Mode peta BBS *Gap BBT* (< 25 % · 25–50 % · 50–80 % · ≥ 80 % · tanpa aktual · tanpa desain), KPI median rasio dan kolom di daftar aksi.

**Target waktu respons.** `mbp.response_target_min` (30) — ETA MBP tercepat dalam radius (`eta_fastest_min`, termasuk mobilisasi 15 mnt). AREA1 saat ini: ≈ 30 % site aktif darat ≤ 30 mnt, ≈ 79 % ≤ 60, ≈ 97 % ≤ 120. Penempatan bisa memakai batas menit, bukan BBT: terjangkau = km garis lurus ≤ radius **dan** ETA ≤ batas; jam mati yang dihindari tetap diukur terhadap BBT.

**Anchor kecamatan.** Untuk tiap kecamatan (Dapot *Subdistrict*): site aktif, berkoordinat, non-pulau yang paling dekat ke centroid site-sitenya. Kandidat penempatan = site target (≤ 400) + satu anchor per kecamatan; himpunan jangkauan dihitung di awal lalu greedy set cover menambah anchor yang menjangkau paling banyak target yang belum terjangkau.

**Dimensioning.** Job PLN off bersamaan per NOP: interval job = takeover (atau occurred) → RH stop (0–48 jam; kalau tidak ada + jam RH; kalau tidak ada + median), disampel per jam → p90 / p95 / p99 / maks. Armada ideal = maks(saat ini + tambahan untuk target jangkauan, ⌈p95⌉). Konkurensi kecil (p95 ≈ 2–4 di kebanyakan NOP), jadi **jangkauan 30 menit** yang menentukan jumlah armada.

**Center of gravity → kecamatan.** Bobot site = 0,35 · rank durasi PLN off + 0,25 · (1 − BBT/desain) + 0,15 · skor class + 0,25 · rank tiket PLN off berulang (minimal 0,02). Per base camp (site tetap di base camp-nya): centroid berbobot → 6 anchor kecamatan terdekat di dalam kabupaten yang memegang ≥ 20 % bobot base camp (+ kabupatennya sendiri) → terbaik = bobot terbanyak dalam target, lalu ETA berbobot terendah. Rekomendasi *Tetap* kecuali menambah ≥ 2 % bobot atau ETA berbobot membaik ≥ 5 mnt; *Geser* kalau kecamatannya sama. AREA1: site ≤ 30 mnt 5.043 → ≈ 6.250 kalau semua rekomendasi dijalankan.

**Produktivitas.** Per base camp dari tiket MBP (tidak canceled): tiket, PLN off, check-in, site unik, RH total/rata-rata/median, median takeover → check-in. Rasio visit wilayah = tiket PLN off yang punya check-in ÷ tiket PLN off dari site yang ditugaskan ke base camp.

## 17. Performa MBP, backtest, dispatch dan jenis aksi BBS (v3.7)

**Job.** `tickets.json` = setiap tiket MBP yang di-takeover base camp (tidak canceled) dengan waktu kejadian, jeda takeover, jeda check-in, jam job (takeover → RH stop, 0–48 jam, kalau tidak ada jam RH), penyelesaian (genset / PLN nyala / tanpa check-in / lainnya) dan RC (PLN off / tidak ada baterai / sewa daya / lainnya). 46.996 job di H1, 39.139 di antaranya PLN off.

**Utilisasi dan performa (usulan, `mbp_perf`).** Okupansi = Σ jam job ÷ 4.344 jam (satu MBP membackup satu site pada satu waktu). Tepat waktu (hanya job PLN off) = check-in − kejadian ≤ BBT efektif site; job di site dengan BBT tidak diketahui tidak dinilai. Kelas: *under-utilized* (abu) bila < 2 job/bulan atau okupansi < 3 %; *beban tinggi* (ungu) bila okupansi ≥ 25 % dan tepat waktu tidak merah; selain itu tepat waktu ≥ 60 % hijau, < 35 % merah, kuning di antaranya (median AREA1 ≈ 44 %); kurang dari 10 job yang dinilai = *data job kurang*. Skor = ranking persentil okupansi (40 %), tepat waktu (40 %) dan porsi genset tersambung (20 %). Capture = porsi job di wilayah base camp yang dikerjakan base camp itu sendiri.

**Backtest relokasi (ESTIMASI).** Job H1 di NOP diputar ulang berurutan: dispatch = kejadian + jeda takeover tiket itu sendiri (maks 240 mnt); job diberikan ke base camp tercepat yang kosong dalam radius (model tempuh dengan pengali lalu lintas jam itu); base camp sibuk selama perjalanan + jam job; tepat waktu = jeda + perjalanan ≤ BBT. Baseline = replay yang sama dengan lokasi sekarang. Kandidat = anchor kecamatan (default di cluster yang sama — ops: unit hanya pindah antar cluster dengan FMC yang sama), disaring dari berapa job telat / tidak terlayani yang bisa dijangkau tepat waktu, tiap kandidat diputar ulang penuh; diurutkan menurut Δ job tepat waktu se-NOP, lalu Δ tidak terlayani.

**Prioritas dispatch (statis, `dispatch`).** Skor = 0,40 class + 0,30 dependensi (site anak ÷ 15; ACTUAL dari `engine/data/site_dependency.csv` bila NOP officer mengisi template, kalau tidak PROXY dari bucket HUB) + 0,30 prioritas MBP. Urutan: site yang masih bisa dijangkau sebelum BBT dulu, lalu BBT tidak diketahui, lalu yang pasti telat, lalu di luar radius; di dalam grup menurut skor. Audit: setiap momen H1 saat base camp mengambil job sementara job lain untuknya menunggu (terjadi sebelum takeover, diambil kemudian, ≤ 24 jam) — dianggap diikuti bila skor site yang diambil ≥ skor terbaik yang menunggu − 0,02.

**Jenis aksi BBS dan cek setting.** `actionType()` memetakan tiap aksi ke REPLACE / UPGRADE / SETTING / TEST / DATA / MONITOR / NONE (mode peta *Jenis aksi*, kotak, filter daftar). Aturan baru sebelum R6: **R6c** Kritis terukur pada baterai yang lebih muda dari 40 % umur gantinya (`battery_young_share`) dan **R6d** lithium Kritis terukur dengan umur tidak diketahui → *Cek setting rectifier / LVD / BMS → uji ulang* (temuan lapangan: BBT pendek karena setting LVD / BMS atau beban, bukan aus). AREA1: penggantian 1.131 → 680, cek setting 566.

### 17b. Utilisasi ideal (v3.7.1 — menggantikan warna okupansi/tepat waktu)
- **Kebutuhan** per base camp = Σ padam PLN (data PLN, H1) di site aktif wilayahnya yang lebih lama dari BBT efektif site — tanpa MBP site akan mati. Dihitung dari histogram durasi per site (bucket 0/15/30/45/60/90/120/180/240/360/480/720+ mnt; bucket yang memuat BBT dibagi linear). AREA1: ≈ 34.200 padam butuh MBP.
- **Serapan kebutuhan** = job MBP PLN off di site tersebut (base camp mana pun) ÷ kebutuhan. AREA1 ≈ 98 %; per base camp bersifat indikatif (event PLN ada untuk ≈ 13,8 rb site dan hanya sebagian tiket cocok dengan event).
- **Warna peta (utilisasi ideal):** abu = menganggur (< 2 job/bulan atau okupansi < 3 %) dengan kebutuhan wilayah kecil → relokasi; merah = wilayah butuh MBP tapi serapan < 50 % (juga bila menganggur); ungu = okupansi ≥ 25 % → tambah unit; biru = serapan ≥ 150 % (dikirim preventif atau data PLN tidak lengkap → cek efisiensi); kuning 50–80 %; hijau ≥ 80 % = seimbang; putih = kebutuhan wilayah < 3 per bulan. Tepat waktu jadi pilihan warna kedua.
- **Skor** = ranking persentil serapan (35 %), tepat waktu (35 %) dan okupansi (30 %).
- **Job RC "Baterai / Tidak Ada Baterai":** dihitung sebagai beban kerja, tidak pernah dinilai tepat waktu maupun dipakai untuk status baterai; base camp dengan ≥ 30 % job seperti ini diberi flag ⚑ (sementara, perlu dicek ke ops).
- **Radius** tetap bisa diatur (preset 20/30/40/60/120 km di Ringkasan MBP, slider peta, Config); default 120 km.
