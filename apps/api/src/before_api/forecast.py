"""Shape scored forecast rows into JSON-ready dicts (NaN -> None, rounded)."""

import pandas as pd

from before_surf.features.derive import build_features
from before_surf.scoring.heuristic import HeuristicScorer


def _clean(value) -> float | None:
    return None if pd.isna(value) else round(float(value), 2)


def build_score_rows(df: pd.DataFrame, scorer: HeuristicScorer) -> list[dict]:
    if df.empty:
        return []
    scores = build_features(df).pipe(scorer.score)
    return [{"slug": df["slug"].iloc[i], "score": _clean(scores.iloc[i])} for i in range(len(df))]


def build_forecast_rows(df: pd.DataFrame, scorer: HeuristicScorer) -> list[dict]:
    explained = build_features(df).pipe(scorer.explain)
    rows: list[dict] = []
    for i in range(len(df)):
        rows.append(
            {
                "observed_at": df["observed_at"].iloc[i],
                "score": _clean(explained["score"].iloc[i]),
                "size": _clean(explained["size"].iloc[i]),
                "period": _clean(explained["period"].iloc[i]),
                "wind": _clean(explained["wind"].iloc[i]),
                "exposure": _clean(explained["exposure"].iloc[i]),
                "swell_height_m": _clean(df["swell_height_m"].iloc[i]),
                "swell_period_s": _clean(df["swell_period_s"].iloc[i]),
                "wind_speed_kmh": _clean(df["wind_speed_kmh"].iloc[i]),
            }
        )
    return rows
