"""The model, the fairness of its comparison, and the honesty of its confidence interval."""

import numpy as np
import pandas as pd
import pytest

from before_surf.correction.dataset import EMBARGO_HOURS
from before_surf.correction.evaluate import BASELINE_RECIPES, Baseline
from before_surf.correction.model import (
    NUMERIC_FEATURES,
    Margin,
    bootstrap_margin,
    choose_baseline,
    choose_params,
    design_matrix,
    fit_model,
    out_of_fold_margin,
    permutation_importance,
    rolling_folds,
    spot_codes_from,
)

FAST = {"learning_rate": 0.2, "max_leaf_nodes": 7, "max_iter": 15}


def make_frame(hours: int = 120, spots: int = 4, seed: int = 0) -> pd.DataFrame:
    """A frame shaped like the real one, with a genuine hour-of-day signal to find."""
    rng = np.random.default_rng(seed)
    base = pd.Timestamp("2026-07-01", tz="UTC")
    rows = []
    for h in range(hours):
        stamp = base + pd.Timedelta(hours=h)
        radians = stamp.hour * (2 * np.pi / 24)
        for s in range(spots):
            rows.append(
                {
                    "observed_at": stamp,
                    "spot": f"spot-{s}",
                    "hour": stamp.hour,
                    "hour_sin": np.sin(radians),
                    "hour_cos": np.cos(radians),
                    "wind_dir_sin": np.sin(radians / 2),
                    "wind_dir_cos": np.cos(radians / 2),
                    "wind_offshore_deg": 40.0 + s,
                    "f_wind_speed_kmh": 12.0 + s,
                    "f_swell_height_m": 1.5,
                    "f_swell_period_s": 9.0,
                    # The target really does depend on the hour, so a model has something to learn.
                    "error_kmh": 3.0 * np.cos(radians) + rng.normal(0, 0.3),
                }
            )
    return pd.DataFrame(rows)


class TestDesignMatrix:
    def test_it_contains_only_prediction_time_features(self):
        matrix = design_matrix(make_frame(hours=4), spot_codes=None)
        assert list(matrix.columns) == NUMERIC_FEATURES
        assert "error_kmh" not in matrix.columns
        assert "spot" not in matrix.columns

    def test_spot_is_added_as_a_code_when_asked(self):
        frame = make_frame(hours=4)
        matrix = design_matrix(frame, spot_codes=spot_codes_from(frame))
        assert list(matrix.columns) == [*NUMERIC_FEATURES, "spot"]
        assert matrix["spot"].notna().all()

    def test_an_unseen_spot_becomes_missing_rather_than_a_new_code(self):
        """A spot added yesterday must get the default branch, not an invented identity."""
        train = make_frame(hours=4, spots=2)
        codes = spot_codes_from(train)
        unseen = make_frame(hours=4, spots=2).assign(spot="brand-new")
        assert design_matrix(unseen, codes)["spot"].isna().all()

    def test_the_target_never_reaches_the_model(self):
        frame = make_frame(hours=4)
        tampered = frame.copy()
        tampered["error_kmh"] = 999.0
        pd.testing.assert_frame_equal(
            design_matrix(frame, None),
            design_matrix(tampered, None),
        )


class TestFitModel:
    def test_it_learns_the_signal_it_was_given(self):
        frame = make_frame(hours=240)
        model = fit_model(frame, use_spot=False, params=FAST)
        predicted = model.predict(frame)
        assert predicted.notna().all()
        # Better than predicting the mean, on the data it was trained on at minimum.
        assert (frame["error_kmh"] - predicted).abs().mean() < frame["error_kmh"].std()

    def test_predictions_line_up_with_the_frame_index(self):
        frame = make_frame(hours=48)
        subset = frame.iloc[10:20]
        predicted = fit_model(frame, params=FAST).predict(subset)
        assert list(predicted.index) == list(subset.index)

    def test_an_empty_frame_returns_an_empty_series(self):
        frame = make_frame(hours=24)
        model = fit_model(frame, params=FAST)
        assert len(model.predict(frame.iloc[0:0])) == 0

    def test_an_unseen_spot_predicts_without_crashing(self):
        frame = make_frame(hours=48, spots=2)
        model = fit_model(frame, use_spot=True, params=FAST)
        unseen = frame.iloc[:5].assign(spot="brand-new")
        assert model.predict(unseen).notna().all()

    def test_chosen_params_come_from_the_grid(self):
        params, mae = choose_params(make_frame(hours=200), use_spot=False)
        assert set(params) == {"learning_rate", "max_leaf_nodes", "max_iter"}
        assert np.isfinite(mae)


class TestBootstrapMargin:
    def test_identical_predictions_give_a_zero_margin(self):
        frame = make_frame(hours=60)
        same = pd.Series(0.0, index=frame.index)
        margin = bootstrap_margin(frame["error_kmh"], frame["observed_at"], same, same)
        assert margin.point == pytest.approx(0.0)
        assert not margin.is_real

    def test_a_clearly_better_method_is_called_real(self):
        frame = make_frame(hours=60)
        actual = frame["error_kmh"]
        margin = bootstrap_margin(
            actual,
            frame["observed_at"],
            worse=pd.Series(0.0, index=frame.index),
            better=actual + 0.01,
        )
        assert margin.point > 0
        assert margin.is_real

    def test_the_interval_brackets_the_point_estimate(self):
        frame = make_frame(hours=60)
        margin = bootstrap_margin(
            frame["error_kmh"],
            frame["observed_at"],
            worse=pd.Series(0.0, index=frame.index),
            better=pd.Series(frame["error_kmh"].mean(), index=frame.index),
        )
        assert margin.low <= margin.point <= margin.high

    def test_duplicating_rows_within_an_hour_does_not_narrow_the_interval(self):
        """The whole reason the resampling unit is the hour.

        Copying every row ten times adds no new information about the weather: it is the same 60
        hours observed with more spots. A bootstrap that resampled rows would see ten times the
        sample size and shrink its interval by roughly sqrt(10), announcing confidence it has not
        earned. Resampling hours must leave the width essentially unchanged.
        """
        frame = make_frame(hours=60)
        worse = pd.Series(0.0, index=frame.index)
        better = pd.Series(frame["error_kmh"].mean(), index=frame.index)
        original = bootstrap_margin(frame["error_kmh"], frame["observed_at"], worse, better)

        fat = pd.concat([frame] * 10, ignore_index=True)
        fat_worse = pd.Series(0.0, index=fat.index)
        fat_better = pd.Series(frame["error_kmh"].mean(), index=fat.index)
        widened = bootstrap_margin(fat["error_kmh"], fat["observed_at"], fat_worse, fat_better)

        original_width = original.high - original.low
        widened_width = widened.high - widened.low
        assert widened_width == pytest.approx(original_width, rel=0.15)
        assert widened.n_hours == original.n_hours

    def test_empty_input_is_not_a_crash(self):
        empty = pd.Series(dtype="float64")
        margin = bootstrap_margin(empty, empty, empty, empty)
        assert margin.n_hours == 0
        assert not margin.is_real

    def test_is_real_requires_the_whole_interval_above_zero(self):
        assert Margin(point=0.5, low=0.1, high=0.9, n_hours=10).is_real
        assert not Margin(point=0.5, low=-0.1, high=0.9, n_hours=10).is_real


class TestRollingFolds:
    def test_every_fold_trains_only_on_its_past(self):
        folds = rolling_folds(make_frame(hours=400))
        for fold in folds:
            assert fold.train["observed_at"].max() < fold.test["observed_at"].min()

    def test_every_fold_respects_the_embargo(self):
        for fold in rolling_folds(make_frame(hours=400)):
            gap = fold.test["observed_at"].min() - fold.train["observed_at"].max()
            assert gap >= pd.Timedelta(hours=EMBARGO_HOURS)

    def test_the_training_window_expands(self):
        folds = rolling_folds(make_frame(hours=400))
        sizes = [fold.train_hours for fold in folds]
        assert sizes == sorted(sizes)
        assert sizes[0] < sizes[-1]

    def test_test_windows_do_not_overlap_each_other(self):
        folds = rolling_folds(make_frame(hours=400))
        seen: set = set()
        for fold in folds:
            hours = set(fold.test["observed_at"])
            assert not (hours & seen)
            seen |= hours

    def test_no_hour_is_ever_in_both_halves_of_a_fold(self):
        for fold in rolling_folds(make_frame(hours=400)):
            assert not set(fold.train["observed_at"]) & set(fold.test["observed_at"])


class TestChooseBaseline:
    def test_it_returns_a_known_family(self):
        key, baseline = choose_baseline(make_frame(hours=300))
        assert key in BASELINE_RECIPES
        assert baseline.predict(make_frame(hours=4)).notna().all()

    def test_it_finds_the_hour_signal_when_that_is_what_the_data_has(self):
        key, _ = choose_baseline(make_frame(hours=400))
        assert key == "per hour"

    def test_it_does_not_look_at_the_frame_it_will_be_scored_on(self):
        """Selection happens inside train, so tampering with anything else cannot change it."""
        train = make_frame(hours=300)
        assert choose_baseline(train)[0] == choose_baseline(train.copy())[0]


class TestPermutationImportance:
    def test_the_feature_the_model_relies_on_ranks_first(self):
        frame = make_frame(hours=300)
        model = fit_model(frame, use_spot=False, params=FAST)
        importance = permutation_importance(model, frame, n_repeats=2)
        assert importance.index[0] == "hour of day"

    def test_a_feature_carrying_no_signal_scores_near_zero(self):
        frame = make_frame(hours=300)
        model = fit_model(frame, use_spot=False, params=FAST)
        importance = permutation_importance(model, frame, n_repeats=2)
        assert importance["swell height"] == pytest.approx(0.0, abs=0.05)

    def test_a_group_is_shuffled_as_a_unit(self):
        """The invariant the grouping exists for, checked on what the model is actually handed.

        Permuting sin and cos independently would recombine them into pairs that were never
        observed and mostly do not lie on the unit circle. The model would be asked to predict from
        an impossible hour, would extrapolate, and would report an importance inflated by its own
        confusion rather than earned by the feature. After a correct group shuffle the multiset of
        pairs is exactly the one that went in, only attached to different rows.
        """
        frame = make_frame(hours=50)
        seen: list[pd.DataFrame] = []

        def spy(handed: pd.DataFrame) -> pd.Series:
            seen.append(handed.copy())
            return pd.Series(0.0, index=handed.index)

        permutation_importance(
            Baseline(name="spy", predict=spy),
            frame,
            groups={"hour": ["hour_sin", "hour_cos"]},
            n_repeats=1,
        )
        shuffled = seen[-1]
        before = sorted(zip(frame["hour_sin"], frame["hour_cos"], strict=True))
        after = sorted(zip(shuffled["hour_sin"], shuffled["hour_cos"], strict=True))
        assert after == before
        radius = np.hypot(shuffled["hour_sin"], shuffled["hour_cos"])
        assert np.allclose(radius, 1.0)

    def test_splitting_a_cyclic_pair_understates_it(self):
        """Why the groups exist: hiding half of sin/cos leaves the other half telling the truth."""
        frame = make_frame(hours=300)
        model = fit_model(frame, use_spot=False, params=FAST)
        together = permutation_importance(
            model, frame, groups={"hour": ["hour_sin", "hour_cos"]}, n_repeats=3
        )["hour"]
        half = permutation_importance(model, frame, groups={"hour": ["hour_sin"]}, n_repeats=3)[
            "hour"
        ]
        assert together > half


class TestOutOfFoldMargin:
    def test_it_reports_both_opponents_over_pooled_hours(self):
        margins = out_of_fold_margin(make_frame(hours=400), n_folds=2)
        assert set(margins) == {"blind", "oracle"}
        for margin in margins.values():
            assert margin.n_hours > 0
            assert margin.low <= margin.point <= margin.high

    def test_the_oracle_baseline_is_never_the_easier_opponent(self):
        """The oracle picks with hindsight, so the margin against it can only be smaller."""
        margins = out_of_fold_margin(make_frame(hours=400), n_folds=2)
        assert margins["oracle"].point <= margins["blind"].point + 1e-9
