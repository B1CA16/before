"""Open-Meteo client: fetch and shape hourly marine + weather data.

Directions are reported as "coming from" (0 = north), which matches our
orientation convention. Times are requested in GMT and stored as UTC.
"""

import time

import httpx

_HEADERS = {"User-Agent": "beFORE-surf/0.1 (+https://github.com/b1ca16/before)"}

MARINE_VARS: dict[str, str] = {
    "wave_height": "wave_height_m",
    "wave_period": "wave_period_s",
    "wave_direction": "wave_direction_deg",
    "swell_wave_height": "swell_height_m",
    "swell_wave_period": "swell_period_s",
    "swell_wave_direction": "swell_direction_deg",
    "sea_surface_temperature": "water_temp_c",
}

WEATHER_VARS: dict[str, str] = {
    "wind_speed_10m": "wind_speed_kmh",
    "wind_direction_10m": "wind_direction_deg",
    "temperature_2m": "air_temp_c",
}

CONDITION_COLUMNS: tuple[str, ...] = tuple(MARINE_VARS.values()) + tuple(WEATHER_VARS.values())


def parse_hourly(payload: dict, var_map: dict[str, str]) -> dict[str, dict]:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    result: dict[str, dict] = {t: {} for t in times}
    for api_name, col in var_map.items():
        series = hourly.get(api_name, [])
        for t, value in zip(times, series, strict=False):
            result[t][col] = value
    return result


def merge_hourly(*sources: dict[str, dict]) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for src in sources:
        for t, cols in src.items():
            merged.setdefault(t, {}).update(cols)
    return merged


def build_condition_rows(spot_id: int, merged: dict[str, dict], source: str) -> list[dict]:
    rows: list[dict] = []
    for observed_at, cols in merged.items():
        row = {"spot_id": spot_id, "observed_at": observed_at, "source": source}
        for col in CONDITION_COLUMNS:
            row[col] = cols.get(col)
        rows.append(row)
    return rows


def _get(url: str, params: dict, timeout: float = 60.0, attempts: int = 3) -> dict:
    params = {**params, "timezone": "GMT"}
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            response = httpx.get(url, params=params, headers=_HEADERS, timeout=timeout)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            last_error = exc
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"Open-Meteo request failed: {url}") from last_error


def normalize_locations(payload: dict | list) -> list[dict]:
    """Open-Meteo returns a dict for one location and a list for many; unify to a list."""
    if isinstance(payload, list):
        return payload
    return [payload]


Coord = tuple[float, float]  # (latitude, longitude)


def _range_params(
    coords: list[Coord],
    var_map: dict[str, str],
    forecast_days: int | None,
    start_date: str | None,
    end_date: str | None,
) -> dict:
    params: dict = {
        "latitude": ",".join(str(lat) for lat, _ in coords),
        "longitude": ",".join(str(lon) for _, lon in coords),
        "hourly": ",".join(var_map),
    }
    if forecast_days is not None:
        params["forecast_days"] = forecast_days
    if start_date is not None:
        params["start_date"] = start_date
        params["end_date"] = end_date
    return params


def _fetch_batch(
    coords: list[Coord],
    url: str,
    var_map: dict[str, str],
    forecast_days: int | None,
    start_date: str | None,
    end_date: str | None,
) -> list[dict[str, dict]]:
    params = _range_params(coords, var_map, forecast_days, start_date, end_date)
    locations = normalize_locations(_get(url, params))
    # Results are returned in the same order as the requested coordinates.
    return [parse_hourly(loc, var_map) for loc in locations]


def fetch_marine(
    coords: list[Coord],
    url: str,
    *,
    forecast_days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, dict]]:
    return _fetch_batch(coords, url, MARINE_VARS, forecast_days, start_date, end_date)


def fetch_weather(
    coords: list[Coord],
    url: str,
    *,
    forecast_days: int | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, dict]]:
    return _fetch_batch(coords, url, WEATHER_VARS, forecast_days, start_date, end_date)
