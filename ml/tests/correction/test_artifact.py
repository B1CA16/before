"""The shipped correction: what it does, what it refuses to do, and how it fails."""

import json

import numpy as np
import pandas as pd
import pytest

from before_surf.correction.artifact import (
    DEFAULT_PATH,
    MIN_HOUR_ROWS,
    TIMEZONE,
    WindCorrection,
    fit_correction,
    load_correction,
)

# +2 at every hour keeps the arithmetic obvious, so a failure points at the logic, not the table.
FLAT = WindCorrection(by_local_hour=dict.fromkeys(range(24), 2.0), fallback_kmh=1.0)


def rows(hours_utc, wind=10.0, source=None) -> pd.DataFrame:
    frame = pd.DataFrame(
        {
            "observed_at": [pd.Timestamp(f"2026-08-01T{h:02d}:00:00Z") for h in hours_utc],
            "wind_speed_kmh": [wind] * len(hours_utc),
        }
    )
    if source is not None:
        frame["source"] = source
    return frame


class TestLookup:
    def test_it_keys_on_local_hour_not_utc(self):
        """August is UTC+1 in Lisbon, so 09:00 UTC must read the 10:00 row."""
        table = WindCorrection(by_local_hour={10: 7.0}, fallback_kmh=0.0)
        assert table.lookup(rows([9])["observed_at"]).iloc[0] == pytest.approx(7.0)
        assert table.lookup(rows([10])["observed_at"]).iloc[0] == pytest.approx(0.0)

    def test_the_same_utc_hour_reads_a_different_row_in_winter(self):
        """The reason the table is keyed locally at all. A UTC table would be an hour out."""
        table = WindCorrection(by_local_hour={9: 5.0, 10: 7.0}, fallback_kmh=0.0)
        summer = pd.Series([pd.Timestamp("2026-08-01T09:00:00Z")])
        winter = pd.Series([pd.Timestamp("2026-12-01T09:00:00Z")])
        assert table.lookup(summer).iloc[0] == pytest.approx(7.0)
        assert table.lookup(winter).iloc[0] == pytest.approx(5.0)

    def test_an_unknown_hour_uses_the_fallback(self):
        table = WindCorrection(by_local_hour={3: 5.0}, fallback_kmh=1.25)
        assert table.lookup(rows([9])["observed_at"]).iloc[0] == pytest.approx(1.25)

    def test_naive_timestamps_are_read_as_utc_rather_than_rejected(self):
        naive = pd.Series([pd.Timestamp("2026-08-01T09:00:00")])
        assert FLAT.lookup(naive).iloc[0] == pytest.approx(2.0)


class TestApply:
    def test_it_adds_the_correction_to_the_wind(self):
        out = FLAT.apply(rows([9], wind=10.0))
        assert out["wind_speed_kmh"].iloc[0] == pytest.approx(12.0)
        assert out["wind_correction_kmh"].iloc[0] == pytest.approx(2.0)

    def test_the_original_frame_is_left_alone(self):
        frame = rows([9], wind=10.0)
        FLAT.apply(frame)
        assert frame["wind_speed_kmh"].iloc[0] == pytest.approx(10.0)
        assert "wind_correction_kmh" not in frame.columns

    def test_wind_is_never_pushed_below_zero(self):
        strong = WindCorrection(by_local_hour={10: -5.0}, fallback_kmh=-5.0)
        out = strong.apply(rows([9], wind=1.0))
        assert out["wind_speed_kmh"].iloc[0] == pytest.approx(0.0)

    def test_a_clamped_correction_reports_what_was_actually_applied(self):
        """Not the table's -5: the app must not claim an adjustment it did not make."""
        strong = WindCorrection(by_local_hour={10: -5.0}, fallback_kmh=-5.0)
        out = strong.apply(rows([9], wind=1.0))
        assert out["wind_correction_kmh"].iloc[0] == pytest.approx(-1.0)

    def test_a_missing_wind_stays_missing_and_reports_nothing(self):
        frame = rows([9])
        frame["wind_speed_kmh"] = np.nan
        out = FLAT.apply(frame)
        assert pd.isna(out["wind_speed_kmh"].iloc[0])
        assert pd.isna(out["wind_correction_kmh"].iloc[0])

    def test_archive_rows_are_left_exactly_as_recorded(self):
        """A recorded hour is not a prediction. Correcting it would move it away from the record."""
        out = FLAT.apply(rows([9, 9], wind=10.0, source=["forecast", "archive"]))
        assert out["wind_speed_kmh"].tolist() == pytest.approx([12.0, 10.0])

    def test_an_untouched_row_reports_no_correction_rather_than_a_zero_one(self):
        out = FLAT.apply(rows([9], wind=10.0, source=["archive"]))
        assert pd.isna(out["wind_correction_kmh"].iloc[0])

    def test_a_frame_without_a_source_column_is_corrected_throughout(self):
        out = FLAT.apply(rows([9, 10, 11]))
        assert out["wind_correction_kmh"].notna().all()

    def test_an_empty_frame_still_gains_the_column(self):
        out = FLAT.apply(rows([]).iloc[0:0])
        assert "wind_correction_kmh" in out.columns
        assert len(out) == 0

    def test_a_frame_with_no_wind_column_does_not_crash(self):
        out = FLAT.apply(pd.DataFrame({"observed_at": [pd.Timestamp("2026-08-01T09:00:00Z")]}))
        assert out["wind_correction_kmh"].isna().all()


class TestFit:
    def test_it_recovers_a_known_per_hour_offset(self):
        frame = pd.DataFrame(
            {
                # 09:00 UTC is 10:00 local in August.
                "observed_at": [pd.Timestamp("2026-08-01T09:00:00Z")] * MIN_HOUR_ROWS,
                "error_kmh": [3.0] * MIN_HOUR_ROWS,
            }
        )
        assert fit_correction(frame).by_local_hour == {10: 3.0}

    def test_an_hour_with_too_few_rows_is_dropped(self):
        frame = pd.DataFrame(
            {
                "observed_at": [pd.Timestamp("2026-08-01T09:00:00Z")] * 3,
                "error_kmh": [40.0] * 3,
            }
        )
        fitted = fit_correction(frame)
        assert fitted.by_local_hour == {}
        assert fitted.lookup(rows([9])["observed_at"]).iloc[0] == pytest.approx(40.0)

    def test_it_uses_the_median_because_the_metric_is_mae(self):
        frame = pd.DataFrame(
            {
                "observed_at": [pd.Timestamp("2026-08-01T09:00:00Z")] * MIN_HOUR_ROWS,
                "error_kmh": [1.0] * (MIN_HOUR_ROWS - 1) + [500.0],
            }
        )
        assert fit_correction(frame).by_local_hour[10] == pytest.approx(1.0)


class TestRoundTrip:
    def test_json_survives_a_round_trip(self):
        restored = WindCorrection.from_json(FLAT.to_json())
        assert restored.by_local_hour == FLAT.by_local_hour
        assert restored.fallback_kmh == FLAT.fallback_kmh
        assert restored.timezone == FLAT.timezone

    def test_hour_keys_come_back_as_integers(self):
        """JSON has no integer keys, so a lazy round trip would silently break every lookup."""
        restored = WindCorrection.from_json(FLAT.to_json())
        assert all(isinstance(hour, int) for hour in restored.by_local_hour)
        assert restored.lookup(rows([9])["observed_at"]).iloc[0] == pytest.approx(2.0)


class TestLoad:
    def test_a_missing_file_gives_none_rather_than_raising(self, tmp_path):
        assert load_correction(tmp_path / "not-here.json") is None

    def test_corrupt_json_gives_none_rather_than_raising(self, tmp_path):
        path = tmp_path / "broken.json"
        path.write_text("{not json", encoding="utf-8")
        assert load_correction(path) is None

    def test_json_missing_its_keys_gives_none(self, tmp_path):
        path = tmp_path / "partial.json"
        path.write_text('{"timezone": "Europe/Lisbon"}', encoding="utf-8")
        assert load_correction(path) is None


class TestShippedArtifact:
    def test_it_exists_and_loads(self):
        assert DEFAULT_PATH.exists(), "run `python -m before_surf.correction.build`"
        assert load_correction() is not None

    def test_every_hour_of_the_day_is_covered(self):
        assert set(load_correction().by_local_hour) == set(range(24))

    def test_the_corrections_are_physically_plausible(self):
        """A guard against shipping a table built from a broken query or the wrong units."""
        values = list(load_correction().by_local_hour.values())
        assert all(-15.0 < value < 15.0 for value in values)

    def test_it_records_the_held_out_score_it_earned(self):
        metadata = load_correction().metadata
        assert metadata["holdout_mae_kmh"] < metadata["do_nothing_mae_kmh"]
        assert metadata["improvement_kmh"] > 0

    def test_it_is_keyed_to_the_timezone_the_code_expects(self):
        assert load_correction().timezone == TIMEZONE

    def test_the_committed_file_is_valid_json_with_the_documented_shape(self):
        raw = json.loads(DEFAULT_PATH.read_text(encoding="utf-8"))
        assert set(raw) == {"by_local_hour", "fallback_kmh", "metadata", "timezone"}
