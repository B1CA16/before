-- Enable Row Level Security on spots and add no anon policy, so the public
-- (anon/authenticated) auto-REST API can neither read nor write the table.
-- Our backend connects as the table owner (postgres), which bypasses RLS,
-- so server-side reads and the seed loader keep full access.
alter table spots enable row level security;
