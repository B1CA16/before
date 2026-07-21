"""Compute the seaward-facing azimuth of a spot from nearby coastline geometry.

OSM convention: coastline ways are traced with land on the LEFT and water on the
RIGHT. So the seaward normal is the travel bearing rotated +90 degrees (clockwise).
"""

from pyproj import Geod

_GEOD = Geod(ellps="WGS84")


def normalize_bearing(deg: float) -> float:
    return deg % 360.0


def bearing(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    fwd_az, _back_az, _dist = _GEOD.inv(lon1, lat1, lon2, lat2)
    return normalize_bearing(fwd_az)


def _distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    _fwd, _back, dist = _GEOD.inv(lon1, lat1, lon2, lat2)
    return dist


def shore_normal(
    spot_lonlat: tuple[float, float],
    coastline: list[tuple[float, float]],
    radius_m: float = 150.0,
) -> float | None:
    spot_lon, spot_lat = spot_lonlat
    near = [
        (lon, lat)
        for lon, lat in coastline
        if _distance_m(spot_lon, spot_lat, lon, lat) <= radius_m
    ]
    if len(near) < 2:
        return None
    (lon_a, lat_a), (lon_b, lat_b) = near[0], near[-1]
    travel = bearing(lon_a, lat_a, lon_b, lat_b)
    return normalize_bearing(travel + 90.0)
