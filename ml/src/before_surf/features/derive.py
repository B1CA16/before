"""Derived surf features. Pure numpy so they broadcast over scalars and pandas Series alike.

Directions are "coming from" (0 = north). orientation_deg is the seaward-facing azimuth.
"""

import numpy as np
import pandas as pd


def offshore_component(wind_direction_deg, orientation_deg):
    """Wind alignment with offshore: +1 fully offshore (clean), -1 fully onshore (blown out)."""
    return -np.cos(np.radians(wind_direction_deg - orientation_deg))


def swell_exposure(swell_direction_deg, orientation_deg):
    """How directly a swell hits the beach: 1 head-on, 0 shadowed (clamped)."""
    return np.clip(np.cos(np.radians(swell_direction_deg - orientation_deg)), 0.0, None)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived feature columns to a conditions-joined-spots DataFrame (non-mutating)."""
    out = df.copy()
    out["offshore_component"] = offshore_component(df["wind_direction_deg"], df["orientation_deg"])
    out["swell_exposure"] = swell_exposure(df["swell_direction_deg"], df["orientation_deg"])
    return out
