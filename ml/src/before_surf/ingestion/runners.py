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
CHUNK_SIZE = 25


def load_spots(database_url: str) -> list[tuple[int, float, float]]:
    with psycopg.connect(database_url) as conn:
        return conn.execute("select id, latitude, longitude from spots order by id").fetchall()


def archive_window(today: date, days: int = 365, lag_days: int = 5) -> tuple[str, str]:
    """Trailing window of archive data, ending `lag_days` short of today.

    The lag is kept even though the endpoint will happily serve today: recent days come back as a
    preliminary product that is still being revised, and `source = 'archive'` is supposed to mean
    settled. Measured against what we had already stored as forecast for the same hours, the archive
    differs on every single hour, by 0.59 s of period on average and up to 4.2 s at worst. Since the
    period ramp spans 3 to 13 s, that worst case is 0.42 of the period sub-score, in the factor that
    most often decides the total. Which source a label is paired with is therefore not a detail.
    """
    end = today - timedelta(days=lag_days)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


def chunked(items: list, size: int) -> list[list]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def ingest_chunk(
    spots: list[tuple[int, float, float]],
    settings: Settings,
    mode: str,
    archive_days: int = 365,
) -> int:
    """Fetch a batch of spots in one request per API, then upsert all their rows."""
    coords = [(lat, lon) for _spot_id, lat, lon in spots]
    if mode == "forecast":
        marine = fetch_marine(coords, settings.marine_url, forecast_days=FORECAST_DAYS)
        weather = fetch_weather(coords, settings.weather_forecast_url, forecast_days=FORECAST_DAYS)
        source = "forecast"
    elif mode == "archive":
        start, end = archive_window(date.today(), days=archive_days)
        marine = fetch_marine(coords, settings.marine_url, start_date=start, end_date=end)
        weather = fetch_weather(
            coords, settings.weather_archive_url, start_date=start, end_date=end
        )
        source = "archive"
    else:
        raise ValueError(f"unknown mode: {mode}")

    rows: list[dict] = []
    for i, (spot_id, _lat, _lon) in enumerate(spots):
        merged = merge_hourly(marine[i], weather[i])
        rows.extend(build_condition_rows(spot_id, merged, source))
    return upsert_conditions(rows, settings.database_url)


def run(mode: str, archive_days: int = 365) -> None:
    """Ingest conditions for every spot.

    `archive_days` sizes the trailing window in archive mode, so one code path serves both the
    one-off year backfill and the weekly refresh that gives logged sessions their ground truth.
    """
    settings = get_settings()
    assert settings.database_url, "DATABASE_URL is not set"
    spots = load_spots(settings.database_url)
    batches = chunked(spots, CHUNK_SIZE)
    total = 0
    for i, batch in enumerate(batches, start=1):
        count = ingest_chunk(batch, settings, mode, archive_days)
        total += count
        print(f"[chunk {i}/{len(batches)}] {len(batch)} spots: {count} rows ({mode})")
        time.sleep(1.0)
    print(f"done: {total} rows upserted ({mode})")
