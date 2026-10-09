# 07 · Deploy & operasional

## 1. Kebutuhan

| Untuk | Butuh |
|---|---|
| Menjalankan aplikasi | Node.js 20.9+ (disarankan 22 LTS) |
| Membangun ulang data | Python 3.11+ dan `engine/requirements.txt`; file mentah |
| Hosting | Repo GitHub **private** dan akun Vercel (atau host Node lain) |

## 2. Jalankan di laptop (Windows)

`public/data/` sudah disertakan, jadi cukup Node.js.

```powershell
node -v; npm -v                         # cek Node.js
cd C:\PBA\pba-dashboard                 # path lokal pendek, jangan OneDrive
npm install                             # pertama kali, 1–3 menit
npm run dev                             # http://localhost:3000
```

- Bagikan di jaringan kantor: `npm run dev -- -H 0.0.0.0` → `http://<IP-anda>:3000` (`ipconfig`).
- Mirip produksi: `npm run build` lalu `npm start`.
- Di lokal, tanpa variabel auth, aplikasi berjalan tanpa login.

## 3. Deploy ke Vercel dengan login

Data ini rahasia Telkomsel: repo harus **private** dan login di-set **sebelum** deploy pertama.

**A. Unggah lewat web GitHub → Vercel**
1. Buat repo private `pba-dashboard` di GitHub.
2. *Add file → Upload files*: unggah semua isi folder proyek (`app`, `components`, `docs`, `engine`, `i18n`, `lib`, `public`, `tests` dan file di root, termasuk `.gitignore` yang tersembunyi). **Jangan** unggah `node_modules`, `.next` atau `engine/data`.
3. Pastikan `package.json` dan `proxy.js` ada di root repo.
4. Vercel → *Add New → Project* → import repo.
5. *Environment Variables* (sebelum deploy):

   | Nama | Nilai |
   |---|---|
   | `BASIC_AUTH_USER` | username bersama |
   | `BASIC_AUTH_PASS` | password kuat |
   | `NEXT_TELEMETRY_DISABLED` | `1` |

6. Deploy, buka URL-nya dan pastikan diminta login (cek juga di jendela Incognito). Bila variabel ditambahkan belakangan: *Deployments → ⋯ → Redeploy*.

**B. Vercel CLI**
```powershell
npm install -g vercel
vercel login
vercel                       # deploy pertama
vercel env add BASIC_AUTH_USER
vercel env add BASIC_AUTH_PASS
vercel --prod
```

`proxy.js` melindungi semua path (halaman dan file `/data/*`) dengan HTTP basic auth setiap kali kedua variabel di-set.

## 4. Rutinitas refresh data

| Langkah | Perintah / tindakan | Cek |
|---|---|---|
| 1 | Taruh file mentah baru di satu folder (pola nama sama, lihat [03 §2](03-data-pipeline.md#2-file-sumber)) | Kualitas data › sumber menampilkan jumlah dan waktu file setelah build |
| 2 | `cd engine` → `python build.py --raw "<folder>"` | Semua cek kewajaran build PASS; `npm test` 47/47 di akhir |
| 3 | `python validate.py` | `docs/VALIDATION_REPORT.md` = ALL CHECKS PASSED (25/25) |
| 4 | `npm run build` (cek lokal, opsional) lalu buka aplikasi | Tanggal snapshot dan waktu refresh di header ter-update |
| 5 | Unggah `public/data/` yang berubah (dan `docs/VALIDATION_REPORT.md`) ke GitHub | Vercel otomatis deploy ulang |
| 6 | Bila ambang disepakati: ubah `engine/config/*.yaml`, build ulang, unggah | Hash config di header berubah |

Bila periode berganti (misal H2), ubah `scope.period_*` di `thresholds.yaml`; file periode dan daftar bulan mengikuti datanya (filter periode saat ini mengasumsikan Jan–Jun 2026 di `lib/period.js` — ubah `Y` dan `MDAYS` di sana untuk rentang lain).

## 5. Environment variable

| Variable | Di mana | Fungsi |
|---|---|---|
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` | Vercel / host | Login untuk seluruh situs |
| `NEXT_TELEMETRY_DISABLED=1` | Vercel / host | Mematikan telemetri Next.js |
| `PBA_RAW_CACHE` | mesin build | Cache file mentah yang sudah diparse |
| `PBA_DAILY_CACHE` | mesin build | Cache pembacaan RAN harian |
| `PBA_SKIP_JS_TESTS=1` | mesin build | Melewati `npm test` di `build.py` (hanya untuk pengembangan) |

## 6. Aturan keamanan

1. Repo GitHub **private**; proyek Vercel dengan basic auth aktif.
2. **Jangan pernah commit Excel/CSV mentah** — `engine/data/` ada di `.gitignore`; yang dipublikasikan hanya JSON hasil agregasi.
3. Bagikan login hanya ke pengguna Telkomsel / Triple-E yang berwenang; ganti password bila ada yang keluar.
4. Jangan jalankan `npm audit fix --force` (bisa menaikkan Next.js/React lintas versi mayor dan merusak build); perbarui dependensi dengan sengaja lalu jalankan tes lagi.
5. Konfigurasi what-if tetap di browser masing-masing pengguna; tidak pernah dikirim ke mana pun.

## 7. Troubleshooting

| Gejala | Penyebab / solusi |
|---|---|
| `'npm' is not recognized` | Instal ulang Node.js dan buka terminal baru |
| `npm install` macet | Proxy kantor: `npm config set proxy http://user:pass@proxy:port` dan `https-proxy` |
| Port 3000 terpakai | `npm run dev -- -p 3001` |
| "Could not load data" | `public/data/*.json` tidak ada → build ulang (03 §8) |
| Titik peta di latar abu-abu | Tile peta dasar (OpenStreetMap) diblokir/offline; titik tetap berfungsi |
| "data periode tidak tersedia" | `public/data/period/<YYYYMM>.json` tidak ada → build ulang dengan file RAN harian |
| Login tidak muncul di Vercel | Variabel ditambahkan setelah deploy → Redeploy |
| `build.py` gagal di "JS rule tests" | Ada tes aturan yang gagal dengan data baru — baca nama tes yang gagal di output sebelum deploy |
| Angka dua orang berbeda | Bandingkan hash config di header (salah satu mungkin memakai config what-if) serta periode/filter di URL |
