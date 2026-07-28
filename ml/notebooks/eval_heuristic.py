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
