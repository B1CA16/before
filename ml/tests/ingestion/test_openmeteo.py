from before_surf.ingestion.openmeteo import (
    CONDITION_COLUMNS,
    build_condition_rows,
    merge_hourly,
    normalize_locations,
    parse_hourly,
)


def test_parse_hourly_zips_arrays_by_time():
    payload = {
        "hourly": {
            "time": ["2024-01-01T00:00", "2024-01-01T01:00"],
            "wave_height": [1.2, 1.5],
            "wave_period": [9.0, 9.5],
        }
    }
    var_map = {"wave_height": "wave_height_m", "wave_period": "wave_period_s"}
    out = parse_hourly(payload, var_map)
    assert out["2024-01-01T00:00"] == {"wave_height_m": 1.2, "wave_period_s": 9.0}
    assert out["2024-01-01T01:00"]["wave_period_s"] == 9.5


def test_parse_hourly_handles_missing_series():
    payload = {"hourly": {"time": ["2024-01-01T00:00"]}}
    out = parse_hourly(payload, {"wave_height": "wave_height_m"})
    assert out["2024-01-01T00:00"] == {}


def test_merge_hourly_combines_sources():
    a = {"t0": {"wave_height_m": 1.0}}
    b = {"t0": {"wind_speed_kmh": 12.0}, "t1": {"wind_speed_kmh": 15.0}}
    merged = merge_hourly(a, b)
    assert merged["t0"] == {"wave_height_m": 1.0, "wind_speed_kmh": 12.0}
    assert merged["t1"] == {"wind_speed_kmh": 15.0}


def test_normalize_locations_wraps_dict_and_passes_list():
    # A single-location response is a dict; multi-location is a list.
    single = {"latitude": 1.0, "hourly": {}}
    assert normalize_locations(single) == [single]
    multi = [{"latitude": 1.0}, {"latitude": 2.0}]
    assert normalize_locations(multi) == multi


def test_build_condition_rows_fills_all_columns():
    merged = {"2024-01-01T00:00": {"wave_height_m": 1.2, "wind_speed_kmh": 10.0}}
    rows = build_condition_rows(spot_id=7, merged=merged, source="archive")
    assert len(rows) == 1
    row = rows[0]
    assert row["spot_id"] == 7
    assert row["observed_at"] == "2024-01-01T00:00"
    assert row["source"] == "archive"
    assert row["wave_height_m"] == 1.2
    assert row["wind_speed_kmh"] == 10.0
    # every measurement column is present, missing ones are None
    for col in CONDITION_COLUMNS:
        assert col in row
    assert row["water_temp_c"] is None
