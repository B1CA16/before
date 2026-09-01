# Milestone 9 learnings: forecast correction

The first real ML in the project, arrived at sideways. The milestone that was planned could not be
built, and what replaced it produced a shipped model that is 24 numbers in a JSON file.

The headline is not the correction. It is that **every interesting result in this milestone came
from a measurement that contradicted something reasonable I already believed.**

---

## The pivot, and why it was not a defeat

M9 was to train an `MLScorer` on session ratings. The label report says 0 and the bar is 80 labels
with a 25% minority class. Labels come from surfers rating sessions; the owner does not surf and is
not in Lisbon. M8 made the site worth using, which was the right move and did not conjure surfers.

Three bad options and one good one. Fabricating labels or rating sessions from the sofa would train
the model on the heuristic's own opinion, which is the circularity trap this project has avoided
since M4. Waiting is not a milestone. The good option was to notice that **75,072 supervised
examples were already in the database** and had been for weeks: every forecast hour that has since
aged into an archive hour.

The lesson generalises past this project. When the labels you planned for do not exist, the question
is not "how do I get them" but "what else in this system already tells the truth about itself".

---

## The technical lessons

### A random split would have recommended shipping the wrong thing

This is the most valuable number in the milestone. The per-spot baseline scores **2.414 on the
training weeks and 2.623 on the held-out ones**, which makes it the best method on one and the
second worst on the other. A random split mixes those two periods, would have reported roughly 2.41,
and would have recommended shipping it.

The theory (rows within an hour are correlated, so split by time) was in the plan before any code
existed. I still did not *believe* it until the two numbers sat next to each other. Writing the
correct split first is what made the disproof visible instead of invisible.

### Confidence intervals lie when the resampling unit is wrong

A bootstrap over rows would treat 92 spots in the same hour as 92 independent observations of the
model's skill. They are closer to one observation seen 92 times: 75,072 rows hide only ~816 distinct
hours.

The test that pins this down is worth stealing: **duplicate every row ten times and assert the
interval does not narrow.** Row resampling would shrink it by about √10. When I mutated the code to
resample rows, that test failed, which is the only reason I trust it.

### One split answers a weaker question than it appears to

The single held-out split gave +0.129 km/h with a 95% interval of [+0.031, +0.232]. Clean, positive,
excludes zero. Ship it.

Three rolling-origin folds gave +0.938, +0.299, +0.078. The between-period swing is an order of
magnitude wider than the within-period interval, because the interval only ever measured noise
*inside* one arbitrary eight-day window. The plan did not ask for the folds. Adding them changed the
conclusion from "clearly better" to "better on average, with the most recent evidence the weakest".

A confidence interval quantifies the uncertainty it was constructed to see, and is silent about
every other kind.

### I was rigging the comparison in the baselines' favour without noticing

The model's hyperparameters were chosen on an inner temporal split, blind to the test weeks. Then I
picked the baseline to beat by reading the test column and taking the best one.

That is an oracle opponent versus a blind contestant. Fixed by making the baseline family choose on
the same inner split, and the margin against a blind-chosen baseline turned out to be +0.419 rather
than +0.129. Both numbers are now reported, because there is no single fair opponent: the honest
position is that the truth is between them, and the ship-or-not decision should lean on the
conservative one.

The general habit: whenever you compare A against B, ask what each was allowed to see.

### The estimator has to match the loss you report

The median beat the mean by 2.390 to 2.427 MAE, because the median is the constant that minimises
absolute error and the mean minimises squared error. Small, and exactly the shape of error that
makes a benchmark quietly generous. The same reasoning put `loss="absolute_error"` on the booster.

### Convenient defaults can undo your careful work silently

`HistGradientBoostingRegressor(early_stopping=True)` carves its validation set out of the training
rows **at random**. On this data that means validating on 10:00 at a beach whose 09:00 is in the
training set: the model would be told it was still improving, stop late, and nothing anywhere would
report an error.

Every careful thing about the temporal split would have been undone by one default argument. Library
defaults are written for independent rows, and time series are not that.

### Feature importance has a trap built into cyclic encodings

Hour of day is encoded as sine and cosine so 23:00 and 00:00 are adjacent. Permuting `hour_sin`
alone leaves `hour_cos` still pointing at the true hour, so the model reconstructs most of what was
hidden and the feature looks unimportant.

The subtler half: permuting them *independently* is also wrong, because it produces (sin, cos) pairs
off the unit circle, which are hours that cannot exist. The model extrapolates and the importance
inflates. Both need one shared permutation across the group. My first test for this asserted a
weaker property and **survived the mutation**; the test that works uses a spy to check the multiset
of pairs handed to the model is unchanged.

### Spot identity was worth +0.42 to the model and -0.29 to the baseline

Both are true at once, and the contradiction is the explanation. A fixed offset per spot claims
Carcavelos runs windy by the same amount at 3am in a storm as at 4pm in a sea breeze, and that does
not survive to the next fortnight. The booster uses spot only where it interacts with hour and wind
speed, and its tree structure lets thin spots fall back on their neighbours.

"Feature X does not generalise" and "feature X is the most important feature" are compatible claims
about different models.

---

## The product lesson, which is the biggest one

The model beat the best baseline on wind MAE, 2.203 against 2.333. I nearly shipped it on that.

The question I had not asked was what 0.13 km/h does to a person looking at a phone. Answering it
took one script: score every held-out spot-hour three ways and compare against what the archive wind
implies. The app shows one decimal and a colour band at 3, 5 and 7.

| Version | mean score error | band word wrong |
| --- | --- | --- |
| raw forecast | 0.129 | 7.6% |
| per-hour table | 0.099 | 6.1% |
| gradient boosting | 0.094 | 5.5% |

Correcting at all is worth doing. The model's extra 0.6 percentage points would have cost
scikit-learn and scipy in the API's runtime dependencies, a measured +75 MB RSS on a 512 MB
instance, and would have made the adjustment unexplainable to the user.

**An ML metric is not a product metric, and the translation between them is a measurement, not an
intuition.** I had no idea in advance whether 0.13 km/h was a lot or nothing, and neither reading
would have been unreasonable.

---

## Where I was wrong, in order

1. **The plan said scikit-learn was "no new dependency".** It was not installed. Corrected by
   putting it in a `train` dependency group so it reaches CI and not the API instance.
2. **The plan's baseline of 2.705 was computed in-sample.** On a proper split with the constant
   learned on train only, the bar was 2.427, and after the blind-selection fix, 2.333.
3. **I picked the baseline to beat by looking at the test column** while the model was tuned blind.
4. **My first cyclic-permutation test asserted the wrong property** and survived its mutation.
5. **Archive rows were reporting a correction of `0.0`** where they should report nothing. "We
   looked and decided nothing was needed" is a different claim from "this is not the kind of thing
   we correct". Caught by running the real API against the real database, not by any test.

Item 5 is the pattern worth keeping: every mutation I could think of passed, and the live call still
found something. Tests check the properties you thought of.

---

## What is still true

The label report says 0. The session-rating model is still the goal, the bar is unchanged at 80
labels with a 25% minority class, and nothing here lowers it. This milestone found real supervised
work to do in the meantime and did it honestly; it did not solve the recruitment problem, and no
amount of engineering will.
