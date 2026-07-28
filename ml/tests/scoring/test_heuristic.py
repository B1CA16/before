import numpy as np
import pandas as pd

from before_surf.scoring.heuristic import HeuristicScorer


def _row(**overrides):
    base = {
        "swell_height_m": 2.0,
        "swell_period_s": 13.0,
        "offshore_component": 1.0,  # fully offshore
        "wind_speed_kmh": 10.0,
        "swell_exposure": 1.0,  # head-on
    }
    base.update(overrides)
    return pd.DataFrame([base])


def test_perfect_conditions_score_high():
    score = HeuristicScorer().score(_row()).iloc[0]
    assert score >= 8.0


def test_garbage_conditions_score_low():
    # tiny short-period swell, shadowed, strong onshore
    df = _row(
        swell_height_m=0.3,
        swell_period_s=5.0,
        offshore_component=-1.0,
        wind_speed_kmh=35.0,
        swell_exposure=0.05,
    )
    assert HeuristicScorer().score(df).iloc[0] <= 2.0


def test_shadowed_spot_is_vetoed_to_zero():
    df = _row(swell_exposure=0.0)
    assert HeuristicScorer().score(df).iloc[0] == 0.0


def test_score_monotonic_in_period():
    lo = HeuristicScorer().score(_row(swell_period_s=7.0)).iloc[0]
    hi = HeuristicScorer().score(_row(swell_period_s=13.0)).iloc[0]
    assert hi > lo


def test_score_decreases_with_onshore_wind():
    offshore = HeuristicScorer().score(_row(offshore_component=1.0, wind_speed_kmh=25.0)).iloc[0]
    onshore = HeuristicScorer().score(_row(offshore_component=-1.0, wind_speed_kmh=25.0)).iloc[0]
    assert onshore < offshore


def test_score_in_range_and_nan_propagates():
    df = _row()
    df2 = _row(offshore_component=np.nan)  # unknown orientation
    both = pd.concat([df, df2], ignore_index=True)
    scores = HeuristicScorer().score(both)
    assert 0.0 <= scores.iloc[0] <= 10.0
    assert np.isnan(scores.iloc[1])


def test_explain_returns_factor_breakdown():
    out = HeuristicScorer().explain(_row())
    assert list(out.columns) == ["size", "period", "wind", "exposure", "score"]
    assert 0.0 <= out["size"].iloc[0] <= 1.0
    assert abs(out["score"].iloc[0] - HeuristicScorer().score(_row()).iloc[0]) < 1e-9
