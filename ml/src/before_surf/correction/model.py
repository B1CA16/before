"""The wind-correction model, and the evidence for whether it deserves to exist.

Gradient boosting on tabular data, which is the ordinary right answer for a problem shaped like this
one: a few dozen thousand rows, a handful of numeric features, and interactions (hour against wind
speed against location) that a linear model would miss.

Three decisions here are worth more than the model itself.

**The loss matches the metric.** `loss="absolute_error"`, not the default squared error. Task 2
established that the median beats the mean on MAE because the median is the constant that minimises
absolute error; the same logic applies to a model. Training on squared error while reporting MAE
would let a handful of storm hours drag every prediction toward them.

**Early stopping is done by hand, on a temporal inner split.** `early_stopping=True` looks like the
obvious choice and would silently undo the whole of Task 1: scikit-learn carves its validation set
out of the training rows *at random*, so 09:00 at Carcavelos would validate a model trained on 10:00
at Carcavelos, the model would stop late having been told it was still improving, and nothing would
report an error. The inner split here reuses `split_by_time`, embargo and all.

**Spot identity is offered, not assumed.** Task 2 found the per-spot baseline was the best on the
training weeks and nearly the worst on the held-out ones. Spot is exactly the feature a booster will
memorise, so two models are trained, one with it and one without, and the held-out weeks decide.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from before_surf.correction.dataset import EMBARGO_HOURS, Split, load_split, split_by_time
from before_surf.correction.evaluate import (
    BASELINE_RECIPES,
    Baseline,
    compare,
    fit_all,
    score,
)

# Everything the forecast knows at prediction time, and nothing else.
#
# Two deliberate omissions. `month` is excluded because 34 days of data spans exactly two of them,
# so it is not a season, it is a label for which half of the dataset a row came from; the model
# would use it to fit the drift between the two periods and would have nothing to say about
# September. `orientation_deg` is excluded because it is constant per spot, which makes it a
# lower-resolution copy of spot identity, and `wind_offshore_deg` already carries the part of it
# that is physically meaningful.
NUMERIC_FEATURES = [
    "hour_sin",
    "hour_cos",
    "wind_dir_sin",
    "wind_dir_cos",
    "wind_offshore_deg",
    "f_wind_speed_kmh",
    "f_swell_height_m",
    "f_swell_period_s",
]

# Permutation importance has to move these together. Permuting `hour_sin` on its own would leave
# `hour_cos` pointing at the true hour, so the model could reconstruct most of what was hidden and
# the feature would look unimportant when it is not. This is the most common way a feature-
# importance table quietly misleads.
FEATURE_GROUPS: dict[str, list[str]] = {
    "hour of day": ["hour_sin", "hour_cos"],
    "wind bearing": ["wind_dir_sin", "wind_dir_cos"],
    "wind vs shore": ["wind_offshore_deg"],
    "forecast wind speed": ["f_wind_speed_kmh"],
    "swell height": ["f_swell_height_m"],
    "swell period": ["f_swell_period_s"],
    "spot": ["spot"],
}

# A small grid. The point of this milestone is the comparison, not squeezing the last 0.01 km/h out
# of a hyperparameter search, and a larger grid searched against the same inner validation set
# starts overfitting that set instead.
GRID = [
    {"learning_rate": rate, "max_leaf_nodes": leaves, "max_iter": iterations}
    for rate in (0.05, 0.1)
    for leaves in (15, 31)
    for iterations in (100, 300)
]

RANDOM_STATE = 0


@dataclass(frozen=True)
class Margin:
    """A difference in MAE, with an interval that says whether to believe it."""

    point: float
    low: float
    high: float
    n_hours: int

    @property
    def is_real(self) -> bool:
        """True when the whole interval is on one side of zero."""
        return self.low > 0.0


def design_matrix(frame: pd.DataFrame, spot_codes: dict[str, int] | None) -> pd.DataFrame:
    """The numeric array the model sees.

    Spots are mapped to the integer codes learned from the training weeks. A spot the training
    weeks never saw maps to NaN rather than to a new code, which the booster treats as a missing
    value and routes down its default branch. That is the behaviour we want at serving time: a spot
    added yesterday should get the coast-wide correction, not an invented one.
    """
    matrix = frame[NUMERIC_FEATURES].astype("float64")
    if spot_codes is not None:
        matrix = matrix.assign(spot=frame["spot"].map(spot_codes).astype("float64"))
    return matrix


def _fit_estimator(
    train: pd.DataFrame,
    spot_codes: dict[str, int] | None,
    params: dict,
) -> HistGradientBoostingRegressor:
    matrix = design_matrix(train, spot_codes)
    categorical = ["spot"] if spot_codes is not None else []
    estimator = HistGradientBoostingRegressor(
        loss="absolute_error",
        categorical_features=categorical,
        early_stopping=False,
        random_state=RANDOM_STATE,
        **params,
    )
    estimator.fit(matrix, train["error_kmh"])
    return estimator


def choose_params(train: pd.DataFrame, use_spot: bool) -> tuple[dict, float]:
    """Pick hyperparameters on a temporal slice of the training weeks, never on the test weeks.

    The inner split is the outer one applied again, embargo included. Reusing the same function is
    not laziness: the reason a random validation split is wrong here is the same reason a random
    test split is wrong, and having one tested implementation means the argument only has to be
    correct once.
    """
    inner = split_by_time(train)
    codes = spot_codes_from(inner.train) if use_spot else None

    best_params, best_mae = GRID[0], float("inf")
    for params in GRID:
        estimator = _fit_estimator(inner.train, codes, params)
        predicted = estimator.predict(design_matrix(inner.test, codes))
        mae = score(inner.test["error_kmh"], pd.Series(predicted, index=inner.test.index)).mae
        if mae < best_mae:
            best_params, best_mae = params, mae
    return best_params, best_mae


def spot_codes_from(train: pd.DataFrame) -> dict[str, int]:
    return {slug: code for code, slug in enumerate(sorted(train["spot"].dropna().unique()))}


def fit_model(train: pd.DataFrame, use_spot: bool = False, params: dict | None = None) -> Baseline:
    """Train on the full training weeks, after the hyperparameters have been settled."""
    if params is None:
        params, _ = choose_params(train, use_spot)
    codes = spot_codes_from(train) if use_spot else None
    estimator = _fit_estimator(train, codes, params)

    def predict(frame: pd.DataFrame) -> pd.Series:
        if frame.empty:
            return pd.Series(dtype="float64", index=frame.index)
        values = estimator.predict(design_matrix(frame, codes))
        return pd.Series(values, index=frame.index)

    label = "gradient boosting + spot" if use_spot else "gradient boosting"
    return Baseline(name=label, predict=predict)


def permutation_importance(
    method: Baseline,
    frame: pd.DataFrame,
    groups: dict[str, list[str]] | None = None,
    n_repeats: int = 5,
    seed: int = RANDOM_STATE,
) -> pd.Series:
    """How much worse the predictions get when a feature group is shuffled.

    Measured on the held-out weeks, because importance on the training weeks tells you what the
    model memorised rather than what it uses. Read the ranking as indicative only: the rows are
    correlated within an hour, so the numbers carry less information than 18,768 of them suggests.
    """
    groups = groups or FEATURE_GROUPS
    rng = np.random.default_rng(seed)
    reference = score(frame["error_kmh"], method.predict(frame)).mae

    results = {}
    for label, columns in groups.items():
        present = [column for column in columns if column in frame.columns]
        if not present:
            continue
        losses = []
        for _ in range(n_repeats):
            shuffled = frame.copy()
            order = rng.permutation(len(frame))
            # One shared permutation across the group, so a sin/cos pair stays consistent with
            # itself and the model cannot reconstruct the hidden value from its partner.
            for column in present:
                shuffled[column] = frame[column].to_numpy()[order]
            losses.append(score(frame["error_kmh"], method.predict(shuffled)).mae - reference)
        results[label] = float(np.mean(losses))
    return pd.Series(results).sort_values(ascending=False)


def bootstrap_margin(
    actual: pd.Series,
    hours: pd.Series,
    worse: pd.Series,
    better: pd.Series,
    n_resamples: int = 2000,
    seed: int = RANDOM_STATE,
) -> Margin:
    """Is the MAE difference between two methods larger than the noise in 204 hours of weather?

    The resampling unit is the **hour**, not the row. Resampling rows would treat 92 spots in the
    same hour as 92 independent observations of the model's skill, when they are largely one
    observation seen 92 times, and would return an interval far too narrow to be honest.

    It is a paired bootstrap: both methods are scored on the same resampled hours every time, so
    the interval measures the difference between them rather than the variation in how hard the
    weather was.
    """
    frame = pd.DataFrame(
        {
            "hour": hours.to_numpy(),
            "worse": np.abs(actual.to_numpy() - worse.to_numpy()),
            "better": np.abs(actual.to_numpy() - better.to_numpy()),
        }
    )
    grouped = frame.groupby("hour")
    # Per-hour sums and counts are all a resample needs: the MAE over a set of hours is the total
    # absolute error in them divided by the total row count. This turns each of the 2,000 resamples
    # into arithmetic over ~200 numbers instead of ~19,000.
    sum_worse = grouped["worse"].sum().to_numpy()
    sum_better = grouped["better"].sum().to_numpy()
    counts = grouped.size().to_numpy()
    n_hours = len(counts)
    if n_hours == 0:
        return Margin(point=float("nan"), low=float("nan"), high=float("nan"), n_hours=0)

    point = (sum_worse.sum() - sum_better.sum()) / counts.sum()

    rng = np.random.default_rng(seed)
    picks = rng.integers(0, n_hours, size=(n_resamples, n_hours))
    totals = counts[picks].sum(axis=1)
    margins = (sum_worse[picks].sum(axis=1) - sum_better[picks].sum(axis=1)) / totals
    low, high = np.percentile(margins, [2.5, 97.5])
    return Margin(point=float(point), low=float(low), high=float(high), n_hours=n_hours)


def choose_baseline(train: pd.DataFrame) -> tuple[str, Baseline]:
    """Pick which baseline family to use, without letting it see the test weeks.

    This corrects a real unfairness. The model's hyperparameters are chosen on an inner temporal
    split, so the model never sees the test weeks while being tuned. Picking the baseline to beat by
    reading the test column would give the baselines a privilege the model was denied, and would
    make the comparison a contest between a tuned-blind model and an oracle-selected baseline. Both
    sides now choose on the same inner slice and are then refitted on the full training weeks.
    """
    inner = split_by_time(train)
    best_key, best_mae = next(iter(BASELINE_RECIPES)), float("inf")
    for key, recipe in BASELINE_RECIPES.items():
        candidate = recipe(inner.train)
        mae = score(inner.test["error_kmh"], candidate.predict(inner.test)).mae
        if mae < best_mae:
            best_key, best_mae = key, mae
    return best_key, BASELINE_RECIPES[best_key](train)


def rolling_folds(
    frame: pd.DataFrame,
    n_folds: int = 3,
    embargo_hours: int = EMBARGO_HOURS,
) -> list[Split]:
    """Several expanding-window splits, so a result does not rest on one arbitrary boundary.

    A single train/test cut answers "did the model win on these particular eight days". That is one
    draw from a noisy process: the boundary could have landed a week either side and the calm spell
    in the test weeks would have fallen differently. Three folds, each training on everything before
    its window, ask instead whether the model wins *repeatedly*. It is the cheapest defence against
    the most likely way this milestone could be wrong.

    Expanding rather than sliding, because that is how the thing would actually be operated: you
    retrain on all the history you have, not on a fixed-length recent window.
    """
    times = frame["observed_at"]
    start, span = times.min(), times.max() - times.min()
    embargo = pd.Timedelta(hours=embargo_hours)

    folds = []
    for index in range(n_folds):
        low = start + span * (0.5 + 0.5 * index / n_folds)
        high = start + span * (0.5 + 0.5 * (index + 1) / n_folds)
        train = frame[times < low - embargo]
        window = (times >= low) if index == n_folds - 1 else (times >= low) & (times < high)
        test = frame[window]
        folds.append(
            Split(
                train=train.reset_index(drop=True),
                test=test.reset_index(drop=True),
                cutoff=low,
                embargoed_rows=len(frame[(times >= low - embargo) & (times < low)]),
            )
        )
    return folds


def stability_check(frame: pd.DataFrame, n_folds: int = 3, use_spot: bool = True) -> pd.DataFrame:
    """Refit the model and the baselines on every fold and report the margin in each.

    Hyperparameters are re-chosen inside each fold, on that fold's own inner temporal split. Reusing
    the ones picked on the last fold would let every earlier fold benefit from a choice made with
    knowledge of data it is not supposed to have seen, which is a small leak but exactly the kind
    this milestone is about.
    """
    rows = []
    for number, fold in enumerate(rolling_folds(frame, n_folds), start=1):
        best_name, best = choose_baseline(fold.train)
        model = fit_model(fold.train, use_spot=use_spot)
        margin = bootstrap_margin(
            actual=fold.test["error_kmh"],
            hours=fold.test["observed_at"],
            worse=best.predict(fold.test),
            better=model.predict(fold.test),
        )
        rows.append(
            {
                "fold": number,
                "train_hours": fold.train_hours,
                "test_hours": fold.test_hours,
                "best_baseline": best_name,
                "baseline_mae": score(fold.test["error_kmh"], best.predict(fold.test)).mae,
                "model_mae": score(fold.test["error_kmh"], model.predict(fold.test)).mae,
                "margin": margin.point,
                "ci_low": margin.low,
                "ci_high": margin.high,
                "real": margin.is_real,
            }
        )
    return pd.DataFrame(rows)


def out_of_fold_margin(
    frame: pd.DataFrame,
    n_folds: int = 3,
    use_spot: bool = True,
) -> dict[str, Margin]:
    """Two margins, pooled over every fold's honestly out-of-time predictions.

    Better evidence than any single split gives: each row is predicted by a model that saw only
    data from before it, and pooling the folds roughly doubles the hours the interval covers. It
    still cannot capture everything, because the folds share training data, so their errors are not
    independent and the interval is narrower than a fully independent one would be.

    Two versions, because there is no single fair opponent and pretending otherwise would be a
    choice dressed up as a fact:

    * **blind** compares against the baseline family chosen the same way the model's
      hyperparameters were, on an inner split with no sight of the test weeks. Procedurally
      symmetric, and the one that reflects how this would actually be operated.
    * **oracle** compares against whichever baseline turned out best on each fold's test weeks.
      Nothing could pick that in advance, so it is not a real opponent; it is a deliberately unfair
      bar. Beating it means the model is not merely winning a baseline-selection lottery.

    The truth about the model's worth sits between them, and the oracle number is the one a
    ship-or-not decision should lean on.
    """
    actual, hours, blind, oracle, model_predictions = [], [], [], [], []
    for fold in rolling_folds(frame, n_folds):
        _, chosen = choose_baseline(fold.train)
        candidates = fit_all(fold.train)
        best_on_test = min(
            candidates,
            key=lambda item: score(fold.test["error_kmh"], item.predict(fold.test)).mae,
        )
        model = fit_model(fold.train, use_spot=use_spot)

        actual.append(fold.test["error_kmh"])
        hours.append(fold.test["observed_at"])
        blind.append(chosen.predict(fold.test))
        oracle.append(best_on_test.predict(fold.test))
        model_predictions.append(model.predict(fold.test))

    pooled_actual = pd.concat(actual, ignore_index=True)
    pooled_hours = pd.concat(hours, ignore_index=True)
    pooled_model = pd.concat(model_predictions, ignore_index=True)
    return {
        "blind": bootstrap_margin(
            actual=pooled_actual,
            hours=pooled_hours,
            worse=pd.concat(blind, ignore_index=True),
            better=pooled_model,
        ),
        "oracle": bootstrap_margin(
            actual=pooled_actual,
            hours=pooled_hours,
            worse=pd.concat(oracle, ignore_index=True),
            better=pooled_model,
        ),
    }


def train_and_compare(split: Split) -> tuple[pd.DataFrame, list[Baseline]]:
    """Every baseline and both models, scored by the same code on the same held-out weeks."""
    methods: Sequence[Baseline] = [
        *fit_all(split.train),
        fit_model(split.train, use_spot=False),
        fit_model(split.train, use_spot=True),
    ]
    return compare(methods, split), list(methods)


def main() -> None:
    from before_surf.config import get_settings
    from before_surf.correction.evaluate import format_table

    split = load_split(get_settings().database_url)
    print(f"train {len(split.train):,} rows / {split.train_hours} hours")
    print(f"test  {len(split.test):,} rows / {split.test_hours} hours")
    print()

    for use_spot in (False, True):
        params, inner_mae = choose_params(split.train, use_spot)
        label = "with spot" if use_spot else "without spot"
        print(f"chosen on the inner split, {label}: {params}, inner MAE {inner_mae:.3f}")
    print()

    table, methods = train_and_compare(split)
    print(format_table(table))

    by_name = {method.name: method for method in methods}
    chosen_key, chosen_baseline = choose_baseline(split.train)
    print()
    print("=" * 77)
    print(f"Baseline chosen blind on the inner split: {chosen_key}")
    print("=" * 77)

    baseline_prediction = chosen_baseline.predict(split.test)
    for name in ("gradient boosting", "gradient boosting + spot"):
        margin = bootstrap_margin(
            actual=split.test["error_kmh"],
            hours=split.test["observed_at"],
            worse=baseline_prediction,
            better=by_name[name].predict(split.test),
        )
        verdict = "REAL" if margin.is_real else "not distinguishable from noise"
        print(
            f"  {name:<26} {margin.point:+.3f} km/h  "
            f"95% CI [{margin.low:+.3f}, {margin.high:+.3f}] over {margin.n_hours} hours  {verdict}"
        )

    print()
    print("=" * 77)
    print("Does it win repeatedly, or only on this one boundary?")
    print("=" * 77)
    folds = stability_check(pd.concat([split.train, split.test], ignore_index=True))
    for _, row in folds.iterrows():
        print(
            f"  fold {int(row['fold'])}: train {int(row['train_hours']):>3}h  "
            f"test {int(row['test_hours']):>3}h  best baseline {row['best_baseline']:<22} "
            f"{row['baseline_mae']:.3f} vs model {row['model_mae']:.3f}  "
            f"margin {row['margin']:+.3f} [{row['ci_low']:+.3f}, {row['ci_high']:+.3f}]"
            f"{'  REAL' if row['real'] else ''}"
        )
    won = int(folds["real"].sum())
    print(f"  -> the model wins by a margin clear of noise in {won} of {len(folds)} folds.")

    pooled = out_of_fold_margin(pd.concat([split.train, split.test], ignore_index=True))
    print()
    for opponent, margin in pooled.items():
        verdict = "REAL" if margin.is_real else "not distinguishable from noise"
        print(
            f"  pooled across folds vs {opponent:<7} baseline: {margin.point:+.3f} km/h  "
            f"95% CI [{margin.low:+.3f}, {margin.high:+.3f}] "
            f"over {margin.n_hours} hours  {verdict}"
        )

    print()
    print("Permutation importance on the held-out weeks (MAE increase when shuffled):")
    for name in ("gradient boosting", "gradient boosting + spot"):
        print(f"  {name}:")
        for feature, value in permutation_importance(by_name[name], split.test).items():
            print(f"    {feature:<22} {value:+.4f}")


if __name__ == "__main__":
    main()
