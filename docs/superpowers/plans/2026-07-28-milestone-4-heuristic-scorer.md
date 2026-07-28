# Milestone 4: Heuristic Scorer and Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the `Scorer` interface, implement a transparent `HeuristicScorer` (v0 BeFORE score, 0 to 10) from EDA-calibrated sub-scores combined by geometric-mean gating, and build a scorer-agnostic evaluation harness for logic and face-validity checks.

**Architecture:** A new `before_surf.scoring` sub-package. `base.py` holds the `Scorer` ABC. `ramps.py` holds pure sub-score functions mapping raw features to [0,1] via EDA-calibrated piecewise-linear ramps. `heuristic.py` holds `HeuristicScorer(Scorer)` with `score()` (geometric mean of sub-scores x 10) and `explain()` (per-factor breakdown). `evaluation.py` holds scorer-agnostic summary functions. Everything is vectorized over a features DataFrame and shape-agnostic via numpy, consistent with `before_surf.features`.

**Tech Stack:** Python 3.12, numpy, pandas.

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- Import name is `before_surf`; new code lives under `ml/src/before_surf/scoring/`.
- A scorer consumes a features DataFrame (from `before_surf.features.build_features`) and returns a
  `pd.Series` of 0-to-10 scores aligned to the frame's index.

## Implementation decisions (flagged for review)

- Interface: a lightweight ABC `Scorer` with `score(features) -> pd.Series`; runtime-enforced.
- Sub-scores in [0,1] via piecewise-linear ramps calibrated from M3 EDA percentiles:
  period 6s->0 to 12s->1; height 0.3m->0 to 1.5m->1; wind = 1 - onshoreness*strength(speed/30);
  exposure = swell_exposure.
- Combination: geometric mean of the 4 sub-scores x 10. Any 0 factor vetoes to 0; NaN propagates.
- Explainability is a `HeuristicScorer` method, not part of the base contract.
- Evaluation harness is scorer-agnostic (takes a `Scorer`). No label-based metrics yet (no labels);
  those are deferred to M7. M4 does property tests + face-validity distribution report.

---

### Task 1: scoring package and the Scorer interface

**Files:**
- Create: `ml/src/before_surf/scoring/__init__.py`
- Create: `ml/src/before_surf/scoring/base.py`
- Create: `ml/tests/scoring/__init__.py`, `ml/tests/scoring/test_base.py`

**Interfaces:**
- `Scorer` (ABC) with abstract `score(self, features: pd.DataFrame) -> pd.Series`.

- [ ] **Step 1: create the package and test package**

`ml/src/before_surf/scoring/__init__.py`:
```python
"""Scoring: the Scorer interface and implementations (heuristic now, ML later)."""
```
`ml/tests/scoring/__init__.py`: (empty file)

- [ ] **Step 2: write failing tests for the interface contract**

`ml/tests/scoring/test_base.py`:
```python
import pandas as pd
import pytest

from before_surf.scoring.base import Scorer


def test_scorer_is_abstract_and_cannot_be_instantiated():
    with pytest.raises(TypeError):
        Scorer()


def test_a_conforming_subclass_works():
    class ConstantScorer(Scorer):
        def score(self, features: pd.DataFrame) -> pd.Series:
            return pd.Series([5.0] * len(features), index=features.index)

    df = pd.DataFrame({"x": [1, 2, 3]})
    result = ConstantScorer().score(df)
    assert list(result) == [5.0, 5.0, 5.0]
```

- [ ] **Step 3: run tests, confirm they fail**

Run: `uv run pytest ml/tests/scoring/test_base.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'before_surf.scoring.base'`.

- [ ] **Step 4: implement `base.py`**

`ml/src/before_surf/scoring/base.py`:
```python
"""The Scorer interface: any brain that turns a features DataFrame into 0-to-10 scores."""

from abc import ABC, abstractmethod

import pandas as pd


class Scorer(ABC):
    @abstractmethod
    def score(self, features: pd.DataFrame) -> pd.Series:
        """Return a Series of BeFORE scores in [0, 10], aligned to features.index."""
```

- [ ] **Step 5: run tests, expect pass**

Run: `uv run pytest ml/tests/scoring/test_base.py -v`
Expected: 2 passed. (The first proves the ABC's runtime enforcement: a missing `score` blocks instantiation.)

- [ ] **Step 6: Commit**

Message:
```
feat: add Scorer interface
```

---

### Task 2: sub-score ramp functions

**Files:**
- Create: `ml/src/before_surf/scoring/ramps.py`
- Test: `ml/tests/scoring/test_ramps.py`

**Interfaces:**
- `size_score(height_m, min_m=0.3, good_m=1.5) -> [0,1]`
- `period_score(period_s, min_s=6.0, good_s=12.0) -> [0,1]`
- `wind_score(offshore_component, wind_speed_kmh, strong_kmh=30.0) -> [0,1]`
- `exposure_score(swell_exposure) -> [0,1]`
- All shape-agnostic (scalar or Series).

- [ ] **Step 1: write failing tests**

`ml/tests/scoring/test_ramps.py`:
```python
import numpy as np
import pandas as pd

from before_surf.scoring.ramps import exposure_score, period_score, size_score, wind_score


def test_period_score_ramp():
    assert period_score(5.0) == 0.0  # below floor
    assert period_score(6.0) == 0.0
    assert abs(period_score(9.0) - 0.5) < 1e-9  # midpoint
    assert period_score(12.0) == 1.0
    assert period_score(16.0) == 1.0  # plateau


def test_size_score_ramp():
    assert size_score(0.2) == 0.0
    assert size_score(0.3) == 0.0
    assert abs(size_score(0.9) - 0.5) < 1e-9
    assert size_score(1.5) == 1.0
    assert size_score(3.0) == 1.0


def test_wind_score_glassy_offshore_and_onshore():
    # Light wind (0 km/h) is glassy regardless of direction -> 1.
    assert wind_score(-1.0, 0.0) == 1.0
    # Strong offshore (+1) -> onshore-ness 0 -> 1.
    assert wind_score(1.0, 40.0) == 1.0
    # Strong onshore (-1) at/above strong threshold -> 0.
    assert wind_score(-1.0, 30.0) == 0.0
    # Cross-shore (0) at strong threshold -> onshore-ness 0.5 -> 0.5.
    assert abs(wind_score(0.0, 30.0) - 0.5) < 1e-9


def test_exposure_score_passthrough_and_clip():
    assert exposure_score(0.7) == 0.7
    assert exposure_score(0.0) == 0.0


def test_ramps_are_vectorized():
    result = period_score(pd.Series([5.0, 9.0, 12.0]))
    assert isinstance(result, pd.Series)
    assert list(result) == [0.0, 0.5, 1.0]


def test_wind_score_propagates_nan():
    # Unknown orientation -> NaN offshore_component -> NaN wind score.
    assert np.isnan(wind_score(np.nan, 20.0))
```

- [ ] **Step 2: run tests, confirm they fail**

Run: `uv run pytest ml/tests/scoring/test_ramps.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: implement `ramps.py`**

`ml/src/before_surf/scoring/ramps.py`:
```python
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
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/scoring/test_ramps.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

Message:
```
feat: add calibrated sub-score ramps
```

---

### Task 3: HeuristicScorer (score and explain)

**Files:**
- Create: `ml/src/before_surf/scoring/heuristic.py`
- Test: `ml/tests/scoring/test_heuristic.py`

**Interfaces:**
- `HeuristicScorer(Scorer)` with tunable threshold kwargs.
- `.score(features) -> pd.Series` in [0, 10] (geometric mean of 4 sub-scores x 10).
- `.explain(features) -> pd.DataFrame` with columns `size, period, wind, exposure, score`.
- Required feature columns: `swell_height_m, swell_period_s, offshore_component, wind_speed_kmh, swell_exposure`.

- [ ] **Step 1: write failing tests (these are the property/invariant tests)**

`ml/tests/scoring/test_heuristic.py`:
```python
import numpy as np
import pandas as pd

from before_surf.scoring.heuristic import HeuristicScorer


def _row(**overrides):
    base = {
        "swell_height_m": 2.0,
        "swell_period_s": 13.0,
        "offshore_component": 1.0,   # fully offshore
        "wind_speed_kmh": 10.0,
        "swell_exposure": 1.0,       # head-on
    }
    base.update(overrides)
    return pd.DataFrame([base])


def test_perfect_conditions_score_high():
    score = HeuristicScorer().score(_row()).iloc[0]
    assert score >= 8.0


def test_garbage_conditions_score_low():
    # tiny short-period swell, shadowed, strong onshore
    df = _row(swell_height_m=0.3, swell_period_s=5.0, offshore_component=-1.0,
              wind_speed_kmh=35.0, swell_exposure=0.05)
    assert HeuristicScorer().score(df).iloc[0] <= 2.0


def test_shadowed_spot_is_vetoed_to_zero():
    df = _row(swell_exposure=0.0)
    assert HeuristicScorer().score(df).iloc[0] == 0.0


def test_score_monotonic_in_period():
    lo = HeuristicScorer().score(_row(swell_period_s=7.0)).iloc[0]
    hi = HeuristicScorer().score(_row(swell_period_s=13.0)).iloc[0]
    assert hi > lo


def test_score_decreases_with_onshore_wind():
    offshore = HeuristicScorer().score(_row(offshore_component=1.0, wind_speed_kmh=25.0)).iloc[0]
    onshore = HeuristicScorer().score(_row(offshore_component=-1.0, wind_speed_kmh=25.0)).iloc[0]
    assert onshore < offshore


def test_score_in_range_and_nan_propagates():
    df = _row()
    df2 = _row(offshore_component=np.nan)  # unknown orientation
    both = pd.concat([df, df2], ignore_index=True)
    scores = HeuristicScorer().score(both)
    assert 0.0 <= scores.iloc[0] <= 10.0
    assert np.isnan(scores.iloc[1])


def test_explain_returns_factor_breakdown():
    out = HeuristicScorer().explain(_row())
    assert list(out.columns) == ["size", "period", "wind", "exposure", "score"]
    assert 0.0 <= out["size"].iloc[0] <= 1.0
    assert abs(out["score"].iloc[0] - HeuristicScorer().score(_row()).iloc[0]) < 1e-9
```

- [ ] **Step 2: run tests, confirm they fail**

Run: `uv run pytest ml/tests/scoring/test_heuristic.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: implement `heuristic.py`**

`ml/src/before_surf/scoring/heuristic.py`:
```python
"""HeuristicScorer: transparent v0 BeFORE score from EDA-calibrated sub-scores.

Sub-scores in [0,1] are combined by geometric mean (x10). Geometric mean is conjunctive:
any near-zero factor (shadowed spot, strong onshore, no size) vetoes the score, while
good-all-round conditions score high. NaN propagates (unknown orientation -> unknown score).
"""

import numpy as np
import pandas as pd

from before_surf.scoring.base import Scorer
from before_surf.scoring.ramps import exposure_score, period_score, size_score, wind_score


class HeuristicScorer(Scorer):
    def __init__(
        self,
        *,
        min_period_s: float = 6.0,
        good_period_s: float = 12.0,
        min_height_m: float = 0.3,
        good_height_m: float = 1.5,
        strong_wind_kmh: float = 30.0,
    ):
        self.min_period_s = min_period_s
        self.good_period_s = good_period_s
        self.min_height_m = min_height_m
        self.good_height_m = good_height_m
        self.strong_wind_kmh = strong_wind_kmh

    def _sub_scores(self, features: pd.DataFrame) -> dict[str, pd.Series]:
        return {
            "size": size_score(features["swell_height_m"], self.min_height_m, self.good_height_m),
            "period": period_score(
                features["swell_period_s"], self.min_period_s, self.good_period_s
            ),
            "wind": wind_score(
                features["offshore_component"], features["wind_speed_kmh"], self.strong_wind_kmh
            ),
            "exposure": exposure_score(features["swell_exposure"]),
        }

    def score(self, features: pd.DataFrame) -> pd.Series:
        sub = self._sub_scores(features)
        # geometric mean = exp(mean(log)); log(0) -> -inf -> exp -> 0 (veto); NaN propagates.
        with np.errstate(divide="ignore"):
            log_mean = sum(np.log(s) for s in sub.values()) / len(sub)
        return 10.0 * np.exp(log_mean)

    def explain(self, features: pd.DataFrame) -> pd.DataFrame:
        sub = self._sub_scores(features)
        out = pd.DataFrame(sub, index=features.index)
        out["score"] = self.score(features)
        return out
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/scoring/test_heuristic.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

Message:
```
feat: add HeuristicScorer with geometric-mean gating
```

---

### Task 4: scorer-agnostic evaluation harness

**Files:**
- Create: `ml/src/before_surf/scoring/evaluation.py`
- Test: `ml/tests/scoring/test_evaluation.py`

**Interfaces:**
- `score_distribution(scorer: Scorer, features: pd.DataFrame) -> dict` (count, mean, p10, median, p90, frac_good).
- `per_spot_mean(scorer: Scorer, features: pd.DataFrame, spot_col="slug") -> pd.Series` (mean score by spot, descending).

- [ ] **Step 1: write failing tests (using a stub Scorer for deterministic asserts)**

`ml/tests/scoring/test_evaluation.py`:
```python
import pandas as pd

from before_surf.scoring.base import Scorer
from before_surf.scoring.evaluation import per_spot_mean, score_distribution


class StubScorer(Scorer):
    """Returns a fixed score per row from a 'stub_score' column, for deterministic tests."""

    def score(self, features: pd.DataFrame) -> pd.Series:
        return features["stub_score"].astype(float)


def test_score_distribution_summary():
    df = pd.DataFrame({"stub_score": [0.0, 5.0, 7.0, 8.0, 10.0]})
    dist = score_distribution(StubScorer(), df)
    assert dist["count"] == 5
    assert dist["median"] == 7.0
    assert abs(dist["frac_good"] - 0.6) < 1e-9  # 3 of 5 are >= 7


def test_per_spot_mean_sorted_desc():
    df = pd.DataFrame(
        {"slug": ["a", "a", "b"], "stub_score": [8.0, 6.0, 2.0]}
    )
    means = per_spot_mean(StubScorer(), df)
    assert means.index[0] == "a"  # a=7.0 ranks above b=2.0
    assert abs(means.loc["a"] - 7.0) < 1e-9
```

- [ ] **Step 2: run tests, confirm they fail**

Run: `uv run pytest ml/tests/scoring/test_evaluation.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: implement `evaluation.py`**

`ml/src/before_surf/scoring/evaluation.py`:
```python
"""Scorer-agnostic evaluation: works for any Scorer. No label-based metrics yet (no labels);
those arrive in M7. For now: score distribution and per-spot behavior for face validity."""

import pandas as pd

from before_surf.scoring.base import Scorer

GOOD_THRESHOLD = 7.0


def score_distribution(scorer: Scorer, features: pd.DataFrame) -> dict:
    scores = scorer.score(features).dropna()
    return {
        "count": int(scores.count()),
        "mean": float(scores.mean()),
        "p10": float(scores.quantile(0.10)),
        "median": float(scores.median()),
        "p90": float(scores.quantile(0.90)),
        "frac_good": float((scores >= GOOD_THRESHOLD).mean()),
    }


def per_spot_mean(scorer: Scorer, features: pd.DataFrame, spot_col: str = "slug") -> pd.Series:
    scored = features.assign(_score=scorer.score(features))
    return scored.groupby(spot_col)["_score"].mean().sort_values(ascending=False)
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/scoring/test_evaluation.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

Message:
```
feat: add scorer-agnostic evaluation harness
```

---

### Task 5: real-data face-validity report and docs

**Files:**
- Create: `ml/notebooks/eval_heuristic.py` (jupytext percent format)
- Create: `ml/src/before_surf/scoring/README.md`

**Interfaces:**
- Produces: a face-validity report on the real archive and module documentation.

- [ ] **Step 1: write the face-validity report script**

`ml/notebooks/eval_heuristic.py`:
```python
# %% [markdown]
# # Face validity: HeuristicScorer on the archive
# No labels yet, so this checks sanity: score distribution, how rare "good" is,
# per-spot behavior, and example explanations.

# %%
from before_surf.config import get_settings
from before_surf.features.dataset import load_joined
from before_surf.features.derive import build_features
from before_surf.scoring.evaluation import per_spot_mean, score_distribution
from before_surf.scoring.heuristic import HeuristicScorer

df = build_features(load_joined(get_settings().database_url, source="archive"))
scorer = HeuristicScorer()

# %% [markdown]
# ## Score distribution (is it spread, and is "good" appropriately rare?)
# %%
dist = score_distribution(scorer, df)
print(dist)
assert 0.0 <= dist["mean"] <= 10.0
assert dist["frac_good"] < 0.5  # good surf should be a minority of all spot-hours

# %% [markdown]
# ## Per-spot mean score (well-oriented, exposed spots should rank higher)
# %%
means = per_spot_mean(scorer, df)
print("top 5 spots:\n", means.head(5))
print("bottom 5 spots:\n", means.tail(5))

# %% [markdown]
# ## Example explanations (read the 'why' for the best-scoring hours)
# %%
explained = scorer.explain(df).assign(slug=df["slug"], observed_at=df["observed_at"])
print(explained.sort_values("score", ascending=False).head(5).to_string())
print("face-validity report complete")
```

- [ ] **Step 2: run the report end to end**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python ml/notebooks/eval_heuristic.py
```
Expected: prints the distribution (mean roughly mid-single-digits, `frac_good` a minority), a sensible top/bottom spot ranking, and top-scoring rows whose explanations show high sub-scores across the board. The assertions passing confirms scores stay in range and "good" is not over-issued. Sanity-read the output: do the top spots and their explanations make domain sense?

- [ ] **Step 3: write the docs**

`ml/src/before_surf/scoring/README.md`:
```markdown
# Scoring (the BeFORE score)

Turns a features DataFrame into a 0-to-10 BeFORE score.

## Design

- `base.Scorer` (ABC): the contract `score(features) -> Series`. HeuristicScorer implements it now;
  MLScorer will implement the same contract in M7, swappable with no changes elsewhere.
- `ramps.py`: raw features -> [0,1] sub-scores via EDA-calibrated piecewise-linear ramps
  (period, size, wind, exposure).
- `heuristic.HeuristicScorer`: combines the 4 sub-scores by geometric mean x 10. Geometric mean is
  conjunctive: any near-zero factor vetoes the score (shadowed spot, strong onshore, no size),
  while good-all-round conditions score high. NaN (unknown orientation) propagates.
- `heuristic.explain(features)`: per-factor [0,1] breakdown plus the final score.
- `evaluation.py`: scorer-agnostic distribution and per-spot summaries.

## Evaluation status

No labels exist yet, so we cannot measure accuracy. M4 validates (a) the scorer's logic via
property tests (monotonicity, vetoes, perfect vs garbage) and (b) face validity on the real archive
(distribution, per-spot behavior, explanations). True label-based metrics (rank correlation, and the
heuristic-vs-model baseline comparison) arrive in M7 once M6 collects user session ratings.
```

- [ ] **Step 4: full suite and hooks**

Run: `uv run pytest` then `uv run pre-commit run --all-files`
Expected: all tests and hooks pass.

- [ ] **Step 5: Commit**

Message:
```
docs: add heuristic face-validity report and scoring docs
```

---

## Definition of done for Milestone 4

- `before_surf.scoring` exists: `Scorer` ABC, calibrated ramps, `HeuristicScorer` (score + explain), scorer-agnostic evaluation.
- Property tests pass (monotonicity, vetoes, perfect/garbage, NaN, range); full suite and pre-commit pass.
- The face-validity report runs on the real archive: scores in range, "good" is a minority, per-spot ranking and explanations are sane.
- CI green.

## Deferred (not in M4)

- Label-based metrics and the heuristic-vs-model baseline comparison (M7, after M6 collects labels).
- The API that serves scores (M5) and the UI (M6).
- An upper "too big" rolloff on size, and tide, revisit if the heuristic needs them.
