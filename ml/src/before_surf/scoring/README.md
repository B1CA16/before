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

Face-validity report: `ml/notebooks/eval_heuristic.py`.
