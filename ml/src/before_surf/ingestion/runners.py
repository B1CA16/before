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
