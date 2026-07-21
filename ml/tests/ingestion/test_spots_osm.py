from before_surf.ingestion.models import Spot
from before_surf.ingestion.spots_osm import dedupe, parse_overpass, slugify


def test_slugify_basic():
    assert slugify("Praia do Guincho") == "praia-do-guincho"
    assert slugify("Carcavelos  ") == "carcavelos"
    assert slugify("Sao Juliao") == "sao-juliao"


def test_parse_overpass_node_and_way_center():
    payload = {
        "elements": [
            {
                "type": "node",
                "id": 1,
                "lat": 38.7,
                "lon": -9.33,
                "tags": {"name": "Carcavelos", "sport": "surfing"},
            },
            {
                "type": "way",
                "id": 2,
                "center": {"lat": 38.93, "lon": -9.42},
                "tags": {"name": "Ribeira d'Ilhas", "natural": "beach"},
            },
            {"type": "node", "id": 3, "lat": 38.8, "lon": -9.4, "tags": {}},
        ]
    }
    spots = parse_overpass(payload, region="Lisbon")
    slugs = {s.slug for s in spots}
    assert "carcavelos" in slugs
    assert "ribeira-d-ilhas" in slugs
    assert all(s.region == "Lisbon" for s in spots)
    # element without a name tag is skipped
    assert len(spots) == 2


def test_dedupe_keeps_first():
    a = Spot(slug="x", name="X", region="R", latitude=1.0, longitude=2.0)
    b = Spot(slug="x", name="X dup", region="R", latitude=1.1, longitude=2.1)
    assert dedupe([a, b]) == [a]
