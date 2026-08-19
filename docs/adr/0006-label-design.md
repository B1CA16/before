# ADR 0006: Label design

- Status: accepted
- Date: 2026-08-19

## Context

Supervised learning needs pairs of features and labels. Features were never the problem: conditions
come from open APIs and there are now over 900,000 hours of them. The label, "was that session any
good", exists nowhere in the world until somebody who was in the water says so. This decision is
therefore the crux of the project, and getting it wrong is not recoverable by better modelling.

Three constraints shape it:

- **The project owner is not a surf forecasting expert** (ADR-0003 already turned away from relying on
  expert annotation). Ratings must be answerable by anyone who surfed: "was that worth it" needs no
  forecasting skill, whereas "was that a 6.4" needs a career.
- **Volume is the binding constraint, not model choice.** One person surfing twice a week produces
  roughly 8 labels a month. Every design choice here is really a choice about sample size.
- **The heuristic must not become the training target.** Training a model to reproduce a formula we
  wrote teaches us nothing (the circularity trap, spec section 3).

## Decision

**Collect rich, train coarse.** A session stores a 1-to-5 `rating` plus optional tags from a fixed
vocabulary (`good_shape`, `crowded`, `too_small`, `too_big`, `blown_out`) and an optional note. The v1
model trains on the binary collapse, `worth_it = rating >= 4`.

This settles the two decisions the spec deferred to M7:

- *Regression vs ordinal classification* → **binary classification** for v1.
- *Final v1 label design* → **user session ratings**, with no expert annotation anywhere.

The asymmetry is deliberate: a fine label can always be collapsed, a coarse one can never be
recovered. Storing 1-to-5 costs one extra tap and keeps ordinal or regression open for v2, when there
may be enough data to support it. Training binary is a concession to arithmetic: ~100 labels across
five ordinal classes is ~20 per class, far too thin, while the same 100 split in two is workable.

**Tags exist to identify noise our features cannot explain.** `crowded` is the important one: a crowd
is invisible to every feature we have, so a session ruined by one is a label that contradicts its own
features. Without the tag that contradiction is indistinguishable from real signal and silently caps
how well any model can do. With it, those sessions can be excluded and the effect measured.

**Labels are paired with conditions at training time, never denormalised into the session row.** The
session stores only where and when. `archive` conditions are preferred over `forecast`, falling back
when no archive row exists yet.

**Retrospective logging is a first-class feature**, not an edge case. `surfed_at` accepts any past
timestamp, and a year of archive conditions is already in the database waiting to be paired with
remembered sessions. This is the single largest lever on label volume available.

**Readiness is a measurement.** `MIN_LABELS = 80` and `MIN_MINORITY_SHARE = 0.25` live in
`before_surf.labels`, and `ml/notebooks/label_report.py` reports named blockers. M8 starts when the
report says so.

## Consequences

- **The archive preference is worth far more than it looks.** Measured across the 48,576 spot-hours
  now holding both sources, archive and forecast disagree on *every hour*, by 0.45 s of swell period
  on average and 6.25 s at worst. The period ramp spans 3 to 13 s, so that worst case is 0.625 of the
  period sub-score, in the factor that most often decides the total. Pairing a label with the forecast
  is not a rounding error, it is most of a sub-score of noise in the model's strongest feature.
- Because a session logged today can only be paired with a forecast, a weekly job re-fetches the
  trailing archive window (`run_archive_refresh`). Recent labels improve on their own as it catches up,
  and `label_source` records which conditions each example actually used.
- **Minutes are deliberately discarded.** Conditions are hourly and the training join truncates to the
  hour, so a minutes field would imply precision the data lacks. It also matters for correctness:
  `surfed_at` is part of the natural key, so logging one session at 08:23 and again at 08:47 would
  create two rows for one session and double-count a label.
- **Timestamps must carry an offset.** A naive timestamp would have to be guessed as UTC or local, and
  a wrong guess shifts the session into a different hour, pairing the rating with different
  conditions. That is a silently wrong training example, the worst kind, so the API rejects it.
- Rating "was the surf good" still conflates conditions with things no feature sees: fitness, a
  snapped leash, an unfamiliar board. Tags cover the common case; the rest is irreducible label noise
  and part of why the ceiling on v1 accuracy is unknown.
- The bar may prove wrong. 80 labels is a plausible floor for a binary model on ~5 features, not a
  guarantee, and a first attempt may still overfit. It is written down so that moving it is a visible
  decision rather than a quiet convenience.
