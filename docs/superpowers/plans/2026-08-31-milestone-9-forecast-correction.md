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

- [ ] `evaluate.py` reporting MAE and RMSE for: do nothing, subtract the global constant, subtract the
      per-spot constant, subtract the per-hour-of-day constant.
- [ ] The per-spot and per-hour baselines matter: they are cheap, interpretable, and if one of them beats
      the model then the model is not worth shipping. Writing them first is what stops a mediocre model
      looking good.
- [ ] **Commit:** `feat: add forecast-correction baselines`

### Task 3: the model

- [ ] Gradient boosting (start with scikit-learn's `HistGradientBoostingRegressor`, no new dependency).
      Tabular, non-linear, handles the interaction between hour, spot and wind speed, and trains in
      seconds on this size.
- [ ] Compare against **every** baseline from Task 2 on the held-out weeks, not on training data.
- [ ] Feature importance, to check the model is using hour and spot the way the exploratory numbers
      suggest. If it is not, one of the two is wrong and that is worth knowing.
- [ ] **A real decision point:** if the model does not beat the best simple baseline by a margin that
      survives the small effective sample size, **ship the baseline instead** and record why. A constant
      per spot that beats gradient boosting is a legitimate and publishable result.
- [ ] **Commit:** `feat: train the wind forecast correction model`

### Task 4: into the serving path, or not

- [ ] If the model wins: persist the artefact, load it in the API, and apply the correction to
      `wind_speed_kmh` before scoring. The correction must be **visible**, not silent: the spot page
      should be able to say the wind was adjusted.
- [ ] The scorer must keep working when the artefact is missing, degrading to the raw forecast. Same
      discipline as the rest of the app: a missing model is a degraded feature, not an outage.
- [ ] Tests: a known input produces a known corrected output; an absent artefact falls back cleanly.
- [ ] **Commit:** `feat: apply the wind correction when scoring`

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
