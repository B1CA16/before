# Milestone 2: Dynamic Conditions Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch ocean and weather conditions per spot from Open-Meteo, store them as an idempotent time-series in Postgres, backfill one year of hourly archive data, and run a daily forecast fetch via GitHub Actions cron.

**Architecture:** A `conditions` table (wide time-series, one row per spot/hour/source). A pure-Python Open-Meteo client parses the two hourly APIs (marine + weather) into column dicts and merges them on timestamp. Network wrappers add fetch. A loader upserts rows idempotently on `(spot_id, observed_at, source)`. Two entrypoints share the client: `run_backfill` (archive, one year, `source='archive'`) and `run_forecast` (7-day forecast, `source='forecast'`). A GitHub Actions scheduled workflow runs the forecast daily with `DATABASE_URL` from an encrypted secret.

**Tech Stack:** Python 3.12, httpx, psycopg[binary], Supabase Postgres, Open-Meteo (no key), GitHub Actions.

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- Commit author email in this repo is the france account; already set locally.
- Import name is `before_surf`; new code lives under `ml/src/before_surf/ingestion/`.
- Backfill target: all spots, 1 year, hourly, `source='archive'` (~800k rows, ~150-200 MB; stays under the 500 MB free tier).

## Implementation decisions (flagged for review)

- Directions from Open-Meteo are "coming from" (0=N); stored as-is, matches orientation math.
- Times requested with `timezone=GMT`; `observed_at` stored as UTC `timestamptz`.
- Two endpoints per spot (marine + weather), merged on timestamp; missing values stored as NULL.
- Loader upserts per spot (batches of ~8760 rows) via `executemany` + `ON CONFLICT`.
- Archive `end_date` = today minus 5 days (ERA5 has a few days of lag).
- Politeness: brief sleep between spots; simple retry in the HTTP getter.

---

### Task 1: `conditions` table migration

**Files:**
- Create: `supabase/migrations/<timestamp>_create_conditions.sql`

**Interfaces:**
- Produces: table `conditions(id, spot_id fk, observed_at, source, wave_height_m, wave_period_s, wave_direction_deg, swell_height_m, swell_period_s, swell_direction_deg, wind_speed_kmh, wind_direction_deg, water_temp_c, air_temp_c, fetched_at)`; unique `(spot_id, observed_at, source)`; index on `(spot_id, observed_at)`; RLS enabled.

- [ ] **Step 1: create the migration file**

Run: `supabase migration new create_conditions`

- [ ] **Step 2: write the schema SQL**

Put this in the new migration file:
```sql
create table conditions (
    id            bigint generated always as identity primary key,
    spot_id       bigint not null references spots(id) on delete cascade,
    observed_at   timestamptz not null,
    source        text not null check (source in ('forecast', 'archive')),

    wave_height_m       real,
    wave_period_s       real,
    wave_direction_deg  real,
    swell_height_m      real,
    swell_period_s      real,
    swell_direction_deg real,
    wind_speed_kmh      real,
    wind_direction_deg  real,
    water_temp_c        real,
    air_temp_c          real,

    fetched_at    timestamptz not null default now(),
    unique (spot_id, observed_at, source)
);

create index conditions_spot_time_idx on conditions (spot_id, observed_at);

alter table conditions enable row level security;
```

- [ ] **Step 3: push to the hosted DB**

Run: `supabase db push`
Expected: applies the migration successfully.

- [ ] **Step 4: verify the table**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "import psycopg; from before_surf.config import get_settings; s=get_settings(); c=psycopg.connect(s.database_url); print(c.execute('select count(*) from conditions').fetchone())"
```
Expected: `(0,)`.

- [ ] **Step 5: Commit**

Message:
```
feat: add conditions time-series table migration
```

---

### Task 2: Open-Meteo client (parse, merge, fetch)

**Files:**
- Create: `ml/src/before_surf/ingestion/openmeteo.py`
- Modify: `ml/src/before_surf/config.py`
- Test: `ml/tests/ingestion/test_openmeteo.py`

**Interfaces:**
- `MARINE_VARS: dict[str,str]`, `WEATHER_VARS: dict[str,str]` (API name -> our column).
- `CONDITION_COLUMNS: tuple[str,...]` (the 10 measurement columns).
- `parse_hourly(payload: dict, var_map: dict[str,str]) -> dict[str, dict]` keyed by ISO time.
- `merge_hourly(*sources: dict[str,dict]) -> dict[str,dict]`.
- `build_condition_rows(spot_id: int, merged: dict[str,dict], source: str) -> list[dict]`.
- `fetch_marine(lat, lon, url, *, forecast_days=None, start_date=None, end_date=None) -> dict[str,dict]`.
- `fetch_weather(lat, lon, url, *, forecast_days=None, start_date=None, end_date=None) -> dict[str,dict]`.
- Config gains: `marine_url`, `weather_forecast_url`, `weather_archive_url`.

- [ ] **Step 1: extend config**

Edit `ml/src/before_surf/config.py`, add fields after `overpass_url`:
```python
    marine_url: str = "https://marine-api.open-meteo.com/v1/marine"
    weather_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
```

- [ ] **Step 2: write failing tests for the pure functions**

`ml/tests/ingestion/test_openmeteo.py`:
```python
from before_surf.ingestion.openmeteo import (
    CONDITION_COLUMNS,
    build_condition_rows,
    merge_hourly,
    parse_hourly,
)


def test_parse_hourly_zips_arrays_by_time():
    payload = {
        "hourly": {
            "time": ["2024-01-01T00:00", "2024-01-01T01:00"],
            "wave_height": [1.2, 1.5],
            "wave_period": [9.0, 9.5],
        }
    }
    var_map = {"wave_height": "wave_height_m", "wave_period": "wave_period_s"}
    out = parse_hourly(payload, var_map)
    assert out["2024-01-01T00:00"] == {"wave_height_m": 1.2, "wave_period_s": 9.0}
    assert out["2024-01-01T01:00"]["wave_period_s"] == 9.5


def test_parse_hourly_handles_missing_series():
    payload = {"hourly": {"time": ["2024-01-01T00:00"]}}
    out = parse_hourly(payload, {"wave_height": "wave_height_m"})
    assert out["2024-01-01T00:00"] == {}


def test_merge_hourly_combines_sources():
    a = {"t0": {"wave_height_m": 1.0}}
    b = {"t0": {"wind_speed_kmh": 12.0}, "t1": {"wind_speed_kmh": 15.0}}
    merged = merge_hourly(a, b)
    assert merged["t0"] == {"wave_height_m": 1.0, "wind_speed_kmh": 12.0}
    assert merged["t1"] == {"wind_speed_kmh": 15.0}


def test_build_condition_rows_fills_all_columns():
    merged = {"2024-01-01T00:00": {"wave_height_m": 1.2, "wind_speed_kmh": 10.0}}
    rows = build_condition_rows(spot_id=7, merged=merged, source="archive")
    assert len(rows) == 1
    row = rows[0]
    assert row["spot_id"] == 7
    assert row["observed_at"] == "2024-01-01T00:00"
    assert row["source"] == "archive"
    assert row["wave_height_m"] == 1.2
    assert row["wind_speed_kmh"] == 10.0
    # every measurement column is present, missing ones are None
    for col in CONDITION_COLUMNS:
        assert col in row
    assert row["water_temp_c"] is None
```

- [ ] **Step 3: run tests, confirm they fail**

Run: `uv run pytest ml/tests/ingestion/test_openmeteo.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'before_surf.ingestion.openmeteo'`.

- [ ] **Step 4: implement `openmeteo.py`**

`ml/src/before_surf/ingestion/openmeteo.py`:
```python
"""Open-Meteo client: fetch and shape hourly marine + weather data.

Directions are reported as "coming from" (0 = north), which matches our
orientation convention. Times are requested in GMT and stored as UTC.
"""

import time

import httpx

_HEADERS = {"User-Agent": "BeFORE-surf/0.1 (+https://github.com/b1ca16/before)"}

MARINE_VARS: dict[str, str] = {
    "wave_height": "wave_height_m",
    "wave_period": "wave_period_s",
    "wave_direction": "wave_direction_deg",
    "swell_wave_height": "swell_height_m",
    "swell_wave_period": "swell_period_s",
    "swell_wave_direction": "swell_direction_deg",
    "sea_surface_temperature": "water_temp_c",
}

WEATHER_VARS: dict[str, str] = {
    "wind_speed_10m": "wind_speed_kmh",
    "wind_direction_10m": "wind_direction_deg",
    "temperature_2m": "air_temp_c",
}

CONDITION_COLUMNS: tuple[str, ...] = tuple(MARINE_VARS.values()) + tuple(WEATHER_VARS.values())


def parse_hourly(payload: dict, var_map: dict[str, str]) -> dict[str, dict]:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    result: dict[str, dict] = {t: {} for t in times}
    for api_name, col in var_map.items():
        series = hourly.get(api_name, [])
        for t, value in zip(times, series, strict=False):
            result[t][col] = value
    return result


def merge_hourly(*sources: dict[str, dict]) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for src in sources:
        for t, cols in src.items():
            merged.setdefault(t, {}).update(cols)
    return merged


def build_condition_rows(spot_id: int, merged: dict[str, dict], source: str) -> list[dict]:
    rows: list[dict] = []
    for observed_at, cols in merged.items():
        row = {"spot_id": spot_id, "observed_at": observed_at, "source": source}
        for col in CONDITION_COLUMNS:
            row[col] = cols.get(col)
        rows.append(row)
    return rows


def _get(url: str, params: dict, timeout: float = 60.0, attempts: int = 3) -> dict:
    params = {**params, "timezone": "GMT"}
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            response = httpx.get(url, params=params, headers=_HEADERS, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            last_error = exc
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"Open-Meteo request failed: {url}") from last_error


def _range_params(
    lat: float,
    lon: float,
    var_map: dict[str, str],
    forecast_days: int | None,
    start_date: str | None,
    end_date: str | None,
) -> dict:
    params: dict = {"latitude": lat, "longitude": lon, "hourly": ",".join(var_map)}
    if forecast_days is not None:
        params["forecast_days"] = forecast_days
    if start_date is not None:
        params["start_date"] = start_date
        params["end_date"] = end_date
    return params


def fetch_marine(
    lat: float,
    lon: float,
    url: str,
    *,
    forecast_days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, dict]:
    params = _range_params(lat, lon, MARINE_VARS, forecast_days, start_date, end_date)
    return parse_hourly(_get(url, params), MARINE_VARS)


def fetch_weather(
    lat: float,
    lon: float,
    url: str,
    *,
    forecast_days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict[str, dict]:
    params = _range_params(lat, lon, WEATHER_VARS, forecast_days, start_date, end_date)
    return parse_hourly(_get(url, params), WEATHER_VARS)
```

- [ ] **Step 5: run tests, expect pass**

Run: `uv run pytest ml/tests/ingestion/test_openmeteo.py -v`
Expected: 4 passed.

- [ ] **Step 6: Commit**

Message:
```
feat: add open-meteo marine and weather client
```

---

### Task 3: Conditions loader

**Files:**
- Create: `ml/src/before_surf/ingestion/load_conditions.py`
- Test: `ml/tests/ingestion/test_load_conditions.py`

**Interfaces:**
- `upsert_conditions(rows: list[dict], database_url: str) -> int` upserts on `(spot_id, observed_at, source)`, returns count.
- `build_upsert_sql() -> str` (exposed for a structural test).

- [ ] **Step 1: write a failing test for the SQL builder**

`ml/tests/ingestion/test_load_conditions.py`:
```python
from before_surf.ingestion.load_conditions import build_upsert_sql
from before_surf.ingestion.openmeteo import CONDITION_COLUMNS


def test_upsert_sql_targets_conflict_key_and_all_columns():
    sql = build_upsert_sql()
    assert "insert into conditions" in sql
    assert "on conflict (spot_id, observed_at, source)" in sql
    # every measurement column participates in the upsert
    for col in CONDITION_COLUMNS:
        assert col in sql
```

- [ ] **Step 2: run it, confirm failure**

Run: `uv run pytest ml/tests/ingestion/test_load_conditions.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: implement the loader**

`ml/src/before_surf/ingestion/load_conditions.py`:
```python
"""Upsert condition rows into the conditions table (idempotent by natural key)."""

import psycopg

from before_surf.ingestion.openmeteo import CONDITION_COLUMNS

_KEY = ("spot_id", "observed_at", "source")
_ALL = _KEY + CONDITION_COLUMNS


def build_upsert_sql() -> str:
    cols = ", ".join(_ALL)
    placeholders = ", ".join(f"%({c})s" for c in _ALL)
    updates = ", ".join(f"{c} = excluded.{c}" for c in CONDITION_COLUMNS)
    return (
        f"insert into conditions ({cols}) values ({placeholders}) "
        f"on conflict (spot_id, observed_at, source) do update set "
        f"{updates}, fetched_at = now();"
    )


def upsert_conditions(rows: list[dict], database_url: str) -> int:
    if not rows:
        return 0
    sql = build_upsert_sql()
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(sql, rows)
        conn.commit()
    return len(rows)
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/ingestion/test_load_conditions.py -v`
Expected: 1 passed.

- [ ] **Step 5: Commit**

Message:
```
feat: add idempotent conditions loader
```

---

### Task 4: Backfill and forecast runners

**Files:**
- Create: `ml/src/before_surf/ingestion/runners.py`
- Test: `ml/tests/ingestion/test_runners.py`

**Interfaces:**
- `load_spots(database_url) -> list[tuple[int, float, float]]` returns `(id, latitude, longitude)`.
- `archive_window(today: date, days: int = 365, lag_days: int = 5) -> tuple[str, str]` returns `(start_date, end_date)` ISO strings.
- `ingest_spot(spot, settings, mode) -> int` fetches marine+weather for one spot, merges, upserts; `mode in {"forecast","archive"}`; returns row count.
- `run(mode)` iterates all spots; `__main__` dispatch via `run_backfill` / `run_forecast` module entrypoints.

- [ ] **Step 1: write failing tests for the pure helper**

`ml/tests/ingestion/test_runners.py`:
```python
from datetime import date

from before_surf.ingestion.runners import archive_window


def test_archive_window_spans_one_year_with_lag():
    start, end = archive_window(date(2026, 7, 23), days=365, lag_days=5)
    assert end == "2026-07-18"      # today minus 5 days
    assert start == "2025-07-18"    # end minus 365 days


def test_archive_window_custom_days():
    start, end = archive_window(date(2026, 1, 10), days=30, lag_days=0)
    assert end == "2026-01-10"
    assert start == "2025-12-11"
```

- [ ] **Step 2: run tests, confirm failure**

Run: `uv run pytest ml/tests/ingestion/test_runners.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: implement `runners.py`**

`ml/src/before_surf/ingestion/runners.py`:
```python
"""Entrypoints that ingest conditions for all spots (backfill and forecast)."""

import time
from datetime import date, timedelta

import psycopg

from before_surf.config import Settings, get_settings
from before_surf.ingestion.load_conditions import upsert_conditions
from before_surf.ingestion.openmeteo import (
    build_condition_rows,
    fetch_marine,
    fetch_weather,
    merge_hourly,
)

FORECAST_DAYS = 7


def load_spots(database_url: str) -> list[tuple[int, float, float]]:
    with psycopg.connect(database_url) as conn:
        return conn.execute("select id, latitude, longitude from spots order by id").fetchall()


def archive_window(today: date, days: int = 365, lag_days: int = 5) -> tuple[str, str]:
    end = today - timedelta(days=lag_days)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


def ingest_spot(spot: tuple[int, float, float], settings: Settings, mode: str) -> int:
    spot_id, lat, lon = spot
    if mode == "forecast":
        marine = fetch_marine(lat, lon, settings.marine_url, forecast_days=FORECAST_DAYS)
        weather = fetch_weather(
            lat, lon, settings.weather_forecast_url, forecast_days=FORECAST_DAYS
        )
        source = "forecast"
    elif mode == "archive":
        start, end = archive_window(date.today())
        marine = fetch_marine(lat, lon, settings.marine_url, start_date=start, end_date=end)
        weather = fetch_weather(
            lat, lon, settings.weather_archive_url, start_date=start, end_date=end
        )
        source = "archive"
    else:
        raise ValueError(f"unknown mode: {mode}")

    rows = build_condition_rows(spot_id, merge_hourly(marine, weather), source)
    return upsert_conditions(rows, settings.database_url)


def run(mode: str) -> None:
    settings = get_settings()
    assert settings.database_url, "DATABASE_URL is not set"
    spots = load_spots(settings.database_url)
    total = 0
    for i, spot in enumerate(spots, start=1):
        count = ingest_spot(spot, settings, mode)
        total += count
        print(f"[{i}/{len(spots)}] spot {spot[0]}: {count} rows ({mode})")
        time.sleep(0.5)
    print(f"done: {total} rows upserted ({mode})")
```

Create `ml/src/before_surf/ingestion/run_backfill.py`:
```python
from before_surf.ingestion.runners import run

if __name__ == "__main__":
    run("archive")
```

Create `ml/src/before_surf/ingestion/run_forecast.py`:
```python
from before_surf.ingestion.runners import run

if __name__ == "__main__":
    run("forecast")
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/ingestion/test_runners.py -v`
Expected: 2 passed.

- [ ] **Step 5: full suite and hooks**

Run: `uv run pytest` then `uv run pre-commit run --all-files`
Expected: all pass.

- [ ] **Step 6: Commit**

Message:
```
feat: add backfill and forecast ingestion runners
```

---

### Task 5: Daily forecast cron (GitHub Actions)

**Files:**
- Create: `.github/workflows/ingest.yml`

**Interfaces:**
- Produces: a scheduled workflow that runs `run_forecast` daily at 06:00 UTC and on manual dispatch, with `DATABASE_URL` from a repo secret.

- [ ] **Step 1: add the repo secret (Francisco, browser)**

On GitHub: repo Settings to Secrets and variables to Actions to New repository secret. Name `DATABASE_URL`, value = the same session-pooler URI from `.env`.

- [ ] **Step 2: create the workflow**

`.github/workflows/ingest.yml`:
```yaml
name: Ingest conditions

on:
  schedule:
    - cron: "0 6 * * *"
  workflow_dispatch:

jobs:
  forecast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v6
        with:
          enable-cache: true

      - name: Install Python
        run: uv python install 3.12

      - name: Sync workspace
        run: uv sync --all-packages --locked

      - name: Run forecast ingestion
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: uv run python -m before_surf.ingestion.run_forecast
```

- [ ] **Step 3: validate the workflow yaml**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "import yaml; yaml.safe_load(open('.github/workflows/ingest.yml',encoding='utf-8')); print('yaml ok')"
```
Expected: `yaml ok`.

- [ ] **Step 4: hooks**

Run: `uv run pre-commit run --files .github/workflows/ingest.yml`
Expected: all pass.

- [ ] **Step 5: Commit**

Message:
```
ci: add daily forecast ingestion workflow
```

---

### Task 6: Run backfill, verify, document

**Files:**
- Create: `ml/src/before_surf/ingestion/CONDITIONS.md`

**Interfaces:**
- Produces: ~800k archive rows in the DB, a verification query, and documentation.

- [ ] **Step 1: run the archive backfill (network, long-running)**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -m before_surf.ingestion.run_backfill
```
Expected: per-spot progress lines and a final total near 800k rows. This takes several minutes (92 spots x 2 calls, with sleeps). If it stops midway, re-running is safe (idempotent upsert).

- [ ] **Step 2: verify row counts and a sample**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "import psycopg; from before_surf.config import get_settings; s=get_settings(); c=psycopg.connect(s.database_url); print('total:', c.execute('select count(*) from conditions').fetchone()[0]); print('by source:', c.execute('select source, count(*) from conditions group by source').fetchall()); print('sample:', c.execute('select observed_at, wave_height_m, swell_period_s, wind_speed_kmh from conditions order by observed_at desc limit 3').fetchall())"
```
Expected: a large total, `archive` present, sample rows with plausible values.

- [ ] **Step 3: smoke-test the forecast runner on ONE spot**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "from before_surf.config import get_settings; from before_surf.ingestion.runners import ingest_spot, load_spots; s=get_settings(); spot=load_spots(s.database_url)[0]; print('forecast rows:', ingest_spot(spot, s, 'forecast'))"
```
Expected: a positive count (about 7 days x 24 hours), `source='forecast'` rows added.

- [ ] **Step 4: write the docs**

`ml/src/before_surf/ingestion/CONDITIONS.md`:
```markdown
# Conditions ingestion (dynamic time-series)

Fetches hourly ocean and weather conditions per spot from Open-Meteo and stores them in the
`conditions` table, keyed uniquely by `(spot_id, observed_at, source)`.

Data source: Open-Meteo (free, no key). Marine API for waves/swell/sea-temperature; Weather API
for wind and air temperature. Directions are "coming from" (0 = north). Times are UTC.

## Modes

- **Backfill (archive):** `uv run python -m before_surf.ingestion.run_backfill`
  Pulls ~1 year of hourly ERA5-based history per spot, `source='archive'`. For EDA and heuristic
  calibration. Idempotent: safe to re-run.
- **Forecast (daily):** `uv run python -m before_surf.ingestion.run_forecast`
  Pulls the next 7 days per spot, `source='forecast'`. Runs daily via GitHub Actions
  (`.github/workflows/ingest.yml`) using the `DATABASE_URL` repo secret.

## Notes

- Two API calls per spot (marine + weather), merged on timestamp; missing values are NULL.
- Archive lags ~5 days, so the backfill window ends 5 days before today.
- Storage: ~800k archive rows plus daily forecast accumulation. Watch the 500 MB free tier; a
  retention policy for old forecast rows is a likely future addition.
```

- [ ] **Step 5: full suite and hooks**

Run: `uv run pytest` then `uv run pre-commit run --all-files`
Expected: all pass.

- [ ] **Step 6: Commit**

Message:
```
docs: document conditions ingestion modes
```

---

## Definition of done for Milestone 2

- `conditions` table exists (migration committed, RLS on, unique natural key).
- Open-Meteo client, loader, and runners implemented with unit tests; full suite and pre-commit pass.
- One year of hourly archive data loaded for all spots; a verification query returns plausible values.
- Daily forecast workflow committed and runnable (manual dispatch works; secret set).
- CI green.

## Deferred (not in M2)

- Tide / sea-level ingestion (limited API support; add when the heuristic needs it).
- Retention / pruning policy for old forecast rows.
- Feature engineering (that is Milestone 3): turning these raw columns into derived features.
