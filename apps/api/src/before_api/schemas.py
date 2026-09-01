"""Pydantic request and response models for the API."""

from datetime import UTC, datetime, timedelta
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

# Must stay identical to the CHECK constraint in the create_surf_sessions migration. A test asserts
# that, because a tag the database rejects would surface here as an opaque 500.
SESSION_TAGS = ("crowded", "too_small", "too_big", "blown_out", "good_shape")
SessionTag = Literal["crowded", "too_small", "too_big", "blown_out", "good_shape"]

# Tolerance for a client whose clock runs slightly fast, so a legitimate "just now" is not rejected.
_FUTURE_SKEW = timedelta(minutes=5)


class SpotOut(BaseModel):
    slug: str
    name: str
    region: str
    latitude: float
    longitude: float
    orientation_deg: float | None


class ScoreOut(BaseModel):
    slug: str
    observed_at: datetime | None = None
    score: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    wind_speed_kmh: float | None
    #: How much was added to the published forecast wind, in km/h. Null when no correction
    #: was applied: an archive reading, a missing wind, or no artefact deployed.
    wind_correction_kmh: float | None = None
    offshore_component: float | None
    # The raw bearings, so the UI can draw the geometry the score is built from.
    swell_direction_deg: float | None
    wind_direction_deg: float | None
    # Tide height only: state and direction need neighbouring hours, which this endpoint lacks.
    sea_level_m: float | None = None


class Readiness(BaseModel):
    """The keep-warm probe's answer: did the real path work, in as few bytes as possible."""

    ok: bool
    spots: int
    scored: int
    observed_at: datetime | None = None


class SpotWithScore(BaseModel):
    """One spot and its current reading, so a server-rendered page needs a single request."""

    spot: SpotOut
    now: ScoreOut | None


class ForecastHour(BaseModel):
    observed_at: datetime
    score: float | None
    sea_level_m: float | None = None
    #: 0 at low water, 1 at high. Normalised so it means the same at any spot and any tidal range.
    tide_state: float | None = None
    tide_rising: bool | None = None
    size: float | None
    period: float | None
    wind: float | None
    exposure: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    wind_speed_kmh: float | None
    #: How much was added to the published forecast wind, in km/h. Null when no correction
    #: was applied: an archive reading, a missing wind, or no artefact deployed.
    wind_correction_kmh: float | None = None


class ConditionsAt(BaseModel):
    """What we have on record for one spot at one past hour, shown while logging a session.

    `source` is surfaced rather than hidden because it changes what the reading means: `archive` is
    measured, `forecast` is what was predicted at the time.
    """

    observed_at: datetime
    source: str
    score: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    wind_speed_kmh: float | None
    #: How much was added to the published forecast wind, in km/h. Null when no correction
    #: was applied: an archive reading, a missing wind, or no artefact deployed.
    wind_correction_kmh: float | None = None
    offshore_component: float | None
    sea_level_m: float | None = None


class SessionIn(BaseModel):
    """A surfed session being logged. This is a label, so the validation here is label quality."""

    slug: str
    # AwareDatetime, so an offset is mandatory. A naive timestamp would have to be *guessed* as UTC
    # or local, and guessing wrong shifts the session into a different hour, which pairs the rating
    # with a different hour's conditions. That is a silently wrong training example, the worst kind.
    surfed_at: AwareDatetime
    rating: int = Field(ge=1, le=5)
    tags: list[SessionTag] = []
    note: str | None = Field(default=None, max_length=500)

    @field_validator("surfed_at")
    @classmethod
    def not_in_the_future(cls, value: AwareDatetime) -> AwareDatetime:
        # The database cannot enforce this: a CHECK constraint must be immutable and now() is not.
        if value > datetime.now(UTC) + _FUTURE_SKEW:
            raise ValueError("surfed_at cannot be in the future")
        return value

    @field_validator("tags")
    @classmethod
    def no_duplicate_tags(cls, value: list[SessionTag]) -> list[SessionTag]:
        # The column check permits {crowded, crowded}; nothing downstream wants it.
        return list(dict.fromkeys(value))


class SessionOut(BaseModel):
    id: int
    slug: str
    name: str
    surfed_at: datetime
    rating: int
    tags: list[str]
    note: str | None
