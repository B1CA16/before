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


_CURRENT_CONDITIONS_QUERY = """
select distinct on (s.slug)
       s.slug, s.orientation_deg,
       c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg
from spots s
join conditions c on c.spot_id = s.id and c.source = 'forecast'
where c.observed_at >= now()
order by s.slug, c.observed_at
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

    def get_current_conditions(self) -> pd.DataFrame:
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(_CURRENT_CONDITIONS_QUERY)
            columns = [desc.name for desc in cur.description]
            data = cur.fetchall()
        return pd.DataFrame(data, columns=columns)

    # --- surf sessions (labels) -------------------------------------------------------------------
    #
    # SECURITY: this service connects as the table owner, which BYPASSES row level security. The
    # policies on surf_sessions protect only the anon/authenticated REST API, not us. So the
    # `user_id = %(user_id)s` clause in every statement below IS the access control. Dropping one
    # would expose other people's sessions, and no policy would stop it.

    def upsert_session(
        self,
        *,
        user_id: str,
        spot_slug: str,
        surfed_at,
        rating: int,
        tags: list[str],
        note: str | None,
    ) -> dict:
        """Insert a session, or update it if this person already logged that spot and moment.

        Upsert rather than insert so a double submit edits instead of duplicating, matching the
        PUT-not-POST idempotency the conditions ingestion uses.
        """
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(
                """
                insert into surf_sessions (user_id, spot_id, surfed_at, rating, tags, note)
                select %(user_id)s, s.id, %(surfed_at)s, %(rating)s, %(tags)s, %(note)s
                from spots s where s.slug = %(slug)s
                on conflict (user_id, spot_id, surfed_at) do update
                    set rating = excluded.rating,
                        tags = excluded.tags,
                        note = excluded.note,
                        updated_at = now()
                returning id, surfed_at, rating, tags, note
                """,
                {
                    "user_id": user_id,
                    "slug": spot_slug,
                    "surfed_at": surfed_at,
                    "rating": rating,
                    "tags": tags,
                    "note": note,
                },
            )
            rows = _rows_as_dicts(cur)
        return rows[0]

    def list_sessions(self, user_id: str) -> list[dict]:
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(
                """
                select ss.id, sp.slug, sp.name, ss.surfed_at, ss.rating, ss.tags, ss.note
                from surf_sessions ss
                join spots sp on sp.id = ss.spot_id
                where ss.user_id = %(user_id)s
                order by ss.surfed_at desc
                """,
                {"user_id": user_id},
            )
            return _rows_as_dicts(cur)

    def delete_session(self, user_id: str, session_id: int) -> bool:
        """True if a row belonging to this user was deleted.

        False covers both "no such session" and "someone else's session", on purpose: the caller
        cannot use the response to learn that another user's session exists.
        """
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(
                "delete from surf_sessions where id = %(id)s and user_id = %(user_id)s",
                {"id": session_id, "user_id": user_id},
            )
            return cur.rowcount > 0


def get_repository() -> SupabaseRepository:
    settings = get_settings()
    assert settings.database_url, "DATABASE_URL is not set"
    return SupabaseRepository(settings.database_url)
