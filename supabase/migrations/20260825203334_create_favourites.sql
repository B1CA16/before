-- Favourites: the spots a person actually cares about.
--
-- Deliberately the smallest table that can exist. A favourite is a fact with no attributes: this
-- person likes this spot. There is no rating, no note and no ordering, because none of those are
-- known and inventing a column now is how you end up with one that is always null.
--
-- Note for M10, recorded rather than acted on: a favourite is a per-user signal, and per-user signals
-- are the first ingredient of the personalisation the spec defers to v2. Nothing here should be built
-- on yet. The point of writing it down is to avoid designing it out, which a table keyed only by
-- spot (a global "popularity" counter) would have done.

create table favourites (
    -- Same cascade as surf_sessions, and the same reason: this is the right-to-erasure path, and a
    -- database-level cascade cannot be forgotten the way a delete in application code can.
    user_id  uuid   not null references auth.users(id) on delete cascade,
    spot_id  bigint not null references spots(id)      on delete cascade,

    created_at timestamptz not null default now(),

    -- The composite primary key IS the idempotency. Favouriting twice cannot create two rows, so
    -- "already favourited" stops being an error case the API has to detect and becomes a state the
    -- database cannot represent. Same PUT-not-POST thinking as the conditions upsert and sessions.
    primary key (user_id, spot_id)
);

-- The primary key above already indexes (user_id, spot_id), and its leading column serves the only
-- query the app makes: "which spots has this person favourited". No second index is needed, and one
-- on spot_id alone would only pay off for a "who favourited this spot" question nobody asks.

-- Unlike spots, which has RLS enabled with no policies (server-only table), favourites is reachable
-- by end users, so it gets real owner-scoped policies.
--
-- IMPORTANT, and the same caveat as surf_sessions: our FastAPI backend connects as the table owner,
-- which BYPASSES RLS. These policies protect the anon/authenticated auto-REST API only. The API's
-- own "where user_id = caller" filter is the actual access control for our traffic, and a missing
-- WHERE clause there would leak other users' favourites without RLS intervening.
alter table favourites enable row level security;

create policy favourites_select_own on favourites
    for select to authenticated
    using (user_id = auth.uid());

create policy favourites_insert_own on favourites
    for insert to authenticated
    with check (user_id = auth.uid());

-- No update policy, on purpose: there is nothing on this row to update. Changing your mind is a
-- delete, and changing which spot it points at is a different favourite.

create policy favourites_delete_own on favourites
    for delete to authenticated
    using (user_id = auth.uid());
