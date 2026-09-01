"""The shipped wind correction: twenty-four numbers, and the discipline around them.

Milestone 9 trained a gradient booster that beat this table by 0.6 percentage points of band words
on the held-out weeks. The table is what ships anyway, and the reasoning is recorded in ADR-0009:
the model's edge is smaller than the fold-to-fold instability measured alongside it, it would put
scikit-learn and scipy on a 512 MB instance for that edge, and a table can tell a surfer *why* the
number moved. A booster cannot.

Two things here are less obvious than the arithmetic.

**The table is keyed by local hour, not UTC.** The bias being corrected is diurnal: it peaks
overnight and nearly vanishes by late afternoon, which is a fact about the sun, not about the prime
meridian. All 34 days of training data are summer, so UTC hour and local hour differ by a constant
+1 and the distinction is invisible right now. It stops being invisible the moment the clocks go
back, when a UTC-keyed table would apply the 04:00 correction at 03:00 for the whole winter. That
would be a silent, seasonal, hard-to-find wrongness, so it is designed out rather than noted.

**The shipped table is fitted on every paired row, not on the training weeks.** The split existed to
produce an honest *estimate* of how well this generalises. Having got the estimate, throwing away a
quarter of the evidence before shipping would be superstition. The reported score stays the held-out
one; only the coefficients use everything.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "wind_correction.json"

# The bias is diurnal in local solar time. See the module docstring.
TIMEZONE = "Europe/Lisbon"

# An hour of the day needs at least this many observations before its own median is trusted over the
# coast-wide one. Same reasoning as the baselines in evaluate.py: a median of a handful of rows is
# noise, and shipping noise as a correction is worse than shipping nothing.
MIN_HOUR_ROWS = 30


@dataclass(frozen=True)
class WindCorrection:
    """A correction in km/h per local hour of day, plus what to do for hours it does not know."""

    by_local_hour: dict[int, float]
    fallback_kmh: float
    metadata: dict = field(default_factory=dict)
    timezone: str = TIMEZONE

    def lookup(self, timestamps: pd.Series) -> pd.Series:
        """The nominal correction for each timestamp, before any clamping."""
        moments = pd.to_datetime(timestamps, utc=True).dt.tz_convert(self.timezone)
        hours = moments.dt.hour
        return hours.map(self.by_local_hour).astype("float64").fillna(self.fallback_kmh)

    def apply(
        self,
        frame: pd.DataFrame,
        time_column: str = "observed_at",
        wind_column: str = "wind_speed_kmh",
        source_column: str = "source",
    ) -> pd.DataFrame:
        """Return a copy with the forecast wind corrected and the adjustment recorded beside it.

        **Only forecast rows are touched.** The correction was learned as the gap between the
        forecast and the ERA5 archive, so applying it to an archive row would add that gap to the
        very thing it was measured against and push a recorded hour away from what was recorded.
        `/conditions-at` prefers archive rows when it has them, so this is a live case, not a
        hypothetical. When the frame has no source column the caller has already filtered, and
        every row is corrected.

        The adjustment column holds what was *actually* applied, which is not always the table's
        value: a +3 km/h correction on a forecast of 1 km/h would imply a negative wind, so the
        result is clamped at zero and the reported adjustment shrinks to match. Reporting the
        nominal figure there would have the app claim an adjustment it did not make.

        A missing wind stays missing and reports no adjustment, rather than becoming a wind of
        exactly the correction.
        """
        out = frame.copy()
        if frame.empty or wind_column not in frame.columns:
            out["wind_correction_kmh"] = pd.Series(dtype="float64", index=frame.index)
            return out

        original = pd.to_numeric(frame[wind_column], errors="coerce")
        nominal = self.lookup(frame[time_column])
        corrected = (original + nominal).clip(lower=0.0)

        # Rows left alone keep their wind and report no adjustment at all. Reporting a 0.0 here
        # would be a different claim: "we looked and decided nothing was needed", when the truth is
        # that an archive reading is not the kind of thing this corrects.
        if source_column in frame.columns:
            untouched = frame[source_column] != "forecast"
            corrected = corrected.mask(untouched, original)
            applied = (corrected - original).mask(untouched)
        else:
            applied = corrected - original

        out[wind_column] = corrected
        out["wind_correction_kmh"] = applied.where(original.notna())
        return out

    def to_json(self) -> str:
        return json.dumps(
            {
                "timezone": self.timezone,
                "fallback_kmh": self.fallback_kmh,
                "by_local_hour": {str(hour): value for hour, value in self.by_local_hour.items()},
                "metadata": self.metadata,
            },
            indent=2,
            sort_keys=True,
        )

    @classmethod
    def from_json(cls, text: str) -> WindCorrection:
        raw = json.loads(text)
        return cls(
            by_local_hour={int(hour): float(v) for hour, v in raw["by_local_hour"].items()},
            fallback_kmh=float(raw["fallback_kmh"]),
            metadata=raw.get("metadata", {}),
            timezone=raw.get("timezone", TIMEZONE),
        )


def fit_correction(pairs: pd.DataFrame, min_rows: int = MIN_HOUR_ROWS) -> WindCorrection:
    """Fit the table from a frame of paired rows carrying `observed_at` and `error_kmh`.

    The median, not the mean, because MAE is the metric and the median is the constant that
    minimises it. Task 2 measured the difference at 2.390 against 2.427.
    """
    moments = pd.to_datetime(pairs["observed_at"], utc=True).dt.tz_convert(TIMEZONE)
    grouped = pairs.groupby(moments.dt.hour)["error_kmh"]
    medians = grouped.median()
    trusted = medians[grouped.size() >= min_rows]
    return WindCorrection(
        by_local_hour={int(hour): round(float(v), 4) for hour, v in trusted.items()},
        fallback_kmh=round(float(pairs["error_kmh"].median()), 4),
    )


def load_correction(path: Path | None = None) -> WindCorrection | None:
    """Load the shipped table, or None if it is not there.

    None is a supported state, not an error. A missing artefact means the app serves the raw
    forecast, which is exactly what it did before this milestone: a degraded feature, not an
    outage. The same discipline as the rest of the app.
    """
    path = path or DEFAULT_PATH
    try:
        return WindCorrection.from_json(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, KeyError):
        return None
