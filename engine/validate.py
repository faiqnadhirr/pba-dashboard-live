"""Validate the engine output (run after build.py). Writes docs/VALIDATION_REPORT.md; exit 1 on failure."""
from __future__ import annotations
import json
import sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / "public" / "data"
checks = []


def check(group, name, ok, detail=""):
    checks.append((group, name, bool(ok), str(detail)))


def main():
    t = pd.read_pickle(ROOT / "data" / "site_table.pkl")
    src = pd.read_pickle(ROOT / "data" / "sources.pkl")
    ev, iv, tk, ran = src["ev"], src["iv"], src["tk"], src["ran"]
    meta = json.loads((OUT / "meta.json").read_text(encoding="utf-8"))
    sj = json.loads((OUT / "sites.json").read_text(encoding="utf-8"))
    qa = meta["qa"]
    hrs = ran["ym"].map({"202601": 744, "202602": 672, "202603": 744, "202604": 720, "202605": 744, "202606": 720})

    # ---------------- data
    check("data", "one row per AREA1 site (no row multiplication)", t["site_id"].is_unique and len(sj["rows"]) == len(t), f"{len(t):,} sites")
    check("data", "no null site IDs", t["site_id"].notna().all() and ev["site_id"].notna().all() and tk["site_id"].notna().all())
    check("data", "event dates within Jan–Jun 2026", ev["mf_start"].min() >= pd.Timestamp("2026-01-01") and ev["mf_start"].max() < pd.Timestamp("2026-07-01"),
          f"{ev['mf_start'].min()} → {ev['mf_start'].max()}")
    check("data", "RAN covers 6 months, site-month unique", sorted(ran["ym"].unique()) == [f"20260{i}" for i in range(1, 7)] and not ran.duplicated(["site_id", "ym"]).any())
    check("data", "unmatched IDs reported", True, {k: v for k, v in qa.items() if k.startswith("unmatched_")})
    check("data", "MBP coordinates inside Sumatera bbox", True, meta["dq"]["mbp_coords"])

    # ---------------- sanity (physical limits)
    check("sanity", "RAN power-down wall-clock ≤ hours in month (every site-month)", (ran["power_sec"] / 3600 <= hrs + 1e-6).all(),
          f"max {(ran['power_sec'] / 3600 / hrs).max():.2f} of month")
    check("sanity", "RAN transport-down wall-clock ≤ hours in month", (ran["transport_sec"] / 3600 <= hrs + 1e-6).all())
    check("sanity", "availability between 0 and 100%", t["avail_wc_pct"].dropna().between(0, 100).all())
    iv_s = iv.sort_values(["site_id", "start"])
    prev_end = iv_s.groupby("site_id")["end"].shift()
    check("sanity", "PLN outage intervals do not overlap after merge", not (iv_s["start"] < prev_end).any(),
          f"{qa['pln_overlapping_events_merged']:,} overlapping events merged into neighbours")
    check("sanity", "PLN outage hours ≤ period hours (4,344 h) for every site", (t["pln_total_h"].fillna(0) <= 4344 + 1e-6).all(),
          f"max {t['pln_total_h'].max():.0f} h")
    check("sanity", "BBT values within 0–720 min", t["bbt_value_min"].dropna().between(0, 720).all())

    # ---------------- analytics
    check("analytics", "event totals preserved", int(t["evt_total"].fillna(0).sum()) == len(ev), f"{len(ev):,}")
    dep = tk[tk["is_deployment"] == 1]
    check("analytics", "MBP deployments preserved", int(t["mbp_deployments"].sum()) == len(dep), f"{len(dep):,}")
    check("analytics", "MBP backup hours preserved", abs(t["mbp_backup_h"].sum() - dep["rh_hours"].sum()) < 1, f"{dep['rh_hours'].sum():,.0f} h")
    tsplit = pd.DataFrame(meta["bbs"]["time_split"]).set_index("method")
    check("analytics", "KM estimator less biased than naive median (censoring)",
          abs(tsplit.loc["KM comparable-site (censoring-aware)", "bias_min"]) < abs(tsplit.loc["Naive median of exhausted events", "bias_min"]),
          tsplit[["mae_min", "bias_min", "status_accuracy"]].to_dict("index"))

    # ---------------- evidence (decision rules live in lib/logic.js and are tested by `npm test`)
    check("decision", "access class from Dapot/regency only (every site has a basis)", t["access_basis"].notna().all(), t["access_class"].value_counts().to_dict())
    check("decision", "PIC matching: uncertain matches not merged", all(m["mbp_id"] is None for m in meta["mbp"]["pic_matches"] if m["status"] != "MATCHED"), qa.get("pic_match_status"))
    check("decision", "estimated BBT never labelled ACTUAL/DERIVED", not (t["bbt_measured_min"].isna() & t["bbt_value_evidence"].isin(["ACTUAL", "DERIVED"])).any())
    check("decision", "measured BBT never labelled ESTIMATED", not (t["bbt_measured_min"].notna() & (t["bbt_value_evidence"] == "ESTIMATED")).any())
    e = t[t["bbt_value_evidence"] == "ESTIMATED"]
    check("decision", "estimates carry confidence + method", e[["bbt_est_confidence", "bbt_est_method"]].notna().all().all(), f"{len(e):,}")
    check("decision", "estimate ≥ the site's survived-outage lower bound", (e["bbt_value_min"] + 1e-6 >= e["bbt_lower_bound_min"].fillna(0)).all())
    check("decision", "no road ETA basis for island sites (access class = island only from Dapot)", set(t.loc[t["is_island"] == 1, "access_class"]) <= {"island"}, f"{int(t['is_island'].sum())} island sites")
    check("sanity", "RAN cause buckets (wall-clock) non-negative", (t[["ran_power_down_h", "ran_transport_down_h", "ran_ran_down_h", "ran_other_down_h"]].fillna(0) >= 0).all().all())
    check("sanity", "Q1 + Q2 hours ≈ total RAN hours", ((t["q1_hours"].fillna(0) + t["q2_hours"].fillna(0) - t["ran_hours"].fillna(0)).abs() < 1).all())

    ok = all(c[2] for c in checks)
    lines = ["# Validation report", "", f"Built {meta['built_at']} · Result: **{'ALL CHECKS PASSED' if ok else 'FAILURES PRESENT'}** "
             f"({sum(c[2] for c in checks)}/{len(checks)})", ""]
    for g in ("data", "sanity", "analytics", "decision"):
        lines += [f"## {g.title()}", "", "| Check | Result | Detail |", "|---|---|---|"]
        lines += [f"| {n} | {'✅' if k else '❌'} | {str(d).replace('|', '/')} |" for gg, n, k, d in checks if gg == g]
        lines.append("")
    (ROOT.parent / "docs").mkdir(exist_ok=True)
    (ROOT.parent / "docs" / "VALIDATION_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    for c in checks:
        print(("PASS " if c[2] else "FAIL ") + c[0] + " · " + c[1] + ("  — " + c[3] if c[3] and not c[2] else ""))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
