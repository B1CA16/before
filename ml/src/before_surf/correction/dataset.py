"""The forecast-correction training set: what was predicted, against what was later recorded.

The target is `archive_wind - forecast_wind`, the amount the forecast was wrong by. Predicting the
error rather than the wind itself is deliberate: it makes "do nothing" a prediction of exactly zero,
so the model is measured against the thing it is supposed to improve on rather than against the
variance of the wind, which is large and not its achievement.

What this model actually learns is worth stating here as well as in the ADR. Open-Meteo's archive is
ERA5 reanalysis, not buoy measurements. So the target is the gap between a forecast model and a
reanalysis model, which is genuinely useful (the reanalysis assimilates observations the forecast
could not have known) but is **not** the gap between a forecast and reality.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd
import psycopg

# Filtered and joined in SQL rather than in pandas, and that is not a style preference: the
# first version pulled the joined rows into Python and had still not returned after ten
# minutes, while the same question asked in SQL answers in seconds. The join spans roughly a
# million rows.
PAIRS_QUERY = """
select
    f.observed_at,
    s.slug                as spot,
    s.orientation_deg     as orientation_deg,
    f.wind_speed_kmh      as f_wind_speed_kmh,
    f.wind_direction_deg  as f_wind_direction_deg,
    f.swell_height_m      as f_swell_height_m,
    f.swell_period_s      as f_swell_period_s,
    f.swell_direction_deg as f_swell_direction_deg,
    a.wind_speed_kmh      as a_wind_speed_kmh
from conditions f
join conditions a
  on a.spot_id = f.spot_id
 and a.observed_at = f.observed_at
 and a.source = 'archive'
join spots s on s.id = f.spot_id
where f.source = 'forecast'
  and f.wind_speed_kmh is not null
  and a.wind_speed_kmh is not null
order by f.observed_at
"""

# Hours dropped either side of the train/test boundary.
#
# Weather is autocorrelated: a system sitting over the coast produces similar errors for
# hours. With the boundary butted straight up, the last training hour and the first test hour
# are the same weather, and the test score flatters itself. Six hours is comfortably longer
# than the few-hour scale of the systems this coast sees.
EMBARGO_HOURS = 6

# Share of the timeline kept for testing. Held as a fraction of the *time span* rather than of the
# rows, because rows are not the unit that matters here.
TEST_FRACTION = 0.25


@dataclass(frozen=True)
class Split:
    """A train and test frame, plus the boundary that produced them."""

    train: pd.DataFrame
    test: pd.DataFrame
    cutoff: pd.Timestamp
    embargoed_rows: int

    @property
    def train_hours(self) -> int:
        return self.train["observed_at"].nunique() if len(self.train) else 0

    @property
    def test_hours(self) -> int:
        return self.test["observed_at"].nunique() if len(self.test) else 0


def load_pairs(database_url: str) -> pd.DataFrame:
    with psycopg.connect(database_url) as conn:
        cur = conn.execute(PAIRS_QUERY)
        rows = cur.fetchall()
        columns = [desc.name for desc in cur.description]
    return pd.DataFrame(rows, columns=columns)


def build_features(pairs: pd.DataFrame) -> pd.DataFrame:
    """Add the derived columns and the target. Pure, so it is testable without a database.

    Every feature here has to be knowable at prediction time, when only the forecast exists.
    That rules out anything from the archive row except the target itself. It is the easiest way
    to leak in a problem shaped like this one, and it would produce a model that looks excellent
    and is useless.
    """
    if pairs.empty:
        return pairs.assign(error_kmh=pd.Series(dtype="float64"))

    frame = pairs.copy()
    frame["observed_at"] = pd.to_datetime(frame["observed_at"], utc=True)

    # Numeric coercion for the same reason as in features/derive.py: a wholly-null column arrives as
    # object dtype and the arithmetic below silently produces objects rather than floats.
    for column in [
        "orientation_deg",
        "f_wind_speed_kmh",
        "f_wind_direction_deg",
        "f_swell_height_m",
        "f_swell_period_s",
        "f_swell_direction_deg",
        "a_wind_speed_kmh",
    ]:
        frame[column] = pd.to_numeric(frame[column], errors="coerce")

    # The target: how far out the forecast was. Positive means the archive was windier.
    frame["error_kmh"] = frame["a_wind_speed_kmh"] - frame["f_wind_speed_kmh"]

    # A missing wind reading on either side has no target, so the row goes. The tempting
    # alternative, filling the gap with zero, would teach the model that those hours needed no
    # correction, which is a claim the data never made. The SQL already excludes them; this
    # repeats it here so the function is safe on any frame, not only on one the query produced.
    frame = frame[frame["error_kmh"].notna()].reset_index(drop=True)

    # Hour of day, which the exploratory pass showed carries the strongest signal: the bias
    # runs from +4.62 km/h at midnight to +0.61 at 16:00. Encoded as sine and cosine so 23:00
    # and 00:00 are adjacent; as a plain integer the model would have to learn that 0 and 23
    # are neighbours, which a tree can only do by splitting the range into pieces.
    hour = frame["observed_at"].dt.hour
    frame["hour"] = hour
    radians = hour * (2 * np.pi / 24)
    frame["hour_sin"] = np.sin(radians)
    frame["hour_cos"] = np.cos(radians)
    frame["month"] = frame["observed_at"].dt.month

    # Wind relative to the direction the spot faces, which is what the scorer already cares
    # about and is more meaningful than a compass bearing on its own.
    offset = (frame["f_wind_direction_deg"] - frame["orientation_deg"]).abs() % 360
    frame["wind_offshore_deg"] = offset.where(offset <= 180, 360 - offset)

    return frame


def split_by_time(
    frame: pd.DataFrame,
    test_fraction: float = TEST_FRACTION,
    embargo_hours: int = EMBARGO_HOURS,
) -> Split:
    """Split on the clock, never on the row.

    A random split is a lie for this data. The 92 spots share weather, so 09:00 at Carcavelos
    and 09:00 at Coxos are close to the same example; put one in train and the other in test and
    the model is being asked to recall, not to predict. Worse, the same spot's 09:00 and 10:00
    are nearly the same too. A random split would report an excellent score for a lookup
    table.

    So: train on the earlier part of the timeline, test on the later part, and throw away the hours
    straddling the boundary so no single weather system appears on both sides.

    Note what this means for confidence. There are roughly 816 distinct hours behind 75,000
    rows, so the effective sample size is nearer the number of hours than the number of rows,
    and a difference in MAE has to be large to mean anything.
    """
    if frame.empty:
        empty = frame.iloc[0:0]
        return Split(train=empty, test=empty, cutoff=pd.NaT, embargoed_rows=0)

    times = frame["observed_at"]
    start, end = times.min(), times.max()
    cutoff = start + (end - start) * (1 - test_fraction)
    embargo = pd.Timedelta(hours=embargo_hours)

    train = frame[times < cutoff - embargo]
    test = frame[times >= cutoff]
    embargoed = len(frame) - len(train) - len(test)

    return Split(
        train=train.reset_index(drop=True),
        test=test.reset_index(drop=True),
        cutoff=cutoff,
        embargoed_rows=embargoed,
    )


def load_split(database_url: str) -> Split:
    return split_by_time(build_features(load_pairs(database_url)))
