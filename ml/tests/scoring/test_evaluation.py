import pandas as pd

from before_surf.scoring.base import Scorer
from before_surf.scoring.evaluation import per_spot_mean, score_distribution


class StubScorer(Scorer):
    """Returns a fixed score per row from a 'stub_score' column, for deterministic tests."""

    def score(self, features: pd.DataFrame) -> pd.Series:
        return features["stub_score"].astype(float)


def test_score_distribution_summary():
    df = pd.DataFrame({"stub_score": [0.0, 5.0, 7.0, 8.0, 10.0]})
    dist = score_distribution(StubScorer(), df)
    assert dist["count"] == 5
    assert dist["median"] == 7.0
    assert abs(dist["frac_good"] - 0.6) < 1e-9  # 3 of 5 are >= 7


def test_per_spot_mean_sorted_desc():
    df = pd.DataFrame({"slug": ["a", "a", "b"], "stub_score": [8.0, 6.0, 2.0]})
    means = per_spot_mean(StubScorer(), df)
    assert means.index[0] == "a"  # a=7.0 ranks above b=2.0
    assert abs(means.loc["a"] - 7.0) < 1e-9
