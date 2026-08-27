"""Favourite endpoints: ownership isolation and idempotency.

Same reasoning as the session tests. This service connects as the table owner and bypasses row level
security, so the API's own per-user filter is the only thing keeping one person's favourites away
from another. A test that would catch its removal is not optional.

The idempotency tests are the other half. PUT and DELETE here claim to state a desired end state
rather than perform an action, and a client that trusts that claim will fire them without checking
first, so the claim has to be true.
"""

from fastapi.testclient import TestClient

from before_api import auth
from before_api.main import app
from before_api.repository import get_repository

SPOTS = {"carcavelos", "praia-dos-coxos", "cave"}


class FakeRepo:
    """In-memory stand-in that enforces ownership the same way the SQL does."""

    def __init__(self):
        # (user_id, slug) pairs, mirroring the composite primary key.
        self.rows: set[tuple[str, str]] = set()

    def list_favourites(self, user_id):
        return sorted(slug for uid, slug in self.rows if uid == user_id)

    def add_favourite(self, user_id, slug):
        if slug not in SPOTS:
            return False
        self.rows.add((user_id, slug))
        return True

    def remove_favourite(self, user_id, slug):
        if slug not in SPOTS:
            return False
        self.rows.discard((user_id, slug))
        return True


def _as(user_id: str):
    """A client whose token verification is stubbed to return this user id."""
    app.dependency_overrides[auth.current_user_id] = lambda: user_id
    return TestClient(app)


def _setup(repo):
    app.dependency_overrides[get_repository] = lambda: repo


def teardown_function():
    app.dependency_overrides.clear()


# --- ownership --------------------------------------------------------------------------------


def test_one_users_favourites_are_invisible_to_another():
    repo = FakeRepo()
    _setup(repo)

    assert _as("user-a").put("/favourites/carcavelos").status_code == 204
    assert _as("user-a").put("/favourites/cave").status_code == 204

    assert _as("user-a").get("/favourites").json() == ["carcavelos", "cave"]
    # The whole point: B sees nothing, despite two rows existing in the table.
    assert _as("user-b").get("/favourites").json() == []


def test_one_user_cannot_unfavourite_for_another():
    repo = FakeRepo()
    _setup(repo)

    _as("user-a").put("/favourites/carcavelos")
    # B removing "carcavelos" succeeds as a statement about B, and must not touch A's row.
    assert _as("user-b").delete("/favourites/carcavelos").status_code == 204
    assert _as("user-a").get("/favourites").json() == ["carcavelos"]


def test_favourites_require_a_token():
    _setup(FakeRepo())
    # No auth override, so the real dependency runs and rejects an unauthenticated caller.
    anon = TestClient(app)
    assert anon.get("/favourites").status_code in (401, 403)
    assert anon.put("/favourites/carcavelos").status_code in (401, 403)
    assert anon.delete("/favourites/carcavelos").status_code in (401, 403)


# --- idempotency ------------------------------------------------------------------------------


def test_favouriting_twice_is_idempotent():
    repo = FakeRepo()
    _setup(repo)
    client = _as("user-a")

    assert client.put("/favourites/carcavelos").status_code == 204
    assert client.put("/favourites/carcavelos").status_code == 204

    assert client.get("/favourites").json() == ["carcavelos"]
    assert len(repo.rows) == 1


def test_unfavouriting_something_not_favourited_succeeds():
    """204 rather than 404: the caller asked for "not favourited" and that is the resulting state."""
    _setup(FakeRepo())
    client = _as("user-a")

    assert client.delete("/favourites/carcavelos").status_code == 204
    assert client.get("/favourites").json() == []


def test_favourite_then_unfavourite_round_trips():
    _setup(FakeRepo())
    client = _as("user-a")

    client.put("/favourites/cave")
    assert client.get("/favourites").json() == ["cave"]
    client.delete("/favourites/cave")
    assert client.get("/favourites").json() == []


# --- unknown spots ----------------------------------------------------------------------------


def test_unknown_spot_is_404_on_both_verbs():
    """A typo in a slug should say so, rather than silently storing nothing and reporting success."""
    _setup(FakeRepo())
    client = _as("user-a")

    assert client.put("/favourites/not-a-spot").status_code == 404
    assert client.delete("/favourites/not-a-spot").status_code == 404


# --- CORS -------------------------------------------------------------------------------------


def test_preflight_allows_the_verbs_the_browser_actually_sends():
    """The browser refuses a cross-origin PUT unless the preflight says PUT is allowed.

    Worth a test because nothing else can catch it: TestClient, curl and every server-to-server
    caller ignore CORS, so a missing verb leaves the endpoint looking perfectly healthy while the
    real app cannot reach it. PUT was in fact missing when favourites were added, and only driving
    the UI in a browser surfaced it.
    """
    client = TestClient(app)
    for method in ("GET", "PUT", "DELETE"):
        res = client.options(
            "/favourites/carcavelos",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": method,
            },
        )
        assert res.status_code == 200, f"{method} preflight rejected"
        allowed = res.headers.get("access-control-allow-methods", "")
        assert method in allowed, f"{method} missing from {allowed!r}"
