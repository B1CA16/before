"""HeuristicScorer: transparent v0 BeFORE score from EDA-calibrated sub-scores.

Sub-scores in [0,1] are combined by geometric mean (x10). Geometric mean is conjunctive:
any near-zero factor (shadowed spot, strong onshore, no size) vetoes the score, while
good-all-round conditions score high. NaN propagates (unknown orientation -> unknown score).
"""

import numpy as np
import pandas as pd

from before_surf.scoring.base import Scorer
from before_surf.scoring.ramps import exposure_score, period_score, size_score, wind_score


class HeuristicScorer(Scorer):
    def __init__(
        self,
        *,
        min_period_s: float = 6.0,
        good_period_s: float = 12.0,
        min_height_m: float = 0.3,
        good_height_m: float = 1.5,
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
        # geometric mean = exp(mean(log)); log(0) -> -inf -> exp -> 0 (veto); NaN propagates.
        with np.errstate(divide="ignore"):
            log_mean = sum(np.log(s) for s in sub.values()) / len(sub)
        return 10.0 * np.exp(log_mean)

    def explain(self, features: pd.DataFrame) -> pd.DataFrame:
        sub = self._sub_scores(features)
        out = pd.DataFrame(sub, index=features.index)
        out["score"] = self.score(features)
        return out
