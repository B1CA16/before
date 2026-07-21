"""Load the versioned spot seed CSV into the `spots` table (idempotent upsert)."""

import csv
from pathlib import Path

import psycopg

UPSERT = """
insert into spots (slug, name, region, latitude, longitude, break_type, orientation_deg)
values (%(slug)s, %(name)s, %(region)s, %(latitude)s, %(longitude)s,
        %(break_type)s, %(orientation_deg)s)
on conflict (slug) do update set
    name = excluded.name,
    region = excluded.region,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    break_type = excluded.break_type,
    orientation_deg = excluded.orientation_deg,
    updated_at = now();
"""


def _opt(value: str) -> str | None:
    value = value.strip()
    return value or None


def rows_from_csv(path: Path) -> list[dict]:
    rows: list[dict] = []
    with path.open(newline="", encoding="utf-8") as fh:
        for raw in csv.DictReader(fh):
            orientation = _opt(raw["orientation_deg"])
            rows.append(
                {
                    "slug": raw["slug"].strip(),
                    "name": raw["name"].strip(),
                    "region": raw["region"].strip(),
                    "latitude": float(raw["latitude"]),
                    "longitude": float(raw["longitude"]),
                    "break_type": _opt(raw["break_type"]),
                    "orientation_deg": None if orientation is None else float(orientation),
                }
            )
    return rows


def upsert(rows: list[dict], database_url: str) -> int:
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT, rows)
        conn.commit()
    return len(rows)


if __name__ == "__main__":
    from before_surf.config import get_settings

    settings = get_settings()
    assert settings.database_url, "DATABASE_URL is not set"
    count = upsert(rows_from_csv(Path("db/seeds/spots.csv")), settings.database_url)
    print(f"upserted {count} spots")
