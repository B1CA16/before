# Milestone 8 learnings: product readiness

Ten tasks, from tide ingestion to keyboard access. The goal was narrow and worth restating: make BeFORE
something a real surfer can be handed without apology, because the binding constraint on the ML work is
not engineering, it is that **the label report says 0**.

That constraint has not moved. Everything below is setup. The play is still to send the link to four or
five people who surf the Lisbon coast and re-run `label_report.py` a week later.

---

## The technical lessons

### SEO was a rendering problem, not a metadata problem

The live site served **37,872 bytes and 29 visible words**, with not one of 92 spot names in the HTML,
and no URL for a spot at all. Adding `<meta>` tags to that would have described an empty page
accurately.

Measuring first is what made the difference between two weeks of metadata tuning and one architectural
change. The habit generalises: when a problem has an obvious category ("we need SEO"), measure before
accepting the category.

### Prerendering is a load test you did not schedule

Rendering 184 pages fires 184 requests at the API in a few seconds. That found three separate defects
that ordinary browsing never would:

- `GET /spots/{slug}` **500'd for 7 of 92 spots**, because a wholly-null `orientation_deg` column
  arrives as object dtype and numpy trig rejects it. Invisible on the 92-row frame where real floats
  force float64.
- The API opened **a new database connection per request**, hitting Supabase's 15-client pooler cap.
  This would have broken production under any traffic burst.
- The **build required a live API**. A free Render instance sleeps; a deploy landing while it was cold
  would have taken the whole site down. It only ever worked because the keep-warm cron holds it awake.

Two of those were pre-existing production bugs. The build did not create them, it just got there first.

### A green build is not evidence that a fix worked

The single most expensive lesson of the milestone. Fixing the 502-during-prerender took four attempts,
and **two of the wrong ones produced a passing build**:

1. Made `generateStaticParams` tolerant but left the page render throwing. The failure moved.
2. Added a retry loop that changed nothing, because Next memoises fetches with the same URL and options
   inside a render, so three attempts collapsed into one network call and all saw the same 502. The code
   looked obviously correct.
3. Made retries `cache: "no-store"` to force a real request. **This was the dangerous one**: a no-store
   fetch pushes the whole route out of static rendering, so pages that hit a retry were built *without
   their forecast*. The build went green while quietly producing incomplete pages, which is worse than
   the failure it replaced.
4. Varying the URL (`?_attempt=2`) keeps each attempt cacheable and statically renderable.

What distinguished them was not reasoning, it was **reproducing the fault**: a flaky proxy injecting
502s. Against 185 injected failures the build exits 0 with 195/195 pages.

### Structured data has to describe the visible page

`Place`, `BreadcrumbList` and `WebSite`, all generated from data actually held. The temptation worth
naming is `aggregateRating`: the app computes a score out of 10, and dressing that as a user rating
would be both dishonest and against Google's policies. There is a test asserting the string never
appears.

`WebSite` sits in the layout rather than the home page because the home page is a client component, so
anything it renders arrives after hydration and a crawler reading the initial HTML never sees it.

### Replacing a native control means inheriting its unpaid work

The custom `Select` and `DayPicker` had **zero keyboard handlers**. `<select>` alone gives arrows, Home,
End, type-ahead, Enter, Escape and focus return for free. Both sheets also declared `role="dialog"` and
`aria-modal="true"` while enforcing neither, so Tab walked out into the map behind, where a screen
reader would read content the dialog claims is hidden. **Declaring modal behaviour without implementing
it is worse than not declaring it.**

Driving the flow with the keyboard alone found two bugs clicking never would: the calendar renders
through a portal so Tab could not reach it at all, and the focus trap then fought those same portals by
dragging focus back out of them.

### Per-user data and shared caches do not mix

The plan said to put favourites on the `/spots` response. That response is fetched with a shared
`revalidate` cache, so one visitor's favourites would have been cached and served to the next. A
separate authenticated endpoint keeps the public data impersonal, which is exactly what lets it stay
cached and prerendered. **Deviating from the plan was correct here**, and the reason is worth keeping:
"add a field to the existing response" is cheap right up until the response is shared.

### Write the privacy policy against the schema

The plan asserted "email address and logged sessions, nothing else". Auditing the live database found
that false: Supabase's default Google scopes include `profile`, so name, picture URL and Google account
id were all being stored, none of which the app reads. Fixed rather than merely disclosed, by requesting
only the `email` scope.

Checking rather than assuming also found a cookie the policy did not mention (`NEXT_LOCALE`, set on the
first visit) and, later, a new localStorage key from the intro card. A policy is a promise; each of
those would have quietly falsified it.

---

## The process lessons, which cost more time than the code

### My own checks lied, repeatedly, and always in the same direction

At least eight times a test reported a failure that was the test's fault, or a success that meant
nothing:

- Measured a CARTO **ocean tile** and concluded the basemap provider had started requiring an API key.
  Reported that to Francisco as a production outage. It was wrong: a Lisbon tile returns 27 KB of real
  map data, and the watermarks came from my own test runs being rate-limited.
- Counted `+N` map badges *after* zooming in, where nothing is hidden, so zero was the correct answer to
  the wrong question.
- Pressed "Equal" expecting a Leaflet zoom binding; it panned instead and reported 0 pins.
- Ran the keyboard test signed out, so the sheet showed the sign-in prompt and the selects never
  mounted.
- Pressed Tab before measuring calendar focus, moving focus off the cell the grid had just focused.
- Built against a port that already had something listening, so "reproducing CI" reproduced nothing.
- Let a heredoc mangle an anchor string, so an edit silently did nothing and I did not assert on it.
- Reported "all checks clean" having never run `ruff`, which CI then failed on.

The pattern is consistent: **a failing assertion is a hypothesis about the harness as much as about the
app**, and "all checks pass" is only ever true of the checks actually run.

### Look at the pixels, not the path data

The marker icon took **seven attempts**. A shaka is the obvious icon for a surf app and it was drawn six
ways: detailed hand (a smudge at 15px), mirrored prongs (unmistakably Mickey Mouse), right angle, line
art, three separated lobes (a propeller), tilted silhouette. Every one looked reasonable as path data
and was rejected on sight once rendered.

The lesson is about the medium: a hand is articulated, and at 19 pixels there is nowhere to put the
articulation. Francisco's suggestion to switch to a **wave** solved it in one pass, because a wave is a
single gesture with no anatomy to get wrong. It is also the same curl as `WaveLoader`, so the app now
has one wave instead of two unrelated ones.

Two related misses: Portuguese written without accents twice (the legal pages and the OG card), both
times from caution I never tested. Rendering it once settles it.

### CSS specificity outranks source order

`.seg:hover:not(:disabled)` scores 0,3,0 against `.seg.is-on` at 0,2,0, so hovering the *selected* sort
pill re-applied dark text over its dark background and the label vanished under the pointer that had
just clicked it. Invisible to the type checker, the linter and the tests. Found by looking.

---

## What is now true that was not

- Portuguese by default, English at `/en`, 214 keys per language with asserted parity, and the interface
  addressed as *tu* because a surf app that says *você* reads like a bank.
- 195 pages prerendered; a spot page has a URL, a breadcrumb, nearby-spot links and an Open Graph card
  showing its live score.
- Legal pages that describe what is actually stored, written against the schema.
- Marked spots, sorted to the top, with a thinned map that keeps the best spot per patch of screen and
  says `+N` for what it hid.
- Search filters the map as well as the list; "near me" sorts by distance and degrades gracefully when
  refused.
- The whole log-a-session flow is operable without a mouse.
- Analytics measuring the one number that matters: visitors to logged sessions.

## What is deliberately still open

- **Bathymetry**, and with it any honest tide term in the score (ADR-0007).
- **Shakas as kudos.** Francisco's idea, and a better use of the gesture than the one it was rejected
  for: a shaka is something you give another surfer's session, not a bookmark on a beach. Blocked on
  sessions being private by design, which the privacy policy states plainly, so making any visible is a
  change of purpose needing a policy change and probably opt-in.
- **A custom domain**, which would fix the Search Console limitations, the Gmail address in the privacy
  contact, and the raw Supabase ref on the Google consent screen.
- **The ML model.** M9 begins when `label_report.py` says so: 80 labels, minority class at least 25%.

## The next step is not code

Send the link to four or five people who surf the Lisbon coast, ask for roughly 20 remembered sessions
each, and run the label report a week later. Retrospective logging exists precisely so that is an
afternoon rather than a year.

If that ask does not land, no amount of the above matters, and the honest response is to change the ask
rather than to build more.
