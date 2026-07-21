from before_surf.ingestion.coastline_osm import parse_coastline
from before_surf.ingestion.orientation import bearing, normalize_bearing, shore_normal


def test_normalize_bearing():
    assert normalize_bearing(370.0) == 10.0
    assert normalize_bearing(-90.0) == 270.0


def test_bearing_due_north_and_east():
    assert abs(bearing(0.0, 0.0, 0.0, 1.0) - 0.0) < 1.0  # north
    assert abs(bearing(0.0, 0.0, 1.0, 0.0) - 90.0) < 1.0  # east


def test_shore_normal_coast_running_north_faces_east():
    # Coastline traced south -> north near lon 0; water is on the right (east).
    coast = [(0.0, 38.60), (0.0, 38.70), (0.0, 38.80)]
    spot = (0.001, 38.70)
    result = shore_normal(spot, coast, radius_m=20000.0)
    assert result is not None
    assert abs(normalize_bearing(result - 90.0)) < 5.0  # seaward ~= east (90)


def test_shore_normal_too_few_points_returns_none():
    assert shore_normal((0.0, 0.0), [(0.0, 0.0)], radius_m=100.0) is None


def test_parse_coastline():
    payload = {
        "elements": [
            {"type": "way", "geometry": [{"lon": 0.0, "lat": 1.0}, {"lon": 0.0, "lat": 2.0}]},
            {"type": "way"},
        ]
    }
    lines = parse_coastline(payload)
    assert lines == [[(0.0, 1.0), (0.0, 2.0)]]
