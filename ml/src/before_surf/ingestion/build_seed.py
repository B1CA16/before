"""Assemble the spot seed CSV from OSM: spots + computed orientation."""

import csv
from pathlib import Path

from before_surf.ingestion.coastline_osm import fetch_coastline
from before_surf.ingestion.orientation import shore_normal
from before_surf.ingestion.spots_osm import BBox, fetch_spots

FIELDS = ["slug", "name", "region", "latitude", "longitude", "break_type", "orientation_deg"]


def build(bbox: BBox, region: str, overpass_url: str, out_path: Path) -> int:
    spots = fetch_spots(bbox, region, overpass_url)
    coast_lines = fetch_coastline(bbox, overpass_url)
    coast_points = [pt for line in coast_lines for pt in line]

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        for spot in spots:
            orientation = shore_normal((spot.longitude, spot.latitude), coast_points)
            writer.writerow(
                {
                    "slug": spot.slug,
                    "name": spot.name,
                    "region": spot.region,
                    "latitude": spot.latitude,
                    "longitude": spot.longitude,
                    "break_type": spot.break_type or "",
                    "orientation_deg": "" if orientation is None else round(orientation, 1),
                }
            )
    return len(spots)


if __name__ == "__main__":
    from before_surf.config import get_settings

    settings = get_settings()
    count = build(
        bbox=(38.60, -9.55, 39.05, -9.20),
        region="Lisbon",
        overpass_url=settings.overpass_url,
        out_path=Path("db/seeds/spots.csv"),
    )
    print(f"wrote {count} spots to db/seeds/spots.csv")
