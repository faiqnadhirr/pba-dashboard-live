# PBA — Power Backup Analytic · Dokumentasi (Bahasa Indonesia)

> English version: [../en/00-INDEX.md](../en/00-INDEX.md)

PBA adalah dasbor pendukung keputusan untuk backup daya Telkomsel **AREA1** (ENOM, dikelola Triple-E). PBA menjawab dua pertanyaan manajemen:

1. **MBP (Mobile Backup Power)** — saat PLN padam, site mana yang butuh MBP, MBP mana yang berangkat, dan apakah MBP bisa tiba sebelum baterai habis? Berapa MBP yang dibutuhkan dan di mana sebaiknya ditempatkan?
2. **BBS (Battery Backup System)** — baterai mana yang mati, kritis atau menurun, apa tindakannya (ganti, upgrade, uji kapasitas, verifikasi), dan urutannya bagaimana?

Setiap angka di PBA **dihitung per site terlebih dulu**, lalu dijumlahkan ke cluster (TO), NOP dan AREA. Jadi angka apa pun di peta, KPI atau grafik selalu bisa ditelusuri sampai ke site dan buktinya.

## Daftar dokumen

| # | Dokumen | Untuk siapa | Isi |
|---|---|---|---|
| 01 | [Gambaran umum](01-gambaran-umum.md) | Semua | Tujuan, pengguna, cakupan, pertanyaan yang dijawab tiap menu, angka utama snapshot |
| 02 | [Panduan pengguna](02-panduan-pengguna.md) | NOP, manajemen area, analis | Semua menu dan tab, filter, periode, peta, legenda toggle, drilldown, panel roll-up, drawer site, ekspor, berbagi link |
| 03 | [Data & pipeline](03-data-pipeline.md) | Analis, data engineer | File sumber, aturan pembersihan, agregasi per site, file output, tingkat bukti, cek kewajaran, cara membangun ulang data |
| 04 | [Metodologi & aturan](04-metodologi.md) | Analis, reviewer, auditor | BBT (Kaplan-Meier), status baterai, urutan bukti, availability & penyebab, penanggung jawab, cakupan/ETA/penugasan MBP, prioritas, aturan aksi R1–R10, simulasi, penempatan, tren, dark site, off-air, semantik periode, roll-up |
| 05 | [Referensi konfigurasi](05-konfigurasi.md) | Analis, admin | Setiap kunci di `engine/config/*.yaml`, nilai default dan efeknya; tab Config (what-if) |
| 06 | [Arsitektur & kode](06-arsitektur.md) | Developer | Struktur repo, alur data, modul, state URL, i18n, terjemahan teks engine, titik ekstensi |
| 07 | [Deploy & operasional](07-deploy-operasional.md) | Developer, operator | Jalankan lokal, deploy Vercel dengan login, rutinitas refresh data, environment variable, aturan keamanan, troubleshooting |
| 08 | [Pengujian & QA](08-pengujian-qa.md) | Developer, reviewer | 48 tes regresi, 25 cek validasi, cek kewajaran build, checklist QA manual |
| 09 | [Keterbatasan, asumsi & roadmap](09-keterbatasan-roadmap.md) | Manajemen, reviewer | Yang belum bisa dijawab data, item PROXY/ESTIMASI, pertanyaan terbuka, telemetri, opsi integrasi Watson (PHP) |
| 10 | [Glosarium](10-glosarium.md) | Semua | Istilah, singkatan dan tag bukti (ID ↔ EN) |
| — | [Changelog](../CHANGELOG.md) | Semua | Riwayat versi v1 → v3.5 |
| — | [Desain telemetri MBP](../MBP_TELEMETRY_DESIGN.md) | Engineer | Desain Teltonika FMC920, skema dan kontrak API (desain, bahasa Inggris) |
| — | [Laporan validasi](../VALIDATION_REPORT.md) | Reviewer | Dibuat otomatis oleh `engine/validate.py` setiap build data |

## Jalur baca

- **"Saya cuma mau pakai"** → 01 → 02 (bagian 2–4) → 10.
- **"Saya harus mempertahankan angka di rapat"** → 02 §6 (panel roll-up) → 04 (bagian terkait) → 05.
- **"Saya merawat atau men-deploy"** → 06 → 07 → 08 → 03.
- **"Saya me-review metodenya"** → 04 → 09 → 03 §6 (bukti) → laporan validasi.
