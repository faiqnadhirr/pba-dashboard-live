"""Turn raw frames into clean, correctly-grained source tables."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.common import dur_to_sec, norm_id, norm_nop, to_num, to_dt

BBOX = dict(lon=(94.0, 109.0), lat=(-6.5, 6.5))   # Sumatera + islands (AREA1)


# ----------------------------------------------------------------- sites
def clean_sites(dapot: pd.DataFrame, newbbt: pd.DataFrame, area: str = "AREA1") -> tuple[pd.DataFrame, dict]:
    d = dapot.copy()
    d["area_n"] = d["Area"].astype("string").str.upper().str.replace(" ", "", regex=False)
    d = d[d["area_n"] == area.upper()]
    qa = {"dapot_rows_area": len(d)}
    d["site_id"] = norm_id(d["Site ID"])
    qa["dapot_dup_ids"] = int(d["site_id"].duplicated().sum())
    d = d.drop_duplicates("site_id", keep="first")
    s = pd.DataFrame({
        "site_id": d["site_id"],
        "site_name": d["Site Name"].astype("string").str.strip(),
        "site_class": d["Site Class"].astype("string").str.strip().fillna("Unknown"),
        "nop": norm_nop(d["NOP"]),
        "cluster_to": d["Cluster"].astype("string"),
        "regional": d["Regional"].astype("string"),
        "province": d["Province"].astype("string"),
        "city": d["City"].astype("string"),
        "type_site": d["Type Site"].astype("string"),
        "site_owner": d["Site Owner"].astype("string"),
        "genset_active": d["Genset : Active"].astype("string").str.lower().eq("true").fillna(False).astype(int),
        "genset_type": d["Genset Type"].astype("string"),
        "lat": to_num(d["Lat"]), "lon": to_num(d["Lon"]),
        "kepulauan": d["Kepulauan"].astype("string"),
        "site_active": d["Site : Active"].astype("string").str.lower().eq("true").fillna(False).astype(int),
    })
    s["is_island"] = s["kepulauan"].str.upper().eq("KEPULAUAN").fillna(False).astype(int)
    s["is_urban"] = s["city"].str.upper().str.startswith("KOTA").fillna(False).astype(int)
    okc = s["lon"].between(*BBOX["lon"]) & s["lat"].between(*BBOX["lat"])
    qa["site_bad_coords"] = int((~okc).sum())
    s.loc[~okc, ["lat", "lon"]] = np.nan

    # ---- New_BBT site attributes (2025 master + battery inventory)
    n = newbbt.copy()
    n["site_id"] = norm_id(n["Site ID"])
    n = n[n["site_id"].notna()].drop_duplicates("site_id")
    bt = n["Type BATTERY"].astype("string").str.upper().str.strip()
    btype = np.select([np.asarray(x, dtype=bool) for x in [bt.str.contains("LITHIUM", na=False) & bt.str.contains("VRLA", na=False), bt.str.contains("LITHIUM", na=False),
                       bt.str.contains("VRLA", na=False), bt.notna().to_numpy(bool)]], ["MIXED", "LITHIUM", "VRLA", "OTHER"], default=None)
    brand = (n["MERK BATTERY"].astype("string").str.upper().str.replace(r"[^A-Z]", "", regex=True)
             .replace({"SCAREDSUN": "SACREDSUN", "SACREDSUNE": "SACREDSUN", "": pd.NA}))
    att = pd.DataFrame({
        "site_id": n["site_id"],
        "hub_site": n["HUB Site"].astype("string").str.strip(),
        "vip": n["VIP"].astype("string").str.upper().eq("VIP").fillna(False).astype(int),
        "battery_install_date": to_dt(n["Battery Installation Date"]),
        "load_a": to_num(n["Total Arus NE (Ampere)"]),
        "battery_type": pd.Series(btype, index=n.index).astype("string"),
        "battery_brand": brand,
        "battery_qty": to_num(n["QTY BATTERY"]),
        "battery_banks": to_num(n["Jumlah Bank"]),
        "main_power": n["Main Power"].astype("string").str.upper().str.strip(),
        "backup_power": n["Backup Power"].astype("string").str.upper().str.strip(),
        "target_ava": to_num(n["Target Ava"]),
        "class_newbbt": n["Site Class"].astype("string").str.strip(),
        "bbt_max_2025_min": dur_to_sec(n["BBT Max Duration"]) / 60,
        "repetitive_2025": to_num(n["Repetitive in 2025"]),
    })
    att.loc[att["load_a"] <= 0, "load_a"] = np.nan
    att.loc[att["battery_banks"] <= 0, "battery_banks"] = np.nan
    s = s.merge(att, on="site_id", how="left")
    qa["sites_with_newbbt"] = int(s["hub_site"].notna().sum())
    return s.reset_index(drop=True), qa


# ----------------------------------------------------------------- MBP
def _repair(v: float, lo: float, hi: float) -> tuple[float, bool]:
    if pd.isna(v):
        return np.nan, False
    if lo <= v <= hi:
        return v, False
    x = v
    for _ in range(12):           # missing decimal point -> rescale by powers of 10
        x /= 10
        if lo <= x <= hi:
            return x, True
    return np.nan, False


def clean_mbp(team: pd.DataFrame) -> pd.DataFrame:
    t = team.copy()
    t["mbp_id"] = t["MBP"].astype("string").str.strip().str.upper().str.replace(r"\s+", " ", regex=True)
    rows = []
    for _, r in t.iterrows():
        lon, rl = _repair(to_num(pd.Series([r["Longitude"]])).iloc[0], *BBOX["lon"])
        lat, ra = _repair(to_num(pd.Series([r["Latitude"]])).iloc[0], *BBOX["lat"])
        status = "MISSING" if pd.isna(lon) or pd.isna(lat) else ("REPAIRED" if (rl or ra) else "ACTUAL")
        rows.append(dict(mbp_id=r["mbp_id"], mbp_name=str(r["MBP"]).strip(), lat=lat, lon=lon,
                         coord_status=status, coord_evidence={"ACTUAL": "ACTUAL", "REPAIRED": "DERIVED",
                                                              "MISSING": "UNAVAILABLE"}[status]))
    m = pd.DataFrame(rows)
    m["nop"] = norm_nop(t["NOP"]).values
    m["source"] = "MBP Team sheet"
    return m.drop_duplicates("mbp_id")


# ----------------------------------------------------------------- tickets
def clean_tickets(track: pd.DataFrame, mbp_ids: set, rh_max: float = 48) -> tuple[pd.DataFrame, dict]:
    t = track.copy()
    t = t[t["Site Id"].astype("string").str.strip().str.upper() != "SITE ID"]   # stray header row
    qa = {"ticket_rows": len(t), "ticket_full_dups": int(t.duplicated().sum())}
    t = t.drop_duplicates()
    out = pd.DataFrame({
        "ticket_inap": t["Ticket Number Inap"].astype("string"),
        "ticket_swfm": t["Ticket Number SWFM"].astype("string"),
        "site_id": norm_id(t["Site Id"]),
        "severity": t["Severity"].astype("string"),
        "ticket_type": t["Type Ticket"].astype("string"),
        "nop": norm_nop(t["NOP"]),
        "rc_category": t["RC Category"].astype("string"),
        "rc1": t["RC 1"].astype("string"), "rc2": t["RC 2"].astype("string"),
        "resolution": t["Resolution Action"].astype("string"),
        "status": t["Ticket SWFM Status"].astype("string"),
        "mbp_id": t["PIC Take Over Ticket"].astype("string").str.strip().str.upper()
                   .str.replace(r"\s+", " ", regex=True).replace({"": pd.NA}),
        "occurred_at": to_dt(t["Occured Time"]), "created_at": to_dt(t["Created At"]),
        "takeover_at": to_dt(t["Take Over Date"]), "checkin_at": to_dt(t["Check In At"]),
        "cleared_at": to_dt(t["Cleared Time"]),
        "rh_start": to_num(t["RH Start"]), "rh_stop": to_num(t["RH Stop"]),
        "rh_start_time": to_dt(t["RH Start Time"]), "rh_stop_time": to_dt(t["RH Stop Time"]),
        "sla_status": t["SLA Status"].astype("string"),
    })
    out["mbp_matched"] = out["mbp_id"].isin(mbp_ids).astype(int)
    rh = out["rh_stop"] - out["rh_start"]
    out["rh_hours"] = rh.where((rh >= 0) & (rh <= rh_max))
    out["rh_valid"] = out["rh_hours"].notna().astype(int)
    tr = (out["checkin_at"] - out["takeover_at"]).dt.total_seconds() / 3600
    out["takeover_to_checkin_h"] = tr.where((tr >= 0) & (tr <= 24))
    out["is_deployment"] = ((out["status"].str.upper() != "CANCELED") & out["mbp_id"].notna()).fillna(False).astype(int)
    out["is_genset_connect"] = out["resolution"].str.contains("Genset", case=False, na=False).astype(int)
    out["is_no_battery"] = out["rc2"].str.contains("Tidak Ada Baterai", case=False, na=False).astype(int)
    out["is_pln_off"] = out["rc1"].str.contains("PLN", case=False, na=False).astype(int)
    out["month"] = out["occurred_at"].dt.month
    qa["ticket_rows_clean"] = len(out)
    qa["ticket_mbp_match_rate"] = round(float(out["mbp_matched"].mean()), 4)
    qa["ticket_rh_valid_rate"] = round(float(out["rh_valid"].mean()), 4)
    return out.reset_index(drop=True), qa


# ----------------------------------------------------------------- BBT events
EXHAUST_FLAGS = ("LOW BATT", "NE DOWN")


def clean_bbt_events(ev: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    e = ev.copy()
    qa = {"bbt_event_rows": len(e), "bbt_event_full_dups": int(e.duplicated().sum())}
    e = e.drop_duplicates()
    out = pd.DataFrame({
        "site_id": norm_id(e["Site ID"]),
        "nop": norm_nop(e["NOP"]),
        "class_event": e["Site Class"].astype("string"),
        "flag": e["Flags"].astype("string"),
        "bbt_category": e["BBT Category"].astype("string"),
        "mf_start": to_dt(e["Alarm Start Mains Fail"]), "mf_clear": to_dt(e["Alarm Clear Mains Fail"]),
        "ne_down_start": to_dt(e["Start NE Down"]), "ne_down_clear": to_dt(e["Clear NE Down"]),
        "backup_min": to_num(e["Backup Duration (Second)"]) / 60,
    })
    f = out["flag"].str.upper()
    out["is_exhaustion"] = (~f.str.startswith("ONLY MAINS FAIL").fillna(False) & f.str.contains("|".join(EXHAUST_FLAGS), na=False)).astype(int)
    out["is_censored"] = f.str.startswith("ONLY MAINS FAIL").fillna(False).astype(int)
    mf = (out["mf_clear"] - out["mf_start"]).dt.total_seconds() / 60
    out["mains_fail_min"] = mf.where(mf >= 0)
    ne = (out["ne_down_clear"] - out["ne_down_start"]).dt.total_seconds() / 60
    out["ne_down_min"] = ne.where(ne >= 0)
    out["month"] = out["mf_start"].dt.month
    qa["bbt_event_rows_clean"] = len(out)
    qa["bbt_event_exhaustion_share"] = round(float(out["is_exhaustion"].mean()), 4)
    qa["bbt_event_max_backup_min"] = float(out["backup_min"].max())
    return out.reset_index(drop=True), qa


# ----------------------------------------------------------------- BBT monthly
def clean_bbt_monthly(m: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame({
        "site_id": norm_id(m["Site ID"]),
        "month": m["month"].astype("Int64"),
        "category": m["Category"].astype("string"),
        "vendor": m["Vendor"].astype("string"),
        "bbt_max_min": dur_to_sec(m["BBT Max Duration"]) / 60,
        "bbt_min_min": dur_to_sec(m["BBT Min Duration"]) / 60,
        "bbt_median_min": dur_to_sec(m["BBT Median Duration"]) / 60,
        "pln_down_min": dur_to_sec(m["PLN Down"]) / 60,
        "backup_min": dur_to_sec(m["Backup Duration"]) / 60,
        "ne_down_min": dur_to_sec(m["NE Down"]) / 60,
        "repetitive": to_num(m["Repetitive"]),
        "total_pln_down_h": dur_to_sec(m["Total PLN Down"]) / 3600,
        "total_backup_h": dur_to_sec(m["Total Battery Backups"]) / 3600,
        "total_ne_down_h": dur_to_sec(m["Total NE Down"]) / 3600,
    }).drop_duplicates(["site_id", "month"])


def clean_outage_2025(o: pd.DataFrame) -> pd.DataFrame:
    if o.empty:
        return pd.DataFrame(columns=["site_id", "outage_2025_h"])
    out = pd.DataFrame({"site_id": norm_id(o["site_id"]), "outage_2025_h": to_num(o["total_outage_sec"]) / 3600})
    return out.dropna(subset=["site_id"]).drop_duplicates("site_id")
