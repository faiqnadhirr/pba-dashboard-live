"""MBP telemetry stub (Teltonika FMC920). Accepts a CSV with the mbp_telemetry schema and derives MBP sessions.

CSV columns: mbp_id, device_imei, ts (YYYY-mm-dd HH:MM:SS, local), lat, lon, power_state (0/1), battery_voltage, speed_kmh
The device server (Codec 8 over TCP) is OUT OF SCOPE; this only proves the downstream data model.
"""
from __future__ import annotations
import numpy as np
import pandas as pd
from src.common import haversine_km

TELEMETRY_COLS = ["mbp_id", "device_imei", "ts", "lat", "lon", "power_state", "battery_voltage", "speed_kmh"]
SESSION_COLS = ["mbp_id", "site_id", "on_ts", "off_ts", "duration_h", "match_km", "evidence"]


def empty_tables() -> tuple[pd.DataFrame, pd.DataFrame]:
    return pd.DataFrame(columns=TELEMETRY_COLS), pd.DataFrame(columns=SESSION_COLS)


def load_csv(path) -> pd.DataFrame:
    d = pd.read_csv(path)
    missing = set(TELEMETRY_COLS) - set(d.columns)
    if missing:
        raise ValueError(f"telemetry CSV missing columns: {missing}")
    d["ts"] = pd.to_datetime(d["ts"])
    d["mbp_id"] = d["mbp_id"].astype(str).str.strip().str.upper()
    return d[TELEMETRY_COLS].sort_values(["mbp_id", "ts"])


def derive_sessions(tel: pd.DataFrame, sites: pd.DataFrame, geofence_km: float = 0.3) -> pd.DataFrame:
    """power_state 0->1 = MBP-on, 1->0 = MBP-off; site matched by nearest site within geofence."""
    out = []
    s = sites.dropna(subset=["lat", "lon"])
    for mbp, g in tel.groupby("mbp_id"):
        g = g.sort_values("ts")
        st = g["power_state"].astype(int).to_numpy()
        on_idx = None
        for i in range(len(g)):
            if st[i] == 1 and on_idx is None:
                on_idx = i
            if st[i] == 0 and on_idx is not None:
                r0, r1 = g.iloc[on_idx], g.iloc[i]
                km = haversine_km(r0["lat"], r0["lon"], s["lat"].to_numpy(), s["lon"].to_numpy())
                j = int(np.argmin(km))
                out.append(dict(mbp_id=mbp, site_id=s.iloc[j]["site_id"] if km[j] <= geofence_km else None,
                                on_ts=r0["ts"], off_ts=r1["ts"],
                                duration_h=(r1["ts"] - r0["ts"]).total_seconds() / 3600,
                                match_km=round(float(km[j]), 3), evidence="ACTUAL"))
                on_idx = None
    return pd.DataFrame(out, columns=SESSION_COLS)
