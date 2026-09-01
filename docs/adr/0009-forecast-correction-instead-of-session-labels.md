# ADR 0009: Forecast correction instead of session labels, and a table instead of the model

- Status: accepted
- Date: 2026-09-01

## Context

M9 was meant to be the first real ML: train an `MLScorer` on session ratings and beat the heuristic.
It could not be done, and the reason is not an engineering one.

The label report reads **0**, and the bar it has to clear is 80 labels with the smaller class at
least 25%. Labels come from surfers rating sessions they actually surfed. The project owner neither
surfs nor lives on the Lisbon coast, so those labels have to come from recruited strangers. M8 was
inserted to make the site worth using, and it did: Portuguese, spot pages, tide, favourites, SEO. It
did not produce four or five Lisbon surfers willing to log twenty sessions each.

The available responses were: fabricate labels, rate sessions from the sofa, wait indefinitely, or
find a supervised problem whose labels already exist. The first two poison the training set with the
heuristic's own opinion, which is the circularity trap this project has avoided from the start. The
third is not a milestone.

## Decision 1: correct the wind forecast, using labels that already exist

**75,072 paired rows** already sat in the database: every forecast hour that has since aged into an
archive hour, for 92 spots over 34 days. The target is `archive_wind - forecast_wind`, the amount
the forecast was wrong by. No new ingestion, no recruitment, and a genuinely supervised problem.

Predicting the *error* rather than the wind is deliberate. It makes "do nothing" a prediction of
exactly zero, so the model is measured against the thing it is supposed to improve rather than
against the variance of wind itself, which is large and would not be its achievement.

Wind alone. Measured first: a constant correction moves period MAE from 0.385 to 0.390, which is
worse, and swell height from 0.062 to 0.062, which is nothing. Only wind is wrong enough to fix.

## What this model actually learns, stated plainly

**Open-Meteo's archive is ERA5 reanalysis, not buoy measurements.** So this learns the gap between a
forecast model and a reanalysis model. That gap is real and useful, because the reanalysis
assimilates observations the forecast could not have known, but it is **not** the gap between a
forecast and reality, and nothing in the app should claim it is.

The second limitation is the calendar. Thirty-four days, all summer. The diurnal pattern the table
encodes is a summer sea-breeze pattern, and whether it holds in a winter swell regime is unknown.
The paired set grows daily on its own, so this improves without any work; the first version ships on
one season of evidence and says so.

## Decision 2: a per-hour table ships, not the gradient booster

The booster won. It should still not be the thing in production.

Measured on the held-out weeks, against the score the archive wind implies, since the product
question is what a person sees and not what an MAE says:

| Version | mean score error | band word wrong |
| --- | --- | --- |
| raw forecast | 0.129 | 7.6% |
| per-hour table | 0.099 | 6.1% |
| gradient boosting | 0.094 | 5.5% |

Correcting at all is clearly worth it: 487 band words move toward truth against 215 away. The model
buys **0.6 further percentage points**. Against that:

- It costs scikit-learn and scipy in the API's runtime dependencies, measured at **+75 MB RSS** on a
  512 MB Render free instance.
- Its advantage is unstable. Across three rolling-origin folds the margin ran +0.938, +0.299, then
  +0.078 km/h, and on the most recent fold the confidence interval crossed zero. Pooled across folds
  against an oracle-selected baseline it is a real +0.276 [+0.170, +0.374], but the trend is
  downward and three folds cannot say whether that is noise or erosion.
- A table of 24 numbers can be shown to a surfer. "Wind adjusted by +3.2 km/h against the published
  forecast" is a sentence. A booster's output is not.

The plan for this milestone said in advance that a simple baseline beating the model was a
legitimate and publishable result. This is the weaker version of that: the model wins on the
numbers, and still does not earn its place in production. The trained model and its evaluation stay
in the repo, and the decision gets revisited when the data covers a winter.

## The methodology, which outlasts this particular model

**A random split would have been a lie.** The 92 spots share weather, so 09:00 at Carcavelos and
09:00 at Coxos are nearly the same example, and the same spot's 09:00 and 10:00 nearly are too. The
split is by time, with a six-hour embargo either side of the boundary so no single weather system
appears on both sides. The evidence that this mattered: the per-spot baseline is the **best** method
on the training weeks (2.414) and the **second worst** on the held-out ones (2.623). A random split
would have scored it at about 2.41 and recommended shipping it.

**Effective sample size is hours, not rows.** There are ~816 distinct hours behind 75,072 rows. The
paired bootstrap that decides whether a margin is real resamples hours; resampling rows would treat
92 spots in one hour as 92 independent observations of skill and return an interval far too narrow.

**Both sides choose blind.** The model's hyperparameters are picked on an inner temporal split, so
the baseline family is picked the same way. Selecting the opponent by reading the test column would
have given the baselines a privilege the model was denied.

**The estimator matches the loss.** The median, not the mean, because MAE is the reported metric and
the median is the constant that minimises it: 2.390 against 2.427. The booster is trained with
`loss="absolute_error"` for the same reason.

**Early stopping is done by hand.** scikit-learn's `early_stopping=True` carves its validation set
out of the training rows at random, which would have quietly undone the temporal split while
reporting no error at all.

## Consequences

- The app serves a corrected wind and says so. A surfer comparing BeFORE against another forecast
  can see why the numbers differ instead of concluding one is broken.
- The table is keyed by **local** hour. The bias is diurnal, which is a fact about the sun; a
  UTC-keyed table would apply the 04:00 correction at 03:00 for the whole winter once the clocks go
  back.
- Archive readings are never corrected. The correction is the forecast-minus-archive gap, so
  applying it to an archive row would push a recorded hour away from what was recorded.
- A missing artefact degrades to the raw forecast rather than failing, like everything else here.
- The build script refuses to write a table that loses to doing nothing on held-out data. It reruns
  as the dataset grows, and without the gate it would eventually ship a correction that makes the
  forecast worse.
- scikit-learn is a `train` dependency group, not a runtime one, so it reaches CI and development
  machines and stays off the API instance.
- `/scores` now returns `observed_at`, which the correction needs and which was missing.

## What this does not change

The session-rating model is still the goal and the label bar is unchanged at 80 labels with a 25%
minority class. This milestone works around the blockage; it does not lower the bar or pretend the
blockage is gone.
