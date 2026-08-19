"""Training-set construction: the class boundary, the source preference, and what gets dropped.

These are label-quality tests. A bug here does not raise; it quietly produces training examples that
are wrong, and a model trained on them looks fine until it is asked to predict something real.
"""

import pandas as pd
import pytest

from before_surf.labels import (
    MIN_LABELS,
    MIN_MINORITY_SHARE,
    WORTH_IT_FROM,
    build_training_set,
    readiness,
    summarise,
)


def _row(**over):
    base = {
        "session_id": 1,
        "user_id": "user-a",
        "slug": "carcavelos",
        "orientation_deg": 205.0,
        "surfed_at": pd.Timestamp("2026-08-10T07:00:00Z"),
        "rating": 4,
        "tags": [],
        "label_source": "archive",
        "swell_height_m": 1.4,
        "swell_period_s": 11.0,
        "swell_direction_deg": 200.0,
        "wind_speed_kmh": 8.0,
        "wind_direction_deg": 20.0,
    }
    return {**base, **over}


def _rows(*dicts):
    return pd.DataFrame(list(dicts))


# --- the class boundary ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("rating", "expected"),
    [(1, False), (2, False), (3, False), (4, True), (5, True)],
)
def test_the_binary_collapse_splits_between_three_and_four(rating, expected):
    """3 is not worth it, 4 is. The exact boundary defines what the model predicts."""
    result = build_training_set(_rows(_row(rating=rating)))
    assert result.frame["worth_it"].iloc[0] == expected


def test_the_boundary_follows_the_named_constant():
    """Guards against the constant and the behaviour drifting apart."""
    below = build_training_set(_rows(_row(rating=WORTH_IT_FROM - 1)))
    at = build_training_set(_rows(_row(rating=WORTH_IT_FROM)))
    assert not below.frame["worth_it"].iloc[0]
    assert at.frame["worth_it"].iloc[0]


# --- which conditions a label is paired with ------------------------------------------------------


def test_the_source_used_is_recorded_on_every_example():
    """Without this column, measured examples could not be told from predicted ones later."""
    result = build_training_set(_rows(_row(label_source="archive"), _row(label_source="forecast")))
    assert sorted(result.frame["label_source"]) == ["archive", "forecast"]


def test_archive_is_preferred_by_the_query_not_by_python():
    """The preference lives in SQL, so assert it is actually written there.

    A Python-side sort would be easy to drop in a refactor and impossible to notice: the training
    set would still build, just paired with the wrong conditions.
    """
    from before_surf.labels import SESSION_QUERY

    normalised = " ".join(SESSION_QUERY.split())
    assert "order by case c.source when 'archive' then 0 else 1 end" in normalised
    assert "limit 1" in normalised
    # A left join, so sessions with no conditions survive to be counted rather than disappearing.
    assert "left join lateral" in normalised


# --- what gets dropped, and counted ---------------------------------------------------------------


def test_sessions_with_no_conditions_are_dropped_and_counted():
    result = build_training_set(_rows(_row(), _row(session_id=2, label_source=None)))
    assert result.size == 1
    assert result.dropped_no_conditions == 1


def test_a_spot_with_unknown_orientation_is_dropped_not_guessed():
    """Orientation drives both interaction features. Guessing it would invent the example."""
    result = build_training_set(_rows(_row(), _row(session_id=2, orientation_deg=None)))
    assert result.size == 1
    assert result.dropped_incomplete == 1


def test_missing_conditions_are_never_filled_with_zero():
    """A zero swell is a meaningful reading, so it must not stand in for an absent one."""
    result = build_training_set(_rows(_row(swell_period_s=None)))
    assert result.size == 0
    assert result.frame.empty


def test_no_sessions_yields_an_empty_set_rather_than_an_error():
    result = build_training_set(pd.DataFrame())
    assert result.size == 0
    assert summarise(result)["labels"] == 0


# --- readiness -----------------------------------------------------------------------------------


def test_features_match_what_the_scorer_consumes():
    """Training and serving derive features from the same code, so the columns must line up."""
    from before_surf.scoring.heuristic import HeuristicScorer

    result = build_training_set(_rows(_row()))
    # The scorer runs on the training frame unchanged, which would raise on a missing column.
    scores = HeuristicScorer().score(result.frame)
    assert len(scores) == 1
    assert 0.0 <= float(scores.iloc[0]) <= 10.0


def test_too_few_labels_is_not_ready_and_says_so():
    verdict = readiness(build_training_set(_rows(_row())))
    assert verdict["ready"] is False
    assert any("labels" in b for b in verdict["blockers"])


def test_a_one_sided_set_is_not_ready_even_when_large():
    """The failure mode this catches: plenty of data, all of it the same answer."""
    rows = _rows(*[_row(session_id=i, rating=5) for i in range(MIN_LABELS + 20)])
    verdict = readiness(build_training_set(rows))
    assert verdict["labels"] >= MIN_LABELS
    assert verdict["ready"] is False
    assert any("smaller class" in b for b in verdict["blockers"])


def test_enough_labels_and_a_balanced_split_is_ready():
    half = MIN_LABELS
    rows = _rows(
        *[_row(session_id=i, rating=5) for i in range(half)],
        *[_row(session_id=100 + i, rating=2) for i in range(half)],
    )
    verdict = readiness(build_training_set(rows))
    assert verdict["ready"] is True
    assert verdict["blockers"] == []
    assert verdict["minority_share"] >= MIN_MINORITY_SHARE
