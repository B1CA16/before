import numpy as np
import pandas as pd

from before_surf.scoring.ramps import exposure_score, period_score, size_score, wind_score

# The ramp SHAPE is tested with explicit thresholds, so recalibrating the defaults cannot break
# these. The calibrated defaults are then pinned separately, so changing them is a deliberate act.


def test_ramp_shape_is_linear_between_floor_and_good():
    assert period_score(4.0, 5.0, 15.0) == 0.0  # below the floor
    assert period_score(5.0, 5.0, 15.0) == 0.0  # at the floor
    assert abs(period_score(10.0, 5.0, 15.0) - 0.5) < 1e-9  # midpoint
    assert period_score(15.0, 5.0, 15.0) == 1.0  # at good
    assert period_score(20.0, 5.0, 15.0) == 1.0  # plateau above


def test_size_ramp_shape():
    assert size_score(0.1, 0.5, 2.5) == 0.0
    assert abs(size_score(1.5, 0.5, 2.5) - 0.5) < 1e-9
    assert size_score(2.5, 0.5, 2.5) == 1.0
    assert size_score(4.0, 0.5, 2.5) == 1.0


def test_calibrated_defaults():
    """Pins the calibration chosen in ml/notebooks/calibrate_heuristic.py.

    The floors sit where conditions become unsurfable, not where they become good. An earlier
    calibration floored period at 6 s, which made a merely poor 5.7 s swell score a hard zero and,
    through the conjunctive mean, dragged every spot to exactly 0.0.
    """
    assert period_score(3.0) == 0.0  # 3 s ripple is not surfable
    assert period_score(13.0) == 1.0  # 13 s is a proper groundswell
    assert 0.2 < period_score(5.7) < 0.4  # poor, but ranked rather than vetoed
    assert size_score(0.2) == 0.0
    assert size_score(1.6) == 1.0
    assert 0.8 < size_score(1.4) < 1.0


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
    result = period_score(pd.Series([2.0, 8.0, 14.0]))
    assert isinstance(result, pd.Series)
    assert result.iloc[0] == 0.0
    assert 0.0 < result.iloc[1] < 1.0
    assert result.iloc[2] == 1.0


def test_wind_score_propagates_nan():
    # Unknown orientation -> NaN offshore_component -> NaN wind score.
    assert np.isnan(wind_score(np.nan, 20.0))
