"""The Scorer interface: any brain that turns a features DataFrame into 0-to-10 scores."""

from abc import ABC, abstractmethod

import pandas as pd


class Scorer(ABC):
    @abstractmethod
    def score(self, features: pd.DataFrame) -> pd.Series:
        """Return a Series of BeFORE scores in [0, 10], aligned to features.index."""
