# ADR 0004: Keeping the free-tier API warm

- Status: accepted
- Date: 2026-08-17

## Context

Render spins down a free web service after 15 minutes without inbound traffic, and spinning back up
takes about a minute. That is a poor fit for this product specifically: the score is glanced at in a
hurry, often on a phone in a car while deciding which beach to drive to. A minute of blank screen at
that moment is worse than a slightly stale number would be.

Two free-tier budgets constrain any fix, and they are easy to confuse:

- **Render grants 750 instance hours per calendar month per workspace**, not per service. A 31-day
  month is 744 hours, so keeping one service up around the clock consumes 744 of 750 and leaves the
  entire workspace roughly six hours of headroom. A single manual restart or a second free service
  would exhaust the allowance and suspend everything until the next month.
- **GitHub Actions gives private repositories 2,000 minutes per month**, and bills each run rounded
  up to the nearest minute.

A third dormancy rule interacts with these: **Supabase pauses a free project after 7 days of
inactivity.** The daily ingestion job writes to Postgres every 24 hours, which clears that bar with a
sevenfold margin, so the database is covered. It is covered by exactly one mechanism, though, which
matters for the choice of endpoint below.

## Decision

An external scheduler (cron-job.org, on an account we already hold) issues `GET /scores` every
5 minutes between 05:00 and 21:00 Europe/Lisbon. **Superseded by the 2026-09-01 update below:
the target is now `GET /ready` and the interval is 10 minutes.**

**`/scores`, deliberately, and not `/health`.** `/health` returns a static dict and touches nothing,
so it would report `200 ok` while the database was unreachable, the credentials had expired or the
scoring path was throwing. A monitor that cannot fail is a monitor that lies. `/scores` executes the
real query-and-score path, so a failure notification means the product is actually broken, and as a
side effect every ping counts as Supabase activity.

Rejected alternatives:

- **GitHub Actions cron.** The obvious choice, since ingestion already runs there, but the arithmetic
  rules it out. A ping every 10 minutes is 6 runs per hour, so roughly 4,460 minutes per month around
  the clock or 2,980 restricted to daytime, against a 2,000 minute allowance. It would exhaust the
  budget that the daily ingestion job depends on, making a nice-to-have break a necessity.
- **Supabase `pg_cron` + `pg_net`.** Genuinely attractive: free, in-stack, needs no third-party
  account, and versions as a migration alongside the schema. Rejected because it only fires while
  Postgres is healthy, so the monitor shares a failure domain with the database it is meant to
  outlive, and it offers no retries or failure alerting.

## Consequences

- Instance hours stay comfortably inside the cap: 16 hours a day over 31 days is about 496 of 750,
  leaving room for a second free service later.
- **A 5-minute interval costs nothing over a 10-minute one.** Instance hours are consumed by uptime,
  not by request count, and the tighter interval survives a single failed or delayed ping without
  crossing the 15-minute spin-down threshold.
- **Supabase no longer depends on GitHub Actions alone to stay awake.** Before this, the daily
  ingestion job was the only thing generating database activity, and its failure chain was silent and
  slow: workflow stops running, then seven days later the project pauses, then the site breaks, with
  nothing connecting the cause to the symptom. Pinging `/scores` adds a second, independent source of
  activity from a different provider.
- That chain is worth keeping in mind because of a rule that does not bite yet: GitHub disables
  scheduled workflows after 60 days without repository activity **in public repositories**. This repo
  is private today, so the rule does not apply. It starts applying the moment the repo is made public,
  which for a portfolio project is the likely end state.
- Each ping costs one lightweight query and about 15 KB of JSON, roughly 190 requests a day inside the
  window. Negligible against the free tier's allowances.
- Overnight the service is allowed to sleep, so the first visitor after 21:00 pays a cold start. That
  is accepted deliberately rather than overlooked.
- **Expect one failed execution each morning.** cron-job.org times out well before Render finishes a
  roughly one-minute cold start, so the 05:00 ping will usually be recorded as a failure even though
  it successfully triggered the wake. Alerting should tolerate a single failure and only escalate on
  consecutive ones, otherwise the daily false alarm will train us to ignore real ones.
- The scheduler lives outside the repository, so this ADR is the only record that it exists. Anyone
  wondering why the API is mysteriously warm, or why it went cold, should start here.
- This reduces cold starts but cannot eliminate them, because it does not remove the dependency on a
  warm Python process. The durable fix is to cache score reads at the edge, since scores only change
  when the daily ingestion runs and are therefore stale by design for hours. Deferred, and worth
  doing before this ping becomes load-bearing.

## Update, 2026-08-20: partly superseded

M8 added server-rendered spot pages (`/spot/[slug]`) with `revalidate = 3600`. All 92 are prerendered
at build time and cached by Vercel, so a visitor arriving at a spot page is served from the edge and
never waits on Render at all. The deferred edge-caching work above is done for those pages, and it fell
out of doing the rendering properly rather than needing its own effort.

The keep-warm ping still matters, for what remains uncached: the map page fetches `/scores` and
`/spots` in the browser, and every authenticated call (sessions, favourites) has to reach Render by
definition. So this ADR stands, with a smaller blast radius: a cold start now degrades the map and
signed-in actions rather than everything.

Discovered while doing it, and worth recording because it constrains anything similar in future: the
API was opening a **new database connection per request**. Prerendering 92 pages with six workers hit
`EMAXCONNSESSION`, because Supabase's session-mode pooler caps a project at 15 clients. Fixed with a
bounded `ConnectionPool` (max 6) in the repository. That bug was always present; concurrency merely
made it visible, and a burst of real traffic would have found it eventually.

## Update, 2026-09-01: the scheduler was rate-limited

cron-job.org stopped running the job, reporting "Too many requests: the server is rate-limiting you.
Consider reducing the job's execution frequency."

**Measured before changing anything, and the API is not the culprit.** Eight rapid requests to
`https://before-api.onrender.com/scores` all returned 200 in about 0.4 s, with no `Retry-After`, no
`RateLimit-*` headers and no Cloudflare mitigation header. Repeating them with cron-job.org's own
User-Agent, in case Cloudflare (which fronts Render) treats automated traffic differently, also
returned eight 200s. So the 429 could not be reproduced from here and is not coming from our code.

What did turn up is that **the ping had quietly grown**. This ADR recorded roughly 15 KB per
request; it now measures **24,853 bytes**, because M9 added `observed_at` and `wind_correction_kmh`
to every one of the 92 rows in `/scores`. Nothing flagged that: an endpoint getting 65% heavier is
invisible to tests.

Two changes, addressing the two things it could plausibly be.

**A dedicated `GET /ready`, replacing `/scores` as the ping target.** It runs the identical query and
the identical scoring path, so it still fails whenever the product is genuinely broken and still
counts as Supabase activity, which were the two reasons `/health` was rejected in the first place. It
returns about 90 bytes instead of 25 KB, and answers **503** rather than a cheerful 200 when no spot
can be scored, because the scheduler reads status codes and not response bodies.

**Halve the frequency: every 10 minutes rather than every 5.** This is a configuration change on
cron-job.org, not in this repository. It is following the scheduler's own advice rather than a
diagnosis, since the 429 was not reproducible.

The cost is a property this ADR previously valued: at 5 minutes a single failed ping still left the
next one inside the 15-minute spin-down window, and at 10 minutes it does not, so an isolated failure
now means one cold start. That is judged acceptable, because the ADR already accepts a cold start
every morning at 05:00 for the same reason. **7 minutes is the alternative** that halves nothing but
preserves single-failure tolerance; it is the fallback if 10 minutes turns out not to satisfy the
scheduler.

Worth being honest about the limits of this: the cause was never confirmed. If the job is throttled
again at 10 minutes with a 90-byte payload, the next suspect is cron-job.org's own fair-use policy
rather than anything at our end, and the answer is a different scheduler or accepting cold starts.
