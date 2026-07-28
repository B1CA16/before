"""Map raw features to [0,1] sub-scores via EDA-calibrated piecewise-linear ramps.

Pure numpy so each works on a scalar or a pandas Series. NaN inputs propagate to NaN.
"""

import numpy as np


def _ramp(value, low, high):
    return np.clip((value - low) / (high - low), 0.0, 1.0)


def size_score(height_m, min_m: float = 0.3, good_m: float = 1.5):
    return _ramp(height_m, min_m, good_m)


def period_score(period_s, min_s: float = 6.0, good_s: float = 12.0):
    return _ramp(period_s, min_s, good_s)


def wind_score(offshore_component, wind_speed_kmh, strong_kmh: float = 30.0):
    onshore = (1.0 - offshore_component) / 2.0  # 1 = full onshore, 0 = full offshore
    strength = np.clip(wind_speed_kmh / strong_kmh, 0.0, 1.0)
    return 1.0 - onshore * strength


def exposure_score(swell_exposure):
    return np.clip(swell_exposure, 0.0, 1.0)
