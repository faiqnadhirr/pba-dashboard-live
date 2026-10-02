"""Assemble the site table (1 row per AREA1 site) and apply configurable scoring.

`apply_scoring` is pure pandas on ~20k rows, so the UI can re-run it live when weights/thresholds change.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.mbp.engine import mbp_factor_matrix, score, MBP_FACTOR_LABEL, dependency_children, travel_minutes
from src.bbs.model import bbs_factor_matrix, bbt_status, BBS_LABEL, recommend_actions, needs_action

# The 14 mandatory columns (display name -> internal column, evidence column)
SITE14 = [
    ("Priority", "mbp_priority_score", None, "DERIVED"),
    ("Site ID", "site_id", None, "ACTUAL"),
    ("Site Name", "site_name", None, "ACTUAL"),
    ("Class", "site_class", None, "ACTUAL"),
    ("Dependency (children)", "dependency_children", None, "PROXY"),
    ("NOP", "nop", None, "ACTUAL"),
    ("BBT Design (min)", "bbt_design_min", None, "PROXY"),
    ("BBT Measured (min)", "bbt_value_min", "bbt_value_evidence", None),
    ("PLN outage (freq)", "pln_freq", None, "DERIVED"),
    ("Outage Duration (h)", "pln_total_h", None, "DERIVED"),
    ("Distance to MBP (km)", "km_assigned", None, "DERIVED"),
    ("Travel time to MBP (min)", "eta_min", "eta_evidence", None),
    ("Historical MBP (deployments)", "mbp_deployments", None, "DERIVED"),
    ("Total MBP backup time (h)", "mbp_backup_h", None, "DERIVED"),
]


def assemble(sites, bbt_kpi, pwr_kpi, mbp_kpi, cov, est, ran_vendor, cfg) -> pd.DataFrame:
    t = sites.merge(bbt_kpi, on="site_id", how="left").merge(pwr_kpi, on="site_id", how="left") \
             .merge(mbp_kpi, on="site_id", how="left").merge(cov, on="site_id", how="left") \
             .merge(ran_vendor, on="site_id", how="left")
    assert t["site_id"].is_unique, "row multiplication in site table"
    t["dependency_children"] = dependency_children(t["hub_site"], cfg["dependency_children"])
    t["dependency_evidence"] = np.where(t["dependency_children"].notna(), "PROXY", "UNAVAILABLE")
    t["bbt_design_min"] = cfg["bbt"]["design_minutes"]
    for c in ("mbp_deployments", "tickets_total", "pln_freq", "pln_total_h", "tk_no_battery", "tk_pln_off"):
        t[c] = t[c].fillna(0)
    t["mbp_backup_h"] = t["mbp_backup_h"].fillna(0)
    if est is not None:
        t = t.merge(est, on="site_id", how="left")
    meas = t["bbt_measured_min"].notna()
    t["bbt_value_min"] = np.where(meas, t["bbt_measured_min"], t.get("bbt_est_min"))
    t["bbt_value_evidence"] = np.where(meas, t["bbt_measured_evidence"],
                                       t.get("bbt_est_evidence", pd.Series("UNAVAILABLE", index=t.index)).fillna("UNAVAILABLE"))
    t["bbt_value_basis"] = np.where(meas, t["bbt_measured_source"], t.get("bbt_est_method"))
    return t


def apply_scoring(t: pd.DataFrame, cfg: dict, with_actions: bool = True) -> pd.DataFrame:
    t = t.copy()
    t["bbt_design_min"] = cfg["bbt"]["design_minutes"]
    t["dependency_children"] = dependency_children(t["hub_site"], cfg["dependency_children"])
    t["eta_min"] = travel_minutes(t["km_assigned"], t["is_urban"].fillna(0), t["is_island"].fillna(0), cfg)
    t["uncovered"] = (t["km_assigned"].isna() | (t["km_assigned"] > cfg["mbp"]["max_radius_km"])).astype(int)
    t["eta_gap_min"] = t["eta_min"] - t["bbt_value_min"].fillna(0)
    # combined MBP-BBS rule: site has PLN outages and goes dark before the MBP can arrive (or cannot be reached by road)
    t["reach_risk"] = (((t["eta_gap_min"] > 0) | t["eta_min"].isna()) & (t["pln_freq"].fillna(0) > 0)).astype(int)
    # MBP priority
    mf = mbp_factor_matrix(t, cfg)
    ms = score(mf, cfg["mbp_priority"], MBP_FACTOR_LABEL, cfg["priority_levels"])
    t["mbp_priority_score"], t["mbp_priority_level"], t["mbp_priority_drivers"] = ms["score"], ms["level"], ms["drivers"]
    # BBS: battery status (Dead/Critical/Degraded/OK/Unknown) + priority P1..P4 for sites needing action
    t["bbt_status"] = bbt_status(t, cfg)
    t["bbt_pct_design"] = (100 * t["bbt_value_min"] / cfg["bbt"]["design_minutes"]).round(0)
    bf = bbs_factor_matrix(t, cfg)
    bs = score(bf, cfg["bbs_priority"], BBS_LABEL, cfg["bbs_priority_levels"])
    need = needs_action(t)
    t["bbs_priority_score"] = np.where(need, bs["score"], np.nan)
    t["bbs_priority_level"] = np.where(need, bs["level"], None)
    t["bbs_priority_drivers"] = np.where(need, bs["drivers"], None)
    t["action_batch"] = t["bbs_priority_level"].map(cfg["action_batches"])
    if with_actions:
        a = recommend_actions(t[need], cfg)
        t = t.drop(columns=[c for c in ("recommended_action", "reason", "mbp_standby_flag") if c in t]).merge(
            a, on="site_id", how="left")
        t["recommended_action"] = t["recommended_action"].fillna(pd.Series(
            np.where(t["bbt_status"] == "OK", "No action", "Collect data (no BBT info)"), index=t.index))
        t["mbp_standby_flag"] = t["mbp_standby_flag"].fillna(0).astype(int)
    t["site_status_flag"] = np.where(t["site_active"] == 1, "Active", "Inactive")
    return t


def site14_view(t: pd.DataFrame) -> pd.DataFrame:
    out = pd.DataFrame(index=t.index)
    for name, col, evcol, ev in SITE14:
        out[name] = t[col]
        if name in ("BBT Measured (min)", "Travel time to MBP (min)"):
            out[name] = pd.to_numeric(t[col], errors="coerce").round(0)
        if evcol:
            out[f"{name} · evidence"] = t[evcol]
    out["Priority level"] = t["mbp_priority_level"]
    out["Priority drivers"] = t["mbp_priority_drivers"]
    out["Assigned MBP"] = t["mbp_assigned"]
    out["Site status"] = t["site_status_flag"]
    for c in ("Outage Duration (h)", "Distance to MBP (km)", "Total MBP backup time (h)"):
        out[c] = pd.to_numeric(out[c], errors="coerce").round(1)
    return out
