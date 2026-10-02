"""MBP identity: normalise PIC / base-camp names, match ticket PICs to base camps, flag possible duplicates.

Nothing is merged blindly:
  * exact normalised-name match            -> MATCHED (confidence HIGH)
  * one fuzzy candidate >= 0.92 in same NOP -> MATCHED (confidence MEDIUM)
  * 0.85-0.92, or several candidates        -> NEEDS REVIEW (kept unmatched)
  * otherwise                               -> UNMATCHED
"""
from __future__ import annotations
import re
from difflib import SequenceMatcher
import pandas as pd

PREFIX = re.compile(r"^\s*(MBP|BPS\s*\d*|SCD|TS\s*\d*|PM|MSMG)\s*[-_ ]+", re.I)
CODE = re.compile(r"^([A-Z]{2,7})(\s*-\s*\d{1,3})?\s*-\s*")          # NOP/area code like 'BKT-', 'PALUTA-03-'
SPELL = [(r"\bMUHAMMAD\b|\bMUHAMAD\b|\bMOHAMMAD\b|\bMOH\b|\bMHD\b|\bM\b\.?", "M"), (r"\bNST\b", "NASUTION"),
         (r"\bHSB\b", "HASIBUAN"), (r"\bHRP\b", "HARAHAP"), (r"\bSPD\b|\bST\b|\bSE\b", "")]


def display_name(raw) -> str:
    """Person (PIC) name for display: 'BPS001-BKT-AIDIL RICOS' -> 'AIDIL RICOS' (order kept)."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    s = str(raw).upper().strip()
    for _ in range(3):
        s2 = CODE.sub("", PREFIX.sub("", s))
        if s2 == s:
            break
        s = s2
    return re.sub(r"\s+", " ", s).strip()


def core_name(raw) -> str:
    """'BPS001-BKT-AIDIL RICOS' -> 'AIDIL RICOS'; token-sorted, punctuation-free, common abbreviations expanded."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    s = str(raw).upper().strip()
    for _ in range(3):
        s2 = PREFIX.sub("", s)
        s2 = CODE.sub("", s2) if s2 != s or re.match(r"^[A-Z]{2,7}\s*-", s2) else s2
        if s2 == s:
            break
        s = s2
    s = re.sub(r"[^A-Z ]", " ", s)
    for pat, rep in SPELL:
        s = re.sub(pat, rep, s)
    toks = sorted(t for t in s.split() if t)
    return " ".join(toks)


def _ratio(a, b):
    return SequenceMatcher(None, a, b).ratio()


def match_pics(pics: pd.DataFrame, team: pd.DataFrame) -> pd.DataFrame:
    """pics: columns pic, nop (most common NOP of that PIC's tickets), n. team: mbp_id, nop.
    Returns one row per PIC with matched mbp_id (or None), status, confidence, basis."""
    team = team.assign(core=team["mbp_id"].map(core_name))
    by_core = team.groupby("core")
    exact_ids = set(team["mbp_id"])
    rows = []
    for _, p in pics.iterrows():
        pic, nop = p["pic"], p["nop"]
        if pic in exact_ids:
            rows.append(dict(pic=pic, mbp_id=pic, status="MATCHED", confidence="EXACT", basis="identical name", candidates=""))
            continue
        c = core_name(pic)
        if not c:
            rows.append(dict(pic=pic, mbp_id=None, status="UNMATCHED", confidence=None, basis="blank PIC", candidates=""))
            continue
        if c in by_core.groups:
            g = by_core.get_group(c)
            g2 = g[g["nop"] == nop] if len(g) > 1 else g
            if len(g2) == 1:
                rows.append(dict(pic=pic, mbp_id=g2.iloc[0]["mbp_id"], status="MATCHED", confidence="HIGH",
                                 basis=f"normalised name '{c}'" + (" + same NOP" if len(g) > 1 else ""), candidates=""))
            else:
                rows.append(dict(pic=pic, mbp_id=None, status="NEEDS REVIEW", confidence=None,
                                 basis=f"normalised name '{c}' matches {len(g)} base camps", candidates=" | ".join(g["mbp_id"])))
            continue
        sc = team.assign(r=team["core"].map(lambda x: _ratio(c, x))).sort_values("r", ascending=False)
        best = sc.iloc[0]
        same = sc[(sc["nop"] == nop) & (sc["r"] >= 0.92)]
        near = sc[sc["r"] >= 0.85]
        if len(same) == 1 and (len(near) == 1 or near.iloc[1]["r"] < same.iloc[0]["r"] - 0.03):
            rows.append(dict(pic=pic, mbp_id=same.iloc[0]["mbp_id"], status="MATCHED", confidence="MEDIUM",
                             basis=f"fuzzy {same.iloc[0]['r']:.2f} + same NOP", candidates=""))
        elif len(near):
            rows.append(dict(pic=pic, mbp_id=None, status="NEEDS REVIEW", confidence=None,
                             basis=f"best fuzzy {best['r']:.2f}", candidates=" | ".join(f"{x} ({r:.2f})" for x, r in zip(near["mbp_id"].head(3), near["r"].head(3)))))
        else:
            rows.append(dict(pic=pic, mbp_id=None, status="UNMATCHED", confidence=None, basis=f"best fuzzy {best['r']:.2f} < 0.85", candidates=""))
    return pd.DataFrame(rows)


def duplicate_basecamps(team: pd.DataFrame, haversine) -> pd.DataFrame:
    """Possible duplicate base camps (same person under two names). Reported, never merged."""
    t = team.assign(core=team["mbp_id"].map(core_name)).reset_index(drop=True)
    out = []
    for i in range(len(t)):
        for j in range(i + 1, len(t)):
            a, b = t.iloc[i], t.iloc[j]
            r = 1.0 if a["core"] == b["core"] else _ratio(a["core"], b["core"])
            if r < 0.88 or not a["core"]:
                continue
            km = haversine(a["lat"], a["lon"], b["lat"], b["lon"]) if pd.notna(a["lat"]) and pd.notna(b["lat"]) else None
            out.append(dict(mbp_a=a["mbp_id"], mbp_b=b["mbp_id"], nop_a=a["nop"], nop_b=b["nop"], similarity=round(r, 2),
                            km_apart=None if km is None else round(float(km), 1),
                            status=_dup_status(r, km, a["nop"], b["nop"])))
    return pd.DataFrame(out)


def _dup_status(r, km, nop_a, nop_b):
    same_nop = isinstance(nop_a, str) and nop_a == nop_b
    if km is None:
        return "SIMILAR NAME — location missing, NEEDS REVIEW"
    if r >= 0.97 and km <= 20 and same_nop:
        return "LIKELY SAME PERSON (≤ 20 km, same NOP) — NEEDS REVIEW"
    if km <= 20:
        return "POSSIBLE DUPLICATE (similar name, ≤ 20 km) — NEEDS REVIEW"
    return f"SAME/SIMILAR NAME, {km:.0f} km apart — probably different people"
