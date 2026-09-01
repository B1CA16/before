import numpy as np
import pandas as pd

from before_api.forecast import build_forecast_rows
from before_surf.scoring.heuristic import HeuristicScorer


def _forecast_df(**overrides):
    base = {
        "observed_at": pd.Timestamp("2026-07-30T08:00:00Z"),
        "orientation_deg": 270.0,
        "swell_height_m": 1.8,
        "swell_period_s": 12.0,
        "swell_direction_deg": 270.0,
        "wind_speed_kmh": 8.0,
        "wind_direction_deg": 90.0,  # offshore for a 270-facing beach
    }
    base.update(overrides)
    return pd.DataFrame([base])


def test_build_forecast_rows_shapes_a_row():
    rows = build_forecast_rows(_forecast_df(), HeuristicScorer())
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == {
        "observed_at",
        "score",
        "size",
        "period",
        "wind",
        "exposure",
        "swell_height_m",
        "swell_period_s",
        "wind_speed_kmh",
        "wind_correction_kmh",
        "sea_level_m",
        "tide_state",
        "tide_rising",
    }
    assert row["score"] is not None and 0.0 <= row["score"] <= 10.0
    assert row["swell_period_s"] == 12.0


def test_build_forecast_rows_maps_nan_score_to_none():
    # unknown orientation -> NaN features -> NaN score -> None in the response
    rows = build_forecast_rows(_forecast_df(orientation_deg=np.nan), HeuristicScorer())
    assert rows[0]["score"] is None
    assert rows[0]["wind"] is None
    # raw conditions still present
    assert rows[0]["swell_height_m"] == 1.8
