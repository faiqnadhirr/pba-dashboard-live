"""Shared helpers: paths, config, parsing, geo."""
from __future__ import annotations
import re
from pathlib import Path
import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
DB_PATH = ROOT / "data" / "pba.sqlite"
CONFIG = ROOT / "config"

EVIDENCE = ("ACTUAL", "DERIVED", "ESTIMATED", "PROXY", "UNAVAILABLE")


def load_config() -> dict:
    cfg = {}
    for f in ("thresholds.yaml", "scoring.yaml"):
        with open(CONFIG / f, encoding="utf-8") as fh:
            cfg.update(yaml.safe_load(fh))
    return cfg


_DUR = re.compile(r"^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?\s*$")


def dur_to_sec(s: pd.Series) -> pd.Series:
    """'4h 34m 8s' -> 16448.0 ; blank/invalid -> NaN."""
    st = s.astype("string").str.strip()
    m = st.str.extract(_DUR)
    v = m.astype("float64")
    out = v[0].fillna(0) * 3600 + v[1].fillna(0) * 60 + v[2].fillna(0)
    bad = st.isna() | (st == "") | v.isna().all(axis=1)
    return out.where(~bad).astype("float64")


def norm_id(s: pd.Series) -> pd.Series:
    return s.astype("string").str.strip().str.upper()


def norm_nop(s: pd.Series) -> pd.Series:
    """'Aceh' / 'NOP BANDA ACEH' / 'PALEMBANG' -> 'NOP ACEH' / 'NOP PALEMBANG'."""
    x = s.astype("string").str.strip().str.upper().str.replace(r"\s+", " ", regex=True)
    x = x.where(x.str.startswith("NOP "), "NOP " + x)
    return x.replace({"NOP BANDA ACEH": "NOP ACEH", "NOP NOP": pd.NA})


def to_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype("string").str.strip().str.replace(",", ".", regex=False), errors="coerce")


def to_dt(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce")


def haversine_km(lat1, lon1, lat2, lon2):
    p = np.pi / 180
    a = (np.sin((lat2 - lat1) * p / 2) ** 2
         + np.cos(lat1 * p) * np.cos(lat2 * p) * np.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * 6371.0 * np.arcsin(np.sqrt(a))


def pct_rank(s: pd.Series) -> pd.Series:
    """0..1 percentile rank; NaN stays NaN."""
    return s.rank(pct=True, method="average")


def minmax(s: pd.Series) -> pd.Series:
    lo, hi = s.min(), s.max()
    if pd.isna(lo) or hi == lo:
        return s * 0
    return (s - lo) / (hi - lo)
