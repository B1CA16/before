-- Surf sessions: the label source for the v1 ML model.
--
-- Named surf_sessions, not sessions, on purpose. Supabase ships its own auth.sessions table for
-- login sessions. Both could coexist in different schemas, but in a project that is adding auth
-- right now the bare word "sessions" would mean two unrelated things, and anyone debugging login
-- would keep landing on the labels table. The prefix costs nothing and removes the ambiguity.
--
-- A session records only WHERE and WHEN someone surfed, plus how it was. Conditions are
-- deliberately NOT copied in here. The conditions table already holds both 'forecast' and
-- 'archive' rows per (spot_id, observed_at), so the training join can prefer what actually
-- happened over what was predicted. Denormalising a snapshot would freeze in the forecast and
-- quietly teach the model to reproduce the forecast rather than the ocean.
--
-- Conditions are hourly, so the training join truncates surfed_at to the hour.

create table surf_sessions (
    id         bigint generated always as identity primary key,
    -- on delete cascade is the GDPR right-to-erasure path: removing the account removes the
    -- sessions with it, with no application code to forget to run.
    user_id    uuid not null references auth.users(id) on delete cascade,
    spot_id    bigint not null references spots(id) on delete cascade,
    surfed_at  timestamptz not null,

    -- Collected at 1-5, trained as a binary collapse (rating >= 4 means "worth it"). A fine label
    -- can always be collapsed later; detail never collected cannot be recovered.
    rating     smallint not null check (rating between 1 and 5),

    -- Why it was good or bad, from a fixed vocabulary. These exist so label noise our features
    -- cannot possibly explain (crowd, above all) can be filtered out at training time instead of
    -- silently capping how well any model can do.
    tags       text[] not null default '{}'
        check (tags <@ array['crowded', 'too_small', 'too_big', 'blown_out', 'good_shape']::text[]),

    note       text,

    created_at timestamptz not null default now(),
    -- Kept for label provenance: a revised rating is a different label, and we want to be able to
    -- see that it changed.
    updated_at timestamptz not null default now(),

    -- One session per person, spot and moment, so a double submit upserts instead of duplicating.
    -- Same PUT-not-POST idempotency the conditions ingestion uses.
    unique (user_id, spot_id, surfed_at)
);

-- The training-set join is (spot_id, hour), so index in that order. Per-user reads are already
-- served by the leading column of the unique index above.
create index surf_sessions_spot_time_idx on surf_sessions (spot_id, surfed_at);

-- Note: surfed_at must not be in the future, but that cannot be a CHECK constraint, because CHECK
-- expressions must be immutable and now() is not. The API enforces it.

-- Unlike spots, which has RLS enabled with no policies (server-only table), sessions is reachable
-- by end users, so it gets real owner-scoped policies.
--
-- IMPORTANT: our FastAPI backend connects as the table owner, which BYPASSES RLS. These policies
-- protect the anon/authenticated auto-REST API only. The API's own "where user_id = caller" filter
-- is the actual access control for our traffic, and a missing WHERE clause there would leak other
-- users' sessions without RLS intervening.
alter table surf_sessions enable row level security;

create policy surf_sessions_select_own on surf_sessions
    for select to authenticated
    using (user_id = auth.uid());

create policy surf_sessions_insert_own on surf_sessions
    for insert to authenticated
    with check (user_id = auth.uid());

create policy surf_sessions_update_own on surf_sessions
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy surf_sessions_delete_own on surf_sessions
    for delete to authenticated
    using (user_id = auth.uid());
