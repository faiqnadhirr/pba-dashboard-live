# 05 · Referensi konfigurasi

Semua ambang dan bobot ada di dua file YAML. Pipeline menyalinnya ke `meta.json`, dan aplikasi web memakainya sebagai konfigurasi default.

- `engine/config/thresholds.yaml` — asumsi fisik dan ambang keputusan
- `engine/config/scoring.yaml` — skor kelas dan bobot prioritas
- `engine/config/basecamp_merge.csv` — daftar base camp duplikat yang sudah direview untuk digabung

## 1. Cara konfigurasi diterapkan

| Mode | Di mana | Siapa yang melihat |
|---|---|---|
| **Default** | File YAML → `meta.json` saat build | Semua orang |
| **What-if (DEMO)** | Tab Config → **Edit (what-if)** → disimpan di browser pengguna (localStorage), terikat pada build data | Hanya pengguna itu; hash di header jadi merah dengan ✎ |
| **Perubahan yang disepakati** | Ekspor JSON dari tab Config → review → ubah YAML → build ulang | Semua orang setelah build ulang |

**Hash config** di header (6 karakter) mengidentifikasi konfigurasi secara persis dan tidak bergantung pada urutan kunci. Dua screenshot dengan hash yang sama memakai aturan yang sama.

Bobot **dinormalisasi ulang** ke 100 %, jadi Anda boleh mengisi nilai relatif.

## 2. `thresholds.yaml`

### scope
| Kunci | Default | Arti |
|---|---|---|
| `area` | AREA1 | Area Dapot yang dipakai |
| `period_start` / `period_end` | 2026-01-01 / 2026-06-30 | Periode snapshot |

### bbt — kriteria dan desain baterai
| Kunci | Default | Arti |
|---|---|---|
| `design_minutes` | 120 | Desain BBT manajemen (PROXY) untuk kriteria masalah |
| `ok_pct` | 0,50 | ≥ 50 % desain = bukan masalah (di bawahnya → Menurun) |
| `degraded_pct` | 0,25 | di bawah 25 % desain → Kritis |
| `dead_max_minutes` | 5 | ≤ 5 mnt → Mati |
| `min_exhaustion_events` | 1 | Jumlah kejadian habis agar BBT disebut terukur |
| `max_events_per_site_flag` | 300 | Lebih dari ini dalam 6 bulan → ditandai alarm flapping |
| `criteria_basis` | standard | `standard` = kriteria vs 120 mnt; `site` = vs desain terhitung per site |
| `design_by_class.*` | 120 | Desain cadangan per kelas bila data baterai kosong (PROXY) |
| `design_from_battery.ah_per_bank.*` | 100 | Ah per bank **diasumsikan** per tipe baterai (sumber tidak punya field Ah) |
| `design_from_battery.usable_dod.*` | Li 0,90 · VRLA 0,50 · Mixed 0,70 · Other 0,50 | DoD yang bisa dipakai |
| `design_from_battery.min_minutes` / `max_minutes` | 30 / 480 | Batas desain terhitung |
| `derived_support.min_exhaustion_events` | 2 | DERIVED Mati/Kritis dipercaya bila ≥ 2 kejadian habis, atau… |
| `derived_support.min_power_h` | 1,0 | …downtime listrik ≥ 1 jam **dan** |
| `derived_support.min_share_of_pln` | 0,5 | …downtime listrik ≥ 50 % jam padam PLN |

### baterai dan beban
| Kunci | Default | Arti |
|---|---|---|
| `battery_age_replace_years` | VRLA 4 · Lithium 8 · Other 5 | Umur yang memicu penggantian untuk Kritis (R4) |
| `load_high_ampere` | 45 | Beban NE dianggap tinggi → upgrade kapasitas (R3b, R5) |

### mbp
| Kunci | Default | Arti |
|---|---|---|
| `max_radius_km` | 120 | Radius cakupan (syarat wajib); juga slider peta |
| `same_nop_only` | true | Cakupan/kandidat NOP sendiri diutamakan |
| `assignment_mode` | history_then_nearest | Preferensi di antara MBP yang layak |
| `rh_max_hours_per_ticket` | 48 | Selisih RH hour-meter di atas ini = outlier |

### travel — model ETA (ESTIMASI)
| Kunci | Default | Arti |
|---|---|---|
| `road_factor` | 1,35 | Km garis lurus → km jalan |
| `mobilization_minutes` | 15 | Persiapan sebelum berangkat |
| `speed_kmh.urban / rural_short / rural_long` | 25 / 35 / 45 | Kecepatan; desa pendek = km jalan < 15 |
| `peak_hours`, `peak_multiplier_urban / rural` | 7, 8, 16–18 · 1,4 / 1,15 | Lalu lintas saat berangkat |
| `night_hours`, `night_multiplier` | 22–04 · 1,2 | Lebih lambat di malam hari |
| `island_eta` | unavailable | Pulau tidak punya ETA darat |
| `access_multiplier` | mainland 1,0 · unknown 1,0 · riverine_delta 1,5 · remote 2,0 · island 3,0 (indikatif saja) | Per kelas akses |

### dependency_children (PROXY)
Kategori HUB Site → perkiraan jumlah site anak: end site / BTS / repeater 0 · combat 1 · simpul kecil 2 · simpul 3 · simpul sedang 5 · simpul besar 8 · simpul sangat besar 12 · BSC / backbone / controller / TTC 15. Bisa diubah di Config; ganti dengan topologi nyata bila sudah tersedia.

### listrik, kondisi site, level dan batch
| Kunci | Default | Arti |
|---|---|---|
| `power.max_pln_events_per_month` | 200 | "Repetitive" bulanan di atas ini = flapping → dibatasi dan ditandai |
| `site_condition.full_gap_pp` | 3,0 | Gap availability (pp) yang memberi faktor kondisi penuh |
| `priority_levels` | P1 0,55 · P2 0,42 · P3 0,30 | Ambang prioritas MBP |
| `bbs_priority_levels` | P1 0,63 · P2 0,54 · P3 0,45 | Ambang prioritas BBS |
| `action_batches` | Batch 1 ≤ 2 minggu · Batch 2 bulan ini · Batch 3 PM berikutnya · Batch 4 kuartal berikutnya | Label per level BBS |
| `severity_floor.measured_dead_critical` | P2 | Mati/Kritis terukur tidak pernah di bawah ini |

### availability (dark site dan tren)
| Kunci | Default | Arti |
|---|---|---|
| `dark_month_h` | 8,0 | Downtime listrik (jam) yang membuat bulan mati |
| `dark_min_months` | 2 | Bulan mati (dari 6) yang membuat dark site |
| `dark_quarter_min_months` | 2 | Bulan mati (dari 3) agar site mati di satu kuartal |
| `trend_pp` | 0,50 | Perubahan availability Q1→Q2 untuk Membaik/Memburuk |
| `trend_dark_share_pp` | 2,0 | Perubahan porsi dark site (pp dari jumlah site) untuk sinyal kedua |
| `min_cluster_sites` | 5 | Kurang dari ini → Data tidak cukup / tidak dihitung di cluster terburuk |

### offair
| Kunci | Default | Arti |
|---|---|---|
| `max_outage_share` | 0,30 | Downtime ≥ 30 % periode |
| `full_month_share` | 0,90 | Ada bulan dengan downtime ≥ 90 % |
| `no_alarm_min_share` | 0,10 | Downtime ≥ 10 % tanpa alarm dan tanpa tiket |
| `exclude_by_default` | true | Dikeluarkan dari KPI kecuali "+ off-air" dicentang |

### penempatan, sinyal base camp, bobot dampak, data kosong
| Kunci | Default | Arti |
|---|---|---|
| `placement.target_share` | 0,90 | Porsi target MBP-P1/P2 yang harus terjangkau sebelum BBT |
| `placement.max_new` | 15 | Maksimal MBP tambahan per NOP |
| `placement.relocation_max_loss_pp` | 0,5 | Kehilangan jangkauan kumulatif yang diizinkan untuk relokasi |
| `placement.relocation_max_candidates` | 3 | Maksimal kandidat relokasi |
| `basecamp_signal.criteria_needed` | 2 | Jumlah kriteria untuk Kurang terlayani |
| `basecamp_signal.p1p2_sites_min` / `reach_risk_share_min` / `avg_eta_min` / `workload_quantile` | 15 / 0,30 / 60 / 0,80 | Empat kriterianya |
| `basecamp_signal.overserved_max_p1p2` | 2 | Ambang Mungkin berlebih |
| `top15_weights` | availability_gap ,30 · power_downtime ,25 · bbt_risk ,20 · priority ,10 · recurrence ,10 · criticality ,05 | Top 15 site terburuk |
| `worst_cluster_weights` | share_dark ,30 · power_downtime_per_site ,25 · availability_gap ,30 · p1p2_dark_share ,15 | Cluster terburuk |
| `unknown_handling.neutral_rank` | 0,5 | Peringkat untuk site tanpa data PLN / riwayat MBP / padam 2025 |

## 3. `scoring.yaml`

| Blok | Default |
|---|---|
| `class_score` | Diamond 1,0 · Platinum 0,8 · Gold 0,6 · Silver 0,4 · Bronze 0,2 · Unknown 0,3 |
| `mbp_priority` | class ,25 · dependency ,15 · outage_frequency ,20 · travel_distance ,10 · eta_gap ,20 · site_condition ,10 · vip 0 · outage_duration 0 · mbp_history 0 |
| `bbs_priority` | bbt_severity ,35 · pln_exposure ,25 · class ,15 · dependency ,15 · site_condition ,10 · vip 0 |
| `mbp_candidate` | eta ,70 · familiarity ,20 · workload ,10 (peringkat MBP yang layak di simulasi; biaya lebih rendah menang) |

## 4. `basecamp_merge.csv`

Daftar dugaan base camp duplikat yang bisa direview. Kolom: `keep`, `drop`, `status` (misal "LIKELY SAME PERSON (≤ 20 km, same NOP) — NEEDS REVIEW"), `km_apart`, `similarity`, `apply` (`yes`/`no`), `reviewer_note`. Hanya baris dengan `apply = yes` yang digabung (saat ini 8 dari 25); tiket base camp yang di-drop dipetakan ulang ke yang dipertahankan. Isi `apply` hanya setelah pasangan itu direview (Kualitas data › dugaan duplikat); pipeline tidak pernah menggabung sendiri.

## 5. Bagian tab Config (what-if)

Bobot (prioritas MBP, prioritas BBS, peringkat kandidat MBP, cluster terburuk, Top 15) · Ambang prioritas · Kriteria BBT · Penanganan data kosong · Model perjalanan · Aturan (batas bawah prioritas, dark site, tren, off-air) · Desain dari baterai · Penempatan · Sinyal base camp · Pemetaan dependensi. Tombol: **Edit (what-if)**, **Terapkan**, **Selesai**, **Ekspor JSON**, **Impor JSON**, **Reset ke default**. Catatan tata kelola menjelaskan bahwa perubahan what-if hanya lokal sampai disepakati dan di-commit.
