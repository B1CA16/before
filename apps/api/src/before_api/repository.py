"""Data access for the API. All DB access lives here, injected into routes via Depends.

Connections come from a pool, and that is a correctness requirement rather than an optimisation.
Supabase's session-mode pooler caps a project at 15 clients. Opening a fresh connection per request
exceeded that as soon as anything concurrent happened: prerendering 92 spot pages with six workers
died with `EMAXCONNSESSION`, and a burst of real traffic would have done the same in production. The
pool bounds us well below the cap and skips a TCP and TLS handshake per query as a side benefit.
"""

import pandas as pd
from psycopg_pool import ConnectionPool

from before_surf.config import get_settings

_SPOT_COLUMNS = "slug, name, region, latitude, longitude, orientation_deg"

# Only hours still ahead. Old forecast rows are never pruned, so without this the endpoint returned
# 816 rows where the interface uses 147, paying to build, validate and serialise each one: 184 KB
# and 825 ms a request, against a query taking 2.3 ms. The database was never the bottleneck.
# Sending
# five times less matters most on the connection this gets used on, in a car park.
_FORECAST_QUERY = """
select c.observed_at, s.orientation_deg,
       c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg, c.sea_level_m
from conditions c
join spots s on s.id = c.spot_id
where s.slug = %(slug)s and c.source = 'forecast'
  and c.observed_at >= now()
order by c.observed_at
"""


# One row per spot: the nearest forecast hour that has not already passed. The optional slug filter
# lets a single spot page reuse the same query rather than scoring all 92 and discarding 91.
_CURRENT_CONDITIONS_QUERY = """
select distinct on (s.slug)
       s.slug, s.orientation_deg,
       c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg, c.sea_level_m
from spots s
join conditions c on c.spot_id = s.id and c.source = 'forecast'
where c.observed_at >= now()
  and (%(slug)s::text is null or s.slug = %(slug)s)
order by s.slug, c.observed_at
"""


def _rows_as_dicts(cursor) -> list[dict]:
    columns = [desc.name for desc in cursor.description]
    return [dict(zip(columns, row, strict=True)) for row in cursor.fetchall()]


class SupabaseRepository:
    def __init__(self, pool: ConnectionPool):
        self.pool = pool

    def list_spots(self) -> list[dict]:
        with self.pool.connection() as conn:
            cur = conn.execute(f"select {_SPOT_COLUMNS} from spots order by name")
            return _rows_as_dicts(cur)

    def get_spot(self, slug: str) -> dict | None:
        with self.pool.connection() as conn:
            cur = conn.execute(
                f"select {_SPOT_COLUMNS} from spots where slug = %(slug)s", {"slug": slug}
            )
            rows = _rows_as_dicts(cur)
        return rows[0] if rows else None

    def get_forecast(self, slug: str) -> pd.DataFrame:
        with self.pool.connection() as conn:
            cur = conn.execute(_FORECAST_QUERY, {"slug": slug})
            columns = [desc.name for desc in cur.description]
            data = cur.fetchall()
        return pd.DataFrame(data, columns=columns)

    def get_current_conditions(self, slug: str | None = None) -> pd.DataFrame:
        with self.pool.connection() as conn:
            cur = conn.execute(_CURRENT_CONDITIONS_QUERY, {"slug": slug})
            columns = [desc.name for desc in cur.description]
            data = cur.fetchall()
        return pd.DataFrame(data, columns=columns)

    def get_conditions_at(self, slug: str, at) -> pd.DataFrame:
        """Conditions for one spot at one hour, for logging a session that already happened.

        Distinct from get_forecast, which only returns hours still ahead of us. A session logged
        from memory is in the past, so it needs whatever we have on record for that hour.

        Prefers `archive` over `forecast`, the same preference the training join will make: the
        archive is what the ocean did, the forecast is what we guessed it would do.
        """
        with self.pool.connection() as conn:
            cur = conn.execute(
                """
                select c.observed_at, c.source, s.orientation_deg,
                       c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
                       c.wind_speed_kmh, c.wind_direction_deg, c.sea_level_m
                from conditions c
                join spots s on s.id = c.spot_id
                where s.slug = %(slug)s
                  and c.observed_at = date_trunc('hour', %(at)s::timestamptz)
                order by case c.source when 'archive' then 0 else 1 end
                limit 1
                """,
                {"slug": slug, "at": at},
            )
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
        with self.pool.connection() as conn:
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
        with self.pool.connection() as conn:
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

    def list_favourites(self, user_id: str) -> list[str]:
        """The caller's favourited slugs, and nothing else.

        Slugs rather than whole spot rows: the client already holds every spot from the cached
        `/spots` response, so returning them again would be the same data twice, on the one request
        that cannot be shared-cached. This endpoint carries the personal layer only.
        """
        with self.pool.connection() as conn:
            cur = conn.execute(
                """
                select sp.slug
                from favourites f
                join spots sp on sp.id = f.spot_id
                where f.user_id = %(user_id)s
                order by sp.slug
                """,
                {"user_id": user_id},
            )
            return [row[0] for row in cur.fetchall()]

    def add_favourite(self, user_id: str, slug: str) -> bool:
        """Favourite a spot. False only if the slug does not exist.

        `on conflict do nothing` makes a repeat call a no-op rather than an error, so the endpoint is
        idempotent: the client can fire it without first knowing the current state, and a double tap
        or a retried request cannot fail. The composite primary key is what makes this safe.
        """
        with self.pool.connection() as conn:
            cur = conn.execute(
                """
                insert into favourites (user_id, spot_id)
                select %(user_id)s, id from spots where slug = %(slug)s
                on conflict do nothing
                """,
                {"user_id": user_id, "slug": slug},
            )
            # rowcount is 0 for both "no such spot" and "already favourited", so it cannot
            # distinguish them. Ask the spots table directly instead.
            if cur.rowcount == 1:
                return True
            exists = conn.execute(
                "select 1 from spots where slug = %(slug)s", {"slug": slug}
            ).fetchone()
            return exists is not None

    def remove_favourite(self, user_id: str, slug: str) -> bool:
        """Un-favourite a spot. False only if the slug does not exist.

        Also idempotent: removing something you have not favourited is a success, because the state
        the caller asked for ("not favourited") is the state they end up in.
        """
        with self.pool.connection() as conn:
            # The user_id filter is the access control, since RLS does not apply to this connection.
            conn.execute(
                """
                delete from favourites
                where user_id = %(user_id)s
                  and spot_id = (select id from spots where slug = %(slug)s)
                """,
                {"user_id": user_id, "slug": slug},
            )
            exists = conn.execute(
                "select 1 from spots where slug = %(slug)s", {"slug": slug}
            ).fetchone()
            return exists is not None

    def delete_account(self, user_id: str) -> bool:
        """Erase an account and everything hanging off it: the GDPR right to erasure.

        Deleting the `auth.users` row is sufficient. Every foreign key pointing at it cascades,
        including `auth.sessions` (login sessions) and our `surf_sessions` (their ratings). That was
        checked against the live schema rather than assumed.

        Done through the database rather than Supabase's admin API on purpose. We already hold owner
        access via DATABASE_URL, whereas the admin route would mean adding a service-role key: one
        more highly privileged secret that bypasses row level security, for no extra capability.
        """
        with self.pool.connection() as conn:
            cur = conn.execute("delete from auth.users where id = %(id)s", {"id": user_id})
            return cur.rowcount > 0

    def delete_session(self, user_id: str, session_id: int) -> bool:
        """True if a row belonging to this user was deleted.

        False covers both "no such session" and "someone else's session", on purpose: the caller
        cannot use the response to learn that another user's session exists.
        """
        with self.pool.connection() as conn:
            cur = conn.execute(
                "delete from surf_sessions where id = %(id)s and user_id = %(user_id)s",
                {"id": session_id, "user_id": user_id},
            )
            return cur.rowcount > 0


# Module-level and lazily opened, so importing this module never touches the network and the tests
# that override get_repository never build a pool at all.
_pool: ConnectionPool | None = None

# Under the pooler's cap of 15, with room left for the ingestion jobs and any ad-hoc script. Raised
# from 6 when prerendering grew from 96 pages to 189 (two locales): that is 378 requests at roughly
# 500 ms each, and six connections could not drain them inside the checkout timeout. The limit is
# throughput through the pool, not the database, whose part of that 500 ms is about 2 ms.
POOL_MAX_SIZE = 10


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        settings = get_settings()
        assert settings.database_url, "DATABASE_URL is not set"
        _pool = ConnectionPool(
            settings.database_url,
            min_size=1,
            max_size=POOL_MAX_SIZE,
            # Wait rather than fail when every connection is busy: a slow page beats a 500.
            # Generous, because a full prerender queues hundreds of requests behind a bounded pool,
            # and a build failing at page 180 of 189 is worse than one taking another minute.
            timeout=60.0,
            # The API sleeps on the free tier, so connections go stale while idle. Checking one out
            # costs a round trip but avoids handing a route a dead socket.
            check=ConnectionPool.check_connection,
            open=True,
        )
    return _pool


def get_repository() -> SupabaseRepository:
    return SupabaseRepository(get_pool())
