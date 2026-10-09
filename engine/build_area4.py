"""v3.8 — AREA 4 (Kalimantan · Sulawesi · Maluku-Papua) light pipeline.

What AREA 4 has today (engine/data/raw_a4/): RAN availability monthly (Jan–Jul 2026) and weekly (W1–W31), one BBT Site Details
snapshot, the HW Master FME (BPS / PM / TS field staff, AREA 2 + 4) — plus the shared Dapot master (engine/data/raw).
What it does NOT have yet: MBP ticket tracking, BBT event export, New_BBT battery inventory, daily RAN, PLN intervals.
So AREA 4 gets: availability vs target + causes per site → cluster → NOP, monthly/weekly trend, battery status from BBT Site Details,
field-staff map (BPS = MBP operators) with simple coverage; MBP performance / backtest / dispatch need the missing sources.

Usage:  python build_area4.py            → ../public/data/a4/{sites,weekly,fme,meta}.json
Personal data rule: e-mail and phone numbers in the FME master are NEVER exported.
"""
from __future__ import annotations
import io, json, sys, time, zipfile, glob
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from src.common import dur_to_sec, norm_id, norm_nop, to_num, load_config  # noqa: E402

RAW4 = ROOT / "data" / "raw_a4"
RAW = ROOT / "data" / "raw"
OUT = ROOT.parent / "public" / "data" / "a4"
BBOX = dict(lon=(108.0, 141.5), lat=(-11.5, 5.5))
T0 = time.time()
log = lambda m: print(f"[{time.time() - T0:6.1f}s] {m}", flush=True)
MONTHS = [f"20260{m}" for m in range(1, 8)]


def xl(p, **kw):
    try:
        return pd.read_excel(p, engine="calamine", **kw)
    except Exception:
        return pd.read_excel(p, **kw)


def num(s):
    return pd.to_numeric(s.astype("string").str.replace(",", ".", regex=False).replace({"-": pd.NA, "": pd.NA}), errors="coerce")


def read_ran(pattern):
    frames = []
    for z in sorted(RAW4.glob(pattern)):
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.lower().endswith(".csv"):
                    frames.append(pd.read_csv(io.BytesIO(zf.read(n)), dtype=str))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


def jclean(v):
    if v is None: return None
    if isinstance(v, (np.integer,)): return int(v)
    if isinstance(v, (np.floating, float)):
        return None if not np.isfinite(v) else round(float(v), 4)
    if v is pd.NA or (isinstance(v, float) and np.isnan(v)): return None
    return v


def columnar(df):
    return {"cols": list(df.columns), "rows": [[jclean(v) if not isinstance(v, list) else v for v in r] for r in df.itertuples(index=False, name=None)]}


def dump(obj, name):
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / name
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), default=jclean)
    return p.stat().st_size


def main():
    cfg = load_config()
    qa, inv = {}, []
    # ---------------------------------------------------------------- Dapot (shared master, AREA 4 rows)
    log("Dapot (AREA 4 rows)")
    dp = xl(next(iter(sorted(RAW.glob("*Dapot*ALL*Site*.xlsx")))))
    d = dp[dp["Area"].astype("string").str.upper().str.replace(" ", "", regex=False) == "AREA4"].copy()
    d["site_id"] = norm_id(d["Site ID"]); d = d.drop_duplicates("site_id")
    s = pd.DataFrame({
        "site_id": d["site_id"], "site_name": d["Site Name"].astype("string").str.strip(), "site_class": d["Site Class"].astype("string").str.strip().fillna("Unknown"),
        "nop": norm_nop(d["NOP"]), "cluster_to": d["Cluster"].astype("string"), "regional": d["Regional"].astype("string"),
        "province": d["Province"].astype("string"), "city": d["City"].astype("string"),
        "kecamatan": d["Subdistrict"].astype("string").str.strip().str.upper(),
        "site_active": d["Site : Active"].astype("string").str.lower().eq("true").fillna(False).astype(int),
        "genset_active": d["Genset : Active"].astype("string").str.lower().eq("true").fillna(False).astype(int),
        "genset_type": d["Genset Type"].astype("string"), "genset_kva": to_num(d["Genset Capacity"]),
        "is_island": d["Kepulauan"].astype("string").str.upper().eq("KEPULAUAN").fillna(False).astype(int),
        "last_pm": pd.to_datetime(d["Last Maintenance Site"], errors="coerce").dt.strftime("%Y-%m-%d"),
        "lat": to_num(d["Lat"]), "lon": to_num(d["Lon"]),
    })
    s["is_urban"] = s["city"].str.upper().str.startswith("KOTA").fillna(False).astype(int)
    ok = s["lon"].between(*BBOX["lon"]) & s["lat"].between(*BBOX["lat"])
    qa["dapot_rows"] = len(s); qa["bad_coords"] = int((~ok).sum()); s.loc[~ok, ["lat", "lon"]] = np.nan
    gt = s["genset_type"].fillna("").str.upper()
    s["fixed_genset"] = np.where((s["genset_active"] == 1) & (gt.str.contains("BACKUP POWER") | gt.str.contains("MAIN POWER")), "ACTIVE", "NONE")
    inv.append(dict(source="Dapot site master (AREA 4 rows)", rows=len(s), period="snapshot", status="OK"))

    # ---------------------------------------------------------------- RAN monthly (site-month)
    log("RAN monthly")
    m = read_ran("*monthly*.zip")
    m["site_id"] = norm_id(m["site_id"])
    for c in ["outage (Sec)", "denum (Sec)", "duration_power (Sec)", "duration_transport (Sec)", "duration_ran (Sec)", "duration_other (Sec)"]:
        m[c] = num(m[c]).fillna(0)
    m["avail"] = num(m["availability (%)"]); m["target"] = num(m["target (%)"])
    m["days"] = pd.to_datetime(m["last_day_period"], errors="coerce").dt.day.fillna(30)
    m["ne"] = (m["denum (Sec)"] / (m["days"] * 86400)).clip(lower=1)
    wc = lambda c: (m[c] / m["ne"]).clip(upper=m["days"] * 86400) / 3600
    m["out_h"], m["pw_h"], m["tr_h"], m["ran_h"], m["oth_h"] = wc("outage (Sec)"), wc("duration_power (Sec)"), wc("duration_transport (Sec)"), wc("duration_ran (Sec)"), wc("duration_other (Sec)")
    m["hours"] = m["days"] * 24
    m = m.sort_values("period").drop_duplicates(["site_id", "period"], keep="last")
    inv.append(dict(source="RAN availability monthly", rows=len(m), period=f"{m['period'].min()}–{m['period'].max()}", status="OK"))
    g = m.groupby("site_id")
    agg = pd.DataFrame({
        "ran_out_s": g["outage (Sec)"].sum(), "ran_den_s": g["denum (Sec)"].sum(), "ran_hours": g["hours"].sum(),
        "ran_outage_h": g["out_h"].sum(), "ran_power_down_h": g["pw_h"].sum(), "ran_transport_down_h": g["tr_h"].sum(),
        "ran_ran_down_h": g["ran_h"].sum(), "ran_other_down_h": g["oth_h"].sum(), "ran_target_pct": g["target"].max(),
        "ran_months": g.size(), "vendor": g["vendor"].last(), "class_ran": g["site_class"].last(),
        "nop_ran": g["networksite"].last(), "to_ran": g["districtoperation"].last(), "kab_ran": g["kabupaten"].last(), "kec_ran": g["kecamatan"].last(),
    })
    agg["avail_pct"] = 100 * (1 - agg["ran_out_s"] / agg["ran_den_s"].replace(0, np.nan))
    piv = {k: m.pivot_table(index="site_id", columns="period", values=k, aggfunc="sum").reindex(columns=MONTHS) for k in ("avail", "pw_h", "out_h")}
    for k, col in (("avail", "m_avail"), ("pw_h", "m_pw"), ("out_h", "m_out")):
        P = piv[k].reindex(agg.index)
        agg[col] = [[None if np.isnan(v) else round(float(v), 3) for v in r] for r in P.to_numpy(dtype=float)]
    agg = agg.reset_index()

    # sites = Dapot AREA 4 ∪ RAN sites (RAN-only sites keep RAN context; no coordinates)
    t = s.merge(agg, on="site_id", how="outer")
    for a, b in (("nop", "nop_ran"), ("cluster_to", "to_ran"), ("kecamatan", "kec_ran"), ("city", "kab_ran"), ("site_class", "class_ran")):
        t[a] = t[a].fillna(t[b])
    t["nop"] = norm_nop(t["nop"])
    t["in_dapot"] = t["site_name"].notna().astype(int)
    t["site_active"] = t["site_active"].fillna(1).astype(int)
    t["avail_delta_pp"] = t["avail_pct"] - t["ran_target_pct"]
    qa["sites_ran"] = int(t["ran_months"].notna().sum()); qa["ran_not_in_dapot"] = int(((t["in_dapot"] == 0)).sum())

    # ---------------------------------------------------------------- BBT Site Details (one snapshot)
    log("BBT Site Details")
    b = xl(next(iter(sorted(RAW4.glob("*BBT*Site*Details*.xlsx")))))
    b.columns = [str(c).strip() for c in b.columns]
    bb = pd.DataFrame({
        "site_id": norm_id(b["Site ID"]), "bbt_category": b["Category"].astype("string"),
        "bbt_median_min": dur_to_sec(b["BBT Median Duration"]) / 60, "bbt_max_min": dur_to_sec(b["BBT Max Duration"]) / 60,
        "bbt_min_min": dur_to_sec(b["BBT Min Duration"]) / 60, "backup_min": dur_to_sec(b["Backup Duration"]) / 60,
        "pln_down_total_h": dur_to_sec(b["Total PLN Down"]) / 3600, "battery_backup_total_h": dur_to_sec(b["Total Battery Backups"]) / 3600,
        "ne_down_total_h": dur_to_sec(b["Total NE Down"]) / 3600, "pln_events": to_num(b["Repetitive"]),
    }).drop_duplicates("site_id")
    t = t.merge(bb, on="site_id", how="left")
    inv.append(dict(source="BBT Site Details", rows=len(bb), period="snapshot — period not written in the file", status="OK (period to confirm)"))
    qa["bbt_sites"] = int(t["bbt_category"].notna().sum())

    # ---------------------------------------------------------------- RAN weekly → NOP / cluster / AREA series (sums, not site rows)
    log("RAN weekly")
    # every RAN zip that is not the monthly one is weekly (the W13–W24 file arrived as "Untitled.zip")
    w = pd.concat([read_ran(z.name) for z in sorted(RAW4.glob("*.zip")) if "monthly" not in z.name.lower()], ignore_index=True)
    w["site_id"] = norm_id(w["site_id"])
    w = w.drop_duplicates(["site_id", "period"], keep="last")
    for c in ["outage (Sec)", "denum (Sec)", "duration_power (Sec)", "duration_transport (Sec)", "duration_ran (Sec)", "duration_other (Sec)"]:
        w[c] = num(w[c]).fillna(0)
    w["nop"] = norm_nop(w["networksite"])
    rows = []
    for lvl, key in (("area", None), ("nop", "nop"), ("cluster", "districtoperation")):
        gg = w.groupby(["period"] + ([key] if key else []))
        a = gg[["outage (Sec)", "denum (Sec)", "duration_power (Sec)", "duration_transport (Sec)", "duration_ran (Sec)", "duration_other (Sec)"]].sum().reset_index()
        a["sites"] = gg["site_id"].nunique().values
        a["target"] = gg["target (%)"].apply(lambda x: num(x).median()).values
        for _, r in a.iterrows():
            den = r["denum (Sec)"] or np.nan
            rows.append(dict(level=lvl, id=("AREA4" if not key else r[key]), week=r["period"], sites=int(r["sites"]),
                             avail=100 * (1 - r["outage (Sec)"] / den), target=r["target"],
                             power=100 * r["duration_power (Sec)"] / den, transport=100 * r["duration_transport (Sec)"] / den,
                             ran=100 * r["duration_ran (Sec)"] / den, other=100 * r["duration_other (Sec)"] / den))
    weekly = pd.DataFrame(rows)
    inv.append(dict(source="RAN availability weekly", rows=len(w), period=f"W{w['period'].min()[-2:]}–W{w['period'].max()[-2:]} 2026", status="OK (NOP / cluster level)"))

    # ---------------------------------------------------------------- HW Master FME (no e-mail, no phone)
    log("FME master")
    fm = []
    for f in sorted(RAW4.glob("*MasterFME*.xlsx")):
        x = xl(f, sheet_name=None, header=1)
        for _, v in x.items():
            if "Role" in v.columns and "Nama" in v.columns:
                v = v.loc[:, ~v.columns.astype(str).str.startswith("Unnamed")]
                fm.append(v)
    fme = pd.concat(fm, ignore_index=True) if fm else pd.DataFrame()
    fme = fme[fme["Area"].astype("string").str.upper().str.replace(" ", "", regex=False) == "AREA4"]
    fme = pd.DataFrame({"name": fme["Nama"].astype("string").str.strip(), "role": fme["Role"].astype("string").str.strip().str.upper(),
                        "nop": norm_nop(fme["NewNOP"]), "nop_old": norm_nop(fme["OldNOP"]), "cluster": fme["Cluster"].astype("string"),
                        "subcluster": fme["SubCluster"].astype("string"), "regional": fme["Regional"].astype("string"),
                        "lat": to_num(fme["Lat"]), "lon": to_num(fme["Lon"]), "active": fme["Flag"].astype("string").str.upper().eq("ACTIVE").astype(int)})
    okf = fme["lon"].between(*BBOX["lon"]) & fme["lat"].between(*BBOX["lat"]); fme.loc[~okf, ["lat", "lon"]] = np.nan
    fme["id"] = [f"{r}-{i + 1:04d}" for i, r in enumerate(fme["role"])]
    inv.append(dict(source="HW Master FME (BPS / PM / TS)", rows=len(fme), period="update 9 Sep 2026", status="OK (e-mail / phone not exported)"))
    qa["fme"] = {k: int(v) for k, v in fme["role"].value_counts().items()}

    # ---------------------------------------------------------------- export
    log("writing JSON")
    cols = ["site_id", "site_name", "site_class", "nop", "cluster_to", "regional", "province", "city", "kecamatan", "site_active", "in_dapot",
            "fixed_genset", "genset_kva", "is_island", "is_urban", "last_pm", "lat", "lon", "vendor",
            "avail_pct", "ran_target_pct", "avail_delta_pp", "ran_hours", "ran_outage_h", "ran_power_down_h", "ran_transport_down_h", "ran_ran_down_h", "ran_other_down_h", "ran_months",
            "m_avail", "m_pw", "m_out",
            "bbt_category", "bbt_median_min", "bbt_max_min", "bbt_min_min", "backup_min", "pln_down_total_h", "battery_backup_total_h", "ne_down_total_h", "pln_events"]
    t = t[t["ran_months"].notna() | t["bbt_category"].notna()]      # on-air evidence (RAN or BBT); Dapot-only rows stay out
    sz = {"sites.json": dump(columnar(t[cols]), "sites.json"), "weekly.json": dump(columnar(weekly), "weekly.json"),
          "fme.json": dump(columnar(fme[["id", "name", "role", "nop", "nop_old", "cluster", "subcluster", "regional", "lat", "lon", "active"]]), "fme.json")}
    missing = [dict(source="MBP ticket tracking (AREA 4)", unlocks="MBP performance & utilisation, relocation backtest, dispatch audit, MBP history in the site list"),
               dict(source="BBT event export (AREA 4)", unlocks="Kaplan-Meier BBT, battery events per site, dark-site profile, MBP need (outages > BBT)"),
               dict(source="New_BBT battery inventory (AREA 4)", unlocks="battery type / age / banks / load → BBS action rules (replace / upgrade / check setting), BBT design"),
               dict(source="RAN daily (AREA 4)", unlocks="daily / weekly period filter per site, off-air detection"),
               dict(source="PLN outage intervals (AREA 4)", unlocks="PLN outage frequency & duration per site, correlation, MBP need")]
    meta = {"built_at": time.strftime("%Y-%m-%d %H:%M"), "area": "AREA4", "inventory": inv, "missing": missing, "qa": qa, "sizes": sz,
            "periods": {"ran_monthly": MONTHS, "weeks": sorted(weekly["week"].unique().tolist())}}
    dump(meta, "meta.json")
    log(f"done · sites {len(t)} · sizes " + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sz.items()))


if __name__ == "__main__":
    main()
