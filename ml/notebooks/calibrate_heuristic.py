# %% [markdown]
# # Calibrating the heuristic
#
# Real forecast data exposed two faults in the v0 scorer:
#
# 1. **Hard zeros collapse the ranking.** The period ramp floors at 6 s, and the geometric mean
#    vetoes on any zero, so a 5.7 s swell put every scored spot at exactly 0.0. A veto is right for
#    genuinely unsurfable conditions, but 1.4 m at 5.7 s is poor, not impossible, and when 85 spots
#    share one value the list order carries no information at all.
# 2. **The geometric mean is too forgiving otherwise.** With four factors the fourth root pulls
#    everything toward 1: a 0.2 period factor beside three 0.9s still scores about 6.2.
#
# This compares candidate fixes on a year of real archive data. The aim is a distribution that
# spreads across the range, keeps genuinely good surf rare, and reserves exact zeros for conditions
# that truly cannot be surfed.

# %%
import numpy as np
import pandas as pd

from before_surf.config import get_settings
from before_surf.features.dataset import load_joined
from before_surf.features.derive import build_features
from before_surf.scoring.ramps import exposure_score, size_score, wind_score

df = build_features(load_joined(get_settings().database_url, source="archive"))
# Every fourth hour is plenty for a distribution and keeps this quick.
df = df.iloc[::4]
print(f"rows: {len(df)}  spots: {df['spot_id'].nunique()}")


# %% [markdown]
# ## The two knobs
#
# `ramp` moves where a factor starts counting. `combine` decides how harshly the weakest factor
# binds. The harmonic mean is the interesting alternative: it still returns 0 if any factor is 0,
# so real vetoes survive, but it punishes a weak link far harder than the geometric mean.


# %%
def period_ramp(period_s, low, high):
    return np.clip((period_s - low) / (high - low), 0.0, 1.0)


def geometric(factors):
    with np.errstate(divide="ignore"):
        return np.exp(sum(np.log(f) for f in factors) / len(factors))


def harmonic(factors):
    with np.errstate(divide="ignore"):
        total = sum(1.0 / f for f in factors)
    return len(factors) / total


def evaluate(name, *, period_low, period_high, size_low, size_high, combine):
    factors = [
        size_score(df["swell_height_m"], size_low, size_high),
        period_ramp(df["swell_period_s"], period_low, period_high),
        wind_score(df["offshore_component"], df["wind_speed_kmh"]),
        exposure_score(df["swell_exposure"]),
    ]
    scores = (10.0 * combine(factors)).replace([np.inf, -np.inf], np.nan).dropna()
    return {
        "config": name,
        "exactly 0": f"{(scores == 0).mean():.1%}",
        "p10": round(scores.quantile(0.10), 1),
        "median": round(scores.median(), 1),
        "p90": round(scores.quantile(0.90), 1),
        "5 and up": f"{(scores >= 5).mean():.1%}",
        "7 and up": f"{(scores >= 7).mean():.1%}",
    }


# %%
results = [
    evaluate(
        "A current (6-12s, geometric)",
        period_low=6,
        period_high=12,
        size_low=0.3,
        size_high=1.5,
        combine=geometric,
    ),
    evaluate(
        "B lower floors, geometric",
        period_low=4,
        period_high=12,
        size_low=0.15,
        size_high=1.5,
        combine=geometric,
    ),
    evaluate(
        "C lower floors, harmonic",
        period_low=4,
        period_high=12,
        size_low=0.15,
        size_high=1.5,
        combine=harmonic,
    ),
    evaluate(
        "D wider period, harmonic",
        period_low=3,
        period_high=13,
        size_low=0.2,
        size_high=1.6,
        combine=harmonic,
    ),
]
print(pd.DataFrame(results).to_string(index=False))

# %% [markdown]
# ## What a live day looks like under each
#
# The case that started this: 1.4 m at 5.7 s, light onshore, swell almost side-on.

# %%
case = {"height": 1.4, "period": 5.7, "offshore": -0.26, "wind_kmh": 2.8, "exposure": 0.26}
for name, pl, ph, sl, sh, comb in [
    ("A current", 6, 12, 0.3, 1.5, geometric),
    ("B floors", 4, 12, 0.15, 1.5, geometric),
    ("C harmonic", 4, 12, 0.15, 1.5, harmonic),
    ("D harmonic", 3, 13, 0.2, 1.6, harmonic),
]:
    f = [
        float(size_score(case["height"], sl, sh)),
        float(period_ramp(case["period"], pl, ph)),
        float(wind_score(case["offshore"], case["wind_kmh"])),
        case["exposure"],
    ]
    total = 10.0 * float(comb([np.array([x]) for x in f])[0])
    print(f"{name:<12} factors {[round(x, 2) for x in f]}  ->  {total:.1f}")
