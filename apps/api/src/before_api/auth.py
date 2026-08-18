"""Verify Supabase access tokens, so an endpoint can trust who is calling it.

Supabase signs with **ES256**, an elliptic-curve signature, and publishes the matching public key at
a JWKS endpoint. So this service can check that a token is genuine without holding anything capable
of producing one. That asymmetry is the point: leaking this API's configuration does not let an
attacker mint a token for an arbitrary user, which is exactly what leaking an HS256 shared secret
would allow.

Why verification cannot be skipped: a JWT is signed but not encrypted, so anyone can read the claims
and anyone can write a token that *says* `sub` is someone else. The signature is the only thing that
distinguishes a token Supabase issued from one a caller invented, and checking it is what turns a
string in a header into an identity.
"""

from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from before_surf.config import get_settings

# Supabase puts this in `aud` for a signed-in (non-anonymous) user.
_AUDIENCE = "authenticated"


@lru_cache
def _jwk_client() -> PyJWKClient:
    """Cached because it fetches over the network and holds a key cache.

    PyJWKClient looks up by the token's `kid` and re-fetches when it sees one it does not know, so
    key rotation is handled without a redeploy.
    """
    return PyJWKClient(get_settings().supabase_jwks_url)


def verify_access_token(token: str) -> str:
    """Return the Supabase user id (`sub`) for a valid token, or raise `jwt.PyJWTError`."""
    signing_key = _jwk_client().get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        # Pinned deliberately. Trusting the algorithm named in the token's own header is the
        # classic JWT vulnerability: a caller switches it to "none", or to HS256 using the public
        # key as the shared secret, and forges whatever they like.
        algorithms=["ES256"],
        audience=_AUDIENCE,
        issuer=get_settings().supabase_auth_issuer,
        # `exp` is verified by default. Requiring it explicitly means a token that simply omits an
        # expiry is rejected rather than treated as valid forever.
        options={"require": ["exp", "sub", "aud", "iss"]},
    )
    return str(claims["sub"])


# auto_error=False so a missing header reaches our own handler and produces a consistent 401 body,
# rather than FastAPI's default 403.
_bearer = HTTPBearer(auto_error=False, description="Supabase access token")


def current_user_id(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    """FastAPI dependency: the authenticated caller's id, or 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        return verify_access_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        # Deliberately uniform: expired, bad signature, wrong audience and malformed all report
        # the same thing. Saying which would tell an attacker how close a forgery got.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


CurrentUser = Annotated[str, Depends(current_user_id)]
