# Milestone 7: Session logging and labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the label loop. Authenticated users log surf sessions (which spot, when, how it was)
and those ratings become the supervised labels M8 trains on. Ends with a training-set builder that
reports how many usable labels exist, so "are we ready for ML" becomes a measured question.

**Architecture:** A `surf_sessions` table keyed to `auth.users` and `spots`. Auth is Google OAuth via
`supabase-js` in the browser (see ADR-0005; email sign-in was built first and could not send, because
no free provider will deliver without a sender domain). Writes and reads of sessions go through
FastAPI, which verifies the Supabase JWT against the project's JWKS and scopes every query to the
caller. Labels are never denormalised: a
session stores only *when and where*, and features are joined from the existing `conditions` table at
training time, preferring `source = 'archive'` (what happened) over `'forecast'` (what was predicted).

**Tech Stack:** Postgres/RLS via Supabase CLI migrations, `supabase-js` in Next.js, `pyjwt[crypto]`
for ES256/JWKS verification in FastAPI, existing `before_surf` package for the training-set builder.

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- Schema changes are hand-written SQL migrations via Supabase CLI (ADR-0002). Never edit applied migrations.
- Sessions are personal data. Data minimisation is a hard rule: if a column is not needed for a label
  or the UI, it does not exist.

## Implementation decisions (approved 2026-08-17)

- **Label: collect rich, train coarse.** Store a 1-5 `rating` plus optional structured `tags`
  (`crowded`, `too_small`, `too_big`, `blown_out`, `good_shape`). M8 trains on the binary collapse
  (`rating >= 4` means worth it). A fine label can always be collapsed; detail never collected cannot
  be recovered. Tags exist so label noise our features cannot explain (crowd, in particular) can be
  filtered out rather than silently capping model performance.
  **This settles the deferred "regression vs ordinal classification" decision: binary classification
  for v1**, because ~100 labels across 5 ordinal classes is roughly 20 per class, too thin to train.
- **Retrospective logging is in scope.** `surfed_at` accepts any past timestamp, and we join to the
  year of archive conditions already ingested. This is the difference between M8 starting with ~60
  labels and ~8. Label volume, not model choice, is the binding constraint on this project.
- **Open signup, private data.** Anyone may sign up; RLS scopes rows to their owner. Same build effort
  as single-user, and a few friends logging multiplies the label rate.
- **Auth: Google OAuth** (revised 2026-08-18, ADR-0005). A 6-digit email code was built first and
  works, but no free mail provider will send without a verified sender domain, which this project does
  not have. Google needs no email at all and still gives a verified address. The email path is kept
  dormant behind `NEXT_PUBLIC_EMAIL_SIGNIN`. Table renamed `surf_sessions`, because Supabase already
  ships `auth.sessions` and one word should not mean two things.
- **Sessions are joined to conditions, not snapshotted.** The `conditions` table already carries both
  `forecast` and `archive` rows per `(spot_id, observed_at)`, so the join can prefer ground truth with
  no new columns. Conditions are hourly, so a session at 07:23 joins to the 07:00 row via
  `date_trunc('hour', surfed_at)`.
- **FastAPI owns data access, and this needs care.** The API connects as the table owner, which
  *bypasses RLS* (see the comment in `20260721195048_enable_rls_on_spots.sql`). So the API's own
  `where user_id = <caller>` filter is the real access control, and RLS policies are defence in depth
  for the day something connects with the anon key. Flagged here because it is a genuine footgun: a
  missing WHERE clause leaks other users' sessions and RLS will not save us.

## Teaching notes to cover during the milestone

- Why the label is the hard part, and why ours must come from human judgment (the circularity trap).
- Ground truth vs prediction: training on forecast conditions teaches the model to predict the
  forecast, not the ocean. Hence the archive preference and the backfill in Task 6.
- Class balance, and why "worth it" being rare or near-universal both break a classifier.
- JWT verification: what signing actually proves, and why verifying beats trusting a header.
- RLS as defence in depth versus RLS as primary control, and which one we actually have.

---

### Task 1: `sessions` schema and RLS

- [x] Create migration `create_sessions` via Supabase CLI (do not hand-name the timestamp):
      `npx supabase migration new create_sessions`
- [x] Columns, deliberately minimal:
      `id bigint generated always as identity primary key`,
      `user_id uuid not null references auth.users(id) on delete cascade`,
      `spot_id bigint not null references spots(id) on delete cascade`,
      `surfed_at timestamptz not null`,
      `rating smallint not null check (rating between 1 and 5)`,
      `tags text[] not null default '{}'`,
      `note text`,
      `created_at timestamptz not null default now()`
- [x] Constrain tags to the known vocabulary so typos cannot fragment the data:
      `check (tags <@ array['crowded','too_small','too_big','blown_out','good_shape']::text[])`
- [x] `unique (user_id, spot_id, surfed_at)` so a double-submit updates rather than duplicates,
      matching the ingestion pipeline's PUT-not-POST idempotency.
- [x] Index `sessions (spot_id, surfed_at)` for the training-set join.
- [x] `on delete cascade` from `auth.users` is the GDPR erasure path: deleting the account deletes the
      sessions. Note this in the migration comment.
- [x] Enable RLS and add owner-scoped policies for select/insert/update/delete
      (`user_id = auth.uid()`), unlike `spots` which has RLS with no policies.
- [x] Note in a comment that `surfed_at <= now()` cannot be a CHECK constraint, because CHECK
      requires immutable expressions. The API enforces it instead.
- [x] Apply with `npx supabase db push` and verify the table and policies exist.
- [x] **Commit:** `feat: add sessions table with owner-scoped RLS`

### Task 2: Supabase auth in the web app

- [x] Add `@supabase/supabase-js` to `apps/web`.
- [x] Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` and to
      Vercel. Remember `NEXT_PUBLIC_*` is inlined at build time, so Vercel needs a redeploy.
- [x] Confirm the anon key is safe to expose (it is: it grants only what RLS allows) and that the
      service-role key is never used in the frontend. State this in the code comment.
- [x] Create a typed browser client and a small `useSession` hook exposing `{user, loading}`.
- [x] Sign-in UI: an email field that calls `signInWithOtp`, plus an "check your inbox" state. Add a
      sign-out control. Keep it inside the existing design system (`.panel`, `.field`, `.pill`).
- [x] Derive auth state, never sync it into effects (the `react-hooks/set-state-in-effect` rule bit
      us twice in M6).
- [x] Verify: sign in end to end on localhost, confirm the JWT is present, then `npm run shots` to
      check the signed-in and signed-out states render.
- [x] **Commit:** `feat: add supabase magic-link auth to the web app`

### Task 3: JWT verification and session endpoints in FastAPI

> **Revised during implementation.** The plan said to verify with a shared `SUPABASE_JWT_SECRET`,
> which is the HS256 model. This project's tokens are actually signed with **ES256** and it publishes
> a JWKS, so verification uses the public key instead. Strictly better and simpler to operate: the API
> holds nothing that could mint a token, so leaking its whole environment does not let anyone sign in
> as another user, and there is no secret to rotate. Key rotation is handled by `kid` lookup. The only
> config needed is `SUPABASE_PROJECT_REF`, which is not a secret and is committed in `render.yaml`.

- [x] Add a JWT dependency that verifies the Supabase access token from the `Authorization: Bearer`
      header against the project's JWKS. Verify signature, `exp`, audience and issuer, with the
      algorithm pinned to ES256. Return the `sub` claim as the user id.
- [x] Reject unverified or expired tokens with 401. Add a test for each failure mode: missing header,
      malformed token, wrong signature, expired token, wrong audience, wrong issuer, unknown key id,
      `alg=none`, and a token with no expiry. Verification without these tests is decoration.
- [x] `POST /sessions`: body `{slug, surfed_at, rating, tags, note}`. Reject `surfed_at` in the future
      (400) and unknown tags (422 via the schema). Upsert on the natural key so re-submitting edits.
- [x] `GET /sessions`: the caller's own sessions, newest first, joined to spot name.
- [x] `DELETE /sessions/{id}`: scoped to the caller, 404 (not 403) if it belongs to someone else, so
      the endpoint does not confirm the existence of other users' rows.
- [x] Every query filters on the authenticated user id. Add a test that user A cannot read, edit or
      delete user B's session, since the owner connection bypasses RLS and this filter is the only
      real control.
- [x] Extend CORS `allow_methods` beyond `GET` to include `POST`, `DELETE` and `OPTIONS`.
- [ ] **Commit:** `feat: add authenticated session endpoints`

### Task 4: the log-a-session flow

- [ ] A "Log a session" form: spot selector (default to the currently selected spot), date and time
      inputs defaulting to now but accepting any past value, 1-5 rating, optional tags, optional note.
- [ ] Make retrospective logging feel first-class, not an edge case: the date field is a normal input,
      not hidden behind an "advanced" toggle. This is the highest-leverage feature in the milestone.
- [ ] Show the conditions we have on record for the chosen spot and hour, so the user can sanity-check
      they are rating the right session, and say plainly when no conditions exist for that hour (an
      honest empty state, not a silent zero, which was an M6 lesson).
- [ ] Optimistic success state, clear error surfacing, and a disabled submit while in flight.
- [ ] Mobile first: this gets used in a car park with cold hands. Large tap targets, no hover-only
      affordances.
- [ ] Verify with `npm run shots` at mobile and desktop widths before declaring it done. Do not design
      blind: the single biggest process failure of M6 was not looking at my own output.
- [ ] **Commit:** `feat: add session logging form`

### Task 5: my sessions list and account deletion

- [ ] A list of the caller's sessions: spot, date, rating, tags, with edit and delete.
- [ ] Deleting a session asks for confirmation, since it destroys a label.
- [ ] An account deletion path that removes the user and cascades their sessions, satisfying the GDPR
      right to erasure. Document where it lives.
- [ ] A short privacy note in the UI stating what is stored (email, sessions) and that sessions are
      private to the account. Honest and brief, not a generated wall of legalese.
- [ ] **Commit:** `feat: add session history and account deletion`

### Task 6: recurring archive backfill (label ground truth)

> **Measured, not assumed.** Two findings changed this task. First, the archive endpoint has **no
> usable lag**: asked for data up to today, it returns complete hours through today. The 5-day lag was
> kept anyway, because recent days come back as a preliminary product still being revised and
> `source = 'archive'` should mean settled. Second, and the reason this task matters at all: across
> the 48,576 spot-hours now holding both sources, archive and forecast disagree on **every hour**, by
> 0.45 s of swell period on average and **6.25 s at worst**. The period ramp spans 3 to 13 s, so that
> worst case is 0.625 of the period sub-score, in the factor that most often decides the total.

- [x] Problem stated: a session logged today has only `forecast` conditions, because the archive
      ingestion was a one-off backfill of the previous year. Training on forecast rows teaches the
      model to reproduce the forecast rather than the ocean.
- [x] Lag confirmed against the API rather than assumed, and the window sized from the schedule:
      a run sees settled data up to 5 days old, the previous weekly run saw up to 12 days old, so the
      window must exceed 12 days or some hours are never fetched. 21 days absorbs a missed run too.
      Both bounds are pinned by tests.
- [x] Weekly GitHub Actions cron (`archive-refresh.yml`, Mondays 05:30 UTC, clear of the 06:00
      forecast job), reusing the idempotent `ON CONFLICT` path so overlapping re-runs are free.
- [x] Weekly, not daily: ~9 minutes a month against the 2,000 available, leaving the daily forecast
      ingestion its 60. Same budget arithmetic as ADR-0004.
- [x] Verified by running it: archive coverage moved from 2026-07-19 to 2026-08-14, closing the
      forecast-only gap, in 20 seconds for 48,576 rows.
- [ ] **Commit:** `feat: refresh archive conditions weekly for session labels`

### Task 7: training-set builder and label report

- [x] `before_surf.labels`: `build_training_set()` joins `surf_sessions` to `conditions` on
      `(spot_id, date_trunc('hour', surfed_at))`, prefers `source = 'archive'` with a `'forecast'`
      fallback, runs the existing `build_features`, and returns features plus
      `worth_it = rating >= 4` and a `label_source` column recording which conditions were used.
      The join is a LEFT JOIN LATERAL so sessions with no conditions survive to be counted.
- [x] Reuses the existing feature code. A test scores the training frame with `HeuristicScorer`
      unchanged, which fails if the columns ever diverge: that is training/serving skew caught by CI
      rather than discovered in M8.
- [x] `ml/notebooks/label_report.py`, split into `report()` and `main()` so the populated branches can
      be exercised on synthetic data instead of waiting for real labels to accumulate.
- [x] Readiness bar stated in code, not prose: `MIN_LABELS = 80`, `MIN_MINORITY_SHARE = 0.25`, with
      `readiness()` returning named blockers so a "no" says what is missing. Both bounds matter, and
      a test proves a large but one-sided set is still refused.
- [x] Tests (16): the 3/4 boundary parameterised across all five ratings, the archive preference
      asserted **in the SQL text** (a Python-side sort could be dropped in a refactor and never
      noticed), and unusable rows dropped-and-counted rather than filled.
- [ ] **Commit:** `feat: add training-set builder and label report`

**Current verdict, run against the live database: 0 labels, NOT READY.** That is the expected answer,
and it is the milestone working rather than failing: the machinery to answer the question now exists,
and the answer is honest.

### Task 8: docs, ADR and spec update

- [ ] ADR for the label design: the 1-5-plus-tags collection with binary training, why not ordinal at
      this sample size, and the archive-over-forecast rule. This is the most consequential decision of
      the project and deserves its own record.
- [ ] Update the spec: resolve the two deferred decisions at lines 310 and 313 (regression vs ordinal;
      final v1 label design), and note that retrospective logging was added to M7.
- [ ] README: how to run the app signed in, and the new env vars.
- [ ] Milestone learnings summary, per the teaching convention.
- [ ] **Commit:** `docs: record the label design decision and M7 learnings`

---

## Definition of done for Milestone 7

- A signed-in user can log a session for any spot at any past time, rate it, tag it, see their
  history, edit and delete it, and delete their account.
- Sessions are private: a test proves user A cannot reach user B's rows through the API.
- `build_training_set()` returns a features-plus-label frame, preferring archive conditions, and the
  label report states plainly whether there are enough labels to attempt M8.
- The weekly backfill gives recent sessions ground-truth conditions.
- Migrations, ADR and spec updated. Lint, format and tests green.

## Deferred (not in M7)

- Any modelling. M8 owns that, and it starts only when the label report clears the bar.
- Personalisation from per-user rating history (v2).
- Photo or video attachments on sessions (storage cost, moderation, and no value to the label).
- Social features. Sessions stay private in v1.
- Edge caching of score reads, which is worth doing before the keep-warm ping becomes load-bearing
  (see ADR-0004) but should not ride along with auth work.
- i18n, still deferred as recorded in the spec.
