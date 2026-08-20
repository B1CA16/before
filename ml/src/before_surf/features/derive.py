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
    """Add derived feature columns to a conditions-joined-spots DataFrame (non-mutating).

    Row-wise only. Every feature here is a pure function of columns in the same row, which is what
    lets the same code serve a single hour at request time and a million rows in training. Tide is
    not like that; see `add_tide_features`.
    """
    out = df.copy()
    # Coerced to numeric first, and that is a bug fix rather than tidiness. A column that is wholly
    # null in this frame arrives as object dtype holding None, and numpy trig rejects object dtype
    # outright ("no callable radians method") instead of propagating NaN. It only shows on small
    # frames: across 92 spots the column has real floats so pandas infers float64, which is why only
    # a single spot page, for one of the spots with no orientation, ever broke.
    orientation = pd.to_numeric(df["orientation_deg"], errors="coerce")
    wind = pd.to_numeric(df["wind_direction_deg"], errors="coerce")
    swell = pd.to_numeric(df["swell_direction_deg"], errors="coerce")
    out["offshore_component"] = offshore_component(wind, orientation)
    out["swell_exposure"] = swell_exposure(swell, orientation)
    return out


# --- tide: a property of the series, not of the row ----------------------------------------------
#
# The features below cannot be computed from a single row, and that is not an implementation
# detail. "Is the tide rising" needs the next hour. "How high is it" needs the surrounding low and
# high water, because raw metres are not comparable across anything: -0.5 m can be near high water
# on a neap tide and mid-ebb on a spring, and the tidal range differs from spot to spot.
#
# So these take a time-ordered series for one spot, and they stay out of build_features rather than
# quietly returning nulls inside it. The consequence worth knowing: /scores holds one row per spot
# and therefore cannot derive them, which is why tide appears on the per-spot forecast, where the
# whole series exists. Pairing tide with a session label needs a window around the session hour,
# and that is M9's problem.

# 13 hours centred is about plus or minus 6, spanning one semidiurnal half-cycle (~6.2 h), so the
# window is guaranteed to contain the neighbouring low and high water.
TIDE_WINDOW_HOURS = 13


def tide_rising(sea_level_m: pd.Series) -> pd.Series:
    """True while the tide is coming in. Null for the final hour, whose successor is unknown."""
    delta = sea_level_m.shift(-1) - sea_level_m
    # .where keeps the unknown as null instead of letting a NaN comparison collapse to False, which
    # would claim the tide is falling when we simply do not know.
    return delta.gt(0).where(delta.notna())


def tide_state(sea_level_m: pd.Series, window: int = TIDE_WINDOW_HOURS) -> pd.Series:
    """Position between the surrounding low and high water: 0 at low, 1 at high.

    Normalising against the local window is what makes tide comparable between spots and between
    spring and neap, which is the form a model could actually use.
    """
    low = sea_level_m.rolling(window, center=True, min_periods=3).min()
    high = sea_level_m.rolling(window, center=True, min_periods=3).max()
    span = high - low
    # A flat span would divide by zero. Null is the honest answer: with no range there is no state.
    return ((sea_level_m - low) / span).where(span > 0)


def add_tide_features(df: pd.DataFrame, time_col: str = "observed_at") -> pd.DataFrame:
    """Add tide_state and tide_rising to one spot's hourly frame (non-mutating).

    Sorts first, because both features read neighbouring rows and would be silently wrong on a frame
    that arrived out of order.
    """
    out = df.sort_values(time_col).copy()
    if "sea_level_m" not in out.columns:
        out["tide_state"] = pd.NA
        out["tide_rising"] = pd.NA
        return out
    level = pd.to_numeric(out["sea_level_m"], errors="coerce")
    out["tide_state"] = tide_state(level)
    out["tide_rising"] = tide_rising(level)
    return out
