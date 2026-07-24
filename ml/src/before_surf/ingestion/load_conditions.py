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
