# PBA — Power Backup Analytics (v2)

PBA is a decision-support dashboard for Telkomsel **AREA1** power backup (ENOM). It covers the two areas in the management order:

- **MBP (Mobile Backup Power).** Every MBP base camp has its own coverage area. Each coverage area shows a site list with the **14 mandatory columns**, sorted by priority. From there you can run a simulation that recommends **where to deploy MBPs** during a PLN outage.
- **BBS (Battery Backup System).** This part covers four things:
  - a correlation of BBT measured vs PLN outage frequency and duration;
  - an estimation algorithm for sites with no BBT measurement (Kaplan-Meier, tested on unseen sites);
  - problem criteria of 50% / 25% / 0% of the 2-hour design;
  - an **action list sorted by priority**, which looks at PLN history, site class, dependency and availability.
- **MBP telemetry (Teltonika FMC920).** This is the design for collecting GPS, MBP-on and MBP-off. The repo includes a data-model stub and the API contract for Watson.

Every value is tagged with its evidence: **ACTUAL · DERIVED · ESTIMATED · PROXY · UNAVAILABLE**.

```text
engine/  (Python)  raw files → clean → analytics → public/data/*.json      (run once per data refresh)
app/     (Next.js) reads public/data, recalculates priorities / simulation live in the browser
```

---

## A. Run on your laptop (Windows)

The `public/data/` folder is already built and included, so you only need Node.js to run the app.

1. **Install Node.js 22 LTS (or 20.9+)** from https://nodejs.org (Windows Installer, keep the default options).
   Close the terminal and open a new one, then check the install:
   ```powershell
   node -v
   npm -v
   ```
2. **Extract** `pba-dashboard.zip` to a short local path, for example `C:\PBA\pba-dashboard`.
   Avoid OneDrive folders: `node_modules` holds thousands of files and OneDrive syncs them slowly.
3. Open **PowerShell** in that folder:
   ```powershell
   cd C:\PBA\pba-dashboard
   npm install
   npm run dev
   ```
   `npm install` takes about 1–3 minutes the first time.
4. Open **http://localhost:3000**.

To show the dashboard to colleagues on the same network, start it with `npm run dev -- -H 0.0.0.0`. They can then open `http://<your-IP>:3000`. Find your IP with `ipconfig`.

For a faster, production-like run, use:
```powershell
npm run build
npm start
```

**If something goes wrong:**

| Problem | Fix |
|---|---|
| `'npm' is not recognized` | Reinstall Node.js, then open a **new** PowerShell window |
| `npm install` hangs or fails | Office proxy: run `npm config set proxy http://user:pass@proxy:port` and `npm config set https-proxy http://user:pass@proxy:port`, then try again |
| Port 3000 in use | `npm run dev -- -p 3001` |
| Map shows dots on a grey background | Basemap tiles are blocked or offline. The points still work, and the app switches to this view automatically |
| "Could not load data" | `public/data/*.json` is missing. Rebuild it with section C |

---

## B. Deploy to Vercel (with login) — no Node.js needed on your laptop

The data is Telkomsel-confidential, so keep the GitHub repo **private** and set the login variables **before** the first deploy.

### B1. GitHub web upload → Vercel (easiest)
1. Create a repo at https://github.com/new. Name it `pba-dashboard`, select **Private**, and tick *Add a README*. Then click **Create repository**.
2. In the repo, click **Add file → Upload files**.
3. Open the extracted `pba-dashboard` folder on your laptop. Select **everything inside it** — the folders `app`, `components`, `docs`, `engine`, `lib`, `public`, `tests` and all the files (`package.json`, `package-lock.json`, `next.config.mjs`, `proxy.js`, `tailwind.config.cjs`, `postcss.config.mjs`, `jsconfig.json`, `README.md`) — and drag it all into the upload area. Do **not** upload `node_modules` or `.next`.
4. Wait until every file is listed (about 72 files), then click **Commit changes**.
5. Check on GitHub that `package.json` and `proxy.js` sit at the **root** of the repo (not inside a sub-folder).
6. Go to https://vercel.com, log in with GitHub, and click **Add New → Project**. Click **Import** next to `pba-dashboard` (if the repo is not listed, choose *Adjust GitHub App Permissions* and allow it).
7. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `BASIC_AUTH_USER` | shared username |
   | `BASIC_AUTH_PASS` | strong password |
   | `NEXT_TELEMETRY_DISABLED` | `1` |

8. Click **Deploy** and wait about 1–2 minutes. Then open the URL: it must ask for the username and password. Test it in an Incognito window too.

If you add the variables *after* deploying: go to **Deployments → ⋯ → Redeploy** so the login takes effect.

### B2. Vercel CLI (alternative, needs Node.js 20.9+)
```powershell
npm install -g vercel
vercel login
cd C:\PBA\pba-dashboard
vercel                      # first deploy (answer the questions; directory ./)
vercel env add BASIC_AUTH_USER
vercel env add BASIC_AUTH_PASS
vercel --prod               # production deploy with login active
```

**Updating data later:** rebuild `public/data` (section C), then upload the changed `public/data` files to GitHub (*Add file → Upload files*, same paths). Vercel redeploys automatically.

---

## C. Rebuild the data (engine, Python 3.11+)

1. Put the raw files in any folder (sub-folders are fine). Files are matched by name pattern:

| Pattern | File |
|---|---|
| `*Dapot*ALL*Site*.xlsx` | Dapot ALL Site TSEL.xlsx |
| `*Tracking*Ticket*MBP*.xlsx` | Tracking Ticket MBP Jan - June.xlsx (sheets *MBP Team*, *Tracking Site*) |
| `*New*BBT*.xlsx` | New_BBT_2026.xlsx |
| `*BBT*Site*Details*.csv` | BBT Site Details_Jan … June_New.csv |
| `*BBT*Export*monthly*.xlsx` | BBT_Exportmonthly_…_AREA1.xlsx |
| `*Avail*RAN*.zip` **or** the extracted `*.csv` (not both) | Avail_RAN_BeforeRecon_site_ne_base_AREA1.zip |

2. Run the build and validation:
```powershell
cd C:\PBA\pba-dashboard
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r engine\requirements.txt
cd engine
python build.py --raw "D:\PBA raw"      # about 2 min → writes ..\public\data\*.json
python validate.py                      # 29 checks → ..\docs\VALIDATION_REPORT.md
cd ..
npm test                                # browser logic == Python engine (parity test)
```

---

## What changed in v2 (from the review)

| Review point | v2 |
|---|---|
| MBP priority ignored BBT | Added **ETA − BBT gap** (20%) and **availability** (10%) as factors. The 4 management factors stay in: class 25 · outage freq 20 · dependency 15 · distance 10 |
| MBP vs BBS contradicted each other (e.g. PBI027) | Added a **combined rule**. A hub that goes dark before the MBP arrives always gets *MBP standby + battery upgrade* |
| Estimated BBT was mixed into the status counts | The Overview now separates **Measured vs Estimated**. Estimated values only ever lead to *Inspect & verify* |
| BBT is censored | BBT now uses **Kaplan-Meier**, tested on unseen sites (Jan–Apr → May–Jun). The naive median was biased −22.6 min; KM is biased −3.9 min |
| transport_down 755 h/month | RAN durations are NE-summed. They are now converted to **wall-clock** (÷ NE count, ≤ 24 h/day) |
| PLN 803× / 2,952 h | **3,298 overlapping events merged** into intervals. PBI027 went from 261× / 1,153 h to 35× / 19 h |
| PBI027 had 0 tickets | Matching is correct: the site is simply not in the ticket file. The drawer now says so |
| Island sites "unserved" without explanation | Results now separate *unserved – island (sea logistics)* from *unserved – no free MBP* |
| "Critical" meant two different things | **Priority P1–P4** is now a separate scale from **Battery: Dead / Critical / Degraded / OK** |
| Inspect & verify had no execution plan | Actions are grouped into execution **batches** per priority (Batch 1 ≤ 2 weeks … Batch 4 next quarter) |
| Inactive sites were on by default | They are now **off by default** |
| Relocation coordinates had 1 decimal | Now shown with 5 decimals, plus a real anchor site |
| Muara Enim (6 sites, 0 MBP) | Flagged, and given a cross-NOP nearest-MBP fallback |
| Map was blank, display was raw, Streamlit was slow | Moved to Next.js + Leaflet with automatic offline fallback. No `None`/`nan`, counts shown as integers, all tables paginated with full CSV export |
| Governance | Config is per-browser with JSON export/import and a clear note. Login, roles and audit trail belong in the Watson integration |

Known limits:
- Dependency is a PROXY (there is no topology list in the data).
- Travel time is a speed model, not road routing.
- MBP availability is a PROXY until FMC920 telemetry exists.
- Scope is AREA1, H1-2026, built in batch.

See `docs/METHOD.md`.
