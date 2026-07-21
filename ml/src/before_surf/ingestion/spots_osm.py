"""Extract surf spots from the OpenStreetMap Overpass API."""

import re
import unicodedata

from before_surf.ingestion.models import Spot
from before_surf.ingestion.overpass import run_query

BBox = tuple[float, float, float, float]  # south, west, north, east

# OSM elements tagged as businesses (surf schools, shops, rentals) are not spots.
_BUSINESS_KEYS = ("shop", "office", "craft", "amenity")
_BUSINESS_WORDS = (
    "school",
    "escola",
    "shop",
    "store",
    "loja",
    "rental",
    "aluguer",
    "lessons",
    "academy",
    "academia",
    "hostel",
    "hotel",
    "surfcamp",
)


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


def _is_business(tags: dict, name: str) -> bool:
    if any(key in tags for key in _BUSINESS_KEYS):
        return True
    lowered = name.lower()
    return any(word in lowered for word in _BUSINESS_WORDS)


def parse_overpass(payload: dict, region: str) -> list[Spot]:
    spots: list[Spot] = []
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name:
            continue
        if _is_business(tags, name):
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
    payload = run_query(_query(bbox), url)
    return dedupe(parse_overpass(payload, region))
