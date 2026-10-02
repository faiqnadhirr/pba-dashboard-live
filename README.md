# PBA — Power Backup Analytics (v3)

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

## v3 hardening pass (what changed)

- **Navigation follows the decision chain:**
  1. Health & cause
  2. Accountability
  3. Impact
  4. Trend
  5. Response (MBP map, simulation)
  6. Action list
- **MBP rules.**
  - The radius and battery survival are **hard constraints** in both coverage and simulation.
  - The simulation runs in two passes, so a hopeless site cannot take an MBP that could save another site.
- **Battery evidence precedence:** measured > inspection > ticket > derived > estimate. Conflicts are shown, and an estimate never leads to *Replace*.
- **P1/P2 never get "Monitor".** A measured Dead/Critical site is never below P2.
- **Availability, target and gap (pp)** are shown everywhere, together with the cause decomposition and power responsibility (Observed / Inferred / Unknown, each with a Why).
- **Base camp matching.** PIC → base camp uses normalised and fuzzy matching with a confidence level. Ambiguous matches go to review, and duplicates are flagged, never merged.
- **Access class.** Mainland / Island / Riverine-delta / Remote / Unknown, taken from Dapot only.
- **Coordinates** are shown at source precision.
- **Map:**
  - distinct site and MBP icons
  - independent toggles
  - coverage layer and radius slider
  - MBP selection shows its radius, assigned sites and workload
  - clustering
- **New analytics:** worst clusters, clusters getting worse (Q1 vs Q2), Top 15 worst sites, and the base-camp under-served signal. All are explainable.
- **Labels.**
  - Data is called a "Data snapshot" with a "Last pipeline refresh" time; nothing says "live".
  - KPIs are labelled portfolio vs filtered.
  - An empty filter shows "No active sites match this filter".

## Demo vs operational mode

The app currently runs in **DEMO mode**:

- Config changes stay in the viewer's browser (localStorage) for what-if analysis.
- Export/import JSON lets the team agree a config, which is then committed to `engine/config/`.

**OPERATIONAL mode** would add:

- one approved, server-side config
- roles
- an audit/version trail
- an "effective from" date

## Ready for an API

- All data access goes through `lib/data.js` (`loadAll`, `loadDetail`).
- To move to an API, replace those two `fetch("/data/...")` calls with your endpoints that return the same JSON shapes (columnar `sites`, `mbps`, `meta`, `familiarity`, per-NOP `detail`).
- No component reads files directly.
- The pipeline (`engine/build.py`) can run on a schedule and publish the same JSON.

## Tests

```text
npm test                     # 14 regression tests (scenarios A–K) on lib/logic.js
python engine/validate.py    # 25 data/sanity checks, writes docs/VALIDATION_REPORT.md
```

**Known limits:**

- Dependency is a PROXY.
- ETA is a speed model, not routing.
- MBP availability is a PROXY until FMC920 telemetry exists.
- Cause attribution is proportional, not causal.
- Scope is AREA1, H1-2026.

See `docs/METHOD.md`.
