"""PBA engine: RAW files -> analytics -> compact JSON for the dashboard (public/data/).

Usage:
    python engine/build.py                      # raw files in engine/data/raw
    python engine/build.py --raw "D:/PBA raw"   # any folder (sub-folders ok)
"""
from __future__ import annotations
import argparse
import json
import math
import os
import pickle
import re
import time
from pathlib import Path
import numpy as np
import pandas as pd

import src.common as common
from src.common import load_config, norm_id
from src.ingestion import load as L
from src.normalization import clean as C
from src.analytics import kpi as K
from src.analytics.site_table import assemble
from src.mbp import engine as M
from src.mbp.matching import match_pics, duplicate_basecamps, display_name
from src.common import haversine_km
from src.bbs import model as B
from src.bbs import survival as S

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "public" / "data"
T0 = time.time()


def log(m):
    print(f"[{time.time() - T0:6.1f}s] {m}", flush=True)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


def jclean(v):
    """JSON-safe scalar: NaN/NaT/None -> None, numpy -> python, round floats."""
    if v is None:
        return None
    if isinstance(v, (pd.Timestamp,)):
        return None if pd.isna(v) else v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return None if (math.isnan(v) or math.isinf(v)) else round(float(v), 3)
    if isinstance(v, list):
        return [jclean(x) for x in v]
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: (_coord(v) if k in COORD_COLS else jclean(v)) for k, v in r.items()} for r in df.to_dict("records")]


COORD_COLS = {"lat", "lon", "anchor_lat", "anchor_lon"}


def _coord(v):
    """coordinates keep the source precision (up to 6 decimals) — jclean's 3-decimal rounding (≈ ±110 m) must not apply"""
    try:
        if v is None or pd.isna(v):
            return None
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isinf(f) else round(f, 6)


def columnar(df: pd.DataFrame) -> dict:
    """{'cols': [...], 'rows': [[...], ...]} — ~60% smaller than records."""
    cols = list(df.columns)
    isc = [c in COORD_COLS for c in cols]
    return {"cols": cols, "rows": [[_coord(v) if c else jclean(v) for v, c in zip(r, isc)] for r in df.itertuples(index=False, name=None)]}


def dump(obj, name):
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), default=jclean)
    return p.stat().st_size


def read_raw(cache: str | None):
    if cache and os.path.exists(cache):
        return pickle.load(open(cache, "rb"))
    out = (L.read_dapot(), *L.read_tickets(), *L.read_newbbt(), L.read_bbt_monthly(), L.read_bbt_events(),
           L.read_ran_site_month().to_pandas())
    if cache:
        pickle.dump(out, open(cache, "wb"))
    return out


def source_status():
    out = []
    for label, pat in [("Dapot site master", "*Dapot*ALL*Site*.xlsx"), ("MBP tickets + base camps", "*Tracking*Ticket*MBP*.xlsx"),
                       ("New_BBT site attributes", "*New*BBT*.xlsx"), ("BBT monthly", "*BBT*Site*Details*.csv"),
                       ("BBT events", "*BBT*Export*monthly*.xlsx"), ("RAN availability", "*Avail*RAN*")]:
        f = L._find(pat, required=False)
        out.append(dict(source=label, files=len(f), status="OK" if f else "MISSING",
                        latest_file_time=max(pd.Timestamp(p.stat().st_mtime, unit="s", tz="UTC").tz_convert("Asia/Jakarta") for p in f).strftime("%d %b %Y %H:%M WIB") if f else None))
    return out


MERGE_CSV = ROOT / "config" / "basecamp_merge.csv"


def apply_basecamp_merge(mbps, tickets, dups, qa):
    """Merge duplicate base-camp records using engine/config/basecamp_merge.csv (created on first run).
    The file is the review point: set apply=no to keep a pair separate, or add rows. keep = record that survives."""
    if not MERGE_CSV.exists():
        rows = []
        for r in dups.itertuples():
            a, b = r.mbp_a, r.mbp_b
            ma, mb = mbps.set_index("mbp_id").loc[a], mbps.set_index("mbp_id").loc[b]
            # keep the coded master record (BPSnnn-/MBP-) when one exists, else the located one
            coded = lambda x: bool(re.match(r"^(BPS\d*|MBP|SCD|TS\d*)[-_ ]", x))
            keep, drop = (b, a) if (coded(b) and not coded(a)) or (pd.isna(ma["lat"]) and pd.notna(mb["lat"])) else (a, b)
            rows.append(dict(keep=keep, drop=drop, status=r.status, km_apart=r.km_apart, similarity=r.similarity,
                             apply="yes" if r.status.startswith("LIKELY SAME PERSON") else "no",
                             reviewer_note=""))
        pd.DataFrame(rows).to_csv(MERGE_CSV, index=False)
    mm = pd.read_csv(MERGE_CSV, dtype=str).fillna("")
    ap = mm[mm["apply"].str.lower().isin(["yes", "y", "1", "true"])]
    ids = set(mbps["mbp_id"])
    ap = ap[ap["keep"].isin(ids) & ap["drop"].isin(ids) & (ap["keep"] != ap["drop"])]
    remap = dict(zip(ap["drop"], ap["keep"]))
    m = mbps.set_index("mbp_id")
    for d, k in remap.items():                       # keep record without location inherits the dropped one's location
        if pd.isna(m.at[k, "lat"]) and pd.notna(m.at[d, "lat"]):
            m.loc[k, ["lat", "lon", "coord_status"]] = m.loc[d, ["lat", "lon", "coord_status"]].values
    m = m.drop(index=list(remap)).reset_index()
    m["merged_from"] = m["mbp_id"].map(lambda k: " | ".join(d for d, kk in remap.items() if kk == k) or None)
    m["pic_name"] = m["mbp_id"].map(display_name)       # person (PIC) vs base camp record (location)
    tickets = tickets.copy()
    tickets["mbp_id"] = tickets["mbp_id"].map(lambda x: remap.get(x, x) if isinstance(x, str) else x)
    qa["basecamp_merge"] = {"pairs_in_map": int(len(mm)), "applied": int(len(remap)), "basecamps_before": int(len(mbps)), "basecamps_after": int(len(m))}
    return m, tickets, mm


SANITY: list = []


def sanity(t, corr, f, mbps, tickets, merge_map, qa):
    """Build-time sanity checks (fail the build on error). Rule-level checks run in `npm test` (called at the end)."""
    def chk(name, ok, detail=""):
        SANITY.append(dict(check=name, ok=bool(ok), detail=str(detail)))
    # A6: every correlation n comes from the same cleaned site-table field that is exported
    for r in corr.itertuples():
        n_site = int((t[r.feature].notna() & t["bbt_measured_min"].notna()).sum()) if r.feature in t else -1
        chk(f"A6 correlation n({r.feature}) = site table non-null with measured BBT", n_site == r.n, f"{r.n} vs {n_site}")
    chk("A6 battery_banks exported and populated", t["battery_banks"].notna().sum() > 0, int(t["battery_banks"].notna().sum()))
    # B3: merge map applied, no dropped base camp left in master or tickets
    ap = merge_map[merge_map["apply"].str.lower().isin(["yes", "y", "1", "true"])]
    gone = set(ap["drop"])
    chk("B3 merged base camps removed from master", not (set(mbps["mbp_id"]) & gone), len(gone))
    chk("B3 tickets remapped to surviving base camp", not tickets["mbp_id"].isin(gone).any())
    chk("B3 base camp ids unique", mbps["mbp_id"].is_unique)
    # A2/A5 inputs: monthly series present and physically valid
    ok = all(v is None or len(v) == 6 for v in t["m_pw"])
    chk("A2 monthly power series has 6 months", ok)
    bad = sum(1 for h, p in zip(t["m_hours"], t["m_pw"]) if h and p and any(pp is not None and hh is not None and pp > hh + 1e-6 for pp, hh in zip(p, h)))
    chk("A2 monthly power downtime <= hours in month", bad == 0, bad)
    lat_dec = t["lat"].dropna().map(lambda v: len(f"{round(float(v), 6):.6f}".rstrip("0").split(".")[1]))
    chk("3c coordinates published with more than 3 decimals where the source has them", (lat_dec > 3).mean() > 0.5, f"{(lat_dec > 3).mean():.0%} of sites")
    qa["build_sanity"] = SANITY
    for c in SANITY:
        print(("  PASS " if c["ok"] else "  FAIL ") + c["check"] + ("" if c["ok"] else "  — " + c["detail"]), flush=True)
    if not all(c["ok"] for c in SANITY):
        raise SystemExit("build sanity checks failed")


def run_js_tests():
    """Rule-level regression tests (lib/logic.js) on the freshly written data. Skip with PBA_SKIP_JS_TESTS=1."""
    import shutil, subprocess
    if os.environ.get("PBA_SKIP_JS_TESTS") or not shutil.which("node"):
        log("JS rule tests skipped (node not found or PBA_SKIP_JS_TESTS set) — run `npm test`")
        return
    log("running JS rule tests (npm test)")
    r = subprocess.run(["node", "--test", "tests/logic.test.mjs"], cwd=ROOT.parent, capture_output=True, text=True)
    tail = "\n".join(l for l in r.stdout.splitlines() if l.startswith(("# pass", "# fail", "not ok")))
    print(tail, flush=True)
    if r.returncode != 0:
        raise SystemExit("JS rule tests failed — see `npm test`")


# ---------------------------------------------------------------------- v3.6 operations
GENSET_OFF_WORDS = ("POWER OFF", "SHUTDOWN", "DISMANTLE", "RUSAK", "CUT OFF")


def add_ops_fields(t, tk, qa):
    """Fixed genset per site (PROVISIONAL: Dapot + New_BBT; SWFM is the reference when available) and PLN-off tickets per site.
    fixed_genset: ACTIVE = Dapot 'Genset : Active' with a backup/main-power genset type, or New_BBT backup power = GENSET /
    Genset Fix Telkomsel 1-2 / Genset Fix = active; OFF = genset recorded but powered off / shut down / dismantled; NONE otherwise."""
    gt = t["genset_type"].fillna("").str.upper()
    dap = (t["genset_active"] == 1) & (gt.str.contains("BACKUP POWER") | gt.str.contains("MAIN POWER"))
    fx, st, bk = t["genset_fix_tsel"].fillna(""), t["genset_fix_state"].fillna(""), t["backup_power"].fillna("")
    mp = t["main_power"].fillna("")
    nb = fx.isin(["1", "2"]) | st.eq("GENSET ACTIVE") | bk.eq("GENSET") | mp.str.contains("GENSET")
    off = (fx.str.contains("|".join(GENSET_OFF_WORDS)) | st.str.contains("|".join(GENSET_OFF_WORDS))) & ~dap & ~nb
    t["fixed_genset"] = np.select([dap | nb, off], ["ACTIVE", "OFF"], default="NONE")
    basis = []
    for d_, n_, o_, g_, f_, s_, b_ in zip(dap, nb, off, gt, fx, st, bk):
        if d_: basis.append(f"Dapot: Genset Active, {g_.title()}")
        elif n_: basis.append(f"New_BBT: backup {b_ or '—'} · Genset Fix TSEL {f_ or '—'} · {s_ or '—'}")
        elif o_: basis.append(f"New_BBT: {f_ or s_}")
        else: basis.append(None)
    t["fixed_genset_basis"] = basis
    qa["fixed_genset_active"] = int((t["fixed_genset"] == "ACTIVE").sum())
    qa["fixed_genset_active_dapot"] = int(dap.sum()); qa["fixed_genset_active_newbbt_only"] = int((nb & ~dap).sum())
    qa["fixed_genset_off"] = int((t["fixed_genset"] == "OFF").sum())
    p = tk[(tk["is_pln_off"] == 1) & (tk["status"].str.upper() != "CANCELED")]
    g = p.groupby("site_id")
    t["tk_plnoff_n"] = t["site_id"].map(g.size()).fillna(0).astype(int)
    t["tk_plnoff_visit_n"] = t["site_id"].map(g["checkin_at"].count()).fillna(0).astype(int)
    t["tk_plnoff_rh_h"] = t["site_id"].map(g["rh_hours"].sum(min_count=1)).round(2)


def mbp_productivity(tk):
    """Per base camp (ticket PIC → base camp): tickets handled, PLN-off tickets, visits (check-in), RH genset hours and response time."""
    d = tk[(tk["status"].str.upper() != "CANCELED") & tk["mbp_id"].notna()]
    g = d.groupby("mbp_id")
    out = pd.DataFrame({
        "prod_tickets": g.size(), "prod_plnoff": g["is_pln_off"].sum(), "prod_visits": g["checkin_at"].count(),
        "prod_sites": g["site_id"].nunique(), "prod_rh_total_h": g["rh_hours"].sum(min_count=1), "prod_rh_mean_h": g["rh_hours"].mean(),
        "prod_rh_median_h": g["rh_hours"].median(), "prod_resp_median_h": g["takeover_to_checkin_h"].median(),
    }).reset_index()
    for c in out.columns:
        if c.startswith("prod_rh") or c == "prod_resp_median_h": out[c] = out[c].round(2)
    return out


def export_tickets(tk, qa):
    """v3.7 — MBP jobs (not cancelled, PIC = base camp; rc: P = PLN off, B = battery, S = power rental, O = other) for MBP performance, relocation backtest and dispatch audit.
    Times in minutes from 2026-01-01 00:00 (WIB as recorded). to = take-over − occurred, arr = check-in − occurred, job = take-over →
    RH stop (0–48 h, else RH hours), out: G = genset connected, P = PLN back on arrival, N = no check-in, O = other resolution."""
    d = tk[(tk["status"].str.upper() != "CANCELED") & tk["mbp_id"].notna() & tk["occurred_at"].notna()].copy()
    t0 = pd.Timestamp("2026-01-01")
    mins = lambda x: (x - t0).dt.total_seconds() / 60
    occ = mins(d["occurred_at"])
    to = (d["takeover_at"] - d["occurred_at"]).dt.total_seconds() / 60
    arr = (d["checkin_at"] - d["occurred_at"]).dt.total_seconds() / 60
    job = (d["rh_stop_time"] - d["takeover_at"]).dt.total_seconds() / 3600
    job = job.where(job.between(0, 48)).fillna(d["rh_hours"].astype(float))
    res = d["resolution"].fillna("").str.upper()
    out = np.select([d["checkin_at"].isna(), res.str.contains("GENSET"), res.str.contains("PLN SUDAH")], ["N", "G", "P"], default="O")
    df = pd.DataFrame({"site": d["site_id"].values, "mbp": d["mbp_id"].values, "occ": occ.round(0).astype("Int64").values,
                       "to": to.where(to.between(0, 7 * 1440)).round(0).astype("Int64").values, "arr": arr.where(arr.between(0, 7 * 1440)).round(0).astype("Int64").values,
                       "job": job.round(2).values, "out": out,
                       "rc": np.select([d["is_pln_off"] == 1, d["rc1"].fillna("").str.upper().str.contains("BATERAI"), d["rc1"].fillna("").str.upper().str.contains("SEWA")], ["P", "B", "S"], default="O")})
    df = df.sort_values("occ").reset_index(drop=True)
    qa["tickets_exported"] = len(df)
    return df


def read_dependency(t, qa):
    """v3.7 — optional NOP-officer dependency file engine/data/site_dependency.csv (template from the Dispatch tab):
    site_id, dependency_role, child_sites. Filled values become ACTUAL dependency; empty = keep the HUB-bucket PROXY."""
    f = ROOT / "data" / "site_dependency.csv"
    t["dep_children_actual"] = np.nan; t["dep_role"] = None
    if not f.exists():
        qa["dependency_file"] = "absent"; return
    d = pd.read_csv(f, dtype=str)
    d.columns = [c.strip().lower() for c in d.columns]
    d["site_id"] = d["site_id"].str.strip().str.upper()
    d = d.drop_duplicates("site_id", keep="last").set_index("site_id")
    if "child_sites" in d: t["dep_children_actual"] = pd.to_numeric(t["site_id"].map(d["child_sites"]), errors="coerce")
    if "dependency_role" in d: t["dep_role"] = t["site_id"].map(d["dependency_role"].str.strip().str.upper())
    qa["dependency_file"] = int(t["dep_children_actual"].notna().sum())


def plnoff_concurrency(tk, t):
    """How many MBP jobs run AT THE SAME TIME per NOP (PLN-off tickets with an MBP). Job = take-over (or occurrence) → RH stop
    (or + RH hours, else + median job length). Sampled every hour over the period: max, p99, p95, p90 of simultaneous jobs."""
    d = tk[(tk["is_pln_off"] == 1) & (tk["status"].str.upper() != "CANCELED") & tk["mbp_id"].notna()].copy()
    d["nop"] = d["site_id"].map(t.set_index("site_id")["nop"]).fillna(d["nop"])
    start = d["takeover_at"].fillna(d["occurred_at"])
    end = d["rh_stop_time"].where((d["rh_stop_time"] - start).dt.total_seconds().between(0, 48 * 3600))
    end = end.fillna(start + pd.to_timedelta(d["rh_hours"], unit="h"))
    med = (end - start).dt.total_seconds().median()
    end = end.fillna(start + pd.to_timedelta(med if pd.notna(med) else 3 * 3600, unit="s"))
    d["s"], d["e"] = start, end
    d = d.dropna(subset=["s", "e"])
    hours = pd.date_range("2026-01-01", "2026-07-01", freq="1h", inclusive="left")
    H = hours.values.astype("datetime64[s]").astype(np.int64)
    out = []
    for nop, g in d.groupby("nop"):
        s_ = np.sort(g["s"].values.astype("datetime64[s]").astype(np.int64)); e_ = np.sort(g["e"].values.astype("datetime64[s]").astype(np.int64))
        conc = np.searchsorted(s_, H, side="right") - np.searchsorted(e_, H, side="right")
        out.append(dict(nop=nop, jobs=int(len(g)), max=int(conc.max()), p99=float(np.percentile(conc, 99)), p95=float(np.percentile(conc, 95)),
                        p90=float(np.percentile(conc, 90)), mean=round(float(conc.mean()), 2), median_job_h=round(float(((g["e"] - g["s"]).dt.total_seconds() / 3600).median()), 2)))
    return out


def read_ran_daily(cache: str | None):
    if cache and os.path.exists(cache):
        return pickle.load(open(cache, "rb"))
    d = L.read_ran_site_day().to_pandas()
    if cache:
        pickle.dump(d, open(cache, "wb"))
    return d


def export_period(t, iv, ev, tk, mo, qa):
    """Per month YYYYMM -> public/data/period/YYYYMM.json. Everything is keyed by the site's row index in sites.json.
    ran : site-days with any downtime (seconds, wall-clock, capped per day exactly like the monthly figures)
    days: number of RAN days per site in that month; miss: missing days for sites with a partial month
    pln : merged PLN intervals (start day, seconds) — sites whose PLN source is the BBT event feed
    plnm: monthly-summary PLN (count, hours) for sites without events — month grain only
    evt : mains-fail events per site-day; tk: tickets (day, root-cause class, MBP deployment, RH hours)"""
    idx = {sid: i for i, sid in enumerate(t["site_id"])}
    rd = read_ran_daily(os.environ.get("PBA_DAILY_CACHE"))
    rd["site_id"] = norm_id(rd["site_id"])
    rd = rd[rd["site_id"].isin(idx)].copy()
    rd["i"] = rd["site_id"].map(idx).astype(int); rd["ym"] = rd["ymd"].str[:6]; rd["d"] = rd["ymd"].str[6:8].astype(int)
    ev_src = set(t.loc[t["pln_source"].astype(str).str.startswith("BBT events"), "site_id"])
    rc_list = ["utility", "internal", "battery", "generator", "vendor", "operational"]
    tko = tk[(tk["status"].str.upper() != "CANCELED") & tk["occurred_at"].notna()].copy()
    tko["i"] = tko["site_id"].map(idx); tko = tko[tko["i"].notna()]
    evo = ev.dropna(subset=["mf_start"]).copy(); evo["i"] = evo["site_id"].map(idx); evo = evo[evo["i"].notna()]
    ivo = iv[iv["site_id"].isin(ev_src)].copy(); ivo["i"] = ivo["site_id"].map(idx)
    mo_fb = mo[~mo["site_id"].isin(ev_src)].copy(); mo_fb["i"] = mo_fb["site_id"].map(idx); mo_fb = mo_fb[mo_fb["i"].notna()]
    MD = {1: 31, 2: 28, 3: 31, 4: 30, 5: 31, 6: 30}
    total = 0; rows_ran = 0; check = {}
    (OUT / "period").mkdir(parents=True, exist_ok=True)
    for m in range(1, 7):
        ym = f"20260{m}"
        r = rd[rd["ym"] == ym]
        cnt = r.groupby("i").size()
        days = [0] * len(idx)
        for i_, n_ in cnt.items(): days[int(i_)] = int(n_)
        miss = []
        for i_, g_ in r[r["i"].isin(cnt[cnt < MD[m]].index)].groupby("i"):
            have = set(g_["d"]); miss.append([int(i_)] + [d_ for d_ in range(1, MD[m] + 1) if d_ not in have])
        nz = r[(r[["o", "p", "t", "r", "x"]] > 0).any(axis=1)].sort_values(["i", "d"])
        secs = lambda c: nz[c].round(0).astype(int).tolist()
        ran = {"s": nz["i"].astype(int).tolist(), "d": nz["d"].tolist(), "o": secs("o"), "p": secs("p"), "t": secs("t"), "r": secs("r"), "x": secs("x")}
        rows_ran += len(nz)
        check[ym] = round(float(r["o"].sum() / 3600), 1)
        pi = ivo[(ivo["start"].dt.month == m)]
        pln = {"s": pi["i"].astype(int).tolist(), "d": pi["start"].dt.day.astype(int).tolist(), "h": (pi["hours"] * 3600).round(0).astype(int).tolist()}
        pm = mo_fb[mo_fb["month"] == m]
        hrs = MD[m] * 24.0
        plnm = {"s": pm["i"].astype(int).tolist(), "n": pm["repetitive"].fillna(0).clip(upper=load_config()["power"]["max_pln_events_per_month"]).astype(int).tolist(),
                "h": pm["total_pln_down_h"].fillna(0).clip(upper=hrs).round(2).tolist()}
        em = evo[evo["mf_start"].dt.month == m].assign(d=lambda x: x["mf_start"].dt.day).groupby(["i", "d"]).size().reset_index(name="n")
        evt = {"s": em["i"].astype(int).tolist(), "d": em["d"].astype(int).tolist(), "n": em["n"].astype(int).tolist()}
        tm = tko[tko["occurred_at"].dt.month == m]
        tkd = {"s": tm["i"].astype(int).tolist(), "d": tm["occurred_at"].dt.day.astype(int).tolist(),
               "c": [rc_list.index(c) if c in rc_list else -1 for c in tm["resp_class"]],
               "dep": tm["is_deployment"].astype(int).tolist(), "rh": [None if pd.isna(v) else round(float(v), 2) for v in tm["rh_hours"]]}
        obj = {"ym": ym, "mdays": MD[m], "n_sites": len(idx), "first_site": t["site_id"].iloc[0], "rc": rc_list,
               "ran": ran, "days": days, "miss": miss, "pln": pln, "plnm": plnm, "evt": evt, "tk": tkd}
        total += dump(obj, f"period/{ym}.json")
    qa["period_ran_nonzero_site_days"] = rows_ran
    qa["period_ran_outage_h_by_month"] = check
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=None, help="folder with raw files (default engine/data/raw)")
    a = ap.parse_args()
    if a.raw:
        L.RAW = Path(a.raw)
    cfg = load_config()
    qa: dict = {}

    log("reading raw files")
    dapot, team, track, newbbt, out25, monthly_raw, events_raw, ran_m = read_raw(os.environ.get("PBA_RAW_CACHE"))

    log("cleaning")
    sites, q = C.clean_sites(dapot, newbbt, cfg["scope"]["area"]); qa.update(q)
    mbps = C.clean_mbp(team)
    sites["access_class"], sites["access_basis"] = C.access_class(sites["kepulauan"], sites["city"])
    sites["is_island"] = (sites["access_class"] == "island").astype(int)       # only true islands lose road ETA
    d1 = dapot[dapot["Area"].astype(str).str.upper().str.replace(" ", "") == cfg["scope"]["area"]].copy()
    d1["sid"] = norm_id(d1["Site ID"])
    dec = d1.drop_duplicates("sid").set_index("sid")["Lat"].astype(str).str.split(".").str[1].str.len()
    sites["coord_decimals"] = sites["site_id"].map(dec).fillna(0).clip(upper=6).astype(int)
    qa["access_class"] = sites["access_class"].value_counts().to_dict()
    tickets, q = C.clean_tickets(track, set(mbps["mbp_id"]), cfg["mbp"]["rh_max_hours_per_ticket"]); qa.update(q)
    # ---- MBP identity: fuzzy / normalised matching of ticket PIC -> base camp (never blind-merged)
    pic = tickets.dropna(subset=["mbp_id"]).groupby("mbp_id").agg(
        n=("site_id", "size"), nop=("nop", lambda x: x.mode().iloc[0] if len(x.mode()) else None)).reset_index().rename(columns={"mbp_id": "pic"})
    pm = match_pics(pic, mbps[["mbp_id", "nop"]]).merge(pic, on="pic", how="left")
    pmap = dict(zip(pm.loc[pm["status"] == "MATCHED", "pic"], pm.loc[pm["status"] == "MATCHED", "mbp_id"]))
    tickets["pic_raw"] = tickets["mbp_id"]
    tickets["mbp_id"] = tickets["mbp_id"].map(lambda x: pmap.get(x, x) if isinstance(x, str) else x)
    tickets["mbp_matched"] = tickets["mbp_id"].isin(set(mbps["mbp_id"])).astype(int)
    qa["ticket_mbp_match_rate_exact"] = qa["ticket_mbp_match_rate"]
    qa["ticket_mbp_match_rate"] = round(float(tickets["mbp_matched"].mean()), 4)
    qa["pic_match_status"] = pm["status"].value_counts().to_dict()
    dups = duplicate_basecamps(mbps, haversine_km)
    # ---- reviewable merge map (B3): default = merge only "LIKELY SAME PERSON (<= 20 km, same NOP)"
    mbps, tickets, merge_map = apply_basecamp_merge(mbps, tickets, dups, qa)
    events, q = C.clean_bbt_events(events_raw); qa.update(q)
    monthly = C.clean_bbt_monthly(monthly_raw)
    o25 = C.clean_outage_2025(out25)
    ran_m["site_id"] = norm_id(ran_m["site_id"])
    SID = set(sites["site_id"])
    nop_sites = sites["nop"].value_counts()
    qa["nop_small"] = {k: int(v) for k, v in nop_sites[nop_sites < 50].items()}
    sites["nop_flag"] = sites["nop"].map(lambda n: "NOP with < 50 sites in Dapot — check NOP mapping" if nop_sites.get(n, 0) < 50 else None)
    unmatched = []
    for name, ids in [("tickets", tickets["site_id"]), ("bbt_events", events["site_id"]), ("bbt_monthly", monthly["site_id"]),
                      ("ran", ran_m["site_id"]), ("new_bbt", norm_id(newbbt["Site ID"]))]:
        u = sorted(set(ids.dropna()) - SID)
        qa[f"unmatched_{name}"] = len(u)
        unmatched += [dict(source=name, id=x, n=None) for x in u]
    for _, r in pm[pm["status"] != "MATCHED"].iterrows():
        unmatched.append(dict(source=f"ticket PIC — {r['status']}", id=r["pic"], n=int(r["n"]), note=f"{r['basis']} {r['candidates']}".strip()))
    blank = int(tickets["pic_raw"].isna().sum())
    if blank:
        unmatched.append(dict(source="ticket PIC — blank", id="(blank)", n=blank, note=""))
    tk = tickets[tickets["site_id"].isin(SID)]
    ev = events[events["site_id"].isin(SID)]
    mo = monthly[monthly["site_id"].isin(SID)]
    ran = ran_m[ran_m["site_id"].isin(SID)]
    tk_sites = set(tk["site_id"])

    log("PLN: merge overlapping outage intervals")
    iv = K.merged_pln_intervals(ev)
    qa["pln_raw_events"] = len(ev)
    qa["pln_merged_intervals"] = len(iv)
    qa["pln_overlapping_events_merged"] = int(len(ev) - len(iv))

    log("site KPIs (site grain before join)")
    pwr = K.site_power_kpi_v2(iv, mo, ran, tk, o25, cfg["power"]["max_pln_events_per_month"])
    mbp_k = K.site_mbp_kpi(tk)
    wl = K.mbp_workload(tk)
    fam = K.familiarity(tk)
    vendor = ran.sort_values("ym").groupby("site_id")["vendor"].last().reset_index()
    # availability decomposition inputs (wall-clock hours) + two periods for trend (Q1 = Jan–Mar, Q2 = Apr–Jun)
    rq = ran.assign(q=np.where(ran["ym"] <= "202603", "q1", "q2"), hrs=ran["days"] * 24.0)
    agg = rq.groupby("site_id").agg(ran_hours=("hrs", "sum"), ran_ran_down_h=("ran_sec", lambda x: x.sum() / 3600),
                                    ran_other_down_h=("other_sec", lambda x: x.sum() / 3600))
    for qq in ("q1", "q2"):
        g_ = rq[rq["q"] == qq].groupby("site_id")
        agg[f"{qq}_hours"] = g_["hrs"].sum()
        agg[f"{qq}_outage_h"] = g_["outage_sec"].sum() / 3600
        agg[f"{qq}_power_h"] = g_["power_sec"].sum() / 3600
    pwr = pwr.merge(agg.reset_index(), on="site_id", how="left")
    # responsibility evidence: ticket root-cause classes per site (OBSERVED)
    rc = tk[tk["status"].str.upper() != "CANCELED"].pivot_table(index="site_id", columns="resp_class", values="ticket_inap",
                                                                 aggfunc="count", fill_value=0)
    rc.columns = [f"rc_{c}" for c in rc.columns]
    pwr = pwr.merge(rc.reset_index(), on="site_id", how="left")

    log("BBT: Kaplan-Meier (censoring-aware)")
    km = S.site_km(ev)
    g = ev.groupby("site_id")
    bk = pd.DataFrame({"evt_total": g.size(), "evt_exhaustion": g["is_exhaustion"].sum(), "evt_censored": g["is_censored"].sum()})
    bk["evt_flapping"] = (bk["evt_total"] > cfg["bbt"]["max_events_per_site_flag"]).astype(int)
    e2 = ev[ev["is_exhaustion"] == 1].assign(h=lambda d: np.where(d["month"] >= 4, "h2", "h1"))
    tr = e2.pivot_table(index="site_id", columns="h", values="backup_min", aggfunc="median")
    bk["bbt_trend_min"] = tr.get("h2") - tr.get("h1")
    bk = bk.join(km.set_index("site_id"), how="outer")
    mb = mo[mo["category"].str.upper() == "BBT"].groupby("site_id")["bbt_median_min"].median()
    bk = bk.join(mb.rename("bbt_monthly_median_min"), how="outer")
    # measured = own KM median actually reached. If the battery outlived most outages (median not reached) we only
    # know a LOWER BOUND -> such sites are estimated (comparable-site KM conditional on what they survived).
    lb_only = (bk["km_n_exhausted"].fillna(0) >= 1) & (bk["km_median_is_lower_bound"].fillna(0) == 1)
    bk.loc[lb_only, "km_lower_bound_min"] = np.fmax(bk.loc[lb_only, "km_lower_bound_min"], bk.loc[lb_only, "km_median_min"])
    has = (bk["km_n_exhausted"].fillna(0) >= 1) & ~lb_only
    # monthly summary is only a fallback, and is rejected when it contradicts what the events prove the battery survived
    contra = bk["bbt_monthly_median_min"].notna() & bk["km_lower_bound_min"].notna() & (bk["bbt_monthly_median_min"] < bk["km_lower_bound_min"])
    qa["bbt_monthly_rejected_contradiction"] = int((contra & ~has).sum())
    bk.loc[contra, "bbt_monthly_median_min"] = np.nan
    bk["bbt_measured_min"] = np.where(has, bk["km_median_min"], bk["bbt_monthly_median_min"])
    bk["bbt_measured_evidence"] = np.where(has, "ACTUAL", np.where(bk["bbt_monthly_median_min"].notna(), "DERIVED", None))
    bk["bbt_measured_source"] = np.where(
        has, "Kaplan-Meier median of own events (" + bk["km_n_events"].fillna(0).astype(int).astype(str) + " events, "
        + bk["km_n_exhausted"].fillna(0).astype(int).astype(str) + " battery-exhausted)",
        np.where(bk["bbt_monthly_median_min"].notna(), "BBT monthly summary (median)", None))
    bk["bbt_is_lower_bound"] = 0
    qa["bbt_sites_outlived_outages"] = int(lb_only.sum())
    bk["bbt_lower_bound_min"] = bk["km_lower_bound_min"]
    bbt_k = bk.reset_index().rename(columns={"index": "site_id"})

    log("MBP: pairs + coverage")
    pairs = M.site_mbp_pairs(sites, mbps, cfg["mbp"]["same_nop_only"])
    cov = M.assign_coverage(sites, pairs, mbp_k, cfg, mbps)

    log("BBS: correlation + estimation (time split Jan–Apr -> May–Jun)")
    t0 = assemble(sites, bbt_k, pwr, mbp_k, cov, None, vendor, cfg)
    f = B.build_features(t0)
    corr = B.correlation_table(f)
    cat = B.categorical_table(f)
    test_sites = S.holdout_sites(ev["site_id"])
    ts = S.evaluate_time_split(ev, t0[["site_id", "site_class", "battery_type", "nop"]], test_sites)
    # 'AI' comparison: gradient boosting trained on Jan–Apr site KM medians -> May–Jun
    from sklearn.ensemble import HistGradientBoostingRegressor
    tr_km = S.site_km(ev[(ev["month"] <= 4) & ~ev["site_id"].isin(test_sites)])
    te_km = S.site_km(ev[(ev["month"] >= 5) & ev["site_id"].isin(test_sites)])
    te_km = te_km[(te_km["km_n_events"] >= 3) & (te_km["km_n_exhausted"] >= 1) & (te_km["km_median_is_lower_bound"] == 0)]
    # leakage guard: power features for the evaluation come from Jan–Apr only (target is May–Jun)
    iv4 = iv[iv["month"] <= 4].groupby("site_id")["hours"].agg(["size", "sum", "max"])
    ran4 = ran[ran["ym"] <= "202604"].groupby("site_id")["power_sec"].sum() / 3600
    fe = f.copy().set_index("site_id")
    fe["pln_freq"] = iv4["size"].reindex(fe.index).fillna(0); fe["pln_total_h"] = iv4["sum"].reindex(fe.index).fillna(0)
    fe["pln_max_event_h"] = iv4["max"].reindex(fe.index); fe["pln_avg_h"] = fe["pln_total_h"] / fe["pln_freq"].replace(0, np.nan)
    fe["ran_power_down_h"] = ran4.reindex(fe.index)
    fe = fe.reset_index()
    trd = fe.drop(columns=["bbt_lower_bound_min"]).merge(
        tr_km[tr_km["km_n_exhausted"] >= 1][["site_id", "km_median_min"]].rename(columns={"km_median_min": "y_"}), on="site_id")
    ted = fe.drop(columns=["bbt_lower_bound_min"]).merge(
        te_km[["site_id", "km_median_min"]].rename(columns={"km_median_min": "y_"}), on="site_id")
    trd["bbt_lower_bound_min"] = np.nan; ted["bbt_lower_bound_min"] = np.nan
    Xtr, cats = B._matrix(trd); Xte, _ = B._matrix(ted, cats)
    gb = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, min_samples_leaf=40,
                                       categorical_features=[c in B.CAT_FEATS for c in Xtr.columns], random_state=42)
    gb.fit(Xtr, trd["y_"])
    pg = gb.predict(Xte); y = ted["y_"].to_numpy()
    ts = pd.concat([ts, pd.DataFrame([dict(method="Gradient boosting (AI, site features)", n_test_sites=len(y),
                                           mae_min=round(float(np.mean(np.abs(pg - y))), 1), bias_min=round(float(np.mean(pg - y)), 1),
                                           status_accuracy=round(float((B._status_vec(pg) == B._status_vec(y)).mean()), 3))])],
                   ignore_index=True)
    km_row = ts.set_index("method").loc["KM comparable-site (censoring-aware)"]
    gb_row = ts.set_index("method").loc["Gradient boosting (AI, site features)"]
    chosen = "gradient_boosting" if gb_row["mae_min"] <= 0.95 * km_row["mae_min"] else "km_comparable"
    log(f"   time-split: KM MAE {km_row['mae_min']} · GB MAE {gb_row['mae_min']} -> {chosen}")

    # ---- estimate sites without measured BBT
    curves = S.group_curves(ev, t0[["site_id", "site_class", "battery_type", "nop"]])
    unl = f[f["bbt_measured_min"].isna()].copy()
    if chosen == "gradient_boosting":
        Xu, _ = B._matrix(unl.assign(bbt_lower_bound_min=np.nan), cats)
        gbp = gb.predict(Xu)
    rows = []
    for i, (_, r) in enumerate(unl.iterrows()):
        lb = r["bbt_lower_bound_min"]
        informative = pd.notna(lb) or pd.notna(r.get("battery_type")) or (r.get("pln_freq") or 0) > 0 or pd.notna(r.get("bbt_max_2025_min"))
        if not informative:
            rows.append(dict(site_id=r["site_id"], bbt_est_min=None, bbt_est_confidence=None, bbt_est_method=None,
                             bbt_est_evidence="UNAVAILABLE"))
            continue
        if chosen == "gradient_boosting":
            v = float(gbp[i]); meth = "gradient boosting (site features)"
            if pd.notna(lb):
                v = max(v, lb); meth += f" | floored at survived {lb:.0f} min"
        else:
            v, meth, _n = S.group_estimate(r, curves, lb if pd.notna(lb) else None)
        conf = "Medium-Low" if pd.notna(lb) else "Low"
        rows.append(dict(site_id=r["site_id"], bbt_est_min=None if pd.isna(v) else math.ceil(v * 10) / 10,
                         bbt_est_confidence=conf, bbt_est_method=meth, bbt_est_evidence="ESTIMATED"))
    est = pd.DataFrame(rows)
    mae = float(ts.set_index("method").loc["KM comparable-site (censoring-aware)" if chosen == "km_comparable"
                                           else "Gradient boosting (AI, site features)", "mae_min"])
    est["bbt_est_low_min"] = (est["bbt_est_min"] - mae).clip(lower=0)
    est["bbt_est_high_min"] = est["bbt_est_min"] + mae

    t = assemble(sites, bbt_k, pwr, mbp_k, cov, est, vendor, cfg)
    t = B.build_features(t)
    t["in_ticket_file"] = t["site_id"].isin(tk_sites).astype(int)
    add_ops_fields(t, tk, qa)
    read_dependency(t, qa)
    assert len(t) == len(sites) and t["site_id"].is_unique, "row multiplication!"
    # decision logic (coverage, survival, status, priority, action, cause, responsibility) lives in ONE place:
    # lib/logic.js — the dashboard, simulation, map, exports and tests all use it. Python only prepares evidence.

    # ------------------------------------------------------------------ export
    log("writing JSON")
    for old in OUT.glob("**/*.json"):
        old.unlink()
    rc_cols = [c for c in t.columns if c.startswith("rc_") and c != "rc_owner"]
    site_cols = [
        # identity & context
        "site_id", "site_name", "site_class", "nop", "nop_flag", "cluster_to", "city", "site_active", "vip",
        "lat", "lon", "coord_decimals", "is_urban", "access_class", "access_basis", "hub_site",
        # battery evidence
        "battery_type", "battery_age_y", "load_a", "battery_banks", "battery_qty", "bbt_value_min", "bbt_value_evidence", "bbt_value_basis", "bbt_measured_min",
        "bbt_lower_bound_min", "bbt_est_confidence", "bbt_est_low_min", "bbt_est_high_min", "bbt_trend_min",
        "evt_total", "evt_exhaustion", "evt_censored", "evt_flapping", "tk_no_battery",
        # power / PLN
        "pln_freq", "pln_total_h", "pln_source", "pln_anomaly_months", "outage_2025_h",
        # availability (RAN, wall-clock) incl. cause decomposition + trend periods
        "avail_wc_pct", "ran_target_pct", "ran_hours", "ran_outage_h", "ran_power_down_h", "ran_transport_down_h",
        "ran_ran_down_h", "ran_other_down_h", "m_hours", "m_out", "m_pw", "q1_hours", "q1_outage_h", "q1_power_h", "q2_hours", "q2_outage_h", "q2_power_h",
        # MBP history
        "in_ticket_file", "mbp_primary_hist", "mbp_deployments", "mbp_backup_h",
        # v3.6 operations: fixed genset (PROVISIONAL until SWFM), location detail, PLN-off tickets & visits
        "fixed_genset", "fixed_genset_basis", "genset_kva", "kecamatan", "desa", "battery_brand",
        "tk_plnoff_n", "tk_plnoff_visit_n", "tk_plnoff_rh_h",
        # v3.7 dependency from NOP officers (ACTUAL when filled)
        "dep_children_actual", "dep_role",
    ] + rc_cols
    for c in rc_cols:
        t[c] = t[c].fillna(0).astype(int)
    # per-month RAN series (Jan..Jun) — dark-site definition and off-air detection are computed per month in lib/logic.js
    yms = [f"20260{m}" for m in range(1, 7)]
    rr = ran.assign(h=ran["days"].astype(float) * 24, o=ran["outage_sec"] / 3600, p=ran["power_sec"] / 3600)
    piv = {k: rr.pivot_table(index="site_id", columns="ym", values=k, aggfunc="sum").reindex(columns=yms) for k in ("h", "o", "p")}
    for k, col in (("h", "m_hours"), ("o", "m_out"), ("p", "m_pw")):
        P = piv[k].reindex(t["site_id"])
        t[col] = [None if np.all(np.isnan(r)) else [None if np.isnan(v) else round(float(v), 2) for v in r] for r in P.to_numpy(dtype=float)]
    sanity(t, corr, f, mbps, tickets, merge_map, qa)
    sz = {}
    sz["sites.json"] = dump(columnar(t[site_cols]), "sites.json")
    mbp_out = mbps.merge(wl, on="mbp_id", how="left").merge(mbp_productivity(tk), on="mbp_id", how="left")
    sz["mbps.json"] = dump(records(mbp_out), "mbps.json")
    sz["familiarity.json"] = dump(columnar(fam), "familiarity.json")
    sz["tickets.json"] = dump(columnar(export_tickets(tk, qa)), "tickets.json")
    # per-NOP detail files (lazy-loaded by the site drawer)
    ran2 = ran.assign(power_h=ran["power_sec"] / 3600, transport_h=ran["transport_sec"] / 3600, outage_h=ran["outage_sec"] / 3600,
                      avail_wc=100 * (1 - ran["outage_sec"] / (ran["days"] * 86400)))
    ivm = iv.groupby(["site_id", "month"]).agg(pln_n=("hours", "size"), pln_h=("hours", "sum")).reset_index()
    evm = ev.groupby(["site_id", "month"]).agg(exh=("is_exhaustion", "sum"), cen=("is_censored", "sum")).reset_index()
    exm = ev[ev["is_exhaustion"] == 1].groupby(["site_id", "month"])["backup_min"].median().rename("bbt_med").reset_index()
    tk_cols = ["occurred_at", "ticket_swfm", "rc1", "rc2", "resolution", "mbp_id", "takeover_at", "checkin_at", "rh_hours", "status"]
    R = {(a_, b_): r for a_, b_, r in zip(ran2["site_id"], ran2["ym"], ran2[["avail_wc", "power_h", "transport_h"]].to_numpy())}
    I = {(a_, b_): (n_, h_) for a_, b_, n_, h_ in zip(ivm["site_id"], ivm["month"], ivm["pln_n"], ivm["pln_h"])}
    E = {(a_, b_): (x1, x2) for a_, b_, x1, x2 in zip(evm["site_id"], evm["month"], evm["exh"], evm["cen"])}
    X = {(a_, b_): v for a_, b_, v in zip(exm["site_id"], exm["month"], exm["bbt_med"])}
    TK = {k: g_ for k, g_ in tk.sort_values("occurred_at", ascending=False).groupby("site_id")}
    EV = {k: g_ for k, g_ in ev.sort_values("mf_start", ascending=False).groupby("site_id")}
    for nop, ss in t.groupby("nop"):
        det = {}
        for sid in ss["site_id"]:
            months = []
            for m in range(1, 7):
                rr = R.get((sid, f"20260{m}")); ii = I.get((sid, m), (0, 0)); ee = E.get((sid, m), (0, 0))
                months.append([m] + ([jclean(x) for x in rr] if rr is not None else [None, None, None])
                              + [int(ii[0]), jclean(ii[1]), int(ee[0]), int(ee[1]), jclean(X.get((sid, m)))])
            kk = TK[sid].head(25) if sid in TK else tk.iloc[0:0]
            es = EV[sid].head(60) if sid in EV else ev.iloc[0:0]
            det[sid] = {"m": months,
                        "tk": [[jclean(v) for v in r] for r in kk[tk_cols].itertuples(index=False, name=None)],
                        "ev": [[jclean(r.mf_start), jclean(r.backup_min), int(r.is_exhaustion)] for r in es.itertuples()]}
        dump(det, f"detail/{slug(nop)}.json")
    sz["detail/*"] = sum(p.stat().st_size for p in (OUT / "detail").glob("*.json"))

    # v3.4 period filter — one file per month with SPARSE site-day series (site index = row of sites.json)
    log("period files (daily RAN, PLN intervals, events, tickets)")
    sz["period/*"] = export_period(t, iv, ev, tk, mo, qa)

    # analytics + meta
    curves_out = []
    for keys in (["site_class"], ["battery_type"]):
        for k, gg in ev.merge(t[["site_id", "site_class", "battery_type"]], on="site_id").groupby(keys[0]):
            tt, sv = S.km_curve(gg["backup_min"].to_numpy(), gg["is_exhaustion"].to_numpy())
            step = max(1, len(tt) // 60)
            curves_out.append(dict(by=keys[0], group=str(k), n=len(gg), median=jclean(S.km_median(tt, sv)),
                                   pts=[[round(float(a_), 1), round(float(b_), 3)] for a_, b_ in zip(tt[::step], sv[::step])]))
    # monthly portfolio series per NOP (small) for the Health / Trend charts
    rm = ran.merge(t[["site_id", "nop", "site_active", "ran_target_pct"]], on="site_id", how="left")
    rm["hrs"] = rm["days"].astype(float) * 24.0
    rm["tgt_h"] = rm["ran_target_pct"] * rm["hrs"]
    monthly_nop = rm.groupby(["nop", "site_active", "ym"]).agg(sites=("site_id", "nunique"), hours=("hrs", "sum"), target_h=("tgt_h", "sum"),
                                                             outage=("outage_sec", lambda x: x.sum() / 3600), power=("power_sec", lambda x: x.sum() / 3600),
                                                             transport=("transport_sec", lambda x: x.sum() / 3600), ran=("ran_sec", lambda x: x.sum() / 3600),
                                                             other=("other_sec", lambda x: x.sum() / 3600)).reset_index()
    meta = {
        "built_at": pd.Timestamp.now(tz="Asia/Jakarta").strftime("%Y-%m-%d %H:%M WIB"),
        "snapshot": {"period_start": cfg["scope"]["period_start"], "period_end": cfg["scope"]["period_end"],
                     "refreshed_at": pd.Timestamp.now(tz="Asia/Jakarta").strftime("%d %b %Y %H:%M WIB"),
                     "sources": source_status()},
        "scope": cfg["scope"], "config": cfg, "qa": qa,
        "bbs": {"correlation": records(corr), "category_medians": records(cat), "time_split": records(ts),
                "chosen_estimator": chosen, "estimator_mae_min": mae, "km_curves": curves_out,
                "naive_vs_km": {"naive_median_all": jclean(km["naive_exhausted_median_min"].median()),
                                "km_median_all": jclean(km["km_median_min"].median())}},
        "mbp": {"pic_matches": records(pm), "duplicates": records(dups), "concurrency": plnoff_concurrency(tk, t)},
        "dq": {"unmatched": unmatched,
               "sources": [
                   dict(source="Dapot ALL Site (AREA1)", raw=qa["dapot_rows_area"], clean=len(sites), grain="site"),
                   dict(source="MBP Team", raw=len(team), clean=len(mbps), grain="MBP"),
                   dict(source="Tracking Ticket", raw=qa["ticket_rows"], clean=len(tickets), grain="ticket"),
                   dict(source="BBT events", raw=qa["bbt_event_rows"], clean=len(events), grain="event"),
                   dict(source="PLN outage intervals (merged)", raw=len(ev), clean=len(iv), grain="interval"),
                   dict(source="BBT monthly (6 CSV)", raw=len(monthly_raw), clean=len(monthly), grain="site-month"),
                   dict(source="RAN availability", raw=None, clean=len(ran_m), grain="site-month (wall-clock)"),
                   dict(source="New_BBT master", raw=len(newbbt), clean=int(t["hub_site"].notna().sum()), grain="site")],
               "mbp_coords": mbps["coord_status"].value_counts().to_dict()},
        "monthly_nop": records(monthly_nop),
        "sizes": sz,
    }
    sz["meta.json"] = dump(meta, "meta.json")
    # keep a parquet of the full site table for validation
    t.to_pickle(ROOT / "data" / "site_table.pkl")
    pd.to_pickle(dict(ev=ev, iv=iv, tk=tk, ran=ran, mo=mo), ROOT / "data" / "sources.pkl")
    log("sizes: " + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sz.items()))
    run_js_tests()
    log("done")


if __name__ == "__main__":
    main()
