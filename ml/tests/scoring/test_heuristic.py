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


def test_poor_conditions_stay_ranked_rather_than_collapsing():
    """The bug this guards against: on 2026-08-17 every scored spot on the coast read exactly 0.0.

    A 5.7 s swell fell below the old 6 s period floor, and the conjunctive mean turned that single
    zero into a zero overall, so 85 spots shared one value and the ranking carried no information.
    Poor conditions must score low but remain ordered.
    """
    poor = _row(
        swell_height_m=1.4,
        swell_period_s=5.7,
        offshore_component=-0.26,
        wind_speed_kmh=2.8,
        swell_exposure=0.26,
    )
    worse = _row(
        swell_height_m=1.0,
        swell_period_s=5.0,
        offshore_component=-0.26,
        wind_speed_kmh=2.8,
        swell_exposure=0.26,
    )
    scorer = HeuristicScorer()
    poor_score = scorer.score(poor).iloc[0]
    worse_score = scorer.score(worse).iloc[0]

    assert poor_score > 0, "a surfable but poor day must not read as a hard zero"
    assert poor_score < 6, "and it must not read as decent either"
    assert worse_score < poor_score, "worse conditions must rank below poor ones"


def test_a_true_veto_still_returns_zero():
    """Softening the floors must not cost us the genuine vetoes."""
    scorer = HeuristicScorer()
    # A beach facing away from the swell receives no energy at all.
    assert scorer.score(_row(swell_exposure=0.0)).iloc[0] == 0.0
    # A gale straight onshore ruins any swell.
    blown_out = _row(offshore_component=-1.0, wind_speed_kmh=45.0)
    assert scorer.score(blown_out).iloc[0] == 0.0


def test_explain_returns_factor_breakdown():
    out = HeuristicScorer().explain(_row())
    assert list(out.columns) == ["size", "period", "wind", "exposure", "score"]
    assert 0.0 <= out["size"].iloc[0] <= 1.0
    assert abs(out["score"].iloc[0] - HeuristicScorer().score(_row()).iloc[0]) < 1e-9
