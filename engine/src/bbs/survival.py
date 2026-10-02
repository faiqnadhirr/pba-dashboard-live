"""Censoring-aware BBT (Kaplan-Meier).

Each mains-fail event is a 'battery life test':
  * battery ran out (LOW BATT / NE DOWN)  -> event observed at t = backup minutes
  * PLN came back first (ONLY MAINS FAIL) -> right-censored at t (battery lasted AT LEAST t)
A plain median of exhausted events is biased LOW (long-lasting batteries are mostly censored).
Kaplan-Meier uses both.
"""
from __future__ import annotations
import numpy as np
import pandas as pd

MIN_SITE_EVENTS = 3          # min events (any) to compute a site KM
MIN_GROUP_EVENTS = 200       # min events for a comparable-site group curve


def km_curve(t: np.ndarray, e: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (times, survival) at each distinct event time."""
    t = np.asarray(t, float); e = np.asarray(e, int)
    ok = ~np.isnan(t)
    t, e = t[ok], e[ok]
    if len(t) == 0:
        return np.array([]), np.array([])
    order = np.argsort(t, kind="mergesort")
    t, e = t[order], e[order]
    uniq, idx = np.unique(t, return_index=True)
    n_at_risk = len(t) - idx
    deaths = np.add.reduceat(e, idx)
    s = np.cumprod(1 - deaths / n_at_risk)
    keep = deaths > 0
    return uniq[keep], s[keep]


def km_median(times, surv) -> float:
    if len(times) == 0:
        return np.nan
    hit = np.nonzero(surv <= 0.5)[0]
    return float(times[hit[0]]) if len(hit) else np.nan


def km_conditional_median(times, surv, lb: float) -> float:
    """Median remaining-life given the battery already survived `lb` minutes: S(t) <= 0.5 * S(lb)."""
    if len(times) == 0:
        return np.nan
    s_lb = surv[times <= lb][-1] if (times <= lb).any() else 1.0
    hit = np.nonzero((times > lb) & (surv <= 0.5 * s_lb))[0]
    return float(times[hit[0]]) if len(hit) else np.nan


def site_km(ev: pd.DataFrame) -> pd.DataFrame:
    """Per-site KM median from that site's own events."""
    rows = []
    for sid, g in ev.groupby("site_id"):
        t = g["backup_min"].to_numpy(); e = g["is_exhaustion"].to_numpy()
        n, k = int(len(g)), int(e.sum())
        lb = float(np.nanmax(t[e == 0])) if (e == 0).any() else np.nan
        med = np.nan; reached = False
        if k >= 1 and n >= MIN_SITE_EVENTS:
            tt, ss = km_curve(t, e)
            med = km_median(tt, ss); reached = not np.isnan(med)
        elif k >= 1:                       # too few events for KM -> median of exhausted
            med = float(np.nanmedian(t[e == 1])); reached = True
        if k >= 1 and not reached:         # median not reached: battery usually outlives PLN outages
            med = float(np.nanmax(t))      # lower bound
        rows.append(dict(site_id=sid, km_n_events=n, km_n_exhausted=k, km_median_min=med,
                         km_median_is_lower_bound=int(k >= 1 and not reached), km_lower_bound_min=lb,
                         naive_exhausted_median_min=float(np.nanmedian(t[e == 1])) if k else np.nan))
    return pd.DataFrame(rows)


GROUP_LEVELS = [["site_class", "battery_type", "nop"], ["site_class", "battery_type"], ["site_class", "nop"],
                ["site_class"], []]


def group_curves(ev: pd.DataFrame, attrs: pd.DataFrame) -> dict:
    """KM curves for comparable-site groups (pooled events)."""
    d = ev[["site_id", "backup_min", "is_exhaustion"]].merge(attrs[["site_id", "site_class", "battery_type", "nop"]], on="site_id", how="left")
    for c in ("site_class", "battery_type", "nop"):
        d[c] = d[c].fillna("UNKNOWN").astype(str)
    curves = {}
    for keys in GROUP_LEVELS:
        if not keys:
            curves[()] = km_curve(d["backup_min"].to_numpy(), d["is_exhaustion"].to_numpy()) + (len(d),)
            continue
        for k, g in d.groupby(keys):
            if len(g) >= MIN_GROUP_EVENTS:
                k = k if isinstance(k, tuple) else (k,)
                curves[tuple(zip(keys, k))] = km_curve(g["backup_min"].to_numpy(), g["is_exhaustion"].to_numpy()) + (len(g),)
    return curves


def group_estimate(row: pd.Series, curves: dict, lb: float | None = None):
    """Hierarchical comparable-site KM estimate; conditional on the site's survived lower bound if known."""
    for keys in GROUP_LEVELS:
        key = tuple((k, str(row.get(k) if pd.notna(row.get(k)) else "UNKNOWN")) for k in keys)
        if key in curves:
            tt, ss, n = curves[key]
            v = km_conditional_median(tt, ss, lb) if lb is not None and not np.isnan(lb) else km_median(tt, ss)
            label = " × ".join(keys) if keys else "AREA1"
            if np.isnan(v):     # median not reached in group -> group's longest observed
                v = float(tt[-1]) if len(tt) else np.nan
                return v, f"comparable-site KM ({label}, n={n}) — median not reached, lower bound", n
            return v, f"comparable-site KM ({label}, n={n})" + (f" | conditional on survived {lb:.0f} min" if lb is not None and not np.isnan(lb) else ""), n
    return np.nan, None, 0


def holdout_sites(site_ids, share=0.3, seed=42) -> set:
    ids = np.array(sorted(set(site_ids)))
    rng = np.random.default_rng(seed)
    return set(ids[rng.random(len(ids)) < share])


def evaluate_time_split(ev: pd.DataFrame, attrs: pd.DataFrame, test_sites: set | None = None) -> pd.DataFrame:
    """Site-AND-time split: estimators learn from Jan–Apr events of TRAIN sites only and are scored on the
    May–Jun KM median of unseen TEST sites (>= 3 May–Jun events incl. >= 1 exhausted). This mimics estimating a
    site that has no measurement. 'Own-site history' is the exception: it uses the test site's own Jan–Apr events."""
    from src.bbs.model import _status_vec
    test_sites = test_sites if test_sites is not None else holdout_sites(ev["site_id"])
    tr = ev[(ev["month"] <= 4) & ~ev["site_id"].isin(test_sites)]
    te = ev[(ev["month"] >= 5) & ev["site_id"].isin(test_sites)]
    truth = site_km(te)
    truth = truth[(truth["km_n_events"] >= 3) & (truth["km_n_exhausted"] >= 1) & (truth["km_median_is_lower_bound"] == 0)]
    curves = group_curves(tr, attrs)
    a = attrs.set_index("site_id")
    tr_naive = tr[tr["is_exhaustion"] == 1][["site_id", "backup_min"]].merge(attrs[["site_id", "site_class", "battery_type", "nop"]], on="site_id")
    preds = {"KM comparable-site (censoring-aware)": [], "Naive median of exhausted events": [], "Own-site history Jan–Apr (KM)": []}
    own = site_km(ev[(ev["month"] <= 4) & ev["site_id"].isin(test_sites)]).set_index("site_id")
    for _, r in truth.iterrows():
        row = a.loc[r["site_id"]] if r["site_id"] in a.index else pd.Series(dtype=object)
        preds["KM comparable-site (censoring-aware)"].append(group_estimate(row, curves)[0])
        g = tr_naive[(tr_naive["site_class"] == row.get("site_class")) & (tr_naive["battery_type"] == row.get("battery_type"))]
        preds["Naive median of exhausted events"].append(g["backup_min"].median() if len(g) else tr_naive["backup_min"].median())
        preds["Own-site history Jan–Apr (KM)"].append(own.loc[r["site_id"], "km_median_min"] if r["site_id"] in own.index else np.nan)
    y = truth["km_median_min"].to_numpy()
    out = []
    for k, p in preds.items():
        p = np.asarray(p, float); m = ~np.isnan(p)
        out.append(dict(method=k, n_test_sites=int(m.sum()), mae_min=round(float(np.mean(np.abs(p[m] - y[m]))), 1),
                        bias_min=round(float(np.mean(p[m] - y[m])), 1),
                        status_accuracy=round(float((_status_vec(p[m]) == _status_vec(y[m])).mean()), 3)))
    return pd.DataFrame(out)
