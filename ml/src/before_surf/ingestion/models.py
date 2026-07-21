from dataclasses import dataclass


@dataclass(frozen=True)
class Spot:
    slug: str
    name: str
    region: str
    latitude: float
    longitude: float
    break_type: str | None = None
    orientation_deg: float | None = None
