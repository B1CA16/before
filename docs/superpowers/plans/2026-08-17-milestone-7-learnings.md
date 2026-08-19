# Milestone 7 learnings: session logging and labels

What M7 set out to do: make it possible to collect the labels a supervised model needs. It did that,
and the honest result is **0 labels so far and a "NOT READY" verdict**, which is the machinery working
rather than the milestone failing. The question is now measurable.

## The concepts this milestone was really about

**A label is not data you find, it is data you cause to exist.** Features came from open APIs and there
are over 900,000 hours of them. Nothing anywhere records whether a particular session was any good
until a person who was in the water says so. That asymmetry is why the whole milestone is a product
feature rather than a data pipeline, and why label *volume* rather than model choice is the binding
constraint on the project.

**Collect rich, train coarse.** Ratings are stored 1 to 5 and trained as `rating >= 4`. A fine label can
always be collapsed and a coarse one never recovered, so the finer value is worth one extra tap. The
coarse target is arithmetic, not preference: ~100 labels across five ordinal classes is ~20 per class.

**Label noise has a shape, and some of it can be named.** A session ruined by a crowd is a label that
contradicts its own features, because no feature we have can see a crowd. Unnamed, that contradiction
is indistinguishable from signal and silently caps accuracy. The `crowded` tag makes it separable, so
its effect can be measured rather than absorbed.

**Ground truth is not free.** The most quantitatively surprising finding of the milestone: across the
48,576 spot-hours now holding both sources, `archive` and `forecast` conditions disagree on **every
hour**, by 0.45 s of swell period on average and **6.25 s at worst**. The period ramp spans 3 to 13 s,
so the worst case is 0.625 of the period sub-score, in the factor the calibration showed decides the
total most often. "Which source a label is paired with" sounded like a detail before it was measured.

**Verification is only as good as the conditions it runs under.** See below.

## Where I was wrong, and what it cost

**The archive endpoint has no lag.** The plan assumed ERA5's ~5-day delay meant recent data simply was
not available. Asked for data up to today, it returns complete hours through today. The 5-day lag was
kept anyway, for a *different* reason: recent days are a preliminary product still being revised, and
`source = 'archive'` should mean settled. Same number, honest reason.

**I tested a desktop bug only at phone width.** The select and calendar panels landed on the right side
of the screen because `.panel-raised` sets a `backdrop-filter`, and any ancestor with one becomes the
containing block for `position: fixed` descendants, so "viewport" coordinates were applied relative to
the sheet. At 430px the sheet is full width and the two coordinate systems coincide, so every test
passed. Three rounds of churn from testing the wrong environment.

**A test can pass for the wrong reason.** My "nothing moved when the panel opened" check passed because
the panel had already closed itself before I measured. It closed because I dismissed panels on scroll,
and the select sets `scrollTop` to centre the current option, which fires a scroll event. A green
result that meant nothing, hiding the bug it was written to catch.

**I cached an access token in React state.** Tokens last an hour, so any copy held in state is a ticking
clock. Combined with a `signOut` that failed when the session was already revoked, this trapped the
user signed-in with a dead token and no way out. Fixed by fetching the token at call time and making
sign-out fall back to clearing locally.

**Internal reasoning leaked into the interface.** The tag helper text explained the ML rationale for
tags to a person standing in a car park. Correct, and completely misplaced.

## Decisions recorded

- ADR-0005: Google sign-in instead of email, because no free provider will send without a domain.
- ADR-0006: label design, and the two spec decisions it resolves (binary for v1; ratings only).
- Table named `surf_sessions`, not `sessions`, because Supabase ships `auth.sessions` and one word
  should not mean two things in a project that is adding auth.
- Account deletion goes through the database, not Supabase's admin API, so no service-role key needs
  to exist. All nine foreign keys into `auth.users` cascade; that was checked, not assumed.

## What M8 needs before it starts

Labels. `uv run python ml/notebooks/label_report.py` gives the verdict; the bar is 80 examples with the
smaller class above 25%. The fastest route there is retrospective logging, since a year of archive
conditions is already stored.

Two things to carry forward into M8:

- The heuristic is the **baseline to beat**, not the target. A model that cannot beat it is worthless,
  and we only know that because the heuristic exists.
- Check `label_source` before trusting a result. Examples paired with forecast conditions carry noise
  in the strongest feature, and early labels will be forecast-paired until the weekly refresh catches up.
