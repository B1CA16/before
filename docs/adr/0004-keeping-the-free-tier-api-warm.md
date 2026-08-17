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
5 minutes between 05:00 and 21:00 Europe/Lisbon.

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
