# ADR 0007: Tide is ingested and shown, but deliberately kept out of the score

- Status: accepted
- Date: 2026-08-31

## Context

Tide is the first thing a surfer asks about after swell and wind, and its absence was the most obvious
gap in the product. M8 added it: `sea_level_m` on the `conditions` table, exposed on three endpoints,
and rendered in the spot panel as a height, a direction, the next turn and a low-to-high bar.

Getting the data was cheap. `sea_level_height_msl` comes from the same Open-Meteo marine call already
being made, at no extra cost and no extra request, and it is available for historical hours too. That
last part mattered: 72 values came back for a date 200 days ago, which is what makes it usable for
retrospective session logging rather than only for the forecast.

The real question was not whether to ingest it. It was whether the heuristic score should use it.

## Decision

**Ingest tide, expose it, show it, and do not score it.**

The heuristic keeps its four factors: size, period, wind and exposure. Tide goes into the database and
onto the screen, and it is available as a feature for the ML model in M9.

## Why not score it

Scoring tide requires knowing which state each spot works best at. That is per-spot bathymetry
knowledge: some reefs only break on a push, some beaches close out at high water, some points need the
tide off them. It varies spot by spot along the same 48 km of coast, and we do not have it. Bathymetry
sourcing was deferred back at M1 and is still deferred.

Without that, any tide term in the formula would be invented. We could assert "mid tide is best" and it
would be defensible in a pub and wrong at a specific beach, which is the worst combination: confident,
plausible, and unfalsifiable against the data we hold.

There is precedent in this project for what happens next. The score collapse in M8's calibration pass,
where 85 of 92 spots read 0.0, came from exactly this kind of unjustified hand-tuning: ramp floors set
where conditions became *good* rather than where they became unsurfable, chosen by eye. Adding a
guessed tide rule would be the same mistake with a new variable.

Showing tide without scoring it is also more honest about what the product knows. A surfer looking at
"-1.1 m, falling, low at 21:00" can apply their own knowledge of that break, which is knowledge the
system does not have. Folding it into a single number would hide that we are guessing.

## Consequences

- The score is unchanged and stays comparable with every reading taken before tide existed.
- Surfers see the tide and weigh it themselves, which is the correct division of labour until the
  system knows more than they do.
- **M9 gets tide as a model feature.** If the labels ever support it, the model can learn the per-spot
  tide relationship from data rather than from our assumptions, which is the whole reason the ML path
  exists. That is the difference between a formula we wrote and a model that learned.
- `tide_state` and `tide_rising` live in `features/derive.py` but deliberately **outside**
  `build_features`. Neither can be computed from a single row: direction needs the next hour, and
  height needs the surrounding low and high water, because raw metres are not comparable between spots
  or between spring and neap tides. `build_features` stays strictly row-wise, which is what lets the
  same code serve one hour at request time and a million in training.
- Pairing a tide value with a session label needs a window around that hour rather than a single row.
  That is M9's problem, noted here rather than fudged now.

## Alternatives considered

**Score it with a generic mid-tide preference.** Rejected: it is a guess dressed as a measurement, and
it would be wrong at specific spots in ways nobody could trace back to this decision.

**Score it only where we have local knowledge.** Rejected: we have it nowhere, and a score whose meaning
changes between spots is worse than one that ignores a factor consistently.

**Leave tide out entirely.** Rejected: the data is free, it is the thing surfers ask about, and
withholding it from the screen because the formula cannot use it would confuse an engineering
limitation with a product one.
