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
