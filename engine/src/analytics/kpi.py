"""Site-level KPIs. Every source is aggregated to SITE grain *before* any join (no row multiplication)."""
from __future__ import annotations
import numpy as np
import pandas as pd


def site_bbt_kpi(ev: pd.DataFrame, monthly: pd.DataFrame, min_events: int = 1, flap: int = 300) -> pd.DataFrame:
    g = ev.groupby("site_id")
    base = pd.DataFrame({
        "evt_total": g.size(),
        "evt_exhaustion": g["is_exhaustion"].sum(),
        "evt_censored": g["is_censored"].sum(),
    })
    ex = ev[ev["is_exhaustion"] == 1].groupby("site_id")["backup_min"]
    base["bbt_evt_median_min"] = ex.median()
    base["bbt_evt_p25_min"] = ex.quantile(0.25)
    base["bbt_evt_max_min"] = ex.max()
    base["bbt_evt_last_date"] = ev[ev["is_exhaustion"] == 1].groupby("site_id")["mf_start"].max()
    # trend: median of exhaustion events in Apr-Jun minus Jan-Mar (negative = degrading)
    e2 = ev[ev["is_exhaustion"] == 1].assign(h=lambda d: np.where(d["month"] >= 4, "h2", "h1"))
    tr = e2.pivot_table(index="site_id", columns="h", values="backup_min", aggfunc="median")
    base["bbt_trend_min"] = (tr.get("h2") - tr.get("h1")) if {"h1", "h2"} <= set(tr.columns) else np.nan
    # lower bound: battery survived at least this long when PLN came back first
    base["bbt_lower_bound_min"] = ev[ev["is_censored"] == 1].groupby("site_id")["backup_min"].max()
    base["evt_flapping"] = (base["evt_total"] > flap).astype(int)

    mb = monthly[monthly["category"].str.upper() == "BBT"].groupby("site_id")["bbt_median_min"].median()
    base = base.join(mb.rename("bbt_monthly_median_min"), how="outer")

    # ---- BBT measured (pragmatic rule, documented in BBS_LOGIC.md)
    has_evt = base["evt_exhaustion"].fillna(0) >= min_events
    base["bbt_measured_min"] = np.where(has_evt, base["bbt_evt_median_min"], base["bbt_monthly_median_min"])
    base["bbt_measured_source"] = np.where(has_evt, "BBT events (exhaustion, median)",
                                           np.where(base["bbt_monthly_median_min"].notna(),
                                                    "BBT monthly summary (median)", None))
    base["bbt_measured_evidence"] = np.where(has_evt, "ACTUAL",
                                             np.where(base["bbt_monthly_median_min"].notna(), "DERIVED", None))
    return base.reset_index().rename(columns={"index": "site_id"})


def site_power_kpi(monthly: pd.DataFrame, ev: pd.DataFrame, ran_m: pd.DataFrame, tickets: pd.DataFrame,
                   out25: pd.DataFrame, max_evt_month: int = 200) -> pd.DataFrame:
    monthly = monthly.copy()
    hours_in_month = monthly["month"].map({1: 744, 2: 672, 3: 744, 4: 720, 5: 744, 6: 720}).astype(float)
    monthly["pln_anomaly"] = ((monthly["repetitive"] > max_evt_month) | (monthly["total_pln_down_h"] > hours_in_month)).astype(int)
    monthly["repetitive"] = monthly["repetitive"].clip(upper=max_evt_month)
    monthly["total_pln_down_h"] = monthly["total_pln_down_h"].clip(upper=hours_in_month)
    g = monthly.groupby("site_id")
    p = pd.DataFrame({
        "pln_freq": g["repetitive"].sum(min_count=1),
        "pln_total_h": g["total_pln_down_h"].sum(min_count=1),
        "pln_max_event_h": g["pln_down_min"].max() / 60,
        "pln_months_affected": g["month"].nunique(),
        "pln_anomaly_months": g["pln_anomaly"].sum(),
    })
    p["pln_avg_h"] = p["pln_total_h"] / p["pln_freq"].replace(0, np.nan)
    p = p.join(ev.groupby("site_id").size().rename("pln_freq_evt10m"), how="outer")
    p = p.join(ev.groupby("site_id")["ne_down_min"].sum().div(60).rename("ne_down_evt_h"), how="outer")
    r = ran_m.groupby("site_id").agg(ran_days=("days", "sum"), ran_power_down_h=("power_sec", lambda s: s.sum() / 3600),
                                     ran_outage_h=("outage_sec", lambda s: s.sum() / 3600),
                                     ran_power_down_days=("power_outage_days", "sum"),
                                     ran_avail_pct=("avail_pct_mean", "mean"), ran_target_pct=("target_pct", "max"))
    p = p.join(r, how="outer")
    t = tickets.groupby("site_id").agg(tk_pln_off=("is_pln_off", "sum"), tk_no_battery=("is_no_battery", "sum"))
    p = p.join(t, how="outer")
    p = p.join(out25.set_index("site_id")["outage_2025_h"], how="left")
    return p.reset_index().rename(columns={"index": "site_id"})


def site_mbp_kpi(tickets: pd.DataFrame) -> pd.DataFrame:
    d = tickets[tickets["is_deployment"] == 1]
    g = d.groupby("site_id")
    k = pd.DataFrame({
        "mbp_deployments": g.size(),
        "mbp_backup_h": g["rh_hours"].sum(min_count=1),
        "mbp_rh_valid_share": g["rh_valid"].mean(),
        "mbp_distinct": g["mbp_id"].nunique(),
        "mbp_last_deploy": g["occurred_at"].max(),
        "hist_takeover_to_checkin_h": g["takeover_to_checkin_h"].median(),
    })
    prim = (d.groupby(["site_id", "mbp_id"]).size().rename("n").reset_index()
              .sort_values(["site_id", "n"], ascending=[True, False]).drop_duplicates("site_id"))
    k = k.join(prim.set_index("site_id").rename(columns={"mbp_id": "mbp_primary_hist", "n": "mbp_primary_hist_n"}))
    k["tickets_total"] = tickets.groupby("site_id").size()
    return k.reset_index().rename(columns={"index": "site_id"})


def mbp_workload(tickets: pd.DataFrame) -> pd.DataFrame:
    d = tickets[tickets["is_deployment"] == 1]
    return d.groupby("mbp_id").agg(mbp_tickets_h1=("site_id", "size"), mbp_sites_served=("site_id", "nunique"),
                                   mbp_run_hours_h1=("rh_hours", "sum")).reset_index()


def familiarity(tickets: pd.DataFrame) -> pd.DataFrame:
    d = tickets[tickets["is_deployment"] == 1]
    return d.groupby(["site_id", "mbp_id"]).size().rename("served_n").reset_index()


# ======================================================================= v2: merged PLN intervals
PERIOD_START, PERIOD_END = pd.Timestamp("2026-01-01"), pd.Timestamp("2026-07-01")
PERIOD_H = (PERIOD_END - PERIOD_START).total_seconds() / 3600   # 4,344 h


def merged_pln_intervals(ev: pd.DataFrame) -> pd.DataFrame:
    """One row per *merged* PLN outage interval per site.
    end = mains-fail clear; if missing (battery ran out first) = NE-down clear; else start + backup duration.
    Overlapping / touching intervals of the same site are merged, so Σ duration can never exceed the period."""
    e = ev[["site_id", "mf_start", "mf_clear", "ne_down_clear", "backup_min"]].dropna(subset=["mf_start"]).copy()
    end = e["mf_clear"].fillna(e["ne_down_clear"])
    end = end.fillna(e["mf_start"] + pd.to_timedelta(e["backup_min"].fillna(0), unit="m"))
    e["end"] = end.where(end >= e["mf_start"], e["mf_start"]).clip(upper=PERIOD_END)
    e = e.sort_values(["site_id", "mf_start"])
    prev_max = e.groupby("site_id")["end"].transform(lambda s: s.cummax().shift())
    e["new"] = (prev_max.isna() | (e["mf_start"] > prev_max)).astype(int)
    e["grp"] = e.groupby("site_id")["new"].cumsum()
    m = e.groupby(["site_id", "grp"]).agg(start=("mf_start", "min"), end=("end", "max"), n_raw=("mf_start", "size")).reset_index()
    m["hours"] = (m["end"] - m["start"]).dt.total_seconds() / 3600
    m["month"] = m["start"].dt.month
    return m


def site_power_kpi_v2(intervals: pd.DataFrame, monthly: pd.DataFrame, ran_m: pd.DataFrame, tickets: pd.DataFrame,
                      out25: pd.DataFrame, max_evt_month: int = 200) -> pd.DataFrame:
    g = intervals.groupby("site_id")
    p = pd.DataFrame({
        "pln_freq": g.size().astype(float),
        "pln_total_h": g["hours"].sum(),
        "pln_max_event_h": g["hours"].max(),
        "pln_months_affected": g["month"].nunique(),
        "pln_overlaps_merged": g["n_raw"].sum() - g.size(),
    })
    p["pln_evidence"] = "DERIVED"
    p["pln_source"] = "BBT events (merged intervals)"
    # fallback: monthly summary (counts are alarm counts; durations overlap -> capped per month)
    mo = monthly.copy()
    hrs = mo["month"].map({1: 744, 2: 672, 3: 744, 4: 720, 5: 744, 6: 720}).astype(float)
    mo["pln_anomaly"] = ((mo["repetitive"] > max_evt_month) | (mo["total_pln_down_h"] > hrs)).astype(int)
    mo["rep_c"] = mo["repetitive"].clip(upper=max_evt_month)
    mo["dur_c"] = mo["total_pln_down_h"].clip(upper=hrs)
    gm = mo.groupby("site_id")
    fb = pd.DataFrame({"m_freq": gm["rep_c"].sum(min_count=1), "m_total_h": gm["dur_c"].sum(min_count=1),
                       "pln_anomaly_months": gm["pln_anomaly"].sum(), "pln_alarm_count_monthly": gm["repetitive"].sum(min_count=1)})
    p = p.join(fb, how="outer")
    use_fb = p["pln_freq"].isna() & p["m_freq"].notna()
    p.loc[use_fb, "pln_freq"] = p.loc[use_fb, "m_freq"]
    p.loc[use_fb, "pln_total_h"] = p.loc[use_fb, "m_total_h"]
    p.loc[use_fb, "pln_evidence"] = "DERIVED"
    p.loc[use_fb, "pln_source"] = "BBT monthly summary (capped per month)"
    p["pln_total_h"] = p["pln_total_h"].clip(upper=PERIOD_H)
    p["pln_avg_h"] = p["pln_total_h"] / p["pln_freq"].replace(0, np.nan)
    p = p.drop(columns=["m_freq", "m_total_h"])
    # RAN (wall-clock) -> site condition
    r = ran_m.groupby("site_id").agg(ran_days=("days", "sum"), ne_count=("ne_count", "mean"),
                                     ran_power_down_h=("power_sec", lambda s: s.sum() / 3600),
                                     ran_transport_down_h=("transport_sec", lambda s: s.sum() / 3600),
                                     ran_outage_h=("outage_sec", lambda s: s.sum() / 3600),
                                     ran_power_down_days=("power_outage_days", "sum"),
                                     ran_avail_pct=("avail_pct_mean", "mean"), ran_target_pct=("target_pct", "max"))
    r["avail_wc_pct"] = 100 * (1 - r["ran_outage_h"] / (r["ran_days"] * 24)).clip(0, 1)
    r["avail_gap_pp"] = (r["ran_target_pct"] - r["avail_wc_pct"]).clip(lower=0)
    r["power_share_of_down"] = (r["ran_power_down_h"] / r["ran_outage_h"].replace(0, np.nan)).clip(0, 1)
    p = p.join(r, how="outer")
    t = tickets.groupby("site_id").agg(tk_pln_off=("is_pln_off", "sum"), tk_no_battery=("is_no_battery", "sum"))
    p = p.join(t, how="outer")
    p = p.join(out25.set_index("site_id")["outage_2025_h"], how="left")
    return p.reset_index().rename(columns={"index": "site_id"})
