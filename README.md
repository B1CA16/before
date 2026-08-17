# beFORE

Decide whether outdoor sports are worth doing given environmental conditions.
We train our own ML models (this is not an AI wrapper). Built one module at a time.

**Current module: Surf Intelligence.**

- Design spec: `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`
- Architecture decisions: `docs/adr/`
- Conventions for contributors and agents: `CLAUDE.md`

## Deployed

- Web: https://before-steel.vercel.app (Vercel)
- API: https://before-api.onrender.com (Render), health check at `/health`

Both run on free tiers, which shapes the operations:

- The API sleeps after 15 minutes idle and takes about a minute to wake. An external scheduler
  (cron-job.org) pings `/scores` every 5 minutes from 05:00 to 21:00 Europe/Lisbon to keep it warm
  during surf hours, and lets it sleep overnight to stay inside Render's 750 instance hours per month.
  It pings `/scores` rather than `/health` on purpose, so the check fails when the app is genuinely
  broken and so each ping also counts as Supabase activity. See
  `docs/adr/0004-keeping-the-free-tier-api-warm.md`, including why this is not a GitHub Action.
- Conditions are ingested daily at 06:00 UTC by `.github/workflows/ingest.yml`. This also keeps the
  Supabase project clear of its 7-day inactivity pause.
- `ALLOWED_ORIGINS` on Render must name the web origin, otherwise browsers cannot read the API.

## Layout

- `ml/` first-party Python package `before_surf` (ingestion, features, scoring, training, evaluation)
- `apps/` FastAPI backend (`api`) and Next.js frontend (`web`), added in later milestones
- `db/` SQL migrations (schema source of truth)
- `docs/` design specs, plans, and ADRs
- `scripts/`, `infrastructure/` tooling and deploy config
