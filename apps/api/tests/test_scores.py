import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from before_api.forecast import build_score_rows
from before_api.main import app
from before_api.repository import get_repository
from before_surf.scoring.heuristic import HeuristicScorer


def _current_df():
    return pd.DataFrame(
        [
            {
                "slug": "carcavelos",
                "observed_at": pd.Timestamp("2026-08-20T09:00:00Z"),
                "orientation_deg": 270.0,
                "swell_height_m": 1.8,
                "swell_period_s": 12.0,
                "swell_direction_deg": 270.0,
                "wind_speed_kmh": 8.0,
                "wind_direction_deg": 90.0,
            },
            {
                "slug": "unknown-orient",
                "observed_at": pd.Timestamp("2026-08-20T09:00:00Z"),
                "orientation_deg": np.nan,
                "swell_height_m": 1.0,
                "swell_period_s": 9.0,
                "swell_direction_deg": 250.0,
                "wind_speed_kmh": 10.0,
                "wind_direction_deg": 100.0,
            },
        ]
    )


def test_build_score_rows_and_nan():
    # correction=None: this test is about conditions reaching the client unaltered, so it opts out
    # of the wind correction rather than hard-coding a number the artefact happens to produce.
    rows = build_score_rows(_current_df(), HeuristicScorer(), correction=None)
    by_slug = {r["slug"]: r for r in rows}
    assert 0.0 <= by_slug["carcavelos"]["score"] <= 10.0
    assert by_slug["unknown-orient"]["score"] is None  # unknown orientation -> null score
    # each row also carries the current conditions for the map's info bar
    carca = by_slug["carcavelos"]
    assert carca["swell_height_m"] == 1.8
    assert carca["swell_period_s"] == 12.0
    assert carca["wind_speed_kmh"] == 8.0
    assert carca["wind_correction_kmh"] is None
    assert carca["offshore_component"] is not None  # 270-facing beach, wind from 90 = offshore
    # the raw bearings travel through so the UI can draw the geometry
    assert carca["swell_direction_deg"] == 270.0
    assert carca["wind_direction_deg"] == 90.0


def test_build_score_rows_empty():
    assert build_score_rows(pd.DataFrame(), HeuristicScorer()) == []


class FakeRepo:
    def get_current_conditions(self):
        return _current_df()


def test_scores_endpoint():
    app.dependency_overrides[get_repository] = lambda: FakeRepo()
    try:
        response = TestClient(app).get("/scores")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = {r["slug"]: r["score"] for r in response.json()}
    assert "carcavelos" in body
    assert body["unknown-orient"] is None
