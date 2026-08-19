"""Tide features, tested against a synthetic tide curve with known low and high water."""

import numpy as np
import pandas as pd

from before_surf.features.derive import add_tide_features, tide_rising, tide_state


def _curve(hours: int = 26, range_m: float = 1.6, period_h: float = 12.4) -> pd.Series:
    """A semidiurnal tide: low at hour 0, high about a quarter-period later."""
    t = np.arange(hours)
    return pd.Series(-(range_m / 2) * np.cos(2 * np.pi * t / period_h + np.pi))


def test_state_is_zero_at_low_water_and_one_at_high():
    level = _curve()
    state = tide_state(level)
    low = int(level.idxmin())
    high = int(level.idxmax())
    assert state[low] < 0.05, "low water should sit at the bottom of the range"
    assert state[high] > 0.95, "high water should sit at the top"
    # Mid-tide on the way up is genuinely in between, not merely "not extreme".
    assert 0.3 < state[(low + high) // 2] < 0.7


def test_state_is_bounded_and_comparable():
    """The point of normalising: the output means the same at any spot and any tidal range."""
    small = tide_state(_curve(range_m=0.8)).dropna()
    large = tide_state(_curve(range_m=3.5)).dropna()
    for series in (small, large):
        assert series.min() >= 0.0
        assert series.max() <= 1.0
    # Same shape of tide, same states, despite a four-fold difference in metres.
    assert np.allclose(small.to_numpy(), large.to_numpy(), atol=1e-9)


def test_rising_is_true_on_the_flood_and_false_on_the_ebb():
    level = _curve()
    rising = tide_rising(level)
    low = int(level.idxmin())
    high = int(level.idxmax())
    assert bool(rising[low + 1]) is True, "just after low water the tide floods"
    assert bool(rising[high + 1]) is False, "just after high water it ebbs"


def test_the_last_hour_has_no_direction_rather_than_a_guess():
    """Its successor is unknown. Saying "falling" would be inventing an answer."""
    rising = tide_rising(_curve())
    assert pd.isna(rising.iloc[-1])


def test_a_flat_series_has_no_state():
    """No range means no meaningful position within it, so null rather than 0 or 0.5."""
    assert tide_state(pd.Series([1.0] * 20)).isna().all()


def test_missing_tide_readings_propagate_as_null():
    """Older rows predate the column. A null must not become a plausible-looking mid-tide."""
    frame = pd.DataFrame(
        {
            "observed_at": pd.date_range("2026-08-01", periods=20, freq="h", tz="UTC"),
            "sea_level_m": [None] * 20,
        }
    )
    out = add_tide_features(frame)
    assert out["tide_state"].isna().all()
    assert out["tide_rising"].isna().all()


def test_a_frame_without_the_column_at_all_still_works():
    """Guards the API against 500ing on rows ingested before the migration."""
    frame = pd.DataFrame(
        {"observed_at": pd.date_range("2026-08-01", periods=3, freq="h", tz="UTC")}
    )
    out = add_tide_features(frame)
    assert "tide_state" in out.columns
    assert out["tide_state"].isna().all()


def test_out_of_order_rows_are_sorted_before_differencing():
    """Both features read neighbours, so an unsorted frame would be silently wrong, not loudly."""
    level = _curve()
    frame = pd.DataFrame(
        {
            "observed_at": pd.date_range("2026-08-01", periods=len(level), freq="h", tz="UTC"),
            "sea_level_m": level.to_numpy(),
        }
    )
    shuffled = frame.sample(frac=1.0, random_state=3)
    assert np.allclose(
        add_tide_features(shuffled)["tide_state"].to_numpy(),
        add_tide_features(frame)["tide_state"].to_numpy(),
        equal_nan=True,
    )
