import numpy as np
import pandas as pd

from before_surf.scoring.ramps import exposure_score, period_score, size_score, wind_score


def test_period_score_ramp():
    assert period_score(5.0) == 0.0  # below floor
    assert period_score(6.0) == 0.0
    assert abs(period_score(9.0) - 0.5) < 1e-9  # midpoint
    assert period_score(12.0) == 1.0
    assert period_score(16.0) == 1.0  # plateau


def test_size_score_ramp():
    assert size_score(0.2) == 0.0
    assert size_score(0.3) == 0.0
    assert abs(size_score(0.9) - 0.5) < 1e-9
    assert size_score(1.5) == 1.0
    assert size_score(3.0) == 1.0


def test_wind_score_glassy_offshore_and_onshore():
    # Light wind (0 km/h) is glassy regardless of direction -> 1.
    assert wind_score(-1.0, 0.0) == 1.0
    # Strong offshore (+1) -> onshore-ness 0 -> 1.
    assert wind_score(1.0, 40.0) == 1.0
    # Strong onshore (-1) at/above strong threshold -> 0.
    assert wind_score(-1.0, 30.0) == 0.0
    # Cross-shore (0) at strong threshold -> onshore-ness 0.5 -> 0.5.
    assert abs(wind_score(0.0, 30.0) - 0.5) < 1e-9


def test_exposure_score_passthrough_and_clip():
    assert exposure_score(0.7) == 0.7
    assert exposure_score(0.0) == 0.0


def test_ramps_are_vectorized():
    result = period_score(pd.Series([5.0, 9.0, 12.0]))
    assert isinstance(result, pd.Series)
    assert list(result) == [0.0, 0.5, 1.0]


def test_wind_score_propagates_nan():
    # Unknown orientation -> NaN offshore_component -> NaN wind score.
    assert np.isnan(wind_score(np.nan, 20.0))
