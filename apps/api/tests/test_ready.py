"""The keep-warm readiness probe.

ADR-0004 points an external scheduler at this every few minutes to stop Render's free tier spinning
down. The properties that matter are that it does real work (so a failure means the product is
really broken), that it says so with a status code rather than in a body nobody parses, and that it
stays small, because the previous probe downloaded 25 KB of scored spots every time.
"""

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from before_api.main import app
from before_api.repository import get_repository


class FakeRepo:
    def __init__(self, frame: pd.DataFrame):
        self.frame = frame
        self.calls = 0

    def get_current_conditions(self, slug: str | None = None) -> pd.DataFrame:
        self.calls += 1
        return self.frame


def conditions(n: int = 3, orientation: float = 270.0) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "slug": f"spot-{i}",
                "observed_at": pd.Timestamp("2026-08-20T09:00:00Z"),
                "orientation_deg": orientation,
                "swell_height_m": 1.8,
                "swell_period_s": 12.0,
                "swell_direction_deg": 270.0,
                "wind_speed_kmh": 8.0,
                "wind_direction_deg": 90.0,
            }
            for i in range(n)
        ]
    )


def client_with(frame: pd.DataFrame) -> tuple[TestClient, FakeRepo]:
    repo = FakeRepo(frame)
    app.dependency_overrides[get_repository] = lambda: repo
    return TestClient(app), repo


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_it_reports_ready_when_spots_can_be_scored():
    client, _ = client_with(conditions(n=3))
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["spots"] == 3
    assert body["scored"] == 3


def test_it_does_real_work_rather_than_returning_a_constant():
    """The whole objection to /health: a probe that cannot fail is a probe that lies."""
    client, repo = client_with(conditions())
    client.get("/ready")
    assert repo.calls == 1


def test_it_fails_with_503_when_nothing_can_be_scored():
    client, _ = client_with(conditions(n=2, orientation=np.nan))
    response = client.get("/ready")
    assert response.status_code == 503


def test_it_fails_on_an_empty_conditions_table():
    client, _ = client_with(conditions(n=0))
    assert client.get("/ready").status_code == 503


def test_it_counts_unscorable_spots_without_failing():
    """Some spots have no orientation. That is known and fine; all of them is not."""
    frame = pd.concat([conditions(n=2), conditions(n=1, orientation=np.nan)], ignore_index=True)
    client, _ = client_with(frame)
    body = client.get("/ready").json()
    assert body["spots"] == 3
    assert body["scored"] == 2


def test_the_response_is_small():
    """The reason this endpoint exists. /scores is about 25 KB; this has to stay tiny."""
    client, _ = client_with(conditions(n=92))
    response = client.get("/ready")
    assert len(response.content) < 200


def test_it_reports_which_hour_it_checked():
    client, _ = client_with(conditions())
    assert client.get("/ready").json()["observed_at"].startswith("2026-08-20T09:00")
