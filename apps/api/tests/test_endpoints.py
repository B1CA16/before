import pandas as pd
from fastapi.testclient import TestClient

from before_api.main import app
from before_api.repository import get_repository


class FakeRepo:
    def __init__(self, spots, known, forecast_df):
        self._spots = spots
        self._known = known
        self._forecast = forecast_df

    def list_spots(self):
        return self._spots

    def get_spot(self, slug):
        return {"slug": slug} if slug in self._known else None

    def get_forecast(self, slug):
        return self._forecast


def _client(fake):
    app.dependency_overrides[get_repository] = lambda: fake
    return TestClient(app)


def teardown_function():
    app.dependency_overrides.clear()


def _spot():
    return {
        "slug": "carcavelos",
        "name": "Carcavelos",
        "region": "Lisbon",
        "latitude": 38.68,
        "longitude": -9.33,
        "orientation_deg": 205.0,
    }


def _forecast_df():
    return pd.DataFrame(
        [
            {
                "observed_at": pd.Timestamp("2026-07-30T08:00:00Z"),
                "orientation_deg": 270.0,
                "swell_height_m": 1.8,
                "swell_period_s": 12.0,
                "swell_direction_deg": 270.0,
                "wind_speed_kmh": 8.0,
                "wind_direction_deg": 90.0,
            }
        ]
    )


def test_list_spots():
    client = _client(FakeRepo([_spot()], {"carcavelos"}, _forecast_df()))
    response = client.get("/spots")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["slug"] == "carcavelos"


def test_forecast_ok():
    client = _client(FakeRepo([_spot()], {"carcavelos"}, _forecast_df()))
    response = client.get("/spots/carcavelos/forecast")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert 0.0 <= body[0]["score"] <= 10.0
    assert body[0]["swell_period_s"] == 12.0


def test_forecast_unknown_spot_404():
    client = _client(FakeRepo([], set(), _forecast_df()))
    response = client.get("/spots/nope/forecast")
    assert response.status_code == 404


def test_forecast_empty_when_no_rows():
    client = _client(FakeRepo([_spot()], {"carcavelos"}, pd.DataFrame()))
    response = client.get("/spots/carcavelos/forecast")
    assert response.status_code == 200
    assert response.json() == []
