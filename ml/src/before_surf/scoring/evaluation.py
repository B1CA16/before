"""Scorer-agnostic evaluation: works for any Scorer. No label-based metrics yet (no labels);
those arrive in M7. For now: score distribution and per-spot behavior for face validity."""

import pandas as pd

from before_surf.scoring.base import Scorer

GOOD_THRESHOLD = 7.0


def score_distribution(scorer: Scorer, features: pd.DataFrame) -> dict:
    scores = scorer.score(features).dropna()
    return {
        "count": int(scores.count()),
        "mean": float(scores.mean()),
        "p10": float(scores.quantile(0.10)),
        "median": float(scores.median()),
        "p90": float(scores.quantile(0.90)),
        "frac_good": float((scores >= GOOD_THRESHOLD).mean()),
    }


def per_spot_mean(scorer: Scorer, features: pd.DataFrame, spot_col: str = "slug") -> pd.Series:
    scored = features.assign(_score=scorer.score(features))
    return scored.groupby(spot_col)["_score"].mean().sort_values(ascending=False)
