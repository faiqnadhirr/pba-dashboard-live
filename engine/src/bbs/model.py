"""BBS engine: correlation study -> BBT estimation -> status -> priority -> action list."""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from src.common import pct_rank

NUM_FEATS = ["pln_freq", "pln_total_h", "pln_avg_h", "pln_max_event_h", "outage_2025_h", "ran_power_down_h",
             "tk_pln_off", "tk_no_battery", "mbp_deployments", "battery_age_y", "load_a", "battery_banks",
             "battery_qty", "dependency_children", "genset_active", "is_island", "is_urban", "vip",
             "bbt_lower_bound_min", "bbt_max_2025_min"]
CAT_FEATS = ["site_class", "battery_type", "nop", "vendor", "type_site_g", "main_power_g"]

FEATURE_LABEL = {
    "pln_freq": "PLN outage frequency (H1-2026)", "pln_total_h": "PLN outage total duration",
    "pln_avg_h": "PLN outage avg duration / event", "pln_max_event_h": "longest PLN outage",
    "outage_2025_h": "2025 outage hours", "ran_power_down_h": "network down due to power (RAN)",
    "tk_pln_off": "PLN-off tickets", "tk_no_battery": "'Tidak Ada Baterai' tickets",
    "mbp_deployments": "MBP deployments", "battery_age_y": "battery age (years)", "load_a": "NE load (A)",
    "battery_banks": "battery banks", "battery_qty": "battery qty", "dependency_children": "dependency (children)",
    "genset_active": "fixed genset", "is_island": "island site", "is_urban": "urban site", "vip": "VIP",
    "bbt_lower_bound_min": "survived-outage lower bound", "bbt_max_2025_min": "BBT max 2025",
}


def build_features(t: pd.DataFrame, ref_date="2026-06-30") -> pd.DataFrame:
    f = t.copy()
    f["battery_age_y"] = (pd.Timestamp(ref_date) - pd.to_datetime(f["battery_install_date"])).dt.days / 365.25
    f.loc[(f["battery_age_y"] < 0) | (f["battery_age_y"] > 25), "battery_age_y"] = np.nan
    f["type_site_g"] = f["type_site"].astype("string").str.replace(r"^\d+\.", "", regex=True).str.strip()
    mp = f["main_power"].astype("string").str.upper()
    f["main_power_g"] = np.select([mp.str.contains("BUILDING", na=False).to_numpy(bool), mp.str.contains("GENSET", na=False).to_numpy(bool),
                                   mp.str.contains("12", na=False).to_numpy(bool), mp.str.contains("PLN", na=False).to_numpy(bool)], ["INBUILDING", "PLN+GENSET", "PLN<=12H", "PLN"], "OTHER")
    return f


# ----------------------------------------------------------------- 7.1 correlation study
def correlation_table(f: pd.DataFrame, target="bbt_measured_min") -> pd.DataFrame:
    rows = []
    y = f[target]
    for c in NUM_FEATS:
        if c not in f or c == "bbt_lower_bound_min":
            continue
        d = pd.concat([f[c], y], axis=1).dropna()
        if len(d) < 30 or d[c].nunique() < 2:
            continue
        rows.append(dict(feature=c, label=FEATURE_LABEL.get(c, c), n=len(d),
                         pearson=round(d.corr().iloc[0, 1], 3), spearman=round(d.corr("spearman").iloc[0, 1], 3),
                         required_by_management=c in ("pln_freq", "pln_total_h", "pln_avg_h"),
                         caveat=("same event feed as BBT: longer PLN outages let longer battery runs be observed "
                                 "(censoring) → correlation is partly mechanical, not causal")
                         if c in ("pln_freq", "pln_total_h", "pln_avg_h", "pln_max_event_h") else None))
    out = pd.DataFrame(rows)
    out["abs_spearman"] = out["spearman"].abs()
    out["strength"] = pd.cut(out["abs_spearman"], [-1, 0.1, 0.3, 0.5, 1.1],
                             labels=["negligible", "weak", "moderate", "strong"]).astype(str)
    return out.sort_values("abs_spearman", ascending=False).reset_index(drop=True)


def categorical_table(f: pd.DataFrame, target="bbt_measured_min") -> pd.DataFrame:
    rows = []
    for c in CAT_FEATS:
        g = f.dropna(subset=[target]).groupby(c)[target].agg(["median", "size"])
        g = g[g["size"] >= 30]
        for k, r in g.iterrows():
            rows.append(dict(feature=c, value=k, n=int(r["size"]), median_bbt_min=round(r["median"], 1)))
    return pd.DataFrame(rows)


# ----------------------------------------------------------------- 7.1/7.2 estimation
def _hier_median(train: pd.DataFrame, test: pd.DataFrame, target: str, levels: list[list[str]], min_n=15):
    pred = pd.Series(np.nan, index=test.index); basis = pd.Series(None, index=test.index, dtype="object")
    npool = pd.Series(np.nan, index=test.index)
    for keys in levels:
        g = train.groupby(keys)[target].agg(["median", "size"])
        g = g[g["size"] >= min_n]
        m = test[keys].merge(g, left_on=keys, right_index=True, how="left")
        fill = pred.isna() & m["median"].notna()
        pred[fill] = m.loc[fill, "median"]; npool[fill] = m.loc[fill, "size"]
        basis[fill] = "comparable sites: " + " x ".join(keys)
    gm = train[target].median()
    fill = pred.isna(); pred[fill] = gm; basis[fill] = "AREA1 median"; npool[fill] = len(train)
    return pred, basis, npool


HIER = [["site_class", "battery_type", "nop"], ["site_class", "battery_type"], ["battery_type", "nop"],
        ["site_class"], ["nop"]]


def _matrix(f: pd.DataFrame, cats: dict | None = None):
    X = f[NUM_FEATS].astype(float).copy()
    cats = cats or {c: sorted(f[c].dropna().astype(str).unique()) for c in CAT_FEATS}
    for c, vals in cats.items():
        X[c] = pd.Categorical(f[c].astype("string"), categories=vals).codes.astype(float)
        X.loc[X[c] < 0, c] = np.nan
    return X, cats


def train_estimator(f: pd.DataFrame, target="bbt_measured_min", seed=42) -> dict:
    lab = f[f[target].notna()].copy()
    tr, te = train_test_split(lab, test_size=0.25, random_state=seed)
    res = {}
    # baseline: comparable-site median
    p0, _, _ = _hier_median(tr, te, target, HIER)
    res["comparable_median"] = p0
    # ridge on numeric (median-imputed)
    Xtr, cats = _matrix(tr); Xte, _ = _matrix(te, cats)
    med = Xtr.median()
    lin = Ridge(alpha=1.0).fit(Xtr.fillna(med), tr[target])
    res["linear_regression"] = pd.Series(lin.predict(Xte.fillna(med)), index=te.index)
    # gradient-boosted trees (native NaN + categorical)
    cat_mask = [c in CAT_FEATS for c in Xtr.columns]
    gb = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=31, min_samples_leaf=40,
                                       categorical_features=cat_mask, random_state=seed)
    gb.fit(Xtr, tr[target])
    res["gradient_boosting"] = pd.Series(gb.predict(Xte), index=te.index)
    perf = []
    for k, p in res.items():
        p = p.clip(0, 720)
        # censored-aware: estimate can never be below the observed lower bound
        p = np.maximum(p, te["bbt_lower_bound_min"].fillna(0))
        perf.append(dict(model=k, mae_min=round(mean_absolute_error(te[target], p), 1),
                         r2=round(r2_score(te[target], p), 3),
                         status_accuracy=round(float((_status_vec(p) == _status_vec(te[target])).mean()), 3)))
    perf = pd.DataFrame(perf).sort_values("mae_min").reset_index(drop=True)
    base_mae = perf.set_index("model").loc["comparable_median", "mae_min"]
    best = perf.iloc[0]["model"]
    # choose simplest adequate model: a more complex model must beat the baseline MAE by >= 5%
    chosen = best if (best != "comparable_median" and perf.iloc[0]["mae_min"] <= 0.95 * base_mae) else "comparable_median"
    resid = (te[target] - np.maximum(res[chosen].clip(0, 720), te["bbt_lower_bound_min"].fillna(0)))
    imp = None
    if chosen == "gradient_boosting":
        from sklearn.inspection import permutation_importance
        pi = permutation_importance(gb, Xte, te[target], n_repeats=5, random_state=seed, scoring="neg_mean_absolute_error")
        imp = pd.DataFrame({"feature": Xte.columns, "importance_min": pi.importances_mean}).sort_values(
            "importance_min", ascending=False)
        imp["label"] = imp["feature"].map(lambda c: FEATURE_LABEL.get(c, c))
    return dict(perf=perf, chosen=chosen, models=dict(linear=(lin, med, cats), gb=(gb, cats)), train=lab,
                resid_q=(float(resid.quantile(0.1)), float(resid.quantile(0.9))), mae=float(
                    perf.set_index("model").loc[chosen, "mae_min"]), importance=imp,
                n_train=len(tr), n_test=len(te))


def apply_estimator(f: pd.DataFrame, est: dict, target="bbt_measured_min") -> pd.DataFrame:
    unl = f[f[target].isna()].copy()
    ch = est["chosen"]
    if ch == "comparable_median":
        p, basis, npool = _hier_median(est["train"], unl, target, HIER)
    elif ch == "linear_regression":
        lin, med, cats = est["models"]["linear"]; X, _ = _matrix(unl, cats)
        p = pd.Series(lin.predict(X.fillna(med)), index=unl.index); basis = pd.Series("linear regression", index=unl.index)
        npool = pd.Series(np.nan, index=unl.index)
    else:
        gb, cats = est["models"]["gb"]; X, _ = _matrix(unl, cats)
        p = pd.Series(gb.predict(X), index=unl.index); basis = pd.Series("gradient boosting model", index=unl.index)
        npool = pd.Series(np.nan, index=unl.index)
    p = p.clip(0, 720)
    lb = unl["bbt_lower_bound_min"]
    p = np.maximum(p, lb.fillna(0))
    lo, hi = est["resid_q"]
    has_lb = lb.notna()
    # inputs check: no power history and no battery info -> not responsible to estimate
    # pln_freq is 0-filled upstream, so only a *positive* outage history counts as information
    informative = (unl[["battery_type", "battery_banks", "bbt_max_2025_min"]].notna().any(axis=1) | has_lb
                   | (unl["pln_freq"].fillna(0) > 0))
    conf = np.where(has_lb & (lb >= 60), "Medium", np.where(has_lb, "Medium-Low", "Low"))
    out = pd.DataFrame({
        "site_id": unl["site_id"],
        "bbt_est_min": np.where(informative, np.ceil(p * 10) / 10, np.nan),   # ceil keeps it >= lower bound
        "bbt_est_low_min": np.where(informative, np.maximum(p + lo, lb.fillna(0)).clip(0).round(1), np.nan),
        "bbt_est_high_min": np.where(informative, (p + hi).clip(0).round(1), np.nan),
        "bbt_est_confidence": np.where(informative, conf, None),
        "bbt_est_method": np.where(informative, basis.astype(str) + np.where(has_lb, " + floor at survived-outage lower bound", ""), None),
        "bbt_est_evidence": np.where(informative, "ESTIMATED", "UNAVAILABLE"),
    })
    return out


# ----------------------------------------------------------------- 7.3 status
def _status_vec(v, design=120, ok=0.5, deg=0.25, dead=5):
    v = np.asarray(v, dtype=float)
    return np.select([np.isnan(v), v <= dead, v < deg * design, v < ok * design], ["Unknown", "Dead", "Critical", "Degraded"], "OK")


def bbt_status(t: pd.DataFrame, cfg: dict) -> pd.Series:
    b = cfg["bbt"]
    st = pd.Series(_status_vec(t["bbt_value_min"], b["design_minutes"], b["ok_pct"], b["degraded_pct"], b["dead_max_minutes"]),
                   index=t.index)
    nobatt = (t["tk_no_battery"].fillna(0) >= 1) & ((t["bbt_value_min"].isna()) | (t["bbt_value_min"] < b["degraded_pct"] * b["design_minutes"]))
    st[nobatt] = "Dead"
    return st


# ----------------------------------------------------------------- 7.4 priority + action
BBS_LABEL = {"bbt_severity": "BBT gap vs design", "pln_exposure": "historical PLN outage", "class": "site class",
             "dependency": "dependency (children)", "site_condition": "availability below target", "vip": "VIP site"}


def bbs_factor_matrix(t: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    design = cfg["bbt"]["design_minutes"]
    cs = cfg["class_score"]
    f = pd.DataFrame(index=t.index)
    sev = (1 - (t["bbt_value_min"] / design).clip(0, 1))
    sev[t["bbt_status"] == "Dead"] = 1.0
    f["bbt_severity"] = sev.fillna(0.5)
    f["pln_exposure"] = (0.5 * pct_rank(t["pln_freq"].fillna(0)) + 0.35 * pct_rank(t["pln_total_h"].fillna(0))
                         + 0.15 * pct_rank(t["outage_2025_h"].fillna(0)))
    f["class"] = t["site_class"].map(cs).fillna(cs.get("Unknown", 0.3))
    f["dependency"] = t["dependency_children"].fillna(0).clip(0, 15) / 15
    f["site_condition"] = (t["avail_gap_pp"].fillna(0) / cfg["site_condition"]["full_gap_pp"]).clip(0, 1)
    f["vip"] = t["vip"].fillna(0).astype(float)
    return f


def needs_action(t: pd.DataFrame) -> pd.Series:
    """BBS problem (status) OR the combined MBP–BBS rule: hub site that goes dark before the MBP can arrive."""
    problem = t["bbt_status"].isin(["Dead", "Critical", "Degraded"])
    reach = (t["reach_risk"] == 1) & (t["dependency_children"].fillna(0) > 0)
    return problem | reach


def recommend_actions(t: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    age_lim = cfg["battery_age_replace_years"]
    hi_load = cfg["load_high_ampere"]
    design = cfg["bbt"]["design_minutes"]
    rows = []
    pln_hi = t["pln_freq"].fillna(0).quantile(0.75) if len(t) else 0
    for _, r in t.iterrows():
        st = r["bbt_status"]; ev = r["bbt_value_evidence"]
        btype = r.get("battery_type") if pd.notna(r.get("battery_type")) else "OTHER"
        lim = age_lim.get(btype, age_lim["OTHER"]) if btype != "MIXED" else age_lim["VRLA"]
        age = r.get("battery_age_y"); load = r.get("load_a")
        hub = (r.get("dependency_children") or 0) > 0
        reach = r.get("reach_risk") == 1
        why = []
        if pd.notna(r["bbt_value_min"]):
            pre = "≥ " if r.get("bbt_is_lower_bound") == 1 else ""
            why.append(f"BBT {pre}{r['bbt_value_min']:.0f} min = {100 * r['bbt_value_min'] / design:.0f}% of design ({ev})")
        if r.get("tk_no_battery", 0) >= 1:
            why.append(f"{int(r['tk_no_battery'])} 'Tidak Ada Baterai' ticket(s)")
        if reach and pd.notna(r.get("eta_min")):
            why.append(f"MBP ETA {r['eta_min']:.0f} min > BBT → site dark ~{r['eta_min'] - (r['bbt_value_min'] or 0):.0f} min before MBP arrives")
        if pd.notna(age):
            why.append(f"battery {age:.1f} yrs ({btype})")
        if pd.notna(r.get("pln_freq")) and r["pln_freq"] > 0:
            why.append(f"{int(r['pln_freq'])} PLN outages H1-2026 ({(r.get('pln_total_h') or 0):.0f} h)")
        if pd.notna(r.get("avail_gap_pp")) and r["avail_gap_pp"] > 0:
            why.append(f"availability {r['avail_wc_pct']:.2f}% ({r['avail_gap_pp']:.2f} pp below target)")
        if hub:
            why.append(f"hub: {r.get('hub_site')} (~{int(r['dependency_children'])} children, PROXY)")
        why.append(f"class {r['site_class']}")
        if pd.notna(r.get("bbt_trend_min")) and r["bbt_trend_min"] < -15:
            why.append(f"BBT dropped {abs(r['bbt_trend_min']):.0f} min Apr–Jun vs Jan–Mar")

        if st == "Dead" and r.get("tk_no_battery", 0) >= 1:
            act = "Replenishment (battery missing / no battery)"
        elif st in ("Dead", "Critical", "Degraded") and ev == "ESTIMATED":
            act = "Inspect & verify (capacity test) — BBT is estimated"
        elif st in ("Dead", "Critical") and pd.notna(age) and age >= lim:
            act = "Battery replacement"
        elif st in ("Dead", "Critical", "Degraded") and pd.notna(load) and load >= hi_load:
            act = "Battery upgrade (add capacity)"
        elif st in ("Dead", "Critical"):
            act = "Battery replacement" if pd.isna(age) else "Inspect & capacity test → replace / upgrade"
        elif st == "Degraded" and (r.get("pln_freq") or 0) >= pln_hi:
            act = "Battery upgrade (add capacity)"
        elif st == "Degraded":
            act = "Monitor (re-test next PM)"
        elif reach and hub:
            act = "MBP standby + battery upgrade (hub goes dark before MBP arrives)"
        else:
            act = "No action"
        mbp_flag = int((st in ("Dead", "Critical") and (r.get("pln_freq") or 0) >= pln_hi) or (reach and hub))
        rows.append(dict(site_id=r["site_id"], recommended_action=act, reason="; ".join(why), mbp_standby_flag=mbp_flag))
    return pd.DataFrame(rows, columns=["site_id", "recommended_action", "reason", "mbp_standby_flag"])
