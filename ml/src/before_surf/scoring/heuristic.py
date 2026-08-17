"""HeuristicScorer: transparent v0 BeFORE score from calibrated sub-scores.

Sub-scores in [0,1] are combined by their HARMONIC mean (x10). Like the geometric mean it is
conjunctive, so any factor at zero still vetoes the whole score (a shadowed spot really does get
no waves), but it punishes a weak link far harder. That matters: with four factors a geometric
mean takes a fourth root, so a 0.2 period factor beside three 0.9s still scored about 6.2, which
is far too generous. The harmonic mean returns 3.7 for the same conditions.

NaN propagates, so a spot with unknown orientation reports an unknown score rather than a guess.

Combination and ramps were chosen against a year of archive data; see
ml/notebooks/calibrate_heuristic.py for the comparison and the distributions.
"""

import numpy as np
import pandas as pd

from before_surf.scoring.base import Scorer
from before_surf.scoring.ramps import exposure_score, period_score, size_score, wind_score


class HeuristicScorer(Scorer):
    def __init__(
        self,
        *,
        min_period_s: float = 3.0,
        good_period_s: float = 13.0,
        min_height_m: float = 0.2,
        good_height_m: float = 1.6,
        strong_wind_kmh: float = 30.0,
    ):
        self.min_period_s = min_period_s
        self.good_period_s = good_period_s
        self.min_height_m = min_height_m
        self.good_height_m = good_height_m
        self.strong_wind_kmh = strong_wind_kmh

    def _sub_scores(self, features: pd.DataFrame) -> dict[str, pd.Series]:
        return {
            "size": size_score(features["swell_height_m"], self.min_height_m, self.good_height_m),
            "period": period_score(
                features["swell_period_s"], self.min_period_s, self.good_period_s
            ),
            "wind": wind_score(
                features["offshore_component"], features["wind_speed_kmh"], self.strong_wind_kmh
            ),
            "exposure": exposure_score(features["swell_exposure"]),
        }

    def score(self, features: pd.DataFrame) -> pd.Series:
        sub = self._sub_scores(features)
        # Harmonic mean: n / sum(1/x). A zero factor makes one term infinite, so the mean goes to
        # zero and the veto survives. NaN propagates untouched.
        with np.errstate(divide="ignore"):
            reciprocal_sum = sum(1.0 / s for s in sub.values())
        return 10.0 * len(sub) / reciprocal_sum

    def explain(self, features: pd.DataFrame) -> pd.DataFrame:
        sub = self._sub_scores(features)
        out = pd.DataFrame(sub, index=features.index)
        out["score"] = self.score(features)
        return out
