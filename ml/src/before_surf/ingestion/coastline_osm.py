"""Fetch OSM coastline polylines within a bounding box (Overpass)."""

from before_surf.ingestion.overpass import run_query

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
    payload = run_query(_query(bbox), url)
    return parse_coastline(payload)
