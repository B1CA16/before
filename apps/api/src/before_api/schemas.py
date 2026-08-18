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
    score: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    wind_speed_kmh: float | None
    offshore_component: float | None
    # The raw bearings, so the UI can draw the geometry the score is built from.
    swell_direction_deg: float | None
    wind_direction_deg: float | None


class ForecastHour(BaseModel):
    observed_at: datetime
    score: float | None
    size: float | None
    period: float | None
    wind: float | None
    exposure: float | None
    swell_height_m: float | None
    swell_period_s: float | None
    wind_speed_kmh: float | None


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
