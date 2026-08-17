# Scoring (the BeFORE score)

Turns a features DataFrame into a 0-to-10 BeFORE score.

## Design

- `base.Scorer` (ABC): the contract `score(features) -> Series`. HeuristicScorer implements it now;
  MLScorer will implement the same contract in M7, swappable with no changes elsewhere.
- `ramps.py`: raw features -> [0,1] sub-scores via calibrated piecewise-linear ramps
  (period, size, wind, exposure).
- `heuristic.HeuristicScorer`: combines the 4 sub-scores by harmonic mean x 10. The harmonic mean is
  conjunctive: any factor at zero vetoes the score (shadowed spot, gale onshore, dead flat), while
  good-all-round conditions score high. NaN (unknown orientation) propagates.
- `heuristic.explain(features)`: per-factor [0,1] breakdown plus the final score.
- `evaluation.py`: scorer-agnostic distribution and per-spot summaries.

## Evaluation status

No labels exist yet, so we cannot measure accuracy. M4 validates (a) the scorer's logic via
property tests (monotonicity, vetoes, perfect vs garbage) and (b) face validity on the real archive
(distribution, per-spot behavior, explanations). True label-based metrics (rank correlation, and the
heuristic-vs-model baseline comparison) arrive in M7 once M6 collects user session ratings.

Face-validity report: `ml/notebooks/eval_heuristic.py`.

## Calibration history

**2026-08-17, the score collapse.** In production every scored spot on the coast read exactly 0.0,
while the per-spot forecast timeline showed sensible numbers. Two mistakes compounded:

1. **The ramp floors were set where conditions became good, not where they became unsurfable.** The
   period floor sat at 6 s, so the 5.7 s wind swell running that day scored a hard 0.
2. **A conjunctive combiner turns one zero into a total zero.** Correct when a factor is physically
   absent, wrong when the factor is merely poor. 85 of 92 spots shared the value 0.0, so the ranking
   carried no information at all. The timeline still looked fine because it plots hours that
   included better periods.

Calibration then compared combiners and floors over a year of archive data, 202,032 spot-hours
(`ml/notebooks/calibrate_heuristic.py`):

| config | exactly 0 | median | 7 and up |
| --- | --- | --- | --- |
| A. floors 6-12 s, geometric (the bug) | 35.4% | 4.4 | 17.7% |
| B. floors 3-13 s, geometric | 27.2% | 5.4 | 24.5% |
| C. floors 4-12 s, harmonic | 27.2% | 4.7 | 19.5% |
| **D. floors 3-13 s, harmonic (chosen)** | **26.6%** | **4.8** | **17.9%** |

Two things the numbers settled:

- **Softer floors alone were not enough.** They only moved the zeros from 35% to 27%. The rest are
  `exposure = 0`, beaches facing away from the swell, which genuinely receive no waves. Those zeros
  are correct and were deliberately kept.
- **The geometric mean was too forgiving on everything else.** With four factors it takes a fourth
  root, so a 0.2 alongside three 0.9s still scored about 6.2, and option B called a quarter of all
  spot-hours "firing". The harmonic mean vetoes on zero just the same but makes the weakest link
  bind much harder, giving 3.7 for those same factors.

D was chosen because it fixes the collapse while leaving the rate of "good" surf almost exactly
where the M4 face-validity pass had put it (17.9% against 17.7%), so the change buys back the
ranking without quietly inflating scores.

Note what this calibration is and is not. It fixes *ordering*, which is what the product needs to
rank spots, using distributional plausibility as the only available yardstick. Whether a 7 truly
means a session worth driving to is unfalsifiable until real ratings exist. That is M7's job, and
the reason the heuristic is the baseline the ML model must beat rather than its training target.
