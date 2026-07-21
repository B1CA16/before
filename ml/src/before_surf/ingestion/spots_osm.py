"""Extract surf spots from the OpenStreetMap Overpass API."""

import re
import unicodedata

import httpx

from before_surf.ingestion.models import Spot

BBox = tuple[float, float, float, float]  # south, west, north, east


def slugify(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _query(bbox: BBox) -> str:
    s, w, n, e = bbox
    area = f"({s},{w},{n},{e})"
    return (
        "[out:json][timeout:60];"
        "("
        f'node["sport"="surfing"]{area};'
        f'way["sport"="surfing"]{area};'
        f'node["natural"="beach"]{area};'
        f'way["natural"="beach"]{area};'
        ");"
        "out center tags;"
    )


def parse_overpass(payload: dict, region: str) -> list[Spot]:
    spots: list[Spot] = []
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:  # way or relation with a computed center
            center = el.get("center", {})
            lat, lon = center.get("lat"), center.get("lon")
        if lat is None or lon is None:
            continue
        spots.append(
            Spot(
                slug=slugify(name),
                name=name,
                region=region,
                latitude=float(lat),
                longitude=float(lon),
            )
        )
    return spots


def dedupe(spots: list[Spot]) -> list[Spot]:
    seen: set[str] = set()
    out: list[Spot] = []
    for spot in spots:
        if spot.slug in seen:
            continue
        seen.add(spot.slug)
        out.append(spot)
    return out


def fetch_spots(bbox: BBox, region: str, url: str) -> list[Spot]:
    response = httpx.post(url, data={"data": _query(bbox)}, timeout=90.0)
    response.raise_for_status()
    return dedupe(parse_overpass(response.json(), region))
