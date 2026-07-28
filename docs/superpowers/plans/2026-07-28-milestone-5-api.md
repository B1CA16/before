# Milestone 5: The API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI backend (`apps/api`) that imports `before_surf` and serves `GET /health`, `GET /spots`, and `GET /spots/{slug}/forecast`, computing BeFORE scores on-the-fly from forecast conditions.

**Architecture:** `apps/api` becomes a second uv workspace member depending on `before-surf`. A `SupabaseRepository` owns all DB access and is injected into route handlers via FastAPI's `Depends`, so endpoints are tested against a fake repository with no live database. Response shaping (features -> scores -> JSON rows, with NaN->null) lives in a pure, unit-tested function. Scores are computed per request using the same `before_surf.features` and `before_surf.scoring` code as offline analysis (the training/serving-skew defense, realized).

**Tech Stack:** Python 3.12, FastAPI, Pydantic, psycopg, pandas; `before_surf` (workspace).

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- New API code lives under `apps/api/src/before_api/`; tests under `apps/api/tests/`.
- Deployment is deferred (a later step, paired with M6). M5 builds, tests, and runs locally.

## Implementation decisions (flagged for review)

- Endpoints: `/health`, `/spots`, `/spots/{slug}/forecast`. Resource-oriented; slug in the URL.
- Scores computed on-the-fly (no precompute table). Forecasts are ~168 rows/spot; scoring is instant.
- Repository behind DI; duck-typed fake in tests (no formal Protocol).
- 404 for unknown slug; 200 with `[]` when the spot exists but has no forecast rows.
- NaN scores (unknown-orientation spots) map to JSON `null` in our code; response fields are `float | None`.
- Per-request psycopg connection via the Supabase pooler URL (no client-side pool yet).
- No pagination (92 spots, ~168 forecast rows are single small responses).

---

### Task 1: apps/api workspace member and FastAPI skeleton

**Files:**
- Modify: `pyproject.toml` (root: workspace members, ruff src, pytest testpaths, isort)
- Create: `apps/api/pyproject.toml`
- Create: `apps/api/src/before_api/__init__.py`
- Create: `apps/api/src/before_api/main.py`
- Create: `apps/api/tests/__init__.py`, `apps/api/tests/test_health.py`

**Interfaces:**
- Produces: a runnable FastAPI `app` with `GET /health` -> `{"status": "ok"}`; the workspace builds `before-api` importing `before_surf`.

- [ ] **Step 1: remove the apps/api placeholder and root config**

Remove the old placeholder:
```powershell
Remove-Item apps/api/.gitkeep -ErrorAction SilentlyContinue
```
Edit the root `pyproject.toml`:
- Change `[tool.uv.workspace]` members to:
  ```toml
  [tool.uv.workspace]
  members = ["ml", "apps/api"]
  ```
- Change `[tool.ruff]` `src` to:
  ```toml
  src = ["ml/src", "apps/api/src"]
  ```
- Change `[tool.ruff.lint.isort]` to:
  ```toml
  known-first-party = ["before_surf", "before_api"]
  ```
- Change `[tool.pytest.ini_options]` `testpaths` to:
  ```toml
  testpaths = ["ml/tests", "apps/api/tests"]
  ```

- [ ] **Step 2: create the api package config**

`apps/api/pyproject.toml`:
```toml
[project]
name = "before-api"
version = "0.0.0"
description = "beFORE API: serves spots and BeFORE scores."
requires-python = ">=3.12"
dependencies = [
    "before-surf",
    "fastapi[standard]",
]

[tool.uv.sources]
before-surf = { workspace = true }

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/before_api"]
```

- [ ] **Step 3: create the app skeleton**

`apps/api/src/before_api/__init__.py`:
```python
"""beFORE API: FastAPI app serving spots and BeFORE scores."""
```

`apps/api/src/before_api/main.py`:
```python
"""FastAPI application for beFORE."""

from fastapi import FastAPI

app = FastAPI(title="beFORE API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

- [ ] **Step 4: write the health test**

`apps/api/tests/__init__.py`: (empty file)

`apps/api/tests/test_health.py`:
```python
from fastapi.testclient import TestClient

from before_api.main import app


def test_health_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 5: sync the workspace and run the test**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv sync --all-packages; uv run pytest apps/api/tests/ -v
```
Expected: sync installs FastAPI and builds `before-api`; `test_health_ok` passes.

- [ ] **Step 6: Commit**

Message:
```
build: add apps/api workspace member with FastAPI skeleton
```

---

### Task 2: response schemas and the pure forecast-row builder

**Files:**
- Create: `apps/api/src/before_api/schemas.py`
- Create: `apps/api/src/before_api/forecast.py`
- Test: `apps/api/tests/test_forecast.py`

**Interfaces:**
- `SpotOut`, `ForecastHour` (Pydantic models).
- `build_forecast_rows(df: pd.DataFrame, scorer) -> list[dict]`: builds one dict per row with score,
  sub-scores, and raw conditions; NaN -> None; numbers rounded.

- [ ] **Step 1: write the schemas**

`apps/api/src/before_api/schemas.py`:
```python
"""Pydantic response models for the API."""

from datetime import datetime

from pydantic import BaseModel


class SpotOut(BaseModel):
    slug: str
    name: str
    region: str
    latitude: float
    longitude: float
    orientation_deg: float | None


class ForecastHour(BaseModel):
    observed_at: datetime
    score: float | None
    size: float | None
    period: float | None
    wind: float | None
    exposure: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    wind_speed_kmh: float | None
```

- [ ] **Step 2: write a failing test for the row builder**

`apps/api/tests/test_forecast.py`:
```python
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
        "observed_at", "score", "size", "period", "wind", "exposure",
        "swell_height_m", "swell_period_s", "wind_speed_kmh",
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
```

- [ ] **Step 3: run it, confirm failure**

Run: `uv run pytest apps/api/tests/test_forecast.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'before_api.forecast'`.

- [ ] **Step 4: implement the row builder**

`apps/api/src/before_api/forecast.py`:
```python
"""Shape scored forecast rows into JSON-ready dicts (NaN -> None, rounded)."""

import pandas as pd

from before_surf.features.derive import build_features
from before_surf.scoring.heuristic import HeuristicScorer


def _clean(value) -> float | None:
    return None if pd.isna(value) else round(float(value), 2)


def build_forecast_rows(df: pd.DataFrame, scorer: HeuristicScorer) -> list[dict]:
    explained = build_features(df).pipe(scorer.explain)
    rows: list[dict] = []
    for i in range(len(df)):
        rows.append(
            {
                "observed_at": df["observed_at"].iloc[i],
                "score": _clean(explained["score"].iloc[i]),
                "size": _clean(explained["size"].iloc[i]),
                "period": _clean(explained["period"].iloc[i]),
                "wind": _clean(explained["wind"].iloc[i]),
                "exposure": _clean(explained["exposure"].iloc[i]),
                "swell_height_m": _clean(df["swell_height_m"].iloc[i]),
                "swell_period_s": _clean(df["swell_period_s"].iloc[i]),
                "wind_speed_kmh": _clean(df["wind_speed_kmh"].iloc[i]),
            }
        )
    return rows
```
Note: `explain` needs the derived feature columns, so we `build_features` first. `explain` returns a DataFrame indexed like `df`; `.pipe(scorer.explain)` just calls `scorer.explain(build_features(df))`.

- [ ] **Step 5: run tests, expect pass**

Run: `uv run pytest apps/api/tests/test_forecast.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit**

Message:
```
feat: add API response schemas and forecast row builder
```

---

### Task 3: the Supabase repository and DI provider

**Files:**
- Create: `apps/api/src/before_api/repository.py`

**Interfaces:**
- `SupabaseRepository(database_url)` with `list_spots() -> list[dict]`, `get_spot(slug) -> dict | None`,
  `get_forecast(slug) -> pd.DataFrame`.
- `get_repository() -> SupabaseRepository` (the DI provider; overridden in tests).

- [ ] **Step 1: implement the repository**

`apps/api/src/before_api/repository.py`:
```python
"""Data access for the API. All DB reads live here, injected into routes via Depends."""

import pandas as pd
import psycopg

from before_surf.config import get_settings

_SPOT_COLUMNS = "slug, name, region, latitude, longitude, orientation_deg"

_FORECAST_QUERY = """
select c.observed_at, s.orientation_deg,
       c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg
from conditions c
join spots s on s.id = c.spot_id
where s.slug = %(slug)s and c.source = 'forecast'
order by c.observed_at
"""


def _rows_as_dicts(cursor) -> list[dict]:
    columns = [desc.name for desc in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


class SupabaseRepository:
    def __init__(self, database_url: str):
        self.database_url = database_url

    def list_spots(self) -> list[dict]:
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(f"select {_SPOT_COLUMNS} from spots order by name")
            return _rows_as_dicts(cur)

    def get_spot(self, slug: str) -> dict | None:
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(
                f"select {_SPOT_COLUMNS} from spots where slug = %(slug)s", {"slug": slug}
            )
            rows = _rows_as_dicts(cur)
        return rows[0] if rows else None

    def get_forecast(self, slug: str) -> pd.DataFrame:
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(_FORECAST_QUERY, {"slug": slug})
            columns = [desc.name for desc in cur.description]
            data = cur.fetchall()
        return pd.DataFrame(data, columns=columns)


def get_repository() -> SupabaseRepository:
    settings = get_settings()
    assert settings.database_url, "DATABASE_URL is not set"
    return SupabaseRepository(settings.database_url)
```

- [ ] **Step 2: verify it imports and constructs**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "from before_api.repository import SupabaseRepository, get_repository; print('ok', SupabaseRepository, get_repository)"
```
Expected: prints `ok` and the two objects. (Live DB queries are exercised in Task 5.)

- [ ] **Step 3: Commit**

Message:
```
feat: add Supabase repository and DI provider
```

---

### Task 4: the endpoints (/spots and /spots/{slug}/forecast)

**Files:**
- Modify: `apps/api/src/before_api/main.py`
- Test: `apps/api/tests/test_endpoints.py`

**Interfaces:**
- `GET /spots -> list[SpotOut]`.
- `GET /spots/{slug}/forecast -> list[ForecastHour]` (404 if unknown; `[]` if no forecast rows).

- [ ] **Step 1: write failing endpoint tests (with a fake repository)**

`apps/api/tests/test_endpoints.py`:
```python
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
        "slug": "carcavelos", "name": "Carcavelos", "region": "Lisbon",
        "latitude": 38.68, "longitude": -9.33, "orientation_deg": 205.0,
    }


def _forecast_df():
    return pd.DataFrame(
        [{
            "observed_at": pd.Timestamp("2026-07-30T08:00:00Z"),
            "orientation_deg": 270.0, "swell_height_m": 1.8, "swell_period_s": 12.0,
            "swell_direction_deg": 270.0, "wind_speed_kmh": 8.0, "wind_direction_deg": 90.0,
        }]
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
```

- [ ] **Step 2: run tests, confirm they fail**

Run: `uv run pytest apps/api/tests/test_endpoints.py -v`
Expected: FAIL (the endpoints do not exist yet, so `/spots` returns 404).

- [ ] **Step 3: implement the endpoints**

Replace `apps/api/src/before_api/main.py` with:
```python
"""FastAPI application for beFORE."""

from fastapi import Depends, FastAPI, HTTPException

from before_api.forecast import build_forecast_rows
from before_api.repository import SupabaseRepository, get_repository
from before_api.schemas import ForecastHour, SpotOut
from before_surf.scoring.heuristic import HeuristicScorer

app = FastAPI(title="beFORE API")
_scorer = HeuristicScorer()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/spots", response_model=list[SpotOut])
def list_spots(repo: SupabaseRepository = Depends(get_repository)):
    return repo.list_spots()


@app.get("/spots/{slug}/forecast", response_model=list[ForecastHour])
def spot_forecast(slug: str, repo: SupabaseRepository = Depends(get_repository)):
    if repo.get_spot(slug) is None:
        raise HTTPException(status_code=404, detail="spot not found")
    df = repo.get_forecast(slug)
    if df.empty:
        return []
    return build_forecast_rows(df, _scorer)
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest apps/api/tests/ -v`
Expected: all endpoint + health + forecast tests pass.

- [ ] **Step 5: Commit**

Message:
```
feat: add spots and forecast endpoints
```

---

### Task 5: run locally against Supabase, docs

**Files:**
- Create: `apps/api/README.md`

**Interfaces:**
- Produces: a locally verified API and documentation.

- [ ] **Step 1: run the server locally**

Run (in a terminal you can stop with Ctrl+C):
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run uvicorn before_api.main:app --reload
```
Expected: server starts on `http://127.0.0.1:8000`.

- [ ] **Step 2: hit the real endpoints (Francisco, second terminal or browser)**

- Open `http://127.0.0.1:8000/docs` (auto OpenAPI UI) and try the endpoints.
- `http://127.0.0.1:8000/spots` returns the 92 spots.
- `http://127.0.0.1:8000/spots/<a-real-slug>/forecast` returns scored hours (pick a slug from `/spots`).
- A spot with null orientation returns `score: null` for its hours; an unknown slug returns 404.

Stop the server with Ctrl+C when done.

- [ ] **Step 3: write the docs**

`apps/api/README.md`:
```markdown
# beFORE API

FastAPI backend. Imports `before_surf` and serves BeFORE scores computed on-the-fly from
forecast conditions.

## Endpoints

- `GET /health` -> `{"status": "ok"}`
- `GET /spots` -> list of spots (slug, name, region, lat/lon, orientation).
- `GET /spots/{slug}/forecast` -> hourly BeFORE score + factor breakdown + raw conditions for the
  upcoming forecast. 404 if the slug is unknown; `[]` if the spot has no forecast rows yet.

## Run locally

`uv run uvicorn before_api.main:app --reload` then open `http://127.0.0.1:8000/docs`.
Requires `DATABASE_URL` in `.env` (same as the rest of the project).

## Design

- Data access is isolated in `SupabaseRepository`, injected via `Depends(get_repository)`, so
  endpoints are tested against a fake repo with no live DB.
- Response shaping (scores, factor breakdown, NaN -> null) is in `forecast.build_forecast_rows`.
- Scores use the shared `before_surf` feature and scoring code (same as offline analysis).
- Deployment is deferred (paired with the frontend milestone).
```

- [ ] **Step 4: full suite and hooks**

Run: `uv run pytest` then `uv run pre-commit run --all-files`
Expected: all tests and hooks pass.

- [ ] **Step 5: Commit**

Message:
```
docs: document the beFORE API
```

---

## Definition of done for Milestone 5

- `apps/api` is a workspace member depending on `before-surf`; `uv sync --all-packages` builds it.
- `GET /health`, `GET /spots`, `GET /spots/{slug}/forecast` implemented; scores computed on-the-fly.
- Endpoints tested via TestClient with a fake repository (200, 404, empty, NaN->null); the pure row
  builder is unit-tested; full suite and pre-commit pass.
- The API runs locally against real Supabase and returns sensible spots and scored forecasts.
- CI green.

## Deferred (not in M5)

- Deployment to a free host (paired with M6).
- The web UI (M6) that consumes these endpoints.
- Caching / precomputed scores / client-side connection pooling (only if traffic ever needs them).
