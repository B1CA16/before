import numpy as np
import pandas as pd

from before_surf.features.derive import build_features, offshore_component, swell_exposure


def test_offshore_component_onshore_and_offshore():
    # Beach faces 270 (west). Wind FROM 270 (off the sea) is onshore -> -1.
    assert offshore_component(270.0, 270.0) == -1.0
    # Wind FROM 90 (off the land) is offshore -> +1.
    assert abs(offshore_component(90.0, 270.0) - 1.0) < 1e-9
    # Cross-shore -> ~0.
    assert abs(offshore_component(180.0, 270.0)) < 1e-9


def test_swell_exposure_head_on_shadow_and_oblique():
    # Swell FROM 270 hitting a 270-facing beach is head-on -> 1.
    assert abs(swell_exposure(270.0, 270.0) - 1.0) < 1e-9
    # Swell from behind (90) is shadowed -> clamped to 0.
    assert swell_exposure(90.0, 270.0) == 0.0
    # Oblique -> between 0 and 1.
    assert 0.0 < swell_exposure(315.0, 270.0) < 1.0


def test_primitives_are_vectorized_over_series():
    wind = pd.Series([270.0, 90.0])
    orient = pd.Series([270.0, 270.0])
    result = offshore_component(wind, orient)
    assert isinstance(result, pd.Series)
    assert len(result) == 2
    assert result.iloc[0] == -1.0
    assert abs(result.iloc[1] - 1.0) < 1e-9


def test_build_features_adds_columns_and_propagates_nan():
    df = pd.DataFrame(
        {
            "wind_direction_deg": [90.0, 270.0],
            "swell_direction_deg": [270.0, 270.0],
            "orientation_deg": [270.0, np.nan],  # second spot has unknown orientation
        }
    )
    out = build_features(df)
    # original columns preserved, new ones added
    assert "offshore_component" in out.columns
    assert "swell_exposure" in out.columns
    assert abs(out["offshore_component"].iloc[0] - 1.0) < 1e-9
    assert abs(out["swell_exposure"].iloc[0] - 1.0) < 1e-9
    # unknown orientation -> NaN feature, never fabricated
    assert np.isnan(out["offshore_component"].iloc[1])
    # input is not mutated
    assert "offshore_component" not in df.columns


def test_a_single_row_with_unknown_orientation_yields_nan_not_a_crash():
    """Regression: this 500'd every spot page for a spot with no orientation.

    A column that is entirely null in the frame arrives as object dtype holding None, and numpy trig
    rejects object dtype rather than propagating NaN. It never showed on the 92-row /scores frame,
    where real floats force float64, so only the per-spot path was affected.
    """
    one = pd.DataFrame(
        [
            {
                "orientation_deg": None,
                "wind_direction_deg": 20.0,
                "swell_direction_deg": 310.0,
                "swell_height_m": 1.2,
                "swell_period_s": 9.0,
                "wind_speed_kmh": 10.0,
            }
        ]
    )
    out = build_features(one)
    assert pd.isna(out["offshore_component"].iloc[0])
    assert pd.isna(out["swell_exposure"].iloc[0])


def test_direction_columns_arriving_as_strings_are_coerced():
    """Whatever the driver hands us, these are numbers or they are nothing."""
    frame = pd.DataFrame(
        [
            {
                "orientation_deg": "300",
                "wind_direction_deg": "20",
                "swell_direction_deg": "not a number",
            }
        ]
    )
    out = build_features(frame)
    assert not pd.isna(out["offshore_component"].iloc[0])
    assert pd.isna(out["swell_exposure"].iloc[0])
