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


# Scoring, statuses and actions were moved to lib/logic.js (single rule engine, used by every tab and tested by `npm test`).
# The Python engine prepares evidence only.


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
