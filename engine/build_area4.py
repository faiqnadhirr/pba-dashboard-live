"""v3.8 — AREA 4 (Kalimantan · Sulawesi · Maluku-Papua) light pipeline.

What AREA 4 has today (engine/data/raw_a4/): RAN availability monthly (Jan–Jul 2026) and weekly (W1–W31), one BBT Site Details
snapshot, the HW Master FME (BPS / PM / TS field staff, AREA 2 + 4) — plus the shared Dapot master (engine/data/raw).
What it does NOT have yet: MBP ticket tracking, BBT event export, New_BBT battery inventory, daily RAN, PLN intervals.
So AREA 4 gets: availability vs target + causes per site → cluster → NOP, monthly/weekly trend, battery status from BBT Site Details,
field-staff map (BPS = MBP operators) with simple coverage; MBP performance / backtest / dispatch need the missing sources.

Usage:  python build_area4.py            → ../public/data/a4/
  v4.0 — AREA 4 is ALSO written in the AREA 1 shape (sites.json with the same 80 columns, mbps.json, tickets.json, pln_ev.json,
  familiarity.json, meta.json with config / monthly_nop / dq stubs) so every AREA 1 screen runs on it; what AREA 4 lacks is null
  (shown as N/A) or an empty file. The light tables stay for the field-staff screen: field_sites.json, weekly.json, fme.json.
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
        # v4.2 (FIX-08) — decimals as written in the source (coordinate precision panel covers AREA 4 too)
        "coord_decimals": d["Lat"].astype("string").str.split(".").str[1].str.len().fillna(0).clip(upper=6),
    })
    # v4.2 (FIX-15) — placeholder site IDs (blank, "-", "XXX", N/A …) are rejected and logged
    ph = s["site_id"].fillna("").str.match(r"^\s*(|-+|X+\d*|N/?A|NULL|NONE|0+|\?+|TBD|NAN|<NA>)\s*$", case=False)
    qa["rejected_placeholder_ids"] = int(ph.sum()); s = s[~ph].copy()
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
    qa["ran_rows"] = int(len(m))
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
    })
    qa["bbt_rows"] = int(len(bb)); bb = bb.drop_duplicates("site_id")
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
    sz = {"field_sites.json": dump(columnar(t[cols]), "field_sites.json"), "weekly.json": dump(columnar(weekly), "weekly.json"),
          "fme.json": dump(columnar(fme[["id", "name", "role", "nop", "nop_old", "cluster", "subcluster", "regional", "lat", "lon", "active"]]), "fme.json")}
    missing = [dict(source="MBP ticket tracking (AREA 4)", unlocks="MBP performance & utilisation, relocation backtest, dispatch audit, MBP history in the site list"),
               dict(source="BBT event export (AREA 4)", unlocks="Kaplan-Meier BBT, battery events per site, dark-site profile, MBP need (outages > BBT)"),
               dict(source="New_BBT battery inventory (AREA 4)", unlocks="battery type / age / banks / load → BBS action rules (replace / upgrade / check setting), BBT design"),
               dict(source="RAN daily (AREA 4)", unlocks="daily / weekly period filter per site, off-air detection"),
               dict(source="PLN outage intervals (AREA 4)", unlocks="PLN outage frequency & duration per site, correlation, MBP need")]
    meta = {"built_at": time.strftime("%Y-%m-%d %H:%M"), "area": "AREA4", "inventory": inv, "missing": missing, "qa": qa, "sizes": sz,
            "periods": {"ran_monthly": MONTHS, "weeks": sorted(weekly["week"].unique().tolist())}}
    sz.update(export_area1_shape(t, m, fme, cfg, meta))
    log(f"done · sites {len(t)} · sizes " + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sz.items()))


A1_COLS = ['site_id', 'site_name', 'site_class', 'nop', 'nop_flag', 'cluster_to', 'city', 'site_active', 'vip', 'lat', 'lon', 'coord_decimals', 'is_urban',
           'access_class', 'access_basis', 'hub_site', 'battery_type', 'battery_age_y', 'load_a', 'battery_banks', 'battery_qty', 'bbt_value_min',
           'bbt_value_evidence', 'bbt_value_basis', 'bbt_measured_min', 'bbt_lower_bound_min', 'bbt_est_confidence', 'bbt_est_low_min', 'bbt_est_high_min',
           'bbt_trend_min', 'evt_total', 'evt_exhaustion', 'evt_censored', 'evt_flapping', 'tk_no_battery', 'pln_freq', 'pln_total_h', 'pln_source',
           'pln_anomaly_months', 'outage_2025_h', 'avail_wc_pct', 'ran_target_pct', 'ran_hours', 'ran_outage_h', 'ran_power_down_h', 'ran_transport_down_h',
           'ran_ran_down_h', 'ran_other_down_h', 'm_hours', 'm_out', 'm_pw', 'q1_hours', 'q1_outage_h', 'q1_power_h', 'q2_hours', 'q2_outage_h', 'q2_power_h',
           'in_ticket_file', 'mbp_primary_hist', 'mbp_deployments', 'mbp_backup_h', 'fixed_genset', 'fixed_genset_basis', 'genset_kva', 'kecamatan', 'desa',
           'battery_brand', 'tk_plnoff_n', 'tk_plnoff_visit_n', 'tk_plnoff_rh_h', 'dep_children_actual', 'dep_role', 'pln_dur_hist', 'rc_battery',
           'rc_generator', 'rc_internal', 'rc_non_power', 'rc_operational', 'rc_utility', 'rc_vendor']
H1 = MONTHS[:6]


def export_area1_shape(t, m, fme, cfg, meta4):
    """v4.0 — AREA 4 in the AREA 1 shape over the SAME period (H1 = Jan–Jun 2026). Columns AREA 4 has no source for are null."""
    log("AREA-1-shaped export (H1)")
    h = m[m["period"].isin(H1)].copy()
    g = h.groupby("site_id")
    a = pd.DataFrame({"ran_hours": g["hours"].sum(), "ran_outage_h": g["out_h"].sum(), "ran_power_down_h": g["pw_h"].sum(),
                      "ran_transport_down_h": g["tr_h"].sum(), "ran_ran_down_h": g["ran_h"].sum(), "ran_other_down_h": g["oth_h"].sum(),
                      "ran_target_pct": g["target"].max()})
    piv = {k: h.pivot_table(index="site_id", columns="period", values=k, aggfunc="sum").reindex(columns=H1) for k in ("hours", "out_h", "pw_h")}
    q = lambda k, sl: piv[k].iloc[:, sl].sum(axis=1, min_count=1)
    a["q1_hours"], a["q1_outage_h"], a["q1_power_h"] = q("hours", slice(0, 3)), q("out_h", slice(0, 3)), q("pw_h", slice(0, 3))
    a["q2_hours"], a["q2_outage_h"], a["q2_power_h"] = q("hours", slice(3, 6)), q("out_h", slice(3, 6)), q("pw_h", slice(3, 6))
    lst = lambda k: [[None if np.isnan(v) else round(float(v), 3) for v in r] for r in piv[k].reindex(a.index).to_numpy(dtype=float)]
    a["m_hours"], a["m_out"], a["m_pw"] = lst("hours"), lst("out_h"), lst("pw_h")
    a = a.reset_index()
    base = t.drop(columns=[c for c in a.columns if c != "site_id" and c in t.columns])
    x = base.merge(a, on="site_id", how="left")
    x["avail_wc_pct"] = 100 * (1 - x["ran_outage_h"] / x["ran_hours"].replace(0, np.nan))
    # site name: Dapot keeps the spaces ("MUARA ENIM" not "MUARAENIM"); title-case only when the source is all upper-case
    x["site_name"] = x["site_name"].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
    x["nop_flag"] = None; x["vip"] = 0; x["hub_site"] = None
    x["coord_decimals"] = x["coord_decimals"].where(x["lat"].notna())
    x["access_class"] = np.where(x["is_island"] == 1, "island", np.where(x["lat"].notna(), "mainland", "unknown"))
    x["access_basis"] = "Dapot: Kepulauan flag"
    # battery: BBT Site Details. "BBT" = NE went down on mains fail → measured median BBT (ACTUAL); "Only Mains Fail" = the battery held
    # for the whole outage → a LOWER BOUND only (status Meets design when ≥ design, otherwise unknown)
    D = cfg["bbt"]["design_minutes"]
    meas = (x["bbt_category"] == "BBT") & x["bbt_median_min"].notna()
    held = x["bbt_category"].notna() & ~meas & x["backup_min"].notna()
    x["bbt_measured_min"] = x["bbt_median_min"].where(meas)
    x["bbt_lower_bound_min"] = x["backup_min"].where(held)
    x["bbt_value_min"] = x["bbt_median_min"].where(meas, x["backup_min"].where(held & (x["backup_min"] >= D)))
    x["bbt_value_evidence"] = np.where(meas, "DERIVED", np.where(held & (x["backup_min"] >= D), "ESTIMATED", "UNAVAILABLE"))
    x["bbt_value_basis"] = np.where(meas, "BBT Site Details — median BBT (mains fail → NE down; snapshot summary, not own events → DERIVED)",
                            np.where(held, "BBT Site Details — battery held through the outage (lower bound)", "not in BBT Site Details"))
    x["pln_freq"] = x["pln_events"] / 6.0                              # Repetitive count in the snapshot, per month (period ASSUMED H1)
    x["pln_total_h"] = x["pln_down_total_h"]
    x["pln_source"] = np.where(x["bbt_category"].notna(), "BBT Site Details (snapshot)", None)
    x["fixed_genset_basis"] = np.where(x["fixed_genset"] == "ACTIVE", "Dapot: genset active (backup / main power)", None)
    x["in_ticket_file"] = 0
    for c in A1_COLS:
        if c not in x.columns:
            x[c] = None
    x = x[x["ran_hours"].notna() | x["bbt_category"].notna()]
    # base camps = BPS (MBP operators) with a position in the FME master; id = BPS-<NOP>-<n> (person name only as pic_name)
    b = fme[(fme["role"] == "BPS") & fme["lat"].notna()].copy()
    b["n"] = b.groupby("nop").cumcount() + 1
    short = b["nop"].str.replace("NOP ", "", regex=False).str.replace(r"[^A-Z]", "", regex=True)   # full NOP name: PALU vs PALANGKARAYA stay distinct
    mb = [dict(mbp_id=f"BPS{int(r.n):03d}-{sh}", mbp_name=f"BPS{int(r.n):03d}-{sh}", lat=float(r.lat), lon=float(r.lon), coord_decimals=None,
               coord_status="ACTUAL", coord_evidence="ACTUAL", nop=r.nop, source="HW Master FME (BPS position)", merged_from=None, pic_name=r.name,
               mbp_tickets_h1=None, mbp_sites_served=None, mbp_run_hours_h1=None) for r, sh in zip(b.itertuples(), short)]
    empty = {"cols": [], "rows": []}
    sz = {"sites.json": dump(columnar(x[A1_COLS]), "sites.json"), "mbps.json": dump(mb, "mbps.json"),
          "tickets.json": dump({"cols": ["site", "mbp", "occ", "to", "arr", "job", "out", "rc"], "rows": []}, "tickets.json"),
          "pln_ev.json": dump({"cols": ["site", "dur", "arr", "mbp"], "rows": []}, "pln_ev.json"),
          "familiarity.json": dump({"cols": ["site_id", "mbp_id", "served_n"], "rows": []}, "familiarity.json")}
    # monthly NOP sums (Health / Trend) — same shape as AREA 1
    hm = h.merge(x[["site_id", "nop", "site_active"]], on="site_id", how="inner")
    hm["target_h"] = hm["hours"] * hm["target"]
    mn = hm.groupby(["nop", "site_active", "period"]).agg(sites=("site_id", "nunique"), hours=("hours", "sum"), target_h=("target_h", "sum"),
                                                          outage=("out_h", "sum"), power=("pw_h", "sum"), transport=("tr_h", "sum"),
                                                          ran=("ran_h", "sum"), other=("oth_h", "sum")).reset_index().rename(columns={"period": "ym"})
    srcs = [dict(source=r["source"], files=1, status=r["status"], latest_file_time=r.get("period")) for r in meta4["inventory"]]
    q4 = meta4["qa"]
    dq_sources = [   # v4.2 (FIX-13/14) — AREA 4 rows of the Sources table (raw, clean, parent, last record date)
        dict(area="AREA 4", source="Dapot ALL Site (AREA4)", raw=q4.get("dapot_rows"), clean=int(len(x)), grain="site", derived_from="Dapot ∪ RAN sites with RAN or BBT evidence", data_max_date=None),
        dict(area="AREA 4", source="RAN availability monthly (AREA4)", raw=q4.get("ran_rows"), clean=int(len(h)), grain="site-month (Jan–Jun used)", derived_from=None, data_max_date=f"{H1[-1][:4]}-{H1[-1][4:]}-30"),
        dict(area="AREA 4", source="BBT Site Details (AREA4)", raw=q4.get("bbt_rows"), clean=q4.get("bbt_sites"), grain="site (snapshot)", derived_from=None, data_max_date=None),
        dict(area="AREA 4", source="HW Master FME — BPS as base camps", raw=sum(q4.get("fme", {}).values()) if q4.get("fme") else None, clean=len(mb), grain="person / base camp", derived_from="HW Master FME (role = BPS, with position)", data_max_date="2026-09-09")]
    meta = {**meta4, "config": cfg, "area": "AREA4", "scope": {"area": "AREA4", "period_start": "2026-01-01", "period_end": "2026-06-30"},
            "snapshot": {"period_start": "2026-01-01", "period_end": "2026-06-30", "refreshed_at": meta4["built_at"], "sources": srcs},
            "monthly_nop": mn.to_dict("records"), "bbs": {}, "mbp": {"pic_matches": [], "duplicates": [], "concurrency": []},
            "dq": {"unmatched": [], "ticket_gaps": [], "sources": dq_sources, "mbp_coords": [], "rejects": [], "field_coverage": {}},
            "na": ["tickets", "pln_events", "battery_inventory", "bbt_events", "daily", "dependency"]}
    dump(meta, "meta.json")
    log(f"AREA-1 shape: sites {len(x)} · base camps (BPS) {len(mb)}")
    return sz


if __name__ == "__main__":
    main()
