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
