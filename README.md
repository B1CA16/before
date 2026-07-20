# beFORE

Decide whether outdoor sports are worth doing given environmental conditions.
We train our own ML models (this is not an AI wrapper). Built one module at a time.

**Current module: Surf Intelligence.**

- Design spec: `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`
- Architecture decisions: `docs/adr/`
- Conventions for contributors and agents: `CLAUDE.md`

## Layout

- `ml/` first-party Python package `before_surf` (ingestion, features, scoring, training, evaluation)
- `apps/` FastAPI backend (`api`) and Next.js frontend (`web`), added in later milestones
- `db/` SQL migrations (schema source of truth)
- `docs/` design specs, plans, and ADRs
- `scripts/`, `infrastructure/` tooling and deploy config
