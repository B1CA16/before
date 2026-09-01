"""The correction as the API serves it: applied, reported, and survivable when absent.

The point of these tests is not the arithmetic, which `ml/tests/correction/test_artifact.py`
already covers. It is that every endpoint applies the correction, every endpoint reports it, and
none of them break when the artefact is not deployed.
"""

import numpy as np
import pandas as pd
import pytest

from before_api.forecast import build_conditions_row, build_forecast_rows, build_score_rows
from before_surf.correction.artifact import WindCorrection
from before_surf.scoring.heuristic import HeuristicScorer

# +2 at every hour, so any deviation in a result is the code's doing, not the table's.
FLAT = WindCorrection(by_local_hour=dict.fromkeys(range(24), 2.0), fallback_kmh=2.0)
SCORER = HeuristicScorer()

BASE = {
    "observed_at": pd.Timestamp("2026-08-20T09:00:00Z"),
    "orientation_deg": 270.0,
    "swell_height_m": 1.8,
    "swell_period_s": 12.0,
    "swell_direction_deg": 270.0,
    "wind_speed_kmh": 8.0,
    "wind_direction_deg": 90.0,
}


def one(**overrides) -> pd.DataFrame:
    return pd.DataFrame([{**BASE, **overrides}])


class TestEveryEndpointApplies:
    def test_forecast_rows(self):
        row = build_forecast_rows(one(), SCORER, correction=FLAT)[0]
        assert row["wind_speed_kmh"] == pytest.approx(10.0)
        assert row["wind_correction_kmh"] == pytest.approx(2.0)

    def test_score_rows(self):
        row = build_score_rows(one(slug="cave"), SCORER, correction=FLAT)[0]
        assert row["wind_speed_kmh"] == pytest.approx(10.0)
        assert row["wind_correction_kmh"] == pytest.approx(2.0)

    def test_conditions_row(self):
        row = build_conditions_row(one(source="forecast"), SCORER, correction=FLAT)
        assert row["wind_speed_kmh"] == pytest.approx(10.0)
        assert row["wind_correction_kmh"] == pytest.approx(2.0)


class TestScoreReflectsTheCorrection:
    def test_the_score_is_computed_from_the_corrected_wind(self):
        """Otherwise the app would display one wind and score a different one."""
        onshore = one(wind_direction_deg=270.0, wind_speed_kmh=8.0)  # straight onshore
        uncorrected = build_forecast_rows(onshore, SCORER, correction=None)[0]
        corrected = build_forecast_rows(onshore, SCORER, correction=FLAT)[0]
        assert corrected["wind_speed_kmh"] > uncorrected["wind_speed_kmh"]
        assert corrected["wind"] < uncorrected["wind"]
        assert corrected["score"] < uncorrected["score"]

    def test_an_offshore_day_is_barely_moved(self):
        """A sanity check on the scorer's own logic: offshore wind strength hardly matters."""
        offshore = one(wind_direction_deg=90.0)
        uncorrected = build_forecast_rows(offshore, SCORER, correction=None)[0]
        corrected = build_forecast_rows(offshore, SCORER, correction=FLAT)[0]
        assert corrected["score"] == pytest.approx(uncorrected["score"], abs=0.05)


class TestArchiveIsNotCorrected:
    def test_an_archive_reading_is_served_as_recorded(self):
        row = build_conditions_row(one(source="archive"), SCORER, correction=FLAT)
        assert row["wind_speed_kmh"] == pytest.approx(8.0)
        assert row["wind_correction_kmh"] is None


class TestDegradesWithoutTheArtifact:
    def test_forecast_rows_serve_the_raw_forecast(self):
        row = build_forecast_rows(one(), SCORER, correction=None)[0]
        assert row["wind_speed_kmh"] == pytest.approx(8.0)
        assert row["wind_correction_kmh"] is None

    def test_score_rows_serve_the_raw_forecast(self):
        row = build_score_rows(one(slug="cave"), SCORER, correction=None)[0]
        assert row["wind_speed_kmh"] == pytest.approx(8.0)
        assert row["wind_correction_kmh"] is None

    def test_conditions_row_serves_the_raw_forecast(self):
        row = build_conditions_row(one(source="forecast"), SCORER, correction=None)
        assert row["wind_speed_kmh"] == pytest.approx(8.0)
        assert row["wind_correction_kmh"] is None

    def test_the_score_is_still_produced(self):
        """A missing artefact is a degraded feature, not an outage."""
        row = build_forecast_rows(one(), SCORER, correction=None)[0]
        assert row["score"] is not None


class TestAwkwardRows:
    def test_a_missing_wind_survives_the_correction(self):
        row = build_forecast_rows(one(wind_speed_kmh=np.nan), SCORER, correction=FLAT)[0]
        assert row["wind_speed_kmh"] is None
        assert row["wind_correction_kmh"] is None

    def test_an_empty_score_frame_returns_nothing(self):
        assert build_score_rows(one().iloc[0:0], SCORER, correction=FLAT) == []
