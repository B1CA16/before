# ADR 0008: Server-rendered spot pages, and why SEO was a rendering problem

- Status: accepted
- Date: 2026-08-31

## Context

The site needed to be findable by someone who had not been handed the link. The obvious reading of that
is "add metadata", and it would have been wrong.

Measured before deciding anything: the live site served **37,872 bytes and 29 visible words**, and not
one of the 92 spot names appeared in the HTML. The map was a single large client component, so what
arrived at a crawler was an empty shell that filled itself in with JavaScript afterwards. There was also
no URL for a spot at all, so there was nothing to link to, share, or index even in principle.

Metadata on a page with no content is lipstick. The problem was rendering.

## Decision

**A server-rendered page per spot at `/spot/[slug]`, prerendered for all 92 spots in both locales, with
`revalidate = 3600`.**

The map stays a client island. The spot page is a server component whose text, numbers and forecast
hours are in the HTML as served.

## Why hourly revalidation

Chosen from the data rather than picked round. Conditions are ingested daily, but the "current" hour
advances every hour, so hourly is the coarsest interval at which the page stays truthful. Anything
longer would show a score for an hour that has passed.

## Consequences

- **134 visible words instead of 29**, with a real `<h1>`, a data-built description, and every spot name
  indexable. Build output confirms 189 prerendered pages once both locales exist, later 195 with the
  legal pages, sitemap and robots.
- A spot has a URL, so it can be shared. That unlocked the Open Graph cards, the breadcrumb, and the
  nearby-spots links that turned a set of leaf pages into a connected site.
- A new `GET /spots/{slug}` on the API, so the page makes one request instead of fetching all 92 spots
  and discarding 91.
- Pages are served from the edge cache, which means a visitor no longer waits on a Render cold start.
  This narrows but does not remove the need for the keep-warm ping in ADR-0004: the map and every
  authenticated call still hit the API directly.

## What this cost, which is the part worth remembering

Prerendering turned out to be a load test nobody asked for, and it surfaced two pre-existing production
bugs plus one of its own.

1. **`GET /spots/{slug}` 500'd for 7 of 92 spots.** A frame whose `orientation_deg` is wholly null
   arrives as object dtype, and numpy trig rejects object dtype rather than propagating NaN. Invisible
   on the 92-row `/scores` frame, where real floats force float64. Fixed in `build_features` with
   `pd.to_numeric(..., errors="coerce")`.
2. **The API opened a new database connection per request.** Prerendering with six workers hit
   `EMAXCONNSESSION: max clients limited to pool_size: 15`. Fixed with a bounded `ConnectionPool`. This
   would have broken production under any traffic burst; prerendering just got there first.
3. **A build that required a live API.** `generateStaticParams` threw when it could not reach the API,
   failing the whole deploy. The API is a free Render instance that sleeps when idle, so a deploy
   landing while it was cold would have taken the entire site down rather than just the spot pages. It
   only ever worked because the keep-warm cron holds Render awake. Now an unreachable API logs loudly
   and prerenders nothing, and the pages render on demand instead.

Later, the same load produced a **502 from the overloaded instance mid-build**, which also failed the
deploy. Transient upstream failures are now retried with backoff, and each of the page's data fetches
degrades independently via `Promise.allSettled` rather than one taking the page down. Two of the three
attempted fixes for that were wrong in instructive ways, recorded in the M8 learnings.

## Alternatives considered

**Add metadata to the existing client-rendered app.** Rejected on the measurement: there was no content
for the metadata to describe, and Google would have indexed an empty shell.

**Render spot pages on demand rather than prerendering.** Would work, and is in fact the fallback when
the API is unreachable, but it puts a Render cold start in front of the first visitor to each page. The
whole point of a shared link is that it opens fast for someone who has never been here.

**Server-render the map too.** Rejected: Leaflet touches `window` at import time, and a crawler gains
nothing from a map it cannot read. The text next to it carries everything that matters.
