# Milestone 9: forecast correction Implementation Plan

**Goal:** train, evaluate and ship a model that corrects the wind forecast, using the 75,072 paired
examples already in the database. This is the first real ML in the project.

**Why this replaces the original M9.** The original plan was a model predicting "was that session worth
it", trained on user session ratings. That is blocked and will stay blocked: it needs recruited surfers
on the Lisbon coast, and the project owner neither surfs nor lives there. The label report says 0 and no
amount of engineering moves it. Rather than fake a model on nothing, this milestone finds a supervised
problem whose labels **already exist**, and leaves the session model as a later chapter if labels ever
arrive.

**Difficulty:** 🟡 Medium. The modelling is simple; the honesty about what the numbers mean is the hard
part.

**Learning goals:** why a temporal split is mandatory and a random one is a lie, what a baseline is for,
effective sample size when rows are correlated, when a model does *not* earn its place, and getting a
trained artefact into a serving path.

## What the data says, measured before planning

Run against the live database on 2026-08-31.

| Fact | Value |
| --- | --- |
| Paired forecast/archive spot-hours | **75,072** across 92 spots |
| Span of paired data | 2026-07-24 to 2026-08-26, **34 days** |
| Wind: do nothing | MAE **3.371 km/h** |
| Wind: subtract a constant | MAE **2.705 km/h** (constant +2.595) |
| Period: constant correction | 0.385 to 0.390, **worse** |
| Swell height: constant correction | 0.062 to 0.062, **no change** |

**The bias varies, which is what justifies a model at all.** If it were a constant, the answer would be
to subtract 2.595 and go home.

- By forecast wind speed: +3.29 at 0-9 km/h, +2.26 at 10-19, +1.34 at 20-29.
- By hour of day: **+4.62 at midnight, +0.61 at 16:00**, back to +3.43 at 20:00. A clear diurnal cycle.
- By spot: from -0.81 to +6.20, standard deviation 1.62 across the 92.

Those three are all available as features at prediction time, which is what makes this learnable rather
than merely observable.

## Decisions already settled by the measurements

- **Wind speed is the only target.** Period and swell height are already close enough that a constant
  correction does nothing or actively hurts. Modelling them would be effort spent to move a number that
  is not wrong. Wind is also the one that matters most: it is one of the four scoring factors, and
  offshore-versus-onshore is what separates a good day from a ruined one.
- **The baseline to beat is 2.705 km/h MAE**, not 3.371. Beating "do nothing" is trivial and would be a
  dishonest way to report success. The bar is beating a constant offset, which is the simplest thing
  that could possibly work.

## Honest limitations, to be stated in the ADR rather than discovered later

1. **The archive is ERA5 reanalysis, not buoy measurements.** This model learns how the forecast model
   differs from the reanalysis model. That is a real and useful thing (the reanalysis assimilates
   observations the forecast could not have known), but it is **not** "predicting reality" and the ADR
   must not claim it is.
2. **34 days, all summer.** Whatever is learned may not hold in a winter swell regime. The paired set
   grows daily as forecasts age into archive, so this improves on its own, but the first model ships
   with a season's worth of evidence and should say so.
3. **Effective sample size is much smaller than 75,072.** The 92 spots share weather: rows from the same
   hour are highly correlated. There are only ~816 distinct hours. Treating 75k rows as 75k independent
   samples would badly overstate confidence, and the split has to be by **time**, never by row.

---

### Task 1: the training set, and an honest split

- [x] `ml/src/before_surf/correction/dataset.py`: build a frame of paired forecast/archive rows with the
      features available at prediction time (forecast wind speed and direction, swell height, period and
      direction, spot orientation, hour of day, month, spot identity) and the target `a_wind - f_wind`.
- [x] Aggregate in SQL, not in Python. A first attempt pulled 75k joined rows into Python and had not
      returned after 10 minutes; the same question answered in SQL took seconds.
- [x] **Split by time, with a gap.** Train on the earlier weeks, test on the later ones, and drop the
      hours either side of the boundary so a 3-hour weather system cannot appear in both. A random split
      would put 09:00 in train and 10:00 in test at the same beach, which is not prediction, it is
      lookup.
- [x] Tests: the split never shares an hour between train and test; the target is computed in the right
      direction; a null on either side drops the row rather than becoming a zero correction.
- [x] **Commit:** `feat: build the forecast-correction training set`

**Measured after the split existed, and it moves the goalposts.** The table above was computed
in-sample over all 34 days. On the real split (train 606 hours / 55,752 rows, test 204 hours /
18,768 rows, 552 rows embargoed, zero shared hours, all 92 spots on both sides) with the constant
learned on train only:

| Baseline, scored on the held-out weeks | MAE |
| --- | --- |
| Do nothing | **2.945 km/h** |
| Subtract the constant learned on train (+2.725) | **2.427 km/h** |

So **the bar for Task 3 is 2.427, not the 2.705 written above.** The in-sample figure was optimistic
in the ordinary way: it let the constant see the data it was scored on.

Two things worth carrying forward. The bias is not stationary: it is +2.725 on the training weeks and
+2.196 on the test weeks, so some of any gain will be the model tracking drift rather than physics.
And 7.61% of rows have a null `orientation_deg`, the same 7 spots of 92 as elsewhere in the app;
`HistGradientBoostingRegressor` takes NaN natively, so Task 3 should leave them alone rather than
impute a fake bearing.

### Task 2: baselines, written down before any model exists

- [x] `evaluate.py` reporting MAE and RMSE for: do nothing, subtract the global constant, subtract the
      per-spot constant, subtract the per-hour-of-day constant.
- [x] The per-spot and per-hour baselines matter: they are cheap, interpretable, and if one of them beats
      the model then the model is not worth shipping. Writing them first is what stops a mediocre model
      looking good.
- [x] **Commit:** `feat: add forecast-correction baselines`

**Results.** All fitted on the training weeks, all scored on the held-out weeks.

| Baseline | train MAE | test MAE | test RMSE | fitted |
| --- | --- | --- | --- | --- |
| **per hour of day** | 2.435 | **2.333** | 2.988 | 100% |
| global median (+2.500) | 2.809 | 2.390 | 3.088 | 100% |
| per spot + hour | 2.809 | 2.390 | 3.088 | **0%** |
| global mean (+2.725) | 2.814 | 2.427 | 3.118 | 100% |
| per spot | 2.414 | **2.623** | 3.352 | 100% |
| do nothing | 3.512 | 2.945 | 3.777 | 100% |

**The bar for Task 3 is 2.333 km/h**, the per-hour-of-day constant. Three findings, each of which
changes what Task 3 should do.

**1. Per-spot correction does not survive a temporal split.** It is the best baseline on the training
weeks (2.414, better than per-hour) and the second *worst* on the held-out ones (2.623). Read the gap
column against "do nothing": the test weeks are simply calmer, so every honest method improves by
roughly 0.4 to 0.6 when it moves across the boundary. Per spot instead gets 0.208 worse, giving back
about 0.78 km/h relative to the period effect. The per-spot spread of -0.81 to +6.20 that the
exploratory pass found was real for those weeks and did not generalise to the next ones. This is the
clearest possible illustration of why the split had to be by time: a random split would have scored
this baseline at roughly 2.41 and recommended shipping it.

**2. There is not enough data for a per-spot-per-hour correction.** 55,752 training rows over 2,208
cells is about 25 rows each, under the 30-row guard, so every cell was rejected and the baseline
collapsed into the global median. The `fitted` column exists to make that visible: without it the two
identical rows read as a coincidence rather than as a measurement. The finding is real and worth
keeping: 34 days does not support a correction that fine-grained.

**3. The median beats the mean, as the theory says it must.** 2.390 against 2.427. The median is the
constant that minimises absolute error, the mean the one that minimises squared error, so reporting
MAE while fitting the mean would have set the bar a little too low. Small, but it is the exact shape
of error that makes a benchmark quietly dishonest.

**Consequences for Task 3.** Hour of day is the feature that carries real, transferable signal. Spot
identity must be handed to the model with suspicion: it is exactly the feature a gradient booster
will happily memorise, and the per-spot baseline is direct evidence that memorising it does not pay
across time. Train once with it and once without, and let the held-out weeks decide.

### Task 3: the model

- [x] Gradient boosting with scikit-learn's `HistGradientBoostingRegressor`. **Correction: this is a
      new dependency, the plan was wrong.** It is declared in a `train` dependency group rather than
      in `ml`'s runtime requirements, because Render builds the API with `uv sync --all-packages`,
      which installs the default `dev` group but not a named one. So scikit-learn and scipy reach CI
      and this machine, and stay off a 512 MB free-tier instance with no use for them. If Task 4
      decides to serve the model, that cost gets paid deliberately and visibly.
- [x] Compare against **every** baseline from Task 2 on the held-out weeks, not on training data.
- [x] Feature importance, grouped so cyclic pairs are shuffled together.
- [x] **The decision point**, answered below with more evidence than the plan asked for.
- [x] **Commit:** `feat: train the wind forecast correction model`

`loss="absolute_error"`, matching the metric, for the same reason the median beat the mean in Task 2.
Early stopping is done by hand on an inner temporal split: scikit-learn's `early_stopping=True`
carves its validation set out of the training rows **at random**, which would have quietly undone the
whole of Task 1 while reporting no error at all.

**Ranking on the single held-out split.**

| Method | train MAE | test MAE | test RMSE | gap |
| --- | --- | --- | --- | --- |
| **gradient boosting + spot** | 1.432 | **2.203** | 2.829 | +0.771 |
| per hour | 2.435 | 2.333 | 2.988 | -0.102 |
| global median (+2.500) | 2.809 | 2.390 | 3.088 | -0.419 |
| global mean (+2.725) | 2.814 | 2.427 | 3.118 | -0.387 |
| gradient boosting (no spot) | 1.783 | 2.449 | 3.088 | +0.666 |
| per spot | 2.414 | 2.623 | 3.352 | +0.208 |
| do nothing | 3.512 | 2.945 | 3.777 | -0.567 |

**Spot identity is worth 0.25 km/h to the model and costs the baseline 0.29.** The per-spot *constant*
was the second-worst method on the held-out weeks, yet spot is the model's single most important
feature by permutation (+0.42) and the model that uses it beats the model that does not. The two facts
are consistent: a fixed offset per spot is a claim that Carcavelos is windier than forecast by the
same amount at 3am in a storm as at 4pm in a sea breeze, and that claim does not survive to the next
fortnight. The booster uses spot only where it interacts with hour and wind speed, and the tree
structure lets thin spots fall back on their neighbours. **The plan's instruction to hand spot to the
model with suspicion was right, and the suspicion was resolved in the model's favour by measurement.**

**Whether the margin is real.** Three ways of asking, because a single split answers only the weakest
version of the question. The paired bootstrap resamples **hours**, not rows; resampling rows would
treat 92 spots in one hour as 92 independent observations and return an interval far too narrow.

| Question | Margin over the baseline | 95% CI | Verdict |
| --- | --- | --- | --- |
| Single split, vs the blind-chosen baseline | +0.419 | [+0.279, +0.550] | real |
| Single split, vs the best baseline on test | +0.129 | [+0.031, +0.232] | real |
| Pooled over 3 folds, vs blind baselines | +0.440 | [+0.355, +0.531] | real |
| **Pooled over 3 folds, vs oracle baselines** | **+0.276** | **[+0.170, +0.374]** | **real** |

The last row is the one to trust: 402 hours of honestly out-of-time predictions, against an opponent
allowed to pick with hindsight whichever baseline turned out best on each fold. The model still wins.

**But the margin is shrinking, and that is the finding to carry into Task 4.**

| Fold | train | test | baseline | model | margin | 95% CI |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 402h | 136h | 2.626 | 1.688 | +0.938 | [+0.820, +1.054] |
| 2 | 538h | 130h | 2.970 | 2.671 | +0.299 | [+0.117, +0.462] |
| 3 | 668h | 136h | 2.191 | 2.114 | +0.078 | [-0.046, +0.206] |

As a share of the baseline that is 36%, 10%, then 3.6%, and the most recent fold cannot distinguish
the model from its baseline at all. The pooled +0.276 is carried largely by fold 1. Two readings fit:
the later weeks are simply calmer and better forecast, so there is less error left to correct; or the
advantage is genuinely eroding. **Three folds cannot separate those**, and the honest position is that
the model is better on the evidence available while the most recent evidence is the weakest.

Also worth recording: the train/test gap of +0.771 is the largest in the table, so the model *is*
overfitting substantially. That is not disqualifying, since it still wins on data it has never seen,
but it says the ceiling here is data, not architecture.

**Permutation importance** on the held-out weeks, MAE increase when a feature group is shuffled. The
cyclic pairs are shuffled as units; moving `hour_sin` while leaving `hour_cos` in place would let the
model reconstruct the hour and report the feature as unimportant.

| Feature | with spot | without spot |
| --- | --- | --- |
| spot | +0.42 | n/a |
| hour of day | +0.25 | +0.25 |
| wind bearing | +0.14 | +0.06 |
| forecast wind speed | +0.14 | +0.06 |
| swell period | +0.04 | +0.03 |
| swell height | +0.04 | +0.12 |
| wind vs shore | +0.00 | +0.05 |

Hour of day is confirmed as the exploratory pass suggested. `wind_offshore_deg` contributing nothing
once spot is present is expected: spot fixes the orientation, so the offshore angle becomes a
redundant recoding of the wind bearing. These values move in the third decimal between runs (parallel
float reductions inside the booster are not bit-reproducible); the ranking is stable, the last digit
is not.

### Task 4: into the serving path, or not

**Decision: ship the per-hour table, not the model.** Taken by the project owner against the
measurements below, and recorded in ADR-0009.

The question Task 3 could not answer is whether 0.13 km/h of MAE is worth anything to a person. It
is not an ML question, so it needed a different measurement: score every held-out spot-hour three
ways and compare against the score the archive wind implies. The app shows one decimal, with a
colour band at 3, 5 and 7.

| Version | mean score error | band word wrong |
| --- | --- | --- |
| raw forecast | 0.129 | 7.6% |
| per-hour table | 0.099 | 6.1% |
| gradient boosting | 0.094 | 5.5% |

Correcting at all is clearly worth it: it flips 487 bands toward truth against 215 away. The model
buys **0.6 further percentage points**, and costs scikit-learn plus scipy in the API's runtime
dependencies: **+75 MB RSS** on a 512 MB Render instance, measured, not guessed. The table is 24
numbers that can be printed in a UI string. The model's remaining edge is also smaller than the
fold-to-fold instability Task 3 documented, where the most recent fold could not distinguish them.

- [x] Persist the artefact and load it in the API; apply the correction to `wind_speed_kmh` before
      scoring, and report it in every endpoint as `wind_correction_kmh`.
- [x] The correction is **visible**: `ScoreBreakdown` says "wind adjusted by +3.2 km/h against the
      published forecast", so a surfer comparing BeFORE against another forecast learns why they
      differ rather than concluding one is broken.
- [x] Degrades to the raw forecast when the artefact is absent, with tests per endpoint.
- [x] Tests both sides, and seven mutations of the serving path, all caught.
- [x] **Commit:** `feat: apply the wind correction when scoring`

Four decisions worth more than the code.

**Keyed by local hour, not UTC.** The bias is diurnal, which is a fact about the sun. All 34 days of
training data are summer, so the two agree up to a constant +1 and the distinction is invisible
today. It stops being invisible when the clocks go back, at which point a UTC table would apply the
04:00 correction at 03:00 all winter: silent, seasonal, and very hard to find. Designed out rather
than noted.

**Archive rows are never corrected.** The correction *is* the gap between forecast and ERA5, so
applying it to an archive row adds that gap to the thing it was measured against. `/conditions-at`
prefers archive rows, so this was live, not hypothetical. Live testing then caught a second-order
version of the same mistake: those rows were reporting a correction of `0.0`, which claims "we
looked and decided nothing was needed" when the truth is "this is not the kind of thing we correct".
They now report null.

**The shipped table is fitted on all 75,072 rows, the quoted score is the held-out one.** The split
existed to produce an honest estimate; having got it, withholding a quarter of the evidence from the
shipped coefficients would be superstition. The two fits are separate and the metadata records the
held-out number, so the artefact cannot quietly quote a score it was allowed to see the answers for.

**The builder refuses to write a table that loses to doing nothing.** This script runs again every
time the data grows. Without the gate, the day eventually comes when it silently ships a correction
that makes the forecast worse.

The shipped table, +km/h added to the forecast wind by local hour:

| 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| +4.40 | +4.15 | +4.05 | +4.20 | +3.50 | +3.50 | +3.30 | +3.60 | +3.80 | +1.70 | +1.10 | +1.50 |

| 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| +1.50 | +1.10 | +0.80 | +0.20 | +0.40 | +0.50 | +0.80 | +1.10 | +2.00 | +3.20 | +3.80 | +4.10 |

Held out: MAE 2.333 against 2.945 for doing nothing, an improvement of 0.613 km/h.

One incidental change: `/scores` now returns `observed_at`. It had to, since the correction needs to
know which hour it is correcting, and the endpoint picks the nearest future hour per spot, which is
not guaranteed to be the same hour for every spot.

### Task 5: ADR and learnings

- [ ] **ADR-0009**: why the label source changed, what the model actually learns (forecast versus
      reanalysis, not versus reality), the baseline it had to beat, and the seasonal limitation.
- [ ] Update the spec: the roadmap, and the fact that the session-rating model is now deferred rather
      than next.
- [ ] `label_report.py` keeps its bar unchanged. The session model is still the goal; this milestone does
      not lower it, it works around the blockage.
- [ ] **Commit:** `docs: record the forecast-correction decisions`

## Definition of done

- A number: the model's MAE on held-out weeks, next to all four baselines, with the winner stated plainly
  even if the winner is a baseline.
- If shipped: the score reflects a corrected wind, and the app says so.
- An ADR that a stranger could read to understand what the model does and does not know.

## Deferred, still

- The session-rating model, whenever labels exist. The report bar is unchanged: 80 examples, minority
  class at least 25%.
- Correcting period or swell height, unless the measurements change.
- Bathymetry, and with it any honest tide term in the score.
