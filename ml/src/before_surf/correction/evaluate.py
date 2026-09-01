"""Baselines for the wind correction, written down before any model exists.

A model's score means nothing on its own. "MAE 2.4 km/h" is neither good nor bad until you know what
the same number is for the laziest thing that could possibly work. This module writes the lazy
things down first, deliberately, because a baseline invented *after* the model is a baseline chosen
to lose. Fixing the bar before taking the shot is the whole point.

Five of them, in increasing order of ambition:

* do nothing, which predicts a correction of exactly zero
* one number for the whole coast
* one number per spot, because the bias ran from -0.81 to +6.20 across the 92
* one number per hour of day, because the bias ran from +4.62 at midnight to +0.61 at 16:00
* one number per spot and hour together, the strongest thing available without a model

Every one of them is fitted on the training weeks and scored on the held-out weeks. Fitting a
per-spot constant on the rows it is then scored against would be the same in-sample optimism that
made the plan's original 2.705 too kind, only worse: there would be 92 constants to overfit with
instead of one.
"""

from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np
import pandas as pd

from before_surf.correction.dataset import Split, load_split

# Below this many training rows, a group's own average is not an estimate, it is noise wearing a
# number's clothes. Such groups fall back to the global constant. With 55,752 training rows across
# 92 spots and 24 hours, the per-spot and per-hour groups are comfortably large; it is the 2,208
# spot-and-hour cells that need the guard.
MIN_GROUP_ROWS = 30


@dataclass(frozen=True)
class Scores:
    """How wrong a set of predictions was, by two different definitions of wrong."""

    mae: float
    rmse: float
    n: int


@dataclass(frozen=True)
class Baseline:
    """A fitted baseline: a name, and a rule for predicting a correction from forecast-time data.

    `by` and `known` are diagnostics rather than machinery. They let the report say what share of
    the rows a grouped baseline actually had an estimate for, which turns out to matter: a baseline
    whose groups were all too thin to trust silently becomes the global constant wearing a
    different name, and without this you would read the two identical rows as a coincidence.
    """

    name: str
    predict: Callable[[pd.DataFrame], pd.Series]
    by: tuple[str, ...] | None = None
    known: pd.Index | None = None


def score(actual: pd.Series, predicted: pd.Series) -> Scores:
    """Mean absolute error and root mean squared error.

    Both are reported because they disagree in a useful way. MAE is the typical miss in km/h, which
    is the number a person can interpret. RMSE squares before averaging, so a single 10 km/h blunder
    hurts it more than five 2 km/h misses do. A method that wins on MAE and loses on RMSE is usually
    one that is right more often but occasionally very wrong, and for a surf forecast that trade is
    worth seeing rather than hiding behind one figure.
    """
    error = np.asarray(actual, dtype="float64") - np.asarray(predicted, dtype="float64")
    if error.size == 0:
        return Scores(mae=float("nan"), rmse=float("nan"), n=0)
    return Scores(
        mae=float(np.abs(error).mean()),
        rmse=float(np.sqrt((error**2).mean())),
        n=int(error.size),
    )


def fit_zero() -> Baseline:
    """Do nothing: trust the forecast exactly as it arrives."""
    return Baseline(name="do nothing", predict=lambda frame: pd.Series(0.0, index=frame.index))


def fit_constant(train: pd.DataFrame, statistic: str = "median") -> Baseline:
    """One correction for the whole coast.

    The choice of statistic is not cosmetic, and it is the trap this milestone is most likely to
    fall into. The mean is the constant that minimises squared error; the **median** is the constant
    that minimises absolute error. Since MAE is the headline number, the median is the honest
    best-constant to beat, and quoting the mean's MAE instead would set the bar slightly too low by
    fitting one loss and reporting another. Both are computed so the gap is visible rather than
    asserted.
    """
    column = train["error_kmh"]
    value = float(column.median() if statistic == "median" else column.mean())
    return Baseline(
        name=f"global {statistic} ({value:+.3f})",
        predict=lambda frame: pd.Series(value, index=frame.index),
    )


def _keys(frame: pd.DataFrame, by: Sequence[str]) -> pd.Index:
    if len(by) == 1:
        return pd.Index(frame[by[0]])
    return pd.MultiIndex.from_frame(frame[list(by)])


def fit_grouped(
    train: pd.DataFrame,
    by: Sequence[str],
    statistic: str = "median",
    min_count: int = MIN_GROUP_ROWS,
) -> Baseline:
    """One correction per group, with a fallback for groups the training weeks never saw.

    The fallback is not defensive padding. At serving time a spot can be added to the database the
    day before it has any history, and a baseline returning NaN for it would silently poison the
    score rather than degrade to the coast-wide correction.
    """
    grouped = train.groupby(list(by), dropna=False)["error_kmh"]
    estimate = grouped.median() if statistic == "median" else grouped.mean()
    estimate = estimate[grouped.size() >= min_count]
    fallback = float(train["error_kmh"].median())

    def predict(frame: pd.DataFrame) -> pd.Series:
        values = estimate.reindex(_keys(frame, by)).to_numpy(dtype="float64")
        return pd.Series(values, index=frame.index).fillna(fallback)

    return Baseline(
        name=f"per {' + '.join(by)}",
        predict=predict,
        by=tuple(by),
        known=estimate.index,
    )


def fit_all(train: pd.DataFrame) -> list[Baseline]:
    """Every baseline the model will have to beat, all fitted on the training weeks only."""
    return [
        fit_zero(),
        fit_constant(train, statistic="mean"),
        fit_constant(train, statistic="median"),
        fit_grouped(train, ["spot"]),
        fit_grouped(train, ["hour"]),
        fit_grouped(train, ["spot", "hour"]),
    ]


def fitted_share(baseline: Baseline, frame: pd.DataFrame) -> float:
    """Share of rows the baseline had a real group estimate for, rather than the fallback."""
    if baseline.by is None or baseline.known is None:
        return 1.0
    if frame.empty:
        return 0.0
    return float(_keys(frame, baseline.by).isin(baseline.known).mean())


def evaluate(split: Split) -> pd.DataFrame:
    """Fit on train, score on both sides, and return the comparison table.

    The training score sits next to the test score on purpose, but read the gap carefully: it is
    not purely overfitting here, because the test weeks are genuinely calmer than the training
    weeks and every method improves on them. What identifies overfitting is a gap *worse* than
    "do nothing" manages on the same two periods. Anything that memorises the training weeks gives
    that advantage back.
    """
    rows = []
    for baseline in fit_all(split.train):
        on_train = score(split.train["error_kmh"], baseline.predict(split.train))
        on_test = score(split.test["error_kmh"], baseline.predict(split.test))
        rows.append(
            {
                "baseline": baseline.name,
                "train_mae": on_train.mae,
                "test_mae": on_test.mae,
                "test_rmse": on_test.rmse,
                "gap": on_test.mae - on_train.mae,
                "fitted": fitted_share(baseline, split.test),
            }
        )
    return pd.DataFrame(rows).sort_values("test_mae").reset_index(drop=True)


def format_table(table: pd.DataFrame) -> str:
    lines = [
        f"{'baseline':<26} {'train MAE':>10} {'test MAE':>10} {'test RMSE':>10} "
        f"{'gap':>8} {'fitted':>8}",
        "-" * 77,
    ]
    for _, row in table.iterrows():
        lines.append(
            f"{row['baseline']:<26} {row['train_mae']:>10.3f} {row['test_mae']:>10.3f} "
            f"{row['test_rmse']:>10.3f} {row['gap']:>+8.3f} {row['fitted']:>7.0%}"
        )
    best = table.iloc[0]
    lines.append("")
    lines.append(f"Best baseline: {best['baseline']} at MAE {best['test_mae']:.3f} km/h.")
    lines.append("A model that does not beat that number is not worth shipping.")
    lines.append("")
    lines.append("`fitted` is the share of test rows the baseline had a real group estimate for.")
    lines.append("A low share means the guard rejected those groups as too thin, and the baseline")
    lines.append("quietly collapsed into the global constant under a different name.")
    return "\n".join(lines)


def main() -> None:
    from before_surf.config import get_settings

    split = load_split(get_settings().database_url)
    print(f"train {len(split.train):,} rows / {split.train_hours} hours")
    print(f"test  {len(split.test):,} rows / {split.test_hours} hours")
    print()
    print(format_table(evaluate(split)))


if __name__ == "__main__":
    main()
