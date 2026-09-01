"""The forecast-correction dataset, and above all the honesty of its split.

The split tests are the ones that matter. A leak here does not crash anything: it produces a model
that scores beautifully on the test set and is worthless in production, which is the failure mode
that is hardest to notice and most embarrassing to publish.
"""

import numpy as np
import pandas as pd
import pytest

from before_surf.correction.dataset import (
    EMBARGO_HOURS,
    build_features,
    split_by_time,
)


def make_pairs(hours: int = 48, spots: int = 3, start: str = "2026-07-01") -> pd.DataFrame:
    """A synthetic paired set: `spots` spots observed every hour for `hours` hours."""
    rows = []
    base = pd.Timestamp(start, tz="UTC")
    for h in range(hours):
        for s in range(spots):
            rows.append(
                {
                    "observed_at": base + pd.Timedelta(hours=h),
                    "spot": f"spot-{s}",
                    "orientation_deg": 270.0 + s,
                    "f_wind_speed_kmh": 10.0 + s,
                    "f_wind_direction_deg": 300.0,
                    "f_swell_height_m": 1.5,
                    "f_swell_period_s": 9.0,
                    "f_swell_direction_deg": 290.0,
                    # Archive is windier by an amount that varies with the hour, mirroring the real
                    # diurnal pattern the exploratory pass found.
                    "a_wind_speed_kmh": 10.0 + s + (h % 24) / 10.0,
                }
            )
    return pd.DataFrame(rows)


class TestBuildFeatures:
    def test_target_is_archive_minus_forecast(self):
        frame = build_features(make_pairs(hours=1, spots=1))
        row = frame.iloc[0]
        assert row["error_kmh"] == pytest.approx(row["a_wind_speed_kmh"] - row["f_wind_speed_kmh"])

    def test_positive_target_means_the_archive_was_windier(self):
        pairs = make_pairs(hours=1, spots=1)
        pairs.loc[0, "a_wind_speed_kmh"] = 20.0
        pairs.loc[0, "f_wind_speed_kmh"] = 12.0
        assert build_features(pairs).iloc[0]["error_kmh"] == pytest.approx(8.0)

    def test_hour_is_encoded_cyclically(self):
        """23:00 and 00:00 must be neighbours, which a plain integer does not give you."""
        frame = build_features(make_pairs(hours=24, spots=1))
        at_23 = frame[frame["hour"] == 23][["hour_sin", "hour_cos"]].iloc[0].to_numpy()
        at_00 = frame[frame["hour"] == 0][["hour_sin", "hour_cos"]].iloc[0].to_numpy()
        at_12 = frame[frame["hour"] == 12][["hour_sin", "hour_cos"]].iloc[0].to_numpy()
        near = np.linalg.norm(at_23 - at_00)
        far = np.linalg.norm(at_23 - at_12)
        assert near < far

    def test_wind_bearing_is_encoded_cyclically(self):
        """359 and 1 degrees are neighbours, which the raw number does not say."""
        pairs = make_pairs(hours=3, spots=1)
        pairs["f_wind_direction_deg"] = [359.0, 1.0, 180.0]
        frame = build_features(pairs)
        points = frame[["wind_dir_sin", "wind_dir_cos"]].to_numpy()
        near = np.linalg.norm(points[0] - points[1])
        far = np.linalg.norm(points[0] - points[2])
        assert near < far
        assert np.allclose(np.hypot(points[:, 0], points[:, 1]), 1.0)

    def test_wind_offset_never_exceeds_180(self):
        """An angle between two bearings is at most a half turn, whichever way round you measure."""
        pairs = make_pairs(hours=4, spots=1)
        pairs["f_wind_direction_deg"] = [350.0, 10.0, 180.0, 0.0]
        pairs["orientation_deg"] = [10.0, 350.0, 0.0, 180.0]
        offsets = build_features(pairs)["wind_offshore_deg"]
        assert (offsets <= 180).all()
        assert offsets.iloc[0] == pytest.approx(20.0)
        assert offsets.iloc[1] == pytest.approx(20.0)

    def test_a_wholly_null_column_does_not_poison_the_arithmetic(self):
        """The bug that 500'd 7 of 92 spot pages: object dtype instead of float."""
        pairs = make_pairs(hours=2, spots=1)
        pairs["orientation_deg"] = None
        frame = build_features(pairs)
        assert frame["error_kmh"].notna().all()
        assert frame["wind_offshore_deg"].isna().all()

    def test_a_null_on_either_side_drops_the_row(self):
        """Never a zero correction: absence of evidence is not evidence of a correct forecast."""
        pairs = make_pairs(hours=4, spots=1)
        pairs.loc[0, "a_wind_speed_kmh"] = None
        pairs.loc[1, "f_wind_speed_kmh"] = None
        frame = build_features(pairs)
        assert len(frame) == 2
        assert (frame["error_kmh"] != 0).all()

    def test_empty_input_returns_an_empty_frame_with_the_target_column(self):
        frame = build_features(make_pairs(hours=0, spots=0))
        assert len(frame) == 0
        assert "error_kmh" in frame.columns


class TestSplitByTime:
    def test_train_is_entirely_before_test(self):
        split = split_by_time(build_features(make_pairs(hours=200)))
        assert split.train["observed_at"].max() < split.test["observed_at"].min()

    def test_no_hour_appears_on_both_sides(self):
        """The leak that a random split would introduce, asserted directly."""
        split = split_by_time(build_features(make_pairs(hours=200)))
        shared = set(split.train["observed_at"]) & set(split.test["observed_at"])
        assert shared == set()

    def test_the_embargo_actually_removes_rows(self):
        split = split_by_time(build_features(make_pairs(hours=200)))
        assert split.embargoed_rows > 0
        gap = split.test["observed_at"].min() - split.train["observed_at"].max()
        assert gap >= pd.Timedelta(hours=EMBARGO_HOURS)

    def test_a_zero_embargo_leaves_the_boundary_touching(self):
        """Shows what the embargo is buying: without it, adjacent hours straddle the split."""
        split = split_by_time(build_features(make_pairs(hours=200)), embargo_hours=0)
        gap = split.test["observed_at"].min() - split.train["observed_at"].max()
        assert gap == pd.Timedelta(hours=1)

    def test_every_spot_appears_on_both_sides(self):
        """Splitting by time must not accidentally split by place."""
        split = split_by_time(build_features(make_pairs(hours=200, spots=5)))
        assert set(split.train["spot"]) == set(split.test["spot"])

    def test_test_fraction_is_of_time_not_of_rows(self):
        split = split_by_time(build_features(make_pairs(hours=400)), test_fraction=0.25)
        # A quarter of the timeline, within rounding of one hour.
        assert split.test_hours == pytest.approx(100, abs=2)

    def test_rows_are_never_duplicated_or_invented(self):
        frame = build_features(make_pairs(hours=200))
        split = split_by_time(frame)
        assert len(split.train) + len(split.test) + split.embargoed_rows == len(frame)

    def test_empty_input_gives_empty_halves(self):
        split = split_by_time(build_features(make_pairs(hours=0, spots=0)))
        assert len(split.train) == 0
        assert len(split.test) == 0
        assert split.train_hours == 0
