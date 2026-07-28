"""Load conditions joined with spot metadata into a DataFrame for EDA and features."""

import pandas as pd
import psycopg

JOIN_QUERY = """
select c.spot_id, s.slug, s.orientation_deg, c.observed_at, c.source,
       c.wave_height_m, c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg, c.water_temp_c, c.air_temp_c
from conditions c
join spots s on s.id = c.spot_id
where c.source = %(source)s
"""


def records_to_dataframe(rows: list, columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=columns)


def load_joined(database_url: str, source: str = "archive") -> pd.DataFrame:
    with psycopg.connect(database_url) as conn:
        cur = conn.execute(JOIN_QUERY, {"source": source})
        rows = cur.fetchall()
        columns = [desc.name for desc in cur.description]
    return records_to_dataframe(rows, columns)
