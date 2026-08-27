# Milestone 8: Product readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BeFORE something a real surfer can be handed without apology, in their own language, and
findable by someone who was not handed it. This is the milestone that unblocks labels, because the
project owner does not surf and cannot honestly generate them.

**Why this comes before the ML model.** M7 built the label loop and the report says 0 labels. The
binding constraint is no longer engineering, it is that nobody has a reason to use this yet. A model
trained on labels that do not exist is not a model.

**The plan this milestone serves:** ship it, then ask four or five people who surf the Lisbon coast to
log ~20 remembered sessions each. Retrospective logging exists precisely so that is an afternoon rather
than a year. **The code is the setup; the ask is the play.** Anything here that does not make that ask
land is decoration.

**Difficulty:** 🟡 Medium, with one genuinely architectural piece (server rendering) and one legal one.

**Learning goals:** server vs client rendering and what that means for crawlers, internationalisation
and locale routing, SEO as an engineering problem rather than a marketing one, GDPR obligations for a
data controller, and the discipline of adding a feature to the *data* without adding it to the *model*.

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- Schema changes are hand-written SQL migrations via Supabase CLI (ADR-0002). Never edit applied migrations.
- Look at the output. `npm run shots` at mobile **and desktop** widths before calling any UI work done.
  Testing only at 430px is how the panel-positioning bug survived three rounds in M7.

## Roadmap renumbering

Inserting this milestone shifts the ML work back. Update section 11 of the spec:

| was | becomes |
| --- | --- |
| M8 First ML model | **M9** First ML model |
| M9 Tuning + XAI + MLOps | **M10** Tuning + XAI + MLOps |

## Decisions already settled

- **Tide is free.** `sea_level_height_msl` from the marine API we already call, in metres, and verified
  available for historical hours too (72 values returned for a date 200 days ago), so retrospective
  sessions can carry a tide feature.
- **Tide does NOT go into the heuristic score.** It goes into the database, the API and the UI, and it
  is exposed as a model feature for M9. Scoring it would require knowing which state each spot works
  best at, which is per-spot bathymetry knowledge we deliberately deferred. Inventing a rule instead is
  exactly the unjustified hand-tuning that produced the all-zeros collapse. Surfers get to see it and
  weigh it themselves; the model may learn it later if the labels ever support that.
- **Analytics: Vercel Web Analytics.** Free on Hobby, no cookies, no third-party script host to fight
  the CSP over. It answers one question that matters: does anyone who visits actually log a session.

## Decisions to make at the task that needs them

- **i18n library or hand-rolled** (Task 3). Locale routing, plural rules and locale-aware formatting are
  a lot of edge cases to own. Recommendation is `next-intl`, but it is a real dependency in an app that
  has deliberately hand-built its own components, so it deserves an explicit call.
- **Whether legal pages are hand-written or generated** (Task 4). A generated policy that misdescribes
  what we store is worse than a short honest one.

---

### Task 1: tide in the pipeline

- [x] Migration `20260819203225_add_sea_level.sql` adds `sea_level_m real`, nullable. Validated in a
      rolled-back transaction, including that the generated upsert round-trips a value.
- [x] One line in `MARINE_VARS`, because `CONDITION_COLUMNS` and the upsert SQL are both generated from
      it. Verified the propagation reached the insert list and the on-conflict update.
- [x] **Coverage measured, and the plan's warning was justified.** The trailing refresh alone left tide
      on only **6%** of archive rows, which would have meant no tide for any session logged from more
      than three weeks ago, gutting the retrospective label strategy. Ran the full year backfill:
      808,128 rows in 2m58s, taking archive coverage to **93%, 2025-08-14 to 2026-08-14**. Forecast sits
      at 21% because 624 pre-migration rows for past hours remain; those hours have archive rows with
      tide, so the training join is unaffected.
- [x] `tide_state` and `tide_rising` in `features/derive.py`, but **deliberately outside
      `build_features`**. Neither can be computed from a single row: direction needs the next hour, and
      height needs the surrounding low and high water, because raw metres are not comparable between
      spots or between spring and neap. `build_features` stays strictly row-wise, which is what lets it
      serve one hour at request time and a million in training.
- [x] Exposed: raw level on `/scores` and `/spots/{slug}/conditions`, and level plus state and direction
      on `/spots/{slug}/forecast`, the only endpoint holding a whole series for one spot. Pairing tide
      with a session label needs a window around that hour, which is M9's problem, noted not fudged.
- [x] Spot panel shows height, rising or falling, the next turn, and a low-to-high bar. Left off the
      timeline chart: a second series made it busy for no gain.
- [x] 8 python tests against a synthetic semidiurnal curve plus 6 TypeScript tests for the turn finder.
      The ones that matter: `tide_state` is identical for a 0.8 m and a 3.5 m range (the whole point of
      normalising); the last hour has no direction rather than a guess, since `NaN > 0` would silently
      collapse to "falling"; nulls stay null so the 800,000 pre-migration rows cannot become a
      plausible-looking mid-tide; and out-of-order rows are sorted before differencing.
- [ ] **Commit:** `feat: ingest and display tide`

> Noted while verifying, not fixed here: `/spots/{slug}/forecast` returns 792 hours when the UI uses
> 147, because old forecast rows are never pruned. Five times the payload for a phone on a car-park
> connection. Worth filtering to future hours during Task 6.

### Task 2: routes, deep links and server rendering

- [x] Problem measured before being fixed: the live site served **37,872 bytes and 29 visible words**,
      with not one of the 92 spot names in it. SEO was never a metadata problem here.
- [x] `app/spot/[slug]/page.tsx` as a server component, plus a new `GET /spots/{slug}` so the page needs
      one request rather than fetching all 92 and discarding 91.
- [x] Map stays a client island; `ShareLink` is the only client leaf on the spot page.
- [x] `generateStaticParams` over all 92 spots, `revalidate = 3600`. Chosen from the data: conditions
      are ingested daily, but the "current" hour advances hourly, so hourly is the coarsest that stays
      truthful. Build output confirms 96/96 pages prerendered in 18.5s.
- [x] **ADR-0004 updated.** The deferred edge-caching item is done for spot pages. The ping still
      matters for the map and for authenticated calls, so the ADR stands with a smaller blast radius.
- [x] URL round-trip via `history.replaceState`, verified: `?spot=` opens focused, selecting rewrites
      the URL, and history length stays at 2 so Back does not walk through selections.
- [x] Share via the Web Share API with a clipboard fallback, plus a permalink from the map panel.
- [x] **Verified with curl**: 134 visible words, `<h1>Praia dos Coxos</h1>`, a data-built description
      ("marginal right now, scoring 4.7 out of 10"), and a canonical URL.
- [ ] **Commit:** `feat: add server-rendered spot pages and deep links`

> **Two real bugs surfaced by doing this, both pre-existing and neither cosmetic.**
>
> 1. **`/spots/{slug}` 500'd for 7 of 92 spots.** A frame whose `orientation_deg` is wholly null arrives
>    as object dtype, and numpy trig rejects object dtype rather than propagating NaN. Invisible on the
>    92-row `/scores` frame, where real floats force float64. Fixed in `build_features` with
>    `pd.to_numeric(..., errors="coerce")`, plus two regression tests.
> 2. **The API opened a new database connection per request.** Prerendering with six workers hit
>    `EMAXCONNSESSION: max clients limited to pool_size: 15`. Fixed with a bounded `ConnectionPool`
>    (max 6). Verified with 60 concurrent heavy requests, all 200. This would have broken production
>    under any traffic burst.
>
> And one deferred item pulled forward because it became the blocker: the forecast endpoint returned
> **816 rows where the UI uses 147**, costing 184 KB and 825 ms per request against a query taking
> 2.3 ms. The database was never the bottleneck; building, validating and serialising rows nobody reads
> was. Now 34 KB and ~515 ms.

### Task 3: Portuguese

- [x] Settled: `next-intl` 4.13.7, which declares Next 16 support in its peer range.
- [x] Routes moved under `app/[locale]/`, with `localePrefix: "as-needed"`: Portuguese keeps the bare
      paths and English is prefixed. Chosen for a concrete reason rather than taste, since spot links
      have already been shared and always-prefixing would turn every one into a redirect.
- [x] 170 message keys per locale, asserted to have exact parity. Covers the parts that get forgotten:
      empty states, error messages, confirmation copy, `aria-label`s and the privacy note.
- [x] `UI_LOCALE` replaced by `localeTag(locale)`. The pin to `en-GB` existed because the *browser*
      locale produced Portuguese day names inside an English interface; a real locale switch is the
      proper fix for that mismatch, so the workaround could go.
- [x] **Score verdicts and wind labels now return keys, not words** (`scoreWordKey`, `windWordKey`).
      The thresholds are a product decision and stay in `lib/score.ts`; the wording lives in the
      catalogues. A test asserts every key either function can emit exists in both languages, so a
      raw key like "firing" can never reach a user.
- [x] `LanguageSwitch` in the top bar. It replaces the current route in the other locale, carrying the
      query string, so switching language does not lose the spot you were reading.
- [x] `hreflang` on the home and spot pages via `alternates.languages`, plus a locale-correct canonical.
- [x] Verified: **189 pages prerendered** (92 spots x 2 locales, plus both home pages). Portuguese
      renders `lang="pt"`, translated metadata, "de mar" for onshore, "MARE +0.0 m a encher", and
      Portuguese weekday names in the chart.
- [ ] **Commit:** `feat: add portuguese and locale routing`

> **The bug worth recording.** `/spot/praia-dos-coxos` 404'd, which is exactly the case `as-needed` was
> chosen to protect. The middleware matcher `"/((?!api|_next|_vercel|.*\..*).*)"` only ever matched `/`
> and one segment: matcher strings are parsed by path-to-regexp, where `.` does not cross the `/`
> delimiter, so `.*` stops at the first slash. It is invisible until a nested URL 404s, and the widely
> copied one-line matcher has this hole. Fixed with an explicit array including `:path*`, and verified
> across five paths: bare links rewrite to `/pt/...`, `/pt/...` redirects away the redundant prefix,
> and an unknown slug still 404s.
>
> Two of my own checks also lied and are worth remembering: `hreflang` looked missing because Next
> emits the attribute as `hrefLang` and my regex was case-sensitive, and accented strings looked absent
> because of Windows stdin decoding, not because they were missing.

### Task 4: privacy policy and terms

- [x] Settled: **hand-written, held as typed data** in `src/content/legal.ts`, not generated and not in
      `messages/*.json`. The catalogue ships to the browser on every page; these documents are ~1,100
      words rendered by two server routes, so they compile into the server render and reach no client
      bundle. The typed shape also lets a test assert the two languages have not drifted.
- [x] `/privacy` and `/terms`, prerendered in both languages. Build goes 189 to **193 pages**.
- [x] **The audit came first, and the plan's own assumption above was wrong.** "Email address and
      logged sessions, nothing else" was not true: Supabase's default Google scopes include `profile`,
      so `auth.users.raw_user_meta_data` and `auth.identities.identity_data` also held `full_name`,
      `name`, `avatar_url`, `picture` and `provider_id`. The app reads none of it (the avatar is the
      first letter of the email). This is exactly what "write it against the schema" was for.
- [x] Fixed rather than merely disclosed: sign-in now requests `scopes: "email"`. Verified by building
      the real authorize URL, which carries `scopes=email` and a PKCE `code_challenge`.
- [x] Second correction from verification: the site **does** set a cookie, `NEXT_LOCALE`, on the first
      visit. The draft said only that the language was "remembered". Now named explicitly, with why a
      strictly functional cookie needs no consent banner.
- [x] Every factual claim checked against something: Supabase in `aws-0-eu-west-1` (Ireland) from the
      connection string, Render in `frankfurt` from `render.yaml`, CARTO receiving the visitor's IP
      from the tile host in the source, deletion cascading from the `on delete cascade` on
      `surf_sessions.user_id`, and `storage = globalThis.localStorage` with `persistSession: true`
      from the installed auth-js, since the client never overrides it.
- [x] Contact published as a single constant. **Controller: Francisco Ferreira, Portugal.**
- [x] Linked from the footer (map page and spot page), the sign-in popover as a consent line shown
      *before* the Google button, and the account screen beside account deletion.
- [x] 9 tests: structural parity between languages including table row and list counts, unique
      anchors, no em-dashes, a contact address in every document, and that the Portuguese actually
      carries diacritics (it was first written without them, which every structural test passed).
- [ ] **Left for Francisco, blocked by a permission prompt:** clear the profile fields already stored
      on the existing account. Script written and safe (it preserves `sub`/`provider_id`, without which
      Google sign-in breaks): `.venv/Scripts/python.exe scratchpad/strip_meta.py`.
- [ ] **Commit:** `feat: add privacy policy and terms`

> **Dependency this creates for Task 8.** The privacy policy states there are no analytics or tracking
> cookies. Adding Vercel Web Analytics falsifies that sentence, so Task 8 must update section 4 of the
> policy and bump `LEGAL_UPDATED` in the same commit that adds the script. A policy that lags the code
> is worse than one that was never written, because it reads as a promise.

### Task 5: favourites

- [x] Migration `20260825203334_create_favourites.sql`: `(user_id, spot_id)` with a **composite
      primary key**, which is where the idempotency actually comes from. Favouriting twice cannot
      create two rows, so "already favourited" stops being an error the API must detect and becomes a
      state the database cannot represent. Owner-scoped RLS, plus the same comment as `surf_sessions`
      that the API's own filter is the real control. No update policy: there is nothing to update.
- [x] Validated in a rolled-back transaction before applying: columns, idempotency, the spot cascade,
      RLS on, three policies. Then pushed (`supabase db push`).
- [x] **Deviated from this plan, deliberately.** The bullet said "inclusion in the spots response for
      a signed-in caller", which conflicts with Task 2: `/spots` and `/scores` are fetched with a
      shared `revalidate` cache, so per-user data in them is cached under one visitor and served to
      the next. That is a leak, not a style question. Favourites got their own endpoint and the public
      responses stayed impersonal, which is what keeps them cacheable and prerenderable.
- [x] `GET /favourites` (slugs only), `PUT`/`DELETE /favourites/{slug}`, both idempotent. DELETE of
      something not favourited is 204, because the caller asked for "not favourited" and that is the
      resulting state.
- [x] A mark on the ranked list, the map's detail panel and the spot page, where it is a client
      island on an otherwise static page. Renders nothing when signed out rather than baiting a
      sign-in.
- [x] **The glyph took seven attempts, and the lesson is about the medium rather than the effort.** A
      shaka is the obvious icon for a surf app, and it was drawn six ways: detailed hand, mirrored
      prongs, right angle, line art, three separated lobes, tilted silhouette. Every one was rejected
      on sight once rendered. A hand is articulated, and at 19px there is nowhere to put the
      articulation: joined digits read as a blob, separated ones as a propeller, mirrored ones as
      Mickey Mouse. The answer was to stop drawing a hand. A **breaking wave** is one gesture with no
      anatomy to get wrong, it survives 15px, and it is the same curl as `WaveLoader`, so the app now
      has one wave rather than two unrelated ones. The component is named `MarkIcon` for what it means
      rather than what it draws, precisely because the glyph has already changed six times.
- [x] Colour picked against the palette rather than by eye: `#1e6fe8`, which clears both the teal
      "fun" score (`#2f9fb5`) and the violet accent (`#5227e5`), because a mark must never read as a
      score or as selection state. Token renamed `--color-mark`.
- [x] Every option at every step was rendered at 15, 19, 22 and 46px and reviewed as pixels before
      being offered. That is the only reason the failures were caught at all: each rejected version
      looked perfectly reasonable as path data.
- [x] Sorting extracted to `lib/rank.ts` so it is testable without mounting a map. Favourites first,
      then by score **within each group**: sorting them to the top in arbitrary order would trade one
      useful ranking for none.
- [x] Map: a favourite never recedes to a dot, and carries a heart badge. Colour already means score
      and shape already means rank, so a third meaning needed a third channel.
- [x] Tests: 8 API (both isolation cases, both idempotency cases, unknown slugs, auth required, CORS)
      and 7 for the ranking rule. The real SQL was also exercised by hand against the live database
      with two users, since the pytest fakes enforce ownership themselves and so cannot catch a
      missing `WHERE`. Mutation-checked both: removing the `WHERE` leaks, and the old CORS list 400s.
- [x] Note for M10: a favourite is a per-user signal, the first ingredient of the v2 personalisation
      the spec defers. Nothing is built on it. The table is keyed by user rather than by spot, which
      is what keeps that door open; a global popularity counter would have closed it.
- [ ] **Commit:** `feat: add favourite spots`

> **A real bug this surfaced, invisible to every server-side test.** The API's CORS `allow_methods`
> listed GET, POST, DELETE and OPTIONS. `PUT /favourites/{slug}` would have been blocked by the
> browser in production while looking perfectly healthy to curl, TestClient and every server-to-server
> caller, all of which ignore CORS entirely. Found only by driving the real UI in a browser. Fixed,
> and covered by a preflight test that fails against the old list.

### Task 6: a map you can actually use

- [x] The map now draws the **filtered** list. Verified: no search gives 92 rows and 15 pins; typing
      "Coxos" gives 1 row and 1 pin. Before this the rail narrowed to one row while the map carried on
      showing every spot, so the two halves of one screen disagreed about the question being asked.
- [x] **Thinning measured before being designed.** The spots occupy a 48 km strip, and at the default
      zoom a 30 px pin covers 3.6 km of it: 254 pairs sit closer than 2 km and 21 closer than 300 m.
      So this is a legibility problem, not a performance one, and the fix has to be in *screen* space
      rather than in kilometres, because the same two spots collide at zoom 10 and separate at 13.
      `lib/thin.ts` grids by pixel cell and keeps the **highest scoring** spot per cell, which is what
      lets a thinned map still answer "where is it good near here". Survivors carry a `+N` badge, so
      thinning never silently hides places. Verified: 15 pins and 14 badges at default zoom
      (`+12`, `+7`, `+4`, ...), all 92 pins and zero badges once zoomed in.
- [x] The selected spot and anything marked are pinned open regardless of score, so the map cannot hide
      what the rest of the interface is pointing at.
- [x] "Near me" via the Geolocation API, **not requested on mount**. An uninvited permission prompt is
      both disliked and self-defeating: denial is sticky per origin, so asking badly once costs the
      feature permanently. Verified both paths in a real browser: granted (from Carcavelos, the list
      reorders to Carcavelos 0.1 km, Moinho 0.8 km, Torre 1.2 km, and each card shows its distance in
      place of the conditions line) and refused (a plain message, and the order falls back to score
      rather than scrambling).
- [x] Bounds biased west with `maxZoom: 12`, so fitting a north-south strip of coast no longer fills
      the eastern half of the screen with inland Portugal.
- [x] 24 new tests: 12 for the thinning grid and 12 for ranking, including that thinning never loses or
      duplicates a spot at any zoom, that latitude is in the metres-per-pixel maths, and that a refused
      geolocation falls back to score.
- [x] **Fixed while verifying: `vitest` had no config at all**, so the `@/` alias the whole app imports
      with was unresolved in tests. It had been masked because `import type` is erased before
      resolution, and only surfaced when a test pulled in a module importing a real value through the
      alias. The tempting fix (rewrite the import as `./geo`) would have fixed the test and left the
      alias broken for the next person.
- [ ] **Commit:** `feat: filter the map by search and sort by distance`

> **Two bugs found by looking rather than by testing.**
>
> 1. **A CSS specificity bug that only appeared while hovering.** `.seg:hover:not(:disabled)` scores
>    0,3,0 against `.seg.is-on` at 0,2,0, so hovering the *selected* sort pill re-applied the dark text
>    colour over its dark background and the label vanished under the pointer that had just clicked it.
>    Source order was irrelevant; only specificity mattered. Fixed with `:not(.is-on)` plus an explicit
>    hover state for the active pill.
> 2. **A missing translation key rendered as raw text.** The distance line used `fav("away")`, but
>    `away` lives in the `spot` namespace, so the UI printed `favourites.away`. Caught by watching the
>    browser console during the run, not by any assertion.
>
> Both were invisible to the type checker, the linter and the test suite.

> **My own checks lied twice in this task, in the same direction: reporting broken code that was fine.**
> The zoom check pressed "Equal" expecting a Leaflet keyboard binding, silently panned instead, and
> reported 0 pins. The `+N` badge check counted badges *after* zooming in, where nothing is hidden, so
> zero was the correct answer to the wrong question. Neither was a code defect. Worth remembering that a
> failing assertion is a hypothesis about the harness as much as about the app.

### Task 7: SEO

- [ ] Only meaningful now that Task 2 renders content on the server. Metadata first: per-spot titles and
      descriptions built from real data ("Praia dos Coxos surf report and forecast"), not boilerplate.
- [ ] `sitemap.ts` and `robots.ts` covering every spot in both locales.
- [ ] JSON-LD: `Place` for spots, `BreadcrumbList` for navigation. Validate it rather than assuming.
- [ ] Open Graph images per spot, generated with `next/og` so a shared link looks deliberate.
- [ ] Honest expectation setting: this earns traffic over months, not days. It is here so the slow path
      exists, not because it will produce labels this week.
- [ ] **Commit:** `feat: add per-spot metadata, sitemap and structured data`

### Task 8: first-run explanation and analytics

- [ ] A visitor currently sees a number with no idea what it means or that they can contribute. A short
      dismissible explanation: what the score is, that it is computed from open forecast data, and that
      rating sessions is what improves it.
- [ ] Make session logging visible rather than buried in a panel. If labels are the goal, the invitation
      should be somewhere a first-time visitor sees it.
- [ ] Vercel Web Analytics, and one thing worth measuring above all: the ratio of visitors to logged
      sessions. That number decides whether the recruitment ask or the acquisition path is working.
- [ ] **Required by Task 4:** the privacy policy currently states there are no analytics. Update
      section 4 of `src/content/legal.ts` in both languages and bump `LEGAL_UPDATED`, in the same
      commit that adds the script.
- [ ] **Commit:** `feat: add first-run explanation and analytics`

### Task 9: keyboard access for the controls I hand-built

- [ ] A regression I introduced in M7: the custom `Select` and `DayPicker` replaced native elements that
      were keyboard-navigable, and they are click-only. Arrow keys, Home and End, Enter and Escape,
      type-ahead on the select, and arrow keys across the calendar grid.
- [ ] Focus management: focus moves into an opened panel and returns to the trigger on close, and the
      sheets trap focus while open.
- [ ] Verify by driving it with the keyboard alone, no mouse, through the whole log-a-session flow.
- [ ] **Commit:** `fix: make the custom select and calendar keyboard accessible`

### Task 10: docs and learnings

- [ ] ADR for the tide decision: ingested and displayed, deliberately excluded from the heuristic.
- [ ] ADR for the rendering change, and update ADR-0004 now that edge caching exists.
- [ ] Spec: renumber the roadmap, and resolve the i18n deferred decision.
- [ ] README: the new routes, locales and env vars.
- [ ] Milestone learnings.
- [ ] **Commit:** `docs: record the M8 decisions and learnings`

---

## Definition of done for Milestone 8

- A Portuguese surfer can open a link to a specific beach, understand what they are looking at in their
  own language, see the tide, favourite the spots they care about, find the ones near them, read what
  data is held about them, and log a remembered session using only a keyboard if they want to.
- `curl` on a spot URL returns HTML containing the spot name and score.
- **And then the actual next step, which is not code:** send it to four or five people who surf, and run
  `label_report.py` a week later.

## Found during M8, needs its own work

- **CARTO rate-limits bursts, and my own test runs tripped it.** Corrected diagnosis: an earlier note
  here claimed CARTO had started requiring an API key and that production was broken. That was wrong,
  and the way it went wrong is worth keeping. The screenshot really did show "API KEY REQUIRED"
  watermarks, and a keyless tile really did come back at 1,790 bytes. But the tile I measured,
  `11/984/739`, is open ocean off northern Spain, where a nearly-blank tile is the correct answer. A
  tile that actually contains Lisbon (`11/971/784`) returns 27,242 bytes of real map data. The
  watermarks came from replaying the map dozens of times in a few minutes during verification; after a
  pause, tiles serve normally again.

  Two lessons. Measuring the wrong coordinate looks exactly like measuring a broken service, so check
  that a fixture is where you think it is before drawing conclusions from its size. And an automated
  UI loop is a traffic source: hammering a free tile provider in a test harness can produce a
  "production is down" symptom that only exists in the harness.

  No action needed on the provider. Worth remembering that if it ever does change, the privacy policy
  names CARTO in the recipients table and the "leaving the EU" section, and both would have to change
  in the same commit.

- **Shakas as kudos, not as bookmarks** (Francisco's idea, and a better use of the gesture than the one
  it was rejected for). A shaka is something you give *another surfer*, so it belongs on someone else's
  logged session, the way Strava kudos work, not on a beach you want to remember. It also gives people
  a reason to come back and look at each other's logs, which is the only mechanism discussed so far
  that might generate labels without the owner asking for them each time.

  Blocked on something real: sessions are private to the account today, and the privacy policy states
  that plainly ("As sessões que regista nunca são mostradas a outros utilizadores como sendo suas").
  Making any of them visible is a change of purpose that needs a policy change and, arguably, opt-in
  consent rather than a quiet default. Worth designing properly rather than bolting on.

## Deferred (not in M8)

- The ML model itself. That is M9, and it starts when the label report says so.
- Per-user personalisation from favourites and ratings (v2).
- Bathymetry, still deferred, and still the thing that would let tide inform the score.
- Push notifications, session photos, anything social.
