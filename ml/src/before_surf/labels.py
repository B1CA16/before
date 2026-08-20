"""Turn logged sessions into a supervised training set.

This is where the project stops being plumbing. Features were always easy to come by. The label,
"was that session any good", can only come from someone who was in the water, and everything in M7
exists to collect it.

Three decisions are baked in here, each with a reason worth keeping:

**The label is binary.** Ratings are collected 1 to 5 but trained as `rating >= 4`. A fine label
can always be collapsed and a coarse one never recovered, so the finer value is what gets stored.
Training coarse is a concession to sample size: ~100 labels across five ordinal classes is ~20 per
class, far too thin, while the same 100 split in two is workable.

**Conditions are joined, never denormalised.** A session records only where and when. Pairing it
with conditions at training time means the pairing can improve later, and it does: `archive` is
preferred over `forecast`, because the archive is what the ocean did while the forecast is what we
guessed it would do. Those differ on every overlapping hour we hold, by up to 6.25 s of period,
which is 0.625 of the period sub-score.

**Unusable rows are dropped and counted, never filled.** A session with no conditions on record, or
one at a spot whose orientation is unknown, cannot become a training example. Imputing a plausible
value would manufacture a label nobody experienced, which is worse than having one fewer.
"""

from dataclasses import dataclass

import pandas as pd
import psycopg

from before_surf.features.derive import build_features

# The rating at which a session counts as worth it. Kept as a named constant because it defines the
# class boundary: moving it silently redefines what the model is predicting.
WORTH_IT_FROM = 4

# Readiness thresholds for attempting the ML milestone, stated up front so "do we have enough
# data" becomes a measurement rather than an argument. Both matter: 200 labels that are 97% one
# class teach a model to answer "yes" and nothing else.
MIN_LABELS = 80
MIN_MINORITY_SHARE = 0.25

FEATURE_COLUMNS = [
    "swell_height_m",
    "swell_period_s",
    "wind_speed_kmh",
    "offshore_component",
    "swell_exposure",
]

# LEFT JOIN LATERAL rather than an inner join: sessions with no conditions must still come back, or
# they would vanish from the counts and we could never report how many were lost.
SESSION_QUERY = """
select ss.id as session_id, ss.user_id, sp.slug, sp.orientation_deg,
       ss.surfed_at, ss.rating, ss.tags,
       co.source as label_source,
       co.swell_height_m, co.swell_period_s, co.swell_direction_deg,
       co.wind_speed_kmh, co.wind_direction_deg
from surf_sessions ss
join spots sp on sp.id = ss.spot_id
left join lateral (
    select c.source, c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
           c.wind_speed_kmh, c.wind_direction_deg
    from conditions c
    where c.spot_id = ss.spot_id
      and c.observed_at = date_trunc('hour', ss.surfed_at)
    order by case c.source when 'archive' then 0 else 1 end
    limit 1
) co on true
order by ss.surfed_at
"""


@dataclass(frozen=True)
class TrainingSet:
    """Usable examples, plus an honest account of what did not make it."""

    frame: pd.DataFrame
    dropped_no_conditions: int
    dropped_incomplete: int

    @property
    def size(self) -> int:
        return len(self.frame)


def load_session_rows(database_url: str) -> pd.DataFrame:
    with psycopg.connect(database_url) as conn:
        cur = conn.execute(SESSION_QUERY)
        rows = cur.fetchall()
        columns = [desc.name for desc in cur.description]
    return pd.DataFrame(rows, columns=columns)


def build_training_set(rows: pd.DataFrame) -> TrainingSet:
    """Shape raw session rows into features plus a binary label.

    Pure, so it can be tested without a database. Feature derivation goes through the same
    `build_features` the API serves with, which is the whole reason `ml/` is an installable package:
    were training and serving to compute features separately they would drift, and the model would
    be scored on inputs it never saw in training.
    """
    if rows.empty:
        empty = pd.DataFrame(columns=[*FEATURE_COLUMNS, "worth_it", "label_source"])
        return TrainingSet(frame=empty, dropped_no_conditions=0, dropped_incomplete=0)

    with_conditions = rows[rows["label_source"].notna()]
    dropped_no_conditions = len(rows) - len(with_conditions)

    featured = build_features(with_conditions)
    needed = [*FEATURE_COLUMNS, "rating"]
    usable = featured.dropna(subset=needed)
    dropped_incomplete = len(featured) - len(usable)

    frame = usable.copy()
    frame["worth_it"] = frame["rating"] >= WORTH_IT_FROM
    return TrainingSet(
        frame=frame,
        dropped_no_conditions=dropped_no_conditions,
        dropped_incomplete=dropped_incomplete,
    )


def load_training_set(database_url: str) -> TrainingSet:
    return build_training_set(load_session_rows(database_url))


def summarise(training: TrainingSet) -> dict:
    """Everything needed to judge whether the label set can support a model yet."""
    frame = training.frame
    n = len(frame)
    positives = int(frame["worth_it"].sum()) if n else 0
    minority = min(positives, n - positives) / n if n else 0.0
    return {
        "labels": n,
        "worth_it": positives,
        "not_worth_it": n - positives,
        "minority_share": round(minority, 3),
        "from_archive": int((frame["label_source"] == "archive").sum()) if n else 0,
        "from_forecast": int((frame["label_source"] == "forecast").sum()) if n else 0,
        "distinct_spots": int(frame["slug"].nunique()) if n else 0,
        "distinct_users": int(frame["user_id"].nunique()) if n else 0,
        "dropped_no_conditions": training.dropped_no_conditions,
        "dropped_incomplete": training.dropped_incomplete,
    }


def readiness(training: TrainingSet) -> dict:
    """Is there enough to attempt the model? Reported as reasons, so a "no" says what is missing."""
    stats = summarise(training)
    blockers = []
    if stats["labels"] < MIN_LABELS:
        blockers.append(f"{stats['labels']} labels, want at least {MIN_LABELS}")
    if stats["labels"] and stats["minority_share"] < MIN_MINORITY_SHARE:
        blockers.append(
            f"smaller class is {stats['minority_share']:.0%} of the set, "
            f"want at least {MIN_MINORITY_SHARE:.0%}"
        )
    return {"ready": not blockers, "blockers": blockers, **stats}
