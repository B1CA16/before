"""Pydantic response models for the API."""

from datetime import datetime

from pydantic import BaseModel


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
