# BeFORE

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
- Archive conditions are refreshed weekly by `.github/workflows/archive-refresh.yml`, which is what
  gives logged sessions measured conditions instead of the forecast that was current when they
  happened. See `docs/adr/0006-label-design.md` for why that difference matters.

## Running it locally

Two processes, and the frontend needs both.

```bash
# API, from the repo root
uv sync --all-packages
uv run uvicorn before_api.main:app --reload --port 8000

# web, in another terminal
cd apps/web && npm install && npm run dev
```

Environment. Secrets live in gitignored files and never in the repo; `.env.example` in each place
lists what is needed.

| Where | Variable | Notes |
| --- | --- | --- |
| `.env` (root) | `DATABASE_URL` | Supabase session-pooler URI. Owner access, so it bypasses RLS. |
| `.env` (root) | `SUPABASE_PROJECT_REF` | Builds the JWKS URL used to verify access tokens. Not secret. |
| `apps/web/.env.local` | `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` locally. |
| `apps/web/.env.local` | `NEXT_PUBLIC_SUPABASE_URL` | |
| `apps/web/.env.local` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Safe in the browser: grants only what RLS allows. **Never** the service-role or `sb_secret_` key. |

There is deliberately **no JWT secret**. Supabase signs with ES256, so the API verifies against a
published public key and holds nothing capable of minting a token.

### Signing in, and logging a session

Sign-in is Google only (ADR-0005: no free mail provider will send without a sender domain). It needs a
Google Cloud OAuth client whose authorised redirect URI is Supabase's callback,
`https://<project-ref>.supabase.co/auth/v1/callback`, **not** this app's URL, plus
`http://localhost:3000/**` in Supabase's redirect allowlist.

Signed in, pick a spot and use "Log a session here". The date accepts **any past time**: logging
remembered sessions is the point, not a convenience, because a year of archive conditions is already
stored and waiting to be paired with them. "Your sessions" in the account menu lists, edits and deletes
them, and deletes the account.

### Languages

Portuguese is the default, English is at `/en`. Portuguese keeps the unprefixed paths, so `/spot/<slug>`
is Portuguese and `/en/spot/<slug>` is English, and links shared before the translation still work.

Strings live in `apps/web/messages/{pt,en}.json`. A test asserts key parity and that every verdict the
score can produce exists in both, because a missing key renders as a raw identifier to a user.

Two things are deliberately not translated: spot names and region names, which are data from OSM rather
than interface copy.

### Are there enough labels to train on?

```bash
uv run python ml/notebooks/label_report.py
```

Reports the label count, class balance, how many examples are paired with measured rather than
forecast conditions, and a plain verdict on whether the ML milestone (M9) can begin. The thresholds live in
`before_surf.labels` so they cannot be quietly relaxed to make a run look better.

## Layout

- `ml/` first-party Python package `before_surf` (ingestion, features, scoring, labels, evaluation)
- `apps/` FastAPI backend (`api`) and Next.js frontend (`web`)
- `supabase/migrations/` SQL migrations (schema source of truth), `supabase/email-templates/` auth mail
- `docs/` design specs, plans, and ADRs
- `scripts/`, `infrastructure/` tooling and deploy config
