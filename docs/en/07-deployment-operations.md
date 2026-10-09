# 07 · Deployment & operations

## 1. Requirements

| For | Needs |
|---|---|
| Running the app | Node.js 20.9+ (22 LTS recommended) |
| Rebuilding data | Python 3.11+ and `engine/requirements.txt`; the raw files |
| Hosting | A **private** GitHub repo and a Vercel account (or any Node host) |

## 2. Run locally (Windows)

`public/data/` is included, so only Node.js is needed.

```powershell
node -v; npm -v                         # check Node.js
cd C:\PBA\pba-dashboard                 # short local path, not OneDrive
npm install                             # first time, 1–3 min
npm run dev                             # http://localhost:3000
```

- Share on the office network: `npm run dev -- -H 0.0.0.0` → `http://<your-IP>:3000` (`ipconfig`).
- Production-like: `npm run build` then `npm start`.
- Locally, without the auth variables, the app runs without a login.

## 3. Deploy to Vercel with login

The data is Telkomsel-confidential: keep the repo **private** and set the login **before** the first deploy.

**A. GitHub web upload → Vercel**
1. Create a private repo `pba-dashboard` on GitHub.
2. *Add file → Upload files*: upload everything inside the project folder (`app`, `components`, `docs`, `engine`, `i18n`, `lib`, `public`, `tests` and the root files, including the hidden `.gitignore`). Do **not** upload `node_modules`, `.next` or `engine/data`.
3. Check that `package.json` and `proxy.js` are at the repo root.
4. Vercel → *Add New → Project* → import the repo.
5. *Environment Variables* (before deploying):

   | Name | Value |
   |---|---|
   | `BASIC_AUTH_USER` | shared username |
   | `BASIC_AUTH_PASS` | strong password |
   | `NEXT_TELEMETRY_DISABLED` | `1` |

6. Deploy, open the URL and confirm it asks for the login (also in an Incognito window). If the variables were added later: *Deployments → ⋯ → Redeploy*.

**B. Vercel CLI**
```powershell
npm install -g vercel
vercel login
vercel                       # first deploy
vercel env add BASIC_AUTH_USER
vercel env add BASIC_AUTH_PASS
vercel --prod
```

`proxy.js` protects every path (pages and `/data/*` files) with HTTP basic auth whenever both variables are set.

## 4. Data refresh routine

| Step | Command / action | Check |
|---|---|---|
| 1 | Put the new raw files in a folder (same name patterns, see [03 §2](03-data-pipeline.md#2-source-files)) | Data quality › sources shows file counts and times after the build |
| 2 | `cd engine` → `python build.py --raw "<folder>"` | Build sanity all PASS; `npm test` 49/49 at the end |
| 3 | `python validate.py` | `docs/VALIDATION_REPORT.md` = ALL CHECKS PASSED (25/25) |
| 4 | `npm run build` (optional local check) and open the app | Header snapshot dates and refresh time updated |
| 5 | Upload the changed `public/data/` (and `docs/VALIDATION_REPORT.md`) to GitHub | Vercel redeploys automatically |
| 6 | If thresholds were agreed: edit `engine/config/*.yaml`, rebuild, upload | Header config hash changes |

When the period changes (e.g. H2), update `scope.period_*` in `thresholds.yaml`; the period files and month lists follow the data (the period filter currently assumes Jan–Jun 2026 in `lib/period.js` — update `Y` and `MDAYS` there for another range).

## 5. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `BASIC_AUTH_USER`, `BASIC_AUTH_PASS` | Vercel / host | Login for the whole site |
| `NEXT_TELEMETRY_DISABLED=1` | Vercel / host | Disable Next.js telemetry |
| `PBA_RAW_CACHE` | build machine | Cache of parsed raw files |
| `PBA_DAILY_CACHE` | build machine | Cache of the daily RAN read |
| `PBA_SKIP_JS_TESTS=1` | build machine | Skip `npm test` in `build.py` (development only) |

## 6. Security rules

1. GitHub repo **private**; Vercel project with basic auth enabled.
2. **Never commit raw Excel/CSV** — `engine/data/` is git-ignored; only aggregated JSON is published.
3. Share the login only with authorised Telkomsel / Triple-E users; rotate the password when people leave.
4. Do not run `npm audit fix --force` (it can upgrade Next.js/React across major versions and break the build); update dependencies deliberately and re-run tests.
5. The what-if configuration stays in each viewer's browser; it is never sent anywhere.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `'npm' is not recognized` | Reinstall Node.js and open a new terminal |
| `npm install` hangs | Office proxy: `npm config set proxy http://user:pass@proxy:port` and `https-proxy` |
| Port 3000 in use | `npm run dev -- -p 3001` |
| "Could not load data" | `public/data/*.json` missing → rebuild (03 §8) |
| Map dots on a grey background | Basemap tiles (OpenStreetMap) blocked/offline; dots still work |
| "period data unavailable" | `public/data/period/<YYYYMM>.json` missing → rebuild with the daily RAN files |
| Login prompt does not appear on Vercel | Variables added after the deploy → Redeploy |
| `build.py` fails at "JS rule tests" | A rule test failed on the new data — read the failing test name in the output before deploying |
| Numbers differ between two people | Compare the header config hash (one of them may have a what-if config) and the period/filters in the URL |
