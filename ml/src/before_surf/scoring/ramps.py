"""Map raw features to [0,1] sub-scores via calibrated piecewise-linear ramps.

Pure numpy so each works on a scalar or a pandas Series. NaN inputs propagate to NaN.

Recalibrated 2026-08-17 against a year of archive data (ml/notebooks/calibrate_heuristic.py).
The floors used to sit where conditions became *good* (period 6 s, size 0.3 m), which meant a
merely poor 5.7 s swell scored a hard zero and, combined with the conjunctive mean, dragged every
spot to exactly 0.0. That destroyed the ranking. The floors now sit where conditions become
genuinely unsurfable instead, so poor days degrade smoothly and stay ordered.
"""

import numpy as np


def _ramp(value, low, high):
    return np.clip((value - low) / (high - low), 0.0, 1.0)


def size_score(height_m, min_m: float = 0.2, good_m: float = 1.6):
    return _ramp(height_m, min_m, good_m)


def period_score(period_s, min_s: float = 3.0, good_s: float = 13.0):
    return _ramp(period_s, min_s, good_s)


def wind_score(offshore_component, wind_speed_kmh, strong_kmh: float = 30.0):
    onshore = (1.0 - offshore_component) / 2.0  # 1 = full onshore, 0 = full offshore
    strength = np.clip(wind_speed_kmh / strong_kmh, 0.0, 1.0)
    return 1.0 - onshore * strength


def exposure_score(swell_exposure):
    return np.clip(swell_exposure, 0.0, 1.0)
