"""Resilient Overpass API access: try the preferred endpoint, then mirrors.

Public Overpass servers are frequently overloaded (504s, read timeouts), so we
retry across a small set of endpoints before giving up.
"""

import time

import httpx

_HEADERS = {"User-Agent": "BeFORE-surf/0.1 (+https://github.com/b1ca16/before)"}

_FALLBACK_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)


def run_query(
    query: str,
    preferred_url: str,
    timeout: float = 180.0,
    attempts: int = 2,
) -> dict:
    endpoints = [preferred_url, *(u for u in _FALLBACK_ENDPOINTS if u != preferred_url)]
    last_error: Exception | None = None
    for round_index in range(attempts):
        for url in endpoints:
            try:
                response = httpx.post(url, data={"data": query}, headers=_HEADERS, timeout=timeout)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as exc:
                last_error = exc
        if round_index + 1 < attempts:
            time.sleep(2.0)
    raise RuntimeError("all Overpass endpoints failed") from last_error
