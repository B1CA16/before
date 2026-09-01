"""The baselines, and in particular that they never see the data they are scored on."""

import numpy as np
import pandas as pd
import pytest

from before_surf.correction.dataset import Split
from before_surf.correction.evaluate import (
    MIN_GROUP_ROWS,
    evaluate,
    fit_all,
    fit_constant,
    fit_grouped,
    fit_zero,
    fitted_share,
    score,
)


def frame_of(errors, spots=None, hours=None) -> pd.DataFrame:
    """A minimal frame with the columns the baselines actually read."""
    n = len(errors)
    return pd.DataFrame(
        {
            "error_kmh": [float(e) for e in errors],
            "spot": spots if spots is not None else ["spot-0"] * n,
            "hour": hours if hours is not None else [12] * n,
        }
    )


class TestScore:
    def test_known_values(self):
        actual = pd.Series([1.0, 2.0, 3.0])
        predicted = pd.Series([1.0, 4.0, 7.0])
        # Errors 0, -2, -4: MAE 2, RMSE sqrt(20/3).
        result = score(actual, predicted)
        assert result.mae == pytest.approx(2.0)
        assert result.rmse == pytest.approx(np.sqrt(20 / 3))
        assert result.n == 3

    def test_rmse_never_below_mae(self):
        """A mathematical guarantee, worth asserting so a wrong formula cannot pass unnoticed."""
        rng = np.random.default_rng(0)
        for _ in range(20):
            actual = pd.Series(rng.normal(size=50))
            predicted = pd.Series(rng.normal(size=50))
            result = score(actual, predicted)
            assert result.rmse >= result.mae - 1e-12

    def test_rmse_punishes_one_blunder_more_than_mae_does(self):
        """The reason both are reported: they rank these two methods differently."""
        actual = pd.Series([0.0] * 10)
        spread = score(actual, pd.Series([2.0] * 10))
        blunder = score(actual, pd.Series([20.0] + [0.0] * 9))
        assert blunder.mae == spread.mae
        assert blunder.rmse > spread.rmse

    def test_empty_input_is_not_a_crash(self):
        result = score(pd.Series(dtype="float64"), pd.Series(dtype="float64"))
        assert result.n == 0
        assert np.isnan(result.mae)


class TestBaselines:
    def test_zero_predicts_no_correction(self):
        frame = frame_of([5.0, -3.0])
        assert (fit_zero().predict(frame) == 0.0).all()

    def test_median_beats_mean_on_mae_when_the_data_is_skewed(self):
        """The estimator has to match the loss: the median minimises MAE, the mean minimises MSE."""
        train = frame_of([1.0, 1.0, 1.0, 1.0, 50.0])
        by_median = fit_constant(train, statistic="median")
        by_mean = fit_constant(train, statistic="mean")
        mae_median = score(train["error_kmh"], by_median.predict(train)).mae
        mae_mean = score(train["error_kmh"], by_mean.predict(train)).mae
        rmse_median = score(train["error_kmh"], by_median.predict(train)).rmse
        rmse_mean = score(train["error_kmh"], by_mean.predict(train)).rmse
        assert mae_median < mae_mean
        assert rmse_mean < rmse_median

    def test_grouped_recovers_a_real_per_group_offset(self):
        n = MIN_GROUP_ROWS
        train = frame_of([2.0] * n + [8.0] * n, spots=["a"] * n + ["b"] * n)
        baseline = fit_grouped(train, ["spot"])
        unseen_rows = frame_of([0.0, 0.0], spots=["a", "b"])
        assert list(baseline.predict(unseen_rows)) == pytest.approx([2.0, 8.0])

    def test_an_unseen_group_falls_back_to_the_global_constant(self):
        n = MIN_GROUP_ROWS
        train = frame_of([2.0] * n + [8.0] * n, spots=["a"] * n + ["b"] * n)
        baseline = fit_grouped(train, ["spot"])
        predicted = baseline.predict(frame_of([0.0], spots=["brand-new-spot"]))
        assert predicted.iloc[0] == pytest.approx(train["error_kmh"].median())
        assert predicted.notna().all()

    def test_a_group_thinner_than_the_guard_falls_back(self):
        """Three rows saying +40 is noise, and the baseline must refuse to believe it."""
        big = MIN_GROUP_ROWS
        train = frame_of([2.0] * big + [40.0] * 3, spots=["a"] * big + ["tiny"] * 3)
        baseline = fit_grouped(train, ["spot"])
        assert baseline.predict(frame_of([0.0], spots=["tiny"])).iloc[0] != pytest.approx(40.0)
        assert baseline.predict(frame_of([0.0], spots=["a"])).iloc[0] == pytest.approx(2.0)

    def test_a_multi_column_group_works(self):
        n = MIN_GROUP_ROWS
        train = frame_of(
            [2.0] * n + [9.0] * n,
            spots=["a"] * (2 * n),
            hours=[6] * n + [18] * n,
        )
        baseline = fit_grouped(train, ["spot", "hour"])
        query = frame_of([0.0, 0.0], spots=["a", "a"], hours=[6, 18])
        assert list(baseline.predict(query)) == pytest.approx([2.0, 9.0])

    def test_predictions_never_contain_nan(self):
        n = MIN_GROUP_ROWS
        train = frame_of([2.0] * n, spots=["a"] * n, hours=[6] * n)
        for baseline in fit_all(train):
            assert baseline.predict(frame_of([0.0], spots=["z"], hours=[23])).notna().all()


class TestNoLeakage:
    def test_a_fitted_baseline_ignores_the_targets_of_the_frame_it_scores(self):
        """The leak that would matter: predictions must depend on train, never on test's answers."""
        n = MIN_GROUP_ROWS
        train = frame_of([2.0] * n + [8.0] * n, spots=["a"] * n + ["b"] * n)
        test = frame_of([0.0, 0.0], spots=["a", "b"])
        tampered = test.copy()
        tampered["error_kmh"] = [999.0, -999.0]
        for baseline in fit_all(train):
            assert list(baseline.predict(test)) == pytest.approx(list(baseline.predict(tampered)))


class TestEvaluate:
    def make_split(self) -> Split:
        n = MIN_GROUP_ROWS * 2
        rng = np.random.default_rng(1)
        spots = ["a", "b"] * n
        # A genuine per-spot signal plus noise, so the grouped baselines have something to find.
        offsets = np.where(np.array(spots) == "a", 2.0, 8.0)
        train = frame_of(offsets + rng.normal(0, 1, size=2 * n), spots=spots)
        test = frame_of(offsets + rng.normal(0, 1, size=2 * n), spots=spots)
        return Split(train=train, test=test, cutoff=pd.NaT, embargoed_rows=0)

    def test_every_baseline_appears_once_with_finite_scores(self):
        table = evaluate(self.make_split())
        assert len(table) == len(fit_all(self.make_split().train))
        assert table["baseline"].is_unique
        assert np.isfinite(table[["train_mae", "test_mae", "test_rmse"]].to_numpy()).all()

    def test_the_table_is_sorted_best_first(self):
        table = evaluate(self.make_split())
        assert list(table["test_mae"]) == sorted(table["test_mae"])

    def test_a_real_per_group_signal_beats_the_global_constant(self):
        table = evaluate(self.make_split()).set_index("baseline")
        per_spot = table.loc["per spot", "test_mae"]
        global_median = table.filter(like="global median", axis=0)["test_mae"].iloc[0]
        assert per_spot < global_median

    def test_do_nothing_is_present_and_beaten(self):
        table = evaluate(self.make_split()).set_index("baseline")
        assert table.loc["do nothing", "test_mae"] > table["test_mae"].min()


class TestFittedShare:
    def test_an_ungrouped_baseline_is_fitted_everywhere(self):
        train = frame_of([1.0] * MIN_GROUP_ROWS)
        assert fitted_share(fit_zero(), train) == 1.0
        assert fitted_share(fit_constant(train), train) == 1.0

    def test_it_reports_the_share_that_had_a_real_estimate(self):
        n = MIN_GROUP_ROWS
        train = frame_of([2.0] * n + [8.0] * n, spots=["a"] * n + ["b"] * n)
        baseline = fit_grouped(train, ["spot"])
        query = frame_of([0.0] * 4, spots=["a", "b", "unseen", "unseen"])
        assert fitted_share(baseline, query) == pytest.approx(0.5)

    def test_groups_rejected_by_the_guard_do_not_count_as_fitted(self):
        """The real finding: a baseline whose groups are all too thin reports 0%, not 100%."""
        n = MIN_GROUP_ROWS
        train = frame_of([2.0] * n + [40.0] * 3, spots=["a"] * n + ["tiny"] * 3)
        baseline = fit_grouped(train, ["spot"])
        assert fitted_share(baseline, frame_of([0.0], spots=["tiny"])) == 0.0
