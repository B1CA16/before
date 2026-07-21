"""Fetch OSM coastline polylines within a bounding box (Overpass)."""

import httpx

BBox = tuple[float, float, float, float]


def _query(bbox: BBox) -> str:
    s, w, n, e = bbox
    return f'[out:json][timeout:90];(way["natural"="coastline"]({s},{w},{n},{e}););out geom;'


def parse_coastline(payload: dict) -> list[list[tuple[float, float]]]:
    lines: list[list[tuple[float, float]]] = []
    for el in payload.get("elements", []):
        geometry = el.get("geometry")
        if not geometry:
            continue
        lines.append([(pt["lon"], pt["lat"]) for pt in geometry])
    return lines


def fetch_coastline(bbox: BBox, url: str) -> list[list[tuple[float, float]]]:
    response = httpx.post(url, data={"data": _query(bbox)}, timeout=120.0)
    response.raise_for_status()
    return parse_coastline(response.json())
