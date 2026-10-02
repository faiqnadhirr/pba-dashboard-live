"""Locate and read raw source files from data/raw (names matched by pattern, not exact)."""
from __future__ import annotations
import glob
import io
import zipfile
from pathlib import Path
import pandas as pd
import polars as pl
from src.common import RAW

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6}


def _find(pattern: str, required: bool = True) -> list[Path]:
    hits = sorted(Path(p) for p in glob.glob(str(RAW / "**" / pattern), recursive=True))
    if required and not hits:
        raise FileNotFoundError(f"No raw file matching '{pattern}' in {RAW}")
    return hits


def _xl(path, **kw) -> pd.DataFrame | dict:
    try:
        return pd.read_excel(path, engine="calamine", **kw)
    except Exception:  # calamine not installed
        return pd.read_excel(path, **kw)


def _dedupe_cols(df: pd.DataFrame) -> pd.DataFrame:
    seen, cols = {}, []
    for c in map(lambda x: str(x).strip(), df.columns):
        if c in seen:
            seen[c] += 1
            cols.append(f"{c}__{seen[c]}")
        else:
            seen[c] = 0
            cols.append(c)
    df.columns = cols
    return df


def read_dapot() -> pd.DataFrame:
    return _dedupe_cols(_xl(_find("*Dapot*ALL*Site*.xlsx")[0]))


def read_tickets() -> tuple[pd.DataFrame, pd.DataFrame]:
    sheets = _xl(_find("*Tracking*Ticket*MBP*.xlsx")[0], sheet_name=None)
    team = next(v for k, v in sheets.items() if "mbp" in k.lower() and "team" in k.lower())
    track = next(v for k, v in sheets.items() if "tracking" in k.lower())
    return _dedupe_cols(team), _dedupe_cols(track)


def read_newbbt() -> tuple[pd.DataFrame, pd.DataFrame]:
    sheets = _xl(_find("*New*BBT*.xlsx")[0], sheet_name=None, header=None)
    names = list(sheets)
    m = sheets[names[0]]
    hdr_row = next(i for i in range(10) if "Site ID" in [str(x).strip() for x in m.iloc[i].tolist()])
    master = m.iloc[hdr_row + 1:].copy()
    master.columns = m.iloc[hdr_row].tolist()
    master = _dedupe_cols(master)
    out25 = pd.DataFrame()
    if "Sheet1" in sheets:
        s = sheets["Sheet1"]
        out25 = s.iloc[2:, :17].copy()
        out25.columns = ["site_id", "site_class", "vendor"] + [f"m{i:02d}" for i in range(1, 13)] + [
            "total_outage_sec", "total_outage_hour"]
    return master, out25


def read_bbt_monthly() -> pd.DataFrame:
    frames = []
    for p in _find("*BBT*Site*Details*.csv"):
        mon = next((v for k, v in MONTHS.items() if f"_{k}" in p.name.lower()), None)
        d = pd.read_csv(p, dtype=str, encoding="utf-8-sig")
        d = _dedupe_cols(d)
        d["month"] = mon
        d["source_file"] = p.name
        frames.append(d)
    return pd.concat(frames, ignore_index=True)


def read_bbt_events() -> pd.DataFrame:
    return _dedupe_cols(_xl(_find("*BBT*Export*monthly*.xlsx")[0]))


def read_ran_site_month() -> pl.DataFrame:
    """RAN daily availability -> aggregated per site-month (never loads raw rows into the UI)."""
    zips = _find("*Avail*RAN*.zip", required=False)
    csvs = _find("*Avail*RAN*.csv", required=False)
    num = ["outage (Sec)", "denum (Sec)", "duration_power (Sec)", "duration_transport (Sec)",
           "duration_ran (Sec)", "duration_other (Sec)", "availability (%)", "target (%)"]
    frames = []

    def agg(df: pl.DataFrame) -> pl.DataFrame:
        """RAN `*_sec` columns are summed over all NEs of the site (NE-seconds, can exceed 24 h/day).
        Wall-clock = NE-seconds / number of NEs, capped at 86,400 s per site-day (number of NEs = denum / 86,400)."""
        df = df.with_columns([pl.col(c).cast(pl.Float64, strict=False) for c in num])
        ne = (pl.col("denum (Sec)") / 86400.0).clip(lower_bound=1.0)
        wc = lambda c: (pl.col(c).fill_null(0) / ne).clip(upper_bound=86400.0)
        df = df.with_columns([ne.alias("ne_count"),
                              wc("outage (Sec)").alias("outage_wc"), wc("duration_power (Sec)").alias("power_wc"),
                              wc("duration_transport (Sec)").alias("transport_wc"), wc("duration_ran (Sec)").alias("ran_wc"),
                              wc("duration_other (Sec)").alias("other_wc")])
        return (df.with_columns(pl.col("period").str.slice(0, 6).alias("ym"))
                  .group_by(["site_id", "ym"])
                  .agg([pl.len().alias("days"),
                        pl.col("ne_count").mean().alias("ne_count"),
                        pl.col("outage_wc").sum().alias("outage_sec"),
                        pl.col("power_wc").sum().alias("power_sec"),
                        pl.col("transport_wc").sum().alias("transport_sec"),
                        pl.col("ran_wc").sum().alias("ran_sec"),
                        pl.col("other_wc").sum().alias("other_sec"),
                        pl.col("duration_power (Sec)").sum().alias("power_ne_sec"),
                        (pl.col("power_wc") > 0).sum().alias("power_outage_days"),
                        pl.col("availability (%)").mean().alias("avail_pct_mean"),
                        pl.col("target (%)").max().alias("target_pct"),
                        pl.col("vendor").first().alias("vendor"),
                        pl.col("site_class").last().alias("site_class_ran")]))

    for z in zips:
        with zipfile.ZipFile(z) as zf:
            for n in zf.namelist():
                if n.lower().endswith(".csv"):
                    frames.append(agg(pl.read_csv(io.BytesIO(zf.read(n)), separator=";",
                                                  infer_schema_length=0)))
    for c in csvs:
        frames.append(agg(pl.read_csv(c, separator=";", infer_schema_length=0)))
    if not frames:
        raise FileNotFoundError("No RAN availability file (zip or csv) in data/raw")
    return pl.concat(frames).unique(subset=["site_id", "ym"], keep="first")
