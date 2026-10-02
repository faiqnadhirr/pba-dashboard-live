"""MBP engine: travel time, coverage assignment, candidate ranking, site priority."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.common import haversine_km, pct_rank


# ----------------------------------------------------------------- travel time (ESTIMATED)
def travel_minutes(km, is_urban, is_island, cfg: dict, depart_hour: int | None = None):
    """Straight-line km -> ESTIMATED door-to-door minutes (mobilisation + road km / speed x traffic)."""
    t = cfg["travel"]
    km = np.asarray(km, dtype=float)
    urban = np.asarray(is_urban, dtype=bool) if np.ndim(is_urban) else np.full(km.shape, bool(is_urban))
    island = np.asarray(is_island, dtype=bool) if np.ndim(is_island) else np.full(km.shape, bool(is_island))
    road = km * t["road_factor"]
    sp = t["speed_kmh"]
    speed = np.where(urban, sp["urban"], np.where(road < 15, sp["rural_short"], sp["rural_long"]))
    mult = np.ones_like(road)
    if depart_hour is not None:
        if depart_hour in t["peak_hours"]:
            mult = np.where(urban, t["peak_multiplier_urban"], t["peak_multiplier_rural"])
        elif depart_hour in t["night_hours"]:
            mult = np.full(road.shape, t["night_multiplier"])
    minutes = t["mobilization_minutes"] + road / speed * 60 * mult
    return np.where(island, np.nan, minutes)


# ----------------------------------------------------------------- distance matrix within NOP
def site_mbp_pairs(sites: pd.DataFrame, mbps: pd.DataFrame, same_nop: bool = True) -> pd.DataFrame:
    """Long table site x candidate MBP with distance (only MBPs with coordinates)."""
    m = mbps.dropna(subset=["lat", "lon"])
    s = sites.dropna(subset=["lat", "lon"])[["site_id", "nop", "lat", "lon", "is_urban", "is_island"]]
    out = []
    groups = s.groupby("nop") if same_nop else [("ALL", s)]
    for nop, ss in groups:
        mm = m[m["nop"] == nop] if same_nop else m
        if mm.empty:
            continue
        la1 = ss["lat"].to_numpy()[:, None]; lo1 = ss["lon"].to_numpy()[:, None]
        la2 = mm["lat"].to_numpy()[None, :]; lo2 = mm["lon"].to_numpy()[None, :]
        km = haversine_km(la1, lo1, la2, lo2)
        out.append(pd.DataFrame({
            "site_id": np.repeat(ss["site_id"].to_numpy(), len(mm)),
            "mbp_id": np.tile(mm["mbp_id"].to_numpy(), len(ss)),
            "km": km.ravel(),
            "is_urban": np.repeat(ss["is_urban"].to_numpy(), len(mm)),
            "is_island": np.repeat(ss["is_island"].to_numpy(), len(mm)),
        }))
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame(
        columns=["site_id", "mbp_id", "km", "is_urban", "is_island"])


def assign_coverage(sites: pd.DataFrame, pairs: pd.DataFrame, site_mbp: pd.DataFrame, cfg: dict,
                    mbps: pd.DataFrame | None = None) -> pd.DataFrame:
    """Coverage area: historical primary MBP first (if it has coords in same NOP), else nearest MBP in the NOP,
    else (NOP without any located MBP, e.g. NOP MUARA ENIM) nearest MBP in any NOP."""
    mcfg = cfg["mbp"]
    nearest = pairs.sort_values("km").drop_duplicates("site_id").rename(
        columns={"mbp_id": "mbp_nearest", "km": "km_nearest"})[["site_id", "mbp_nearest", "km_nearest"]]
    a = sites[["site_id", "lat", "lon", "is_urban", "is_island"]].merge(nearest, on="site_id", how="left")
    a["nearest_basis"] = np.where(a["mbp_nearest"].notna(), "nearest MBP (same NOP)", None)
    if mbps is not None:
        m = mbps.dropna(subset=["lat", "lon"])
        miss = a["mbp_nearest"].isna() & a["lat"].notna()
        if miss.any() and len(m):
            km = haversine_km(a.loc[miss, "lat"].to_numpy()[:, None], a.loc[miss, "lon"].to_numpy()[:, None],
                              m["lat"].to_numpy()[None, :], m["lon"].to_numpy()[None, :])
            j = km.argmin(axis=1)
            a.loc[miss, "mbp_nearest"] = m["mbp_id"].to_numpy()[j]
            a.loc[miss, "km_nearest"] = km[np.arange(len(j)), j]
            a.loc[miss, "nearest_basis"] = "nearest MBP (cross-NOP fallback: no MBP located in this NOP)"
    a = a.merge(site_mbp[["site_id", "mbp_primary_hist"]], on="site_id", how="left")
    hist = pairs.rename(columns={"mbp_id": "mbp_primary_hist", "km": "km_hist"})[["site_id", "mbp_primary_hist", "km_hist"]]
    a = a.merge(hist, on=["site_id", "mbp_primary_hist"], how="left")
    use_hist = (mcfg["assignment_mode"] == "history_then_nearest") & a["km_hist"].notna()
    a["mbp_assigned"] = np.where(use_hist, a["mbp_primary_hist"], a["mbp_nearest"])
    a["km_assigned"] = np.where(use_hist, a["km_hist"], a["km_nearest"]).astype(float)
    a["assignment_basis"] = np.where(use_hist, "historical primary MBP",
                                     a["nearest_basis"].fillna("no MBP with coordinates"))
    a["uncovered"] = (a["km_assigned"].isna() | (a["km_assigned"] > mcfg["max_radius_km"])).astype(int)
    a["eta_min"] = travel_minutes(a["km_assigned"], a["is_urban"], a["is_island"], cfg)
    a["eta_evidence"] = np.where(a["is_island"] == 1, "UNAVAILABLE",
                                 np.where(a["km_assigned"].notna(), "ESTIMATED", "UNAVAILABLE"))
    return a[["site_id", "mbp_assigned", "km_assigned", "eta_min", "eta_evidence", "assignment_basis",
              "mbp_nearest", "km_nearest", "uncovered"]]


# ----------------------------------------------------------------- dependency proxy
def dependency_children(hub_site: pd.Series, mapping: dict) -> pd.Series:
    key = hub_site.astype("string").str.lower().str.replace(r"[.…()<>+0-9]|sites|anakan|metro-e|radio ip|fo tsel",
                                                            "", regex=True).str.strip().str.replace(r"\s+", " ", regex=True)
    mp = {k.lower(): v for k, v in mapping.items()}
    return key.map(lambda k: mp.get(k, np.nan) if pd.notna(k) else np.nan).astype(float)


# ----------------------------------------------------------------- priority (configurable)
def _norm_w(w: dict) -> dict:
    tot = sum(v for v in w.values() if v and v > 0)
    return {k: (v / tot if tot else 0) for k, v in w.items() if v and v > 0}


MBP_FACTOR_LABEL = {
    "class": "site class", "dependency": "dependency (children)", "outage_frequency": "PLN outage frequency",
    "travel_distance": "far from MBP", "eta_gap": "MBP arrives after battery runs out",
    "site_condition": "availability below target", "vip": "VIP site",
    "outage_duration": "long PLN outages", "mbp_history": "frequent MBP deployments",
}


def eta_gap_minutes(t: pd.DataFrame) -> pd.Series:
    """ETA - BBT (min). Unknown BBT -> 0 (conservative). Island (no road ETA) -> NaN."""
    return t["eta_min"] - t["bbt_value_min"].fillna(0)


def mbp_factor_matrix(t: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    cs = cfg["class_score"]
    design = cfg["bbt"]["design_minutes"]
    f = pd.DataFrame(index=t.index)
    f["class"] = t["site_class"].map(cs).fillna(cs.get("Unknown", 0.3))
    f["dependency"] = (t["dependency_children"].fillna(0).clip(0, 15) / 15)
    f["outage_frequency"] = pct_rank(t["pln_freq"].fillna(0))
    f["travel_distance"] = (t["km_assigned"].clip(0, cfg["mbp"]["max_radius_km"]) / cfg["mbp"]["max_radius_km"]).fillna(1)
    gap = eta_gap_minutes(t)
    f["eta_gap"] = (gap.clip(lower=0) / design).clip(0, 1)
    f.loc[t["eta_min"].isna(), "eta_gap"] = 1.0          # island / no MBP: cannot be reached by road
    f["site_condition"] = (t["avail_gap_pp"].fillna(0) / cfg["site_condition"]["full_gap_pp"]).clip(0, 1)
    f["vip"] = t["vip"].fillna(0).astype(float)
    f["outage_duration"] = pct_rank(t["pln_total_h"].fillna(0))
    f["mbp_history"] = pct_rank(t["mbp_deployments"].fillna(0))
    return f


def score(factors: pd.DataFrame, weights: dict, labels: dict, levels: dict, top_n: int = 3) -> pd.DataFrame:
    w = _norm_w(weights)
    contrib = pd.DataFrame({k: factors[k] * v for k, v in w.items() if k in factors})
    s = contrib.sum(axis=1)
    se = s + 1e-9                     # tolerance so float summation order never flips a level at a cut-off
    lv = np.select([se >= levels["P1"], se >= levels["P2"], se >= levels["P3"]], ["P1", "P2", "P3"], default="P4")
    arr = contrib.to_numpy(); cols = contrib.columns.to_numpy()
    order = np.argsort(-arr, axis=1, kind="stable")[:, :top_n]
    tops = [", ".join(f"{labels.get(cols[j], cols[j])} ({arr[i, j]:.2f})" for j in row if arr[i, j] > 0)
            for i, row in enumerate(order)]
    return pd.DataFrame({"score": s.round(4), "level": lv, "drivers": tops}, index=factors.index)


# ----------------------------------------------------------------- candidates for one site
def rank_candidates(site_id: str, pairs: pd.DataFrame, fam: pd.DataFrame, workload: pd.DataFrame,
                    cfg: dict, depart_hour: int | None = None, unavailable: set | None = None,
                    extra_mbps: pd.DataFrame | None = None, site_row: pd.Series | None = None) -> pd.DataFrame:
    c = pairs[pairs["site_id"] == site_id].copy()
    if extra_mbps is not None and site_row is not None and not extra_mbps.empty:
        km = haversine_km(site_row["lat"], site_row["lon"], extra_mbps["lat"].to_numpy(), extra_mbps["lon"].to_numpy())
        c = pd.concat([c, pd.DataFrame({"site_id": site_id, "mbp_id": extra_mbps["mbp_id"].to_numpy(), "km": km,
                                        "is_urban": site_row["is_urban"], "is_island": site_row["is_island"]})])
    if c.empty:
        return c
    if unavailable:
        c = c[~c["mbp_id"].isin(unavailable)]
    c["eta_min"] = travel_minutes(c["km"], c["is_urban"], c["is_island"], cfg, depart_hour)
    c = c.merge(fam[fam["site_id"] == site_id][["mbp_id", "served_n"]], on="mbp_id", how="left")
    c = c.merge(workload[["mbp_id", "mbp_tickets_h1"]], on="mbp_id", how="left")
    c["served_n"] = c["served_n"].fillna(0)
    w = _norm_w(cfg["mbp_candidate"])
    eta_n = (c["eta_min"] / c["eta_min"].max()).fillna(1) if c["eta_min"].notna().any() else 1
    fam_n = c["served_n"] / max(c["served_n"].max(), 1)
    wl_n = c["mbp_tickets_h1"].fillna(0) / max(c["mbp_tickets_h1"].max() or 1, 1)
    c["cand_cost"] = w.get("eta", 0) * eta_n - w.get("familiarity", 0) * fam_n + w.get("workload", 0) * wl_n
    c = c.sort_values(["cand_cost", "km"]).reset_index(drop=True)
    c["rank"] = np.arange(1, len(c) + 1)
    return c
