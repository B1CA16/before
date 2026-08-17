# Milestone 7: Session logging and labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the label loop. Authenticated users log surf sessions (which spot, when, how it was)
and those ratings become the supervised labels M8 trains on. Ends with a training-set builder that
reports how many usable labels exist, so "are we ready for ML" becomes a measured question.

**Architecture:** A `sessions` table keyed to `auth.users` and `spots`. Auth is Supabase magic links,
handled in the browser by `supabase-js`. Writes and reads of sessions go through FastAPI, which
verifies the Supabase JWT and scopes every query to the caller. Labels are never denormalised: a
session stores only *when and where*, and features are joined from the existing `conditions` table at
training time, preferring `source = 'archive'` (what happened) over `'forecast'` (what was predicted).

**Tech Stack:** Postgres/RLS via Supabase CLI migrations, `supabase-js` in Next.js, `python-jose` (or
`pyjwt`) for JWT verification in FastAPI, existing `before_surf` package for the training-set builder.

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
- **Auth: Supabase magic links.** No password storage, fewest moving parts, less personal data to
  defend under GDPR.
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

- [ ] Create migration `create_sessions` via Supabase CLI (do not hand-name the timestamp):
      `npx supabase migration new create_sessions`
- [ ] Columns, deliberately minimal:
      `id bigint generated always as identity primary key`,
      `user_id uuid not null references auth.users(id) on delete cascade`,
      `spot_id bigint not null references spots(id) on delete cascade`,
      `surfed_at timestamptz not null`,
      `rating smallint not null check (rating between 1 and 5)`,
      `tags text[] not null default '{}'`,
      `note text`,
      `created_at timestamptz not null default now()`
- [ ] Constrain tags to the known vocabulary so typos cannot fragment the data:
      `check (tags <@ array['crowded','too_small','too_big','blown_out','good_shape']::text[])`
- [ ] `unique (user_id, spot_id, surfed_at)` so a double-submit updates rather than duplicates,
      matching the ingestion pipeline's PUT-not-POST idempotency.
- [ ] Index `sessions (spot_id, surfed_at)` for the training-set join.
- [ ] `on delete cascade` from `auth.users` is the GDPR erasure path: deleting the account deletes the
      sessions. Note this in the migration comment.
- [ ] Enable RLS and add owner-scoped policies for select/insert/update/delete
      (`user_id = auth.uid()`), unlike `spots` which has RLS with no policies.
- [ ] Note in a comment that `surfed_at <= now()` cannot be a CHECK constraint, because CHECK
      requires immutable expressions. The API enforces it instead.
- [ ] Apply with `npx supabase db push` and verify the table and policies exist.
- [ ] **Commit:** `feat: add sessions table with owner-scoped RLS`

### Task 2: Supabase auth in the web app

- [ ] Add `@supabase/supabase-js` to `apps/web`.
- [ ] Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local` and to
      Vercel. Remember `NEXT_PUBLIC_*` is inlined at build time, so Vercel needs a redeploy.
- [ ] Confirm the anon key is safe to expose (it is: it grants only what RLS allows) and that the
      service-role key is never used in the frontend. State this in the code comment.
- [ ] Create a typed browser client and a small `useSession` hook exposing `{user, loading}`.
- [ ] Sign-in UI: an email field that calls `signInWithOtp`, plus an "check your inbox" state. Add a
      sign-out control. Keep it inside the existing design system (`.panel`, `.field`, `.pill`).
- [ ] Derive auth state, never sync it into effects (the `react-hooks/set-state-in-effect` rule bit
      us twice in M6).
- [ ] Verify: sign in end to end on localhost, confirm the JWT is present, then `npm run shots` to
      check the signed-in and signed-out states render.
- [ ] **Commit:** `feat: add supabase magic-link auth to the web app`

### Task 3: JWT verification and session endpoints in FastAPI

- [ ] Add a JWT dependency that verifies the Supabase access token from the `Authorization: Bearer`
      header, using the project JWT secret from config (`SUPABASE_JWT_SECRET`, `sync: false` on
      Render). Verify signature, `exp`, and audience. Return the `sub` claim as the user id.
- [ ] Reject unverified or expired tokens with 401. Add a test for each failure mode: missing header,
      malformed token, wrong signature, expired token. Verification without these tests is decoration.
- [ ] `POST /sessions`: body `{slug, surfed_at, rating, tags, note}`. Reject `surfed_at` in the future
      (400) and unknown tags (422 via the schema). Upsert on the natural key so re-submitting edits.
- [ ] `GET /sessions`: the caller's own sessions, newest first, joined to spot name.
- [ ] `DELETE /sessions/{id}`: scoped to the caller, 404 (not 403) if it belongs to someone else, so
      the endpoint does not confirm the existence of other users' rows.
- [ ] Every query filters on the authenticated user id. Add a test that user A cannot read, edit or
      delete user B's session, since the owner connection bypasses RLS and this filter is the only
      real control.
- [ ] Extend CORS `allow_methods` beyond `GET` to include `POST`, `DELETE` and `OPTIONS`.
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

- [ ] Problem to state clearly first: a session logged today has only `forecast` conditions, because
      the archive ingestion was a one-off backfill of the previous year. Training on forecast rows
      teaches the model to reproduce the forecast rather than the ocean.
- [ ] ERA5 archive lags real time by roughly five days, so backfill the trailing window rather than
      yesterday. Confirm the actual lag against the API before fixing the window.
- [ ] Add a weekly GitHub Actions cron that backfills archive conditions for the trailing ~2 weeks,
      reusing the existing idempotent `ON CONFLICT` ingestion path so re-runs are safe.
- [ ] Weekly, not daily: Actions minutes on a private repo are capped at 2,000/month and the keep-warm
      analysis in ADR-0004 showed how fast that budget goes.
- [ ] Verify a session logged today gains an `archive` row within a week.
- [ ] **Commit:** `feat: backfill archive conditions weekly for session labels`

### Task 7: training-set builder and label report

- [ ] `before_surf.labels.build_training_set()`: join `sessions` to `conditions` on
      `(spot_id, date_trunc('hour', surfed_at))`, prefer `source = 'archive'` and fall back to
      `'forecast'`, run the existing `build_features`, and return features plus
      `worth_it = rating >= 4` and a `label_source` column recording which conditions were used.
- [ ] Reuse the existing feature code rather than reimplementing it. The whole reason `ml/` is an
      installable package is to make training/serving skew impossible.
- [ ] A report notebook (`ml/notebooks/label_report.py`) printing: total labels, class balance,
      archive vs forecast split, labels per spot, labels per user, and how many were dropped for
      missing conditions.
- [ ] State the readiness bar explicitly so M8 is not started on hope: at least ~80 labels with both
      classes above ~25% is a plausible floor for a first binary model. Under that, M8 is premature and
      the honest move is to keep logging.
- [ ] Tests: the join prefers archive over forecast, the binary collapse is correct at the 3/4
      boundary, and sessions with no matching conditions are dropped rather than silently NaN-filled.
- [ ] **Commit:** `feat: add training-set builder and label report`

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
