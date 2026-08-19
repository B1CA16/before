# Milestone 8: Product readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make beFORE something a real surfer can be handed without apology, in their own language, and
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

- [ ] Migration adding `sea_level_m real` to `conditions`. Nullable: a year of existing rows will not
      have it, and backfilling is a separate step.
- [ ] Add `sea_level_height_msl` to the marine variables and to `build_condition_rows`.
- [ ] Re-run the archive refresh so the trailing window gains tide, then note in the plan how far back
      tide coverage actually goes. Do not claim the full year has it unless a query says so.
- [ ] Derived, in `features/derive.py`, because raw metres are not meaningful on their own:
      `tide_state` (position within the local low-to-high range) and `tide_rising` (sign of the change
      to the next hour). Both shape-agnostic numpy, same as the existing primitives.
- [ ] Expose on `/scores`, `/spots/{slug}/forecast` and `/spots/{slug}/conditions`.
- [ ] Show it in the spot panel: current height, whether it is rising or falling, and the next turn.
      A tide row on the forecast timeline if it reads clearly; skip it if it makes the chart busy.
- [ ] Tests: the derived features at low, mid and high water, and that a null `sea_level_m` propagates
      to null rather than to a plausible-looking zero.
- [ ] **Commit:** `feat: ingest and display tide`

### Task 2: routes, deep links and server rendering

- [ ] State the problem plainly first: `app/page.tsx` is one big client component, so the served HTML
      contains no spots, no scores and no text. There is exactly one route (`/` and `/_not-found`).
      Nothing can be linked to and nothing can be indexed. SEO is not a metadata problem here, it is a
      rendering problem.
- [ ] Add `app/spot/[slug]/page.tsx` as a **server component**: fetches that spot and its forecast on
      the server, renders name, region, score, conditions and the explanation as real HTML.
- [ ] Keep the map a client island (`ssr: false`), because Leaflet needs `window`. The point is that the
      content around it no longer depends on JavaScript.
- [ ] `generateStaticParams` over the spot list, with `revalidate` matched to the ingestion cadence.
- [ ] **This closes the deferred item in ADR-0004.** Server-rendered pages with revalidation are cached
      by Vercel, so a visitor is not waiting on a Render cold start. Note that in the ADR.
- [ ] Selecting a spot on the map updates the URL, and loading a spot URL selects it on the map.
- [ ] A share affordance on the spot panel: copy link, and the Web Share API on mobile where available.
- [ ] Verify with `curl` that the HTML actually contains the spot name and score. If it does not, the
      task is not done, whatever the browser shows.
- [ ] **Commit:** `feat: add server-rendered spot pages and deep links`

### Task 3: Portuguese

- [ ] Settle the library question above before writing anything.
- [ ] Locale-prefixed routes (`/pt/...`, `/en/...`) with negotiation from `Accept-Language` and a
      persisted override. Portuguese is the default for a Portuguese coast.
- [ ] Extract every UI string. There are more than it looks: empty states, error messages, the privacy
      note, confirmation copy, `aria-label`s.
- [ ] Replace the pinned `UI_LOCALE` in `lib/forecast.ts` with the active locale. It was pinned to
      `en-GB` in M6 precisely because the browser locale produced Portuguese day names in an English
      interface; now that mismatch is the thing being fixed properly.
- [ ] Language switch in the top bar, and `hreflang` on every page.
- [ ] Verify: `npm run shots` in both languages. Portuguese is longer than English and will find every
      layout that only fits its original copy.
- [ ] **Commit:** `feat: add portuguese and locale routing`

### Task 4: privacy policy and terms

- [ ] Not optional. With accounts open to other people, you are a data controller processing personal
      data of EU residents, and Art. 13 requires you to tell them what you hold and why. Google's
      consent screen wants the URL too.
- [ ] `/privacy` and `/terms` as server-rendered pages, in both languages.
- [ ] The privacy policy must describe **what is actually true**, which is unusually easy here because
      the system was built for it: email address and logged sessions, nothing else; sessions private to
      the account; Google as the identity provider; Supabase and Render and Vercel as processors;
      deletion immediate and total via the account screen. Write it against the schema, not from a
      template.
- [ ] Link both from the footer, from the sign-in popover, and from the account screen.
- [ ] **Commit:** `feat: add privacy policy and terms`

### Task 5: favourites

- [ ] Migration: `favourites (user_id, spot_id)` with the same owner-scoped RLS as `surf_sessions`, and
      the same reminder in the comment that the API's own filter is the real control.
- [ ] `PUT`/`DELETE /favourites/{slug}` and inclusion in the spots response for a signed-in caller.
- [ ] Heart on each spot card and on the spot page; favourites sort to the top of the ranked list and
      get a distinct marker on the map.
- [ ] Tests: one user's favourites are invisible to another, and favouriting twice is idempotent.
- [ ] Note for M10: a favourite is a per-user signal, which is the first ingredient of the v2
      personalisation the spec defers. Do not build on that yet, just avoid designing it out.
- [ ] **Commit:** `feat: add favourite spots`

### Task 6: a map you can actually use

- [ ] Search filters the **map** as well as the list. Today it filters only the list, which is
      surprising the moment you use it.
- [ ] "Near me" via the Geolocation API, sorting by distance. This is the real product question: not
      "show me 92 beaches" but "which one I can reach is best right now". Handle refusal gracefully,
      since it is a permission prompt and many people say no.
- [ ] Cluster or thin markers where spots bunch near Cascais, deferred from M6.
- [ ] Keep the map to the coast; the current bounds include a lot of inland Portugal.
- [ ] **Commit:** `feat: filter the map by search and sort by distance`

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

## Deferred (not in M8)

- The ML model itself. That is M9, and it starts when the label report says so.
- Per-user personalisation from favourites and ratings (v2).
- Bathymetry, still deferred, and still the thing that would let tide inform the score.
- Push notifications, session photos, anything social.
