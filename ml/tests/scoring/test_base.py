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
