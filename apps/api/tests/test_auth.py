"""Token verification, tested by forging tokens.

Each test signs a real ES256 token with a key we control, and points the verifier at a JWKS built
from that key. Asserting a *valid* token works proves almost nothing on its own: the value of
verification is entirely in what it refuses, so every failure mode gets its own test.
"""

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

from before_api import auth
from before_api.main import app
from before_api.repository import get_repository

ISSUER = "https://test-project.supabase.co/auth/v1"
KID = "test-key-1"


def _keypair():
    return ec.generate_private_key(ec.SECP256R1())


# One key for the whole module, plus a second that was never trusted.
GOOD_KEY = _keypair()
ATTACKER_KEY = _keypair()


def _token(key=GOOD_KEY, *, sub="user-a", aud="authenticated", iss=ISSUER, exp_delta=None, kid=KID):
    now = datetime.now(UTC)
    claims = {
        "sub": sub,
        "aud": aud,
        "iss": iss,
        "iat": int(now.timestamp()),
        "exp": int((now + (exp_delta or timedelta(hours=1))).timestamp()),
    }
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": kid})


class _FakeJWKClient:
    """Stands in for the network call to Supabase's JWKS endpoint."""

    def get_signing_key_from_jwt(self, token):
        header = jwt.get_unverified_header(token)
        if header.get("kid") != KID:
            raise jwt.PyJWKClientError(f"unknown kid {header.get('kid')}")

        class _Key:
            key = GOOD_KEY.public_key()

        return _Key()


@pytest.fixture(autouse=True)
def _wire_verifier(monkeypatch):
    monkeypatch.setattr(auth, "_jwk_client", lambda: _FakeJWKClient())

    class _S:
        supabase_auth_issuer = ISSUER

    monkeypatch.setattr(auth, "get_settings", lambda: _S())
    yield
    app.dependency_overrides.clear()


class _Repo:
    def list_sessions(self, user_id):
        return []


def _client():
    app.dependency_overrides[get_repository] = lambda: _Repo()
    return TestClient(app)


def _get(headers=None):
    return _client().get("/sessions", headers=headers or {})


def test_valid_token_is_accepted():
    assert _get({"Authorization": f"Bearer {_token()}"}).status_code == 200


def test_missing_header_is_rejected():
    response = _get()
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_malformed_token_is_rejected():
    assert _get({"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_token_signed_by_the_wrong_key_is_rejected():
    """The core of it: anyone can write the claims, only Supabase can sign them."""
    assert _get({"Authorization": f"Bearer {_token(ATTACKER_KEY)}"}).status_code == 401


def test_expired_token_is_rejected():
    stale = _token(exp_delta=timedelta(minutes=-5))
    assert _get({"Authorization": f"Bearer {stale}"}).status_code == 401


def test_wrong_audience_is_rejected():
    assert _get({"Authorization": f"Bearer {_token(aud='anon')}"}).status_code == 401


def test_wrong_issuer_is_rejected():
    """A token from a different Supabase project must not open this one."""
    other = _token(iss="https://someone-elses.supabase.co/auth/v1")
    assert _get({"Authorization": f"Bearer {other}"}).status_code == 401


def test_unknown_key_id_is_rejected():
    assert _get({"Authorization": f"Bearer {_token(kid='rotated-away')}"}).status_code == 401


def test_unsigned_token_is_rejected():
    """alg=none is the oldest JWT attack. Pinning algorithms is what stops it."""
    forged = jwt.encode(
        {"sub": "user-a", "aud": "authenticated", "iss": ISSUER, "exp": 9999999999},
        key=None,
        algorithm="none",
        headers={"kid": KID},
    )
    assert _get({"Authorization": f"Bearer {forged}"}).status_code == 401


def test_token_without_expiry_is_rejected():
    """A token with no exp would otherwise be valid forever."""
    forever = jwt.encode(
        {"sub": "user-a", "aud": "authenticated", "iss": ISSUER},
        GOOD_KEY,
        algorithm="ES256",
        headers={"kid": KID},
    )
    assert _get({"Authorization": f"Bearer {forever}"}).status_code == 401


def test_the_subject_claim_becomes_the_caller_identity():
    seen = {}

    class _Recorder:
        def list_sessions(self, user_id):
            seen["user_id"] = user_id
            return []

    app.dependency_overrides[get_repository] = lambda: _Recorder()
    TestClient(app).get("/sessions", headers={"Authorization": f"Bearer {_token(sub='user-zed')}"})
    assert seen["user_id"] == "user-zed"
