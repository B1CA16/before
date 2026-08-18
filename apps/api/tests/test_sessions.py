"""Session endpoints: ownership isolation and label-quality validation.

The isolation tests are the important ones. This service connects as the table owner and so bypasses
row level security, which means the API's own per-user filter is the only thing keeping one person's
sessions away from another. A test that would catch its removal is not optional.
"""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient

from before_api import auth
from before_api.main import app
from before_api.repository import get_repository
from before_api.schemas import SESSION_TAGS

SPOT = {"slug": "carcavelos", "name": "Carcavelos", "region": "Lisbon"}


class FakeRepo:
    """In-memory stand-in that enforces ownership the same way the SQL does."""

    def __init__(self):
        self.rows = []
        self._next_id = 1

    def get_spot(self, slug):
        return dict(SPOT) if slug == SPOT["slug"] else None

    def upsert_session(self, *, user_id, spot_slug, surfed_at, rating, tags, note):
        for row in self.rows:
            if (row["user_id"], row["slug"], row["surfed_at"]) == (user_id, spot_slug, surfed_at):
                row.update(rating=rating, tags=tags, note=note)
                return row
        row = {
            "id": self._next_id,
            "user_id": user_id,
            "slug": spot_slug,
            "name": SPOT["name"],
            "surfed_at": surfed_at,
            "rating": rating,
            "tags": tags,
            "note": note,
        }
        self._next_id += 1
        self.rows.append(row)
        return row

    def list_sessions(self, user_id):
        return [r for r in self.rows if r["user_id"] == user_id]

    def delete_session(self, user_id, session_id):
        before = len(self.rows)
        self.rows = [r for r in self.rows if r["id"] != session_id or r["user_id"] != user_id]
        return len(self.rows) < before


def _as(user_id: str):
    """A client whose token verification is stubbed to return this user id."""
    app.dependency_overrides[auth.current_user_id] = lambda: user_id
    return TestClient(app)


def _setup(repo):
    app.dependency_overrides[get_repository] = lambda: repo


def teardown_function():
    app.dependency_overrides.clear()


def _yesterday():
    return (datetime.now(UTC) - timedelta(days=1)).replace(microsecond=0).isoformat()


def _body(**over):
    return {"slug": "carcavelos", "surfed_at": _yesterday(), "rating": 4, "tags": [], **over}


# --- ownership ------------------------------------------------------------------------------------


def test_sessions_are_private_to_their_owner():
    repo = FakeRepo()
    _setup(repo)
    _as("user-a").post("/sessions", json=_body())

    assert len(_as("user-a").get("/sessions").json()) == 1
    assert _as("user-b").get("/sessions").json() == []


def test_another_user_cannot_delete_your_session():
    repo = FakeRepo()
    _setup(repo)
    created = _as("user-a").post("/sessions", json=_body()).json()

    # 404 rather than 403: a 403 would confirm the session exists.
    assert _as("user-b").delete(f"/sessions/{created['id']}").status_code == 404
    assert len(_as("user-a").get("/sessions").json()) == 1

    assert _as("user-a").delete(f"/sessions/{created['id']}").status_code == 204
    assert _as("user-a").get("/sessions").json() == []


def test_deleting_a_missing_session_is_404():
    _setup(FakeRepo())
    assert _as("user-a").delete("/sessions/999").status_code == 404


def test_the_body_cannot_choose_the_owner():
    """Even if a caller supplies user_id, identity comes from the token."""
    repo = FakeRepo()
    _setup(repo)
    _as("user-a").post("/sessions", json=_body(user_id="user-b"))
    assert repo.rows[0]["user_id"] == "user-a"


# --- label quality --------------------------------------------------------------------------------


def test_a_repeat_submission_updates_instead_of_duplicating():
    repo = FakeRepo()
    _setup(repo)
    when = _yesterday()
    _as("user-a").post("/sessions", json=_body(surfed_at=when, rating=2))
    _as("user-a").post("/sessions", json=_body(surfed_at=when, rating=5))

    sessions = _as("user-a").get("/sessions").json()
    assert len(sessions) == 1
    assert sessions[0]["rating"] == 5


def test_future_sessions_are_rejected():
    _setup(FakeRepo())
    ahead = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert _as("user-a").post("/sessions", json=_body(surfed_at=ahead)).status_code == 422


def test_a_session_logged_moments_ago_is_accepted():
    """Guards the clock-skew allowance, so a slightly fast client is not rejected."""
    _setup(FakeRepo())
    now = datetime.now(UTC).isoformat()
    assert _as("user-a").post("/sessions", json=_body(surfed_at=now)).status_code == 201


def test_a_naive_timestamp_is_rejected():
    """No offset means the hour is a guess, and a wrong hour pairs the label with wrong
    conditions."""
    _setup(FakeRepo())
    naive = "2026-08-10T07:00:00"
    assert _as("user-a").post("/sessions", json=_body(surfed_at=naive)).status_code == 422


def test_ratings_outside_one_to_five_are_rejected():
    _setup(FakeRepo())
    for rating in (0, 6, -1):
        assert _as("user-a").post("/sessions", json=_body(rating=rating)).status_code == 422


def test_unknown_tags_are_rejected():
    _setup(FakeRepo())
    assert _as("user-a").post("/sessions", json=_body(tags=["crowdd"])).status_code == 422


def test_duplicate_tags_are_collapsed():
    repo = FakeRepo()
    _setup(repo)
    _as("user-a").post("/sessions", json=_body(tags=["crowded", "crowded"]))
    assert repo.rows[0]["tags"] == ["crowded"]


def test_unknown_spot_is_404():
    _setup(FakeRepo())
    assert _as("user-a").post("/sessions", json=_body(slug="nowhere")).status_code == 404


def test_tag_vocabulary_matches_the_database_constraint():
    """Drift here would surface as an opaque 500 from a CHECK violation, so pin them together."""
    migration = next(
        Path(__file__).resolve().parents[3].glob("supabase/migrations/*_create_surf_sessions.sql")
    ).read_text(encoding="utf-8")
    # Match the array literal itself. Splitting on "tags" and then on "]" does not work, because the
    # "]" of the column's own text[] type comes first.
    literal = re.search(r"array\[(.*?)\]::text\[\]", migration, re.DOTALL)
    assert literal, "could not find the tag vocabulary in the migration"
    in_sql = set(re.findall(r"'([a-z_]+)'", literal.group(1)))
    assert in_sql == set(SESSION_TAGS)
