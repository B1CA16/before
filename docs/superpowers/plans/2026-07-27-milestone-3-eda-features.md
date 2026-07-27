# Milestone 3: EDA and Feature Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explore the ingested conditions to validate quality and calibrate thresholds, and build the shared feature module that turns raw conditions plus spot orientation into model-ready derived features.

**Architecture:** A new `before_surf.features` sub-package. Low-level, shape-agnostic numpy primitives (`offshore_component`, `swell_exposure`) work on a scalar or a pandas Series, so the identical code serves training (vectorized over 800k rows) and serving (one row), which makes training/serving skew impossible. A `build_features(df)` wrapper adds the derived columns. A `dataset.load_joined()` loader joins `conditions` to `spots` into a DataFrame. A jupytext percent-format EDA script does targeted data-quality, distribution, and calibration analysis.

**Tech Stack:** Python 3.12, pandas, numpy, psycopg (runtime); jupyterlab, jupytext, matplotlib, seaborn (dev).

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- Import name is `before_surf`; new code lives under `ml/src/before_surf/features/`.
- Directions from Open-Meteo are "coming from" (0 = N); `orientation_deg` is the seaward-facing azimuth (a west-facing beach ~ 270).

## Implementation decisions (flagged for review)

- Feature primitives are pure numpy so they broadcast over scalars and Series identically.
- `offshore_component = -cos(radians(wind_dir - orientation))` in [-1, 1]; `+1` offshore, `-1` onshore.
- `swell_exposure = clip(cos(radians(swell_dir - orientation)), 0, None)` in [0, 1]; `1` head-on, `0` shadowed.
- Kept raw features: `swell_period_s, swell_height_m, wave_height_m, wind_speed_kmh, water_temp_c`.
- Deferred to M7: swell-energy proxy, sin/cos of raw directions, cross/along-shore split. Deferred (no data): tide.
- Null `orientation_deg` (7 spots) yields NaN interaction features; we let NaN propagate, never fake orientation.
- EDA committed as a jupytext percent-format `.py`; `.ipynb` and generated plots are gitignored.
- The join loader builds a DataFrame from psycopg records directly (no SQLAlchemy dependency).

---

### Task 1: Dependencies and feature primitives

**Files:**
- Modify: `ml/pyproject.toml` (runtime deps), root `pyproject.toml` (dev deps) via uv
- Create: `ml/src/before_surf/features/__init__.py`
- Create: `ml/src/before_surf/features/derive.py`
- Test: `ml/tests/features/__init__.py`, `ml/tests/features/test_derive.py`

**Interfaces:**
- `offshore_component(wind_direction_deg, orientation_deg)` -> scalar or Series in [-1, 1].
- `swell_exposure(swell_direction_deg, orientation_deg)` -> scalar or Series in [0, 1].

- [ ] **Step 1: add dependencies**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"
uv add --package before-surf pandas numpy
uv add --dev jupyterlab jupytext matplotlib seaborn
uv sync --all-packages
```
Expected: pandas/numpy in `ml/pyproject.toml` `[project].dependencies`; the notebook tools in the root dev group.

- [ ] **Step 2: create the sub-package and empty test package**

Create `ml/src/before_surf/features/__init__.py`:
```python
"""Feature engineering: derived, model-ready features shared by training and serving."""
```
Create `ml/tests/features/__init__.py`: (empty file)

- [ ] **Step 3: write failing tests for the primitives**

`ml/tests/features/test_derive.py`:
```python
import numpy as np
import pandas as pd

from before_surf.features.derive import offshore_component, swell_exposure


def test_offshore_component_onshore_and_offshore():
    # Beach faces 270 (west). Wind FROM 270 (off the sea) is onshore -> -1.
    assert offshore_component(270.0, 270.0) == -1.0
    # Wind FROM 90 (off the land) is offshore -> +1.
    assert abs(offshore_component(90.0, 270.0) - 1.0) < 1e-9
    # Cross-shore -> ~0.
    assert abs(offshore_component(180.0, 270.0)) < 1e-9


def test_swell_exposure_head_on_shadow_and_oblique():
    # Swell FROM 270 hitting a 270-facing beach is head-on -> 1.
    assert abs(swell_exposure(270.0, 270.0) - 1.0) < 1e-9
    # Swell from behind (90) is shadowed -> clamped to 0.
    assert swell_exposure(90.0, 270.0) == 0.0
    # Oblique -> between 0 and 1.
    assert 0.0 < swell_exposure(315.0, 270.0) < 1.0


def test_primitives_are_vectorized_over_series():
    wind = pd.Series([270.0, 90.0])
    orient = pd.Series([270.0, 270.0])
    result = offshore_component(wind, orient)
    assert isinstance(result, pd.Series)
    assert len(result) == 2
    assert result.iloc[0] == -1.0
    assert abs(result.iloc[1] - 1.0) < 1e-9
```

- [ ] **Step 4: run tests, confirm they fail**

Run: `uv run pytest ml/tests/features/test_derive.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'before_surf.features.derive'`.

- [ ] **Step 5: implement `derive.py`**

`ml/src/before_surf/features/derive.py`:
```python
"""Derived surf features. Pure numpy so they broadcast over scalars and pandas Series alike.

Directions are "coming from" (0 = north). orientation_deg is the seaward-facing azimuth.
"""

import numpy as np


def offshore_component(wind_direction_deg, orientation_deg):
    """Wind alignment with offshore: +1 fully offshore (clean), -1 fully onshore (blown out)."""
    return -np.cos(np.radians(wind_direction_deg - orientation_deg))


def swell_exposure(swell_direction_deg, orientation_deg):
    """How directly a swell hits the beach: 1 head-on, 0 shadowed (clamped)."""
    return np.clip(np.cos(np.radians(swell_direction_deg - orientation_deg)), 0.0, None)
```

- [ ] **Step 6: run tests, expect pass**

Run: `uv run pytest ml/tests/features/test_derive.py -v`
Expected: 3 passed.

- [ ] **Step 7: Commit**

Message:
```
feat: add offshore and swell-exposure feature primitives
```

---

### Task 2: build_features wrapper

**Files:**
- Modify: `ml/src/before_surf/features/derive.py`
- Test: `ml/tests/features/test_derive.py`

**Interfaces:**
- `build_features(df: pd.DataFrame) -> pd.DataFrame` returns a copy with `offshore_component` and `swell_exposure` columns added. Requires columns `wind_direction_deg, swell_direction_deg, orientation_deg`.

- [ ] **Step 1: add a failing test**

Append to `ml/tests/features/test_derive.py`:
```python
def test_build_features_adds_columns_and_propagates_nan():
    df = pd.DataFrame(
        {
            "wind_direction_deg": [90.0, 270.0],
            "swell_direction_deg": [270.0, 270.0],
            "orientation_deg": [270.0, np.nan],  # second spot has unknown orientation
        }
    )
    out = build_features(df)
    # original columns preserved, new ones added
    assert "offshore_component" in out.columns
    assert "swell_exposure" in out.columns
    assert abs(out["offshore_component"].iloc[0] - 1.0) < 1e-9
    assert abs(out["swell_exposure"].iloc[0] - 1.0) < 1e-9
    # unknown orientation -> NaN feature, never fabricated
    assert np.isnan(out["offshore_component"].iloc[1])
    # input is not mutated
    assert "offshore_component" not in df.columns
```
And update the import line at the top of the file to include `build_features`:
```python
from before_surf.features.derive import build_features, offshore_component, swell_exposure
```

- [ ] **Step 2: run it, confirm failure**

Run: `uv run pytest ml/tests/features/test_derive.py::test_build_features_adds_columns_and_propagates_nan -v`
Expected: FAIL with `ImportError: cannot import name 'build_features'`.

- [ ] **Step 3: implement `build_features`**

Append to `ml/src/before_surf/features/derive.py`:
```python
import pandas as pd


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add derived feature columns to a conditions-joined-spots DataFrame (non-mutating)."""
    out = df.copy()
    out["offshore_component"] = offshore_component(
        df["wind_direction_deg"], df["orientation_deg"]
    )
    out["swell_exposure"] = swell_exposure(df["swell_direction_deg"], df["orientation_deg"])
    return out
```
Note: move the `import pandas as pd` to the top of the file with the other imports (keep imports grouped; ruff will enforce ordering).

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/features/test_derive.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

Message:
```
feat: add build_features wrapper
```

---

### Task 3: Dataset loader (join conditions and spots)

**Files:**
- Create: `ml/src/before_surf/features/dataset.py`
- Test: `ml/tests/features/test_dataset.py`

**Interfaces:**
- `records_to_dataframe(rows: list, columns: list[str]) -> pd.DataFrame` (pure).
- `load_joined(database_url: str, source: str = "archive") -> pd.DataFrame` joins conditions to spots.

- [ ] **Step 1: write a failing test for the pure helper**

`ml/tests/features/test_dataset.py`:
```python
from before_surf.features.dataset import records_to_dataframe


def test_records_to_dataframe_builds_named_columns():
    rows = [(1, 270.0, 1.4), (2, 200.0, 0.9)]
    columns = ["spot_id", "orientation_deg", "wave_height_m"]
    df = records_to_dataframe(rows, columns)
    assert list(df.columns) == columns
    assert len(df) == 2
    assert df["orientation_deg"].iloc[0] == 270.0
```

- [ ] **Step 2: run it, confirm failure**

Run: `uv run pytest ml/tests/features/test_dataset.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: implement `dataset.py`**

`ml/src/before_surf/features/dataset.py`:
```python
"""Load conditions joined with spot metadata into a DataFrame for EDA and features."""

import pandas as pd
import psycopg

JOIN_QUERY = """
select c.spot_id, s.slug, s.orientation_deg, c.observed_at, c.source,
       c.wave_height_m, c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg, c.water_temp_c, c.air_temp_c
from conditions c
join spots s on s.id = c.spot_id
where c.source = %(source)s
"""


def records_to_dataframe(rows: list, columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=columns)


def load_joined(database_url: str, source: str = "archive") -> pd.DataFrame:
    with psycopg.connect(database_url) as conn:
        cur = conn.execute(JOIN_QUERY, {"source": source})
        rows = cur.fetchall()
        columns = [desc.name for desc in cur.description]
    return records_to_dataframe(rows, columns)
```

- [ ] **Step 4: run tests, expect pass**

Run: `uv run pytest ml/tests/features/test_dataset.py -v`
Expected: 1 passed.

- [ ] **Step 5: live verify the join loads real data**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"
uv run python -c "from before_surf.config import get_settings; from before_surf.features.dataset import load_joined; df=load_joined(get_settings().database_url); print('rows:', len(df)); print('cols:', list(df.columns)); print('spots:', df['spot_id'].nunique()); print('null orientation rows:', int(df['orientation_deg'].isna().sum()))"
```
Expected: ~800k rows, the joined columns, 92 spots, some null-orientation rows.

- [ ] **Step 6: Commit**

Message:
```
feat: add joined conditions dataset loader
```

---

### Task 4: EDA notebook (targeted validation and calibration)

**Files:**
- Create: `ml/notebooks/eda_conditions.py` (jupytext percent format)
- Modify: `.gitignore` (ignore `.ipynb` and generated plots)

**Interfaces:**
- Produces: a runnable EDA script and saved plots; findings printed to stdout.

- [ ] **Step 1: ignore notebook artifacts**

Append to `.gitignore`:
```gitignore
# Notebooks (jupytext .py is the source of truth)
*.ipynb
ml/notebooks/plots/
```

- [ ] **Step 2: write the EDA script**

`ml/notebooks/eda_conditions.py`:
```python
# %% [markdown]
# # EDA: conditions (archive)
# Targeted checks: data quality, distributions, direction sanity, feature ranges, calibration.

# %%
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # headless: save figures to files, no display needed
import matplotlib.pyplot as plt
import seaborn as sns

from before_surf.config import get_settings
from before_surf.features.dataset import load_joined
from before_surf.features.derive import build_features

PLOTS = Path("ml/notebooks/plots")
PLOTS.mkdir(parents=True, exist_ok=True)
sns.set_theme()

df = load_joined(get_settings().database_url, source="archive")
df = build_features(df)
print(f"rows={len(df)} spots={df['spot_id'].nunique()}")

# %% [markdown]
# ## 1. Data quality: null fraction per column
# %%
null_fraction = df.isna().mean().sort_values(ascending=False)
print(null_fraction)

# %% [markdown]
# ## 2. Distributions of key raw variables (calibration for the M4 heuristic)
# %%
raw_cols = ["swell_height_m", "swell_period_s", "wave_height_m", "wind_speed_kmh", "water_temp_c"]
print(df[raw_cols].describe(percentiles=[0.1, 0.25, 0.5, 0.75, 0.9]))
fig, axes = plt.subplots(1, len(raw_cols), figsize=(4 * len(raw_cols), 3))
for ax, col in zip(axes, raw_cols, strict=True):
    sns.histplot(df[col].dropna(), ax=ax)
    ax.set_title(col)
fig.tight_layout()
fig.savefig(PLOTS / "raw_distributions.png", dpi=90)

# %% [markdown]
# ## 3. Direction sanity: where do swells and winds come from?
# %%
fig, axes = plt.subplots(1, 2, figsize=(8, 3))
sns.histplot(df["swell_direction_deg"].dropna(), bins=36, ax=axes[0]).set_title("swell dir (from)")
sns.histplot(df["wind_direction_deg"].dropna(), bins=36, ax=axes[1]).set_title("wind dir (from)")
fig.tight_layout()
fig.savefig(PLOTS / "direction_distributions.png", dpi=90)

# %% [markdown]
# ## 4. Derived feature ranges (must be within bounds)
# %%
print(df[["offshore_component", "swell_exposure"]].describe())
assert df["offshore_component"].dropna().between(-1, 1).all()
assert df["swell_exposure"].dropna().between(0, 1).all()

# %% [markdown]
# ## 5. Correlations among numeric features
# %%
corr_cols = raw_cols + ["offshore_component", "swell_exposure"]
fig, ax = plt.subplots(figsize=(7, 6))
sns.heatmap(df[corr_cols].corr(), annot=True, fmt=".2f", cmap="coolwarm", ax=ax)
fig.tight_layout()
fig.savefig(PLOTS / "feature_correlations.png", dpi=90)

print("EDA complete; plots saved to", PLOTS)
```

- [ ] **Step 3: run the EDA end to end (it must complete cleanly)**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python ml/notebooks/eda_conditions.py
```
Expected: prints null fractions, describe tables, "EDA complete"; three PNGs written under `ml/notebooks/plots/`. The two range assertions passing confirms the feature bounds hold on all 800k rows. Read the printed distributions: note the median and 10th/90th percentiles of `swell_period_s` and `swell_height_m` (these calibrate the M4 heuristic thresholds).

- [ ] **Step 4: Commit**

Message:
```
feat: add targeted EDA notebook for conditions
```

---

### Task 5: Feature module docs and end-to-end verification

**Files:**
- Create: `ml/src/before_surf/features/README.md`

**Interfaces:**
- Produces: documentation and a final verified feature build on real data.

- [ ] **Step 1: end-to-end feature build on real data**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"
uv run python -c "from before_surf.config import get_settings; from before_surf.features.dataset import load_joined; from before_surf.features.derive import build_features; df=build_features(load_joined(get_settings().database_url)); print(df[['slug','wind_direction_deg','orientation_deg','offshore_component','swell_direction_deg','swell_exposure']].dropna().head(5).to_string())"
```
Expected: five real rows where `offshore_component` and `swell_exposure` are sensible given the angles (offshore/onshore and exposure track the direction-vs-orientation differences).

- [ ] **Step 2: write the docs**

`ml/src/before_surf/features/README.md`:
```markdown
# Features (derived, model-ready)

Transforms raw conditions plus spot orientation into features shared by training and serving.
The primitives are pure numpy, so the same function works on a single value (serving) and a whole
column (training), which makes training/serving skew impossible.

## Modules

- `derive.py`
  - `offshore_component(wind_direction_deg, orientation_deg)` -> [-1, 1]; +1 offshore, -1 onshore.
  - `swell_exposure(swell_direction_deg, orientation_deg)` -> [0, 1]; 1 head-on, 0 shadowed.
  - `build_features(df)` -> DataFrame with those columns added (non-mutating).
- `dataset.py`
  - `load_joined(database_url, source='archive')` -> conditions joined with spot metadata.

## Notes

- Directions are "coming from" (0 = north); `orientation_deg` is the seaward-facing azimuth.
- Spots with unknown `orientation_deg` yield NaN interaction features; NaN propagates, we never
  fabricate an orientation.
- Deferred to M7: swell-energy proxy, sin/cos of raw directions, cross/along-shore wind split.
  Deferred (no data): tide.
```

- [ ] **Step 3: full suite and hooks**

Run: `uv run pytest` then `uv run pre-commit run --all-files`
Expected: all tests and hooks pass.

- [ ] **Step 4: Commit**

Message:
```
docs: document the features module
```

---

## Definition of done for Milestone 3

- `before_surf.features` exists: tested primitives (`offshore_component`, `swell_exposure`), a `build_features` wrapper, and a `load_joined` dataset loader.
- Feature values are verified within bounds on all archive rows.
- A runnable jupytext EDA script produces data-quality, distribution, direction, and correlation views, and prints the percentiles that will calibrate the M4 heuristic.
- Full suite and pre-commit pass; CI green.

## Deferred (not in M3)

- The heuristic scorer itself (Milestone 4) that consumes these features.
- Model-only features (energy proxy, raw-direction sin/cos, cross/along-shore split) until M7.
- Tide (no data source yet).
