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
from src.analytics.site_table import assemble, apply_scoring
from src.mbp import engine as M
from src.mbp.basecamp import basecamp_summary, suggest_new_basecamps
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
    if v is pd.NA or v is pd.NaT:
        return None
    return v


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: jclean(v) for k, v in r.items()} for r in df.to_dict("records")]


def columnar(df: pd.DataFrame) -> dict:
    """{'cols': [...], 'rows': [[...], ...]} — ~60% smaller than records."""
    return {"cols": list(df.columns), "rows": [[jclean(v) for v in r] for r in df.itertuples(index=False, name=None)]}


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
    tickets, q = C.clean_tickets(track, set(mbps["mbp_id"]), cfg["mbp"]["rh_max_hours_per_ticket"]); qa.update(q)
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
    pics = tickets[tickets["mbp_matched"] == 0]["mbp_id"].fillna("(blank)").value_counts()
    unmatched += [dict(source="ticket PIC without MBP base camp", id=k, n=int(v)) for k, v in pics.items()]
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
    assert len(t) == len(sites) and t["site_id"].is_unique, "row multiplication!"
    log("scoring + actions")
    t = apply_scoring(t, cfg)

    # ------------------------------------------------------------------ export
    log("writing JSON")
    for old in OUT.glob("**/*.json"):
        old.unlink()
    site_cols = [
        "site_id", "site_name", "site_class", "nop", "nop_flag", "cluster_to", "city", "type_site", "kepulauan", "is_island",
        "is_urban", "site_active", "vip", "lat", "lon", "hub_site", "dependency_children",
        "battery_type", "battery_age_y", "battery_banks", "load_a", "genset_active",
        "bbt_value_min", "bbt_value_evidence", "bbt_value_basis", "bbt_is_lower_bound", "bbt_measured_min",
        "bbt_lower_bound_min", "bbt_est_confidence", "bbt_est_low_min", "bbt_est_high_min", "bbt_trend_min",
        "evt_total", "evt_exhaustion", "evt_censored", "evt_flapping",
        "pln_freq", "pln_total_h", "pln_avg_h", "pln_max_event_h", "pln_source", "pln_alarm_count_monthly", "pln_anomaly_months",
        "outage_2025_h", "avail_wc_pct", "ran_target_pct", "avail_gap_pp", "ran_power_down_h", "ran_transport_down_h",
        "ran_outage_h", "ne_count", "tk_pln_off", "tk_no_battery", "in_ticket_file",
        "mbp_assigned", "km_assigned", "assignment_basis", "uncovered", "mbp_primary_hist",
        "mbp_deployments", "mbp_backup_h", "mbp_distinct", "hist_takeover_to_checkin_h",
        # build-time defaults (dashboard recomputes these live)
        "eta_min", "eta_gap_min", "reach_risk", "mbp_priority_score", "mbp_priority_level", "bbt_status",
        "bbs_priority_score", "bbs_priority_level", "recommended_action", "reason", "mbp_standby_flag", "action_batch",
    ]
    sz = {}
    sz["sites.json"] = dump(columnar(t[site_cols]), "sites.json")
    mbp_out = mbps.merge(wl, on="mbp_id", how="left")
    sz["mbps.json"] = dump(records(mbp_out), "mbps.json")
    sz["familiarity.json"] = dump(columnar(fam), "familiarity.json")
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

    # analytics + meta
    curves_out = []
    for keys in (["site_class"], ["battery_type"]):
        for k, gg in ev.merge(t[["site_id", "site_class", "battery_type"]], on="site_id").groupby(keys[0]):
            tt, sv = S.km_curve(gg["backup_min"].to_numpy(), gg["is_exhaustion"].to_numpy())
            step = max(1, len(tt) // 60)
            curves_out.append(dict(by=keys[0], group=str(k), n=len(gg), median=jclean(S.km_median(tt, sv)),
                                   pts=[[round(float(a_), 1), round(float(b_), 3)] for a_, b_ in zip(tt[::step], sv[::step])]))
    bc = basecamp_summary(t, mbps, tk, pairs)
    sug = suggest_new_basecamps(t, min_sites=5)
    meta = {
        "built_at": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
        "scope": cfg["scope"], "config": cfg, "qa": qa,
        "bbs": {"correlation": records(corr), "category_medians": records(cat), "time_split": records(ts),
                "chosen_estimator": chosen, "estimator_mae_min": mae, "km_curves": curves_out,
                "naive_vs_km": {"naive_median_all": jclean(km["naive_exhausted_median_min"].median()),
                                "km_median_all": jclean(km["km_median_min"].median())}},
        "mbp": {"basecamp_summary": records(bc), "suggestions": records(sug)},
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
        "sizes": sz,
    }
    sz["meta.json"] = dump(meta, "meta.json")
    # keep a parquet of the full site table for validation
    t.to_pickle(ROOT / "data" / "site_table.pkl")
    pd.to_pickle(dict(ev=ev, iv=iv, tk=tk, ran=ran, mo=mo), ROOT / "data" / "sources.pkl")
    log("sizes: " + ", ".join(f"{k} {v / 1e6:.1f} MB" for k, v in sz.items()))
    log("done")


if __name__ == "__main__":
    main()
