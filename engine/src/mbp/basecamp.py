"""6.4 Base camp analysis (decision support): load, risk and suggested additional base camps."""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.common import haversine_km


def basecamp_summary(t: pd.DataFrame, mbps: pd.DataFrame, tickets: pd.DataFrame, pairs: pd.DataFrame) -> pd.DataFrame:
    t = t.copy()
    t["at_risk"] = t["reach_risk"].fillna(0).astype(int)
    g = t.groupby("mbp_assigned").agg(
        sites_covered=("site_id", "size"),
        p1_p2=("mbp_priority_level", lambda s: int(s.isin(["P1", "P2"]).sum())),
        priority_sum=("mbp_priority_score", "sum"),
        pln_outages_h1=("pln_freq", "sum"),
        avg_km=("km_assigned", "mean"), max_km=("km_assigned", "max"),
        avg_eta_min=("eta_min", "mean"),
        at_risk_sites=("at_risk", "sum"),
        uncovered=("uncovered", "sum"),
    ).reset_index().rename(columns={"mbp_assigned": "mbp_id"})
    d = tickets[tickets["is_deployment"] == 1].merge(pairs[["site_id", "mbp_id", "km"]], on=["site_id", "mbp_id"], how="left")
    h = d.groupby("mbp_id").agg(deployments_h1=("site_id", "size"), hist_avg_dispatch_km=("km", "mean"),
                                run_hours_h1=("rh_hours", "sum")).reset_index()
    out = mbps[["mbp_id", "nop", "lat", "lon", "coord_status"]].merge(g, on="mbp_id", how="left").merge(h, on="mbp_id", how="left")
    out[["sites_covered", "p1_p2", "at_risk_sites", "deployments_h1"]] = out[
        ["sites_covered", "p1_p2", "at_risk_sites", "deployments_h1"]].fillna(0)
    q_hi = out["deployments_h1"].quantile(0.8); q_lo = out["deployments_h1"].quantile(0.2)
    out["load_signal"] = np.select(
        [out["coord_status"] == "MISSING", (out["deployments_h1"] >= q_hi) | (out["at_risk_sites"] >= out["at_risk_sites"].quantile(0.9)),
         (out["deployments_h1"] <= q_lo) & (out["p1_p2"] <= 2)],
        ["no location (cannot plan)", "under-served area (high load / many at-risk sites)", "possibly over-served (low load)"],
        default="balanced")
    return out


def suggest_new_basecamps(t: pd.DataFrame, n_per_nop: int = 1, min_sites: int = 10) -> pd.DataFrame:
    """Priority-weighted centroid of at-risk Critical/High sites per NOP, snapped to the nearest real site."""
    r = t[(t["reach_risk"] == 1) & t["eta_min"].notna() & t["mbp_priority_level"].isin(["P1", "P2"])
          & t["lat"].notna() & (t["is_island"] == 0)]
    rows = []
    for nop, g in r.groupby("nop"):
        if len(g) < min_sites:
            continue
        w = g["mbp_priority_score"]
        clat, clon = np.average(g["lat"], weights=w), np.average(g["lon"], weights=w)
        km = haversine_km(clat, clon, g["lat"].to_numpy(), g["lon"].to_numpy())
        j = int(np.argmin(km))
        rows.append(dict(nop=nop, at_risk_priority_sites=len(g), suggested_lat=round(clat, 5), suggested_lon=round(clon, 5), anchor_lat=float(g.iloc[j]["lat"]), anchor_lon=float(g.iloc[j]["lon"]), anchor_km_from_centre=round(float(km[j]), 2),
                         anchor_site=g.iloc[j]["site_id"], anchor_site_name=g.iloc[j]["site_name"],
                         avg_eta_now_min=round(g["eta_min"].mean(), 0),
                         note="decision support: candidate location for an extra / relocated MBP"))
    return pd.DataFrame(rows).sort_values("at_risk_priority_sites", ascending=False) if rows else pd.DataFrame()
