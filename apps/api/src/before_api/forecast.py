"""Shape scored forecast rows into JSON-ready dicts (NaN -> None, rounded)."""

import pandas as pd

from before_surf.features.derive import add_tide_features, build_features
from before_surf.scoring.heuristic import HeuristicScorer


def _clean(value) -> float | None:
    return None if pd.isna(value) else round(float(value), 2)


def build_conditions_row(df: pd.DataFrame, scorer: HeuristicScorer) -> dict:
    """Shape a single conditions row (one spot, one hour) for the session-logging form.

    `offshore_component` comes from the features frame, not from explain(), which returns only the
    four sub-scores and the total.
    """
    feats = build_features(df)
    explained = scorer.explain(feats)
    row = df.iloc[0]
    return {
        "observed_at": row["observed_at"],
        "source": row["source"],
        "score": _clean(explained["score"].iloc[0]),
        "swell_height_m": _clean(row["swell_height_m"]),
        "swell_period_s": _clean(row["swell_period_s"]),
        "wind_speed_kmh": _clean(row["wind_speed_kmh"]),
        "offshore_component": _clean(feats["offshore_component"].iloc[0]),
        "sea_level_m": _clean(row["sea_level_m"]) if "sea_level_m" in row else None,
    }


def build_score_rows(df: pd.DataFrame, scorer: HeuristicScorer) -> list[dict]:
    if df.empty:
        return []
    feats = build_features(df)
    scores = scorer.score(feats)
    return [
        {
            "slug": df["slug"].iloc[i],
            "score": _clean(scores.iloc[i]),
            "swell_height_m": _clean(df["swell_height_m"].iloc[i]),
            "swell_period_s": _clean(df["swell_period_s"].iloc[i]),
            "wind_speed_kmh": _clean(df["wind_speed_kmh"].iloc[i]),
            "offshore_component": _clean(feats["offshore_component"].iloc[i]),
            "swell_direction_deg": _clean(df["swell_direction_deg"].iloc[i]),
            "wind_direction_deg": _clean(df["wind_direction_deg"].iloc[i]),
            "sea_level_m": (
                _clean(df["sea_level_m"].iloc[i]) if "sea_level_m" in df.columns else None
            ),
        }
        for i in range(len(df))
    ]


def build_forecast_rows(df: pd.DataFrame, scorer: HeuristicScorer) -> list[dict]:
    """Score every forecast hour for one spot, and add tide.

    This is the one endpoint that can derive tide state and direction, because it holds a whole
    ordered series for one spot. /scores has one row per spot, so it returns the raw level only.
    """
    ordered = add_tide_features(df)
    explained = build_features(ordered).pipe(scorer.explain)
    df = ordered
    rows: list[dict] = []
    for i in range(len(df)):
        rising = df["tide_rising"].iloc[i]
        rows.append(
            {
                "observed_at": df["observed_at"].iloc[i],
                "sea_level_m": _clean(df["sea_level_m"].iloc[i]) if "sea_level_m" in df else None,
                "tide_state": _clean(df["tide_state"].iloc[i]),
                "tide_rising": None if pd.isna(rising) else bool(rising),
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
