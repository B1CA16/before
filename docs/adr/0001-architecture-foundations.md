# ADR 0001: Architecture foundations

- Status: accepted
- Date: 2026-07-20

## Context

BeFORE is a learning-focused, portfolio-quality ML project starting from an empty repo. It must
scale from a notebook-provable hypothesis to a deployed product, and later to more sports, using
only free-tier tooling. Full reasoning is in the design spec:
`docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`.

## Decision

- Single **monorepo** managed as a **uv virtual workspace**. First member: `ml/` (package
  `before-surf`, import `before_surf`). `apps/api` (FastAPI) and `apps/web` (Next.js) join later.
- The ML code is an **installable package imported by the API**, so feature and scoring logic is
  written once and shared between training and serving (prevents training/serving skew).
- **No separate model-serving service** in v0/v1; the model artifact loads inside the API.
- Stack: Python 3.12, FastAPI, Supabase (Postgres + PostGIS), Next.js on Vercel, GitHub Actions
  cron for ingestion. All free tier.
- Quality gates from day one: ruff, pytest, pre-commit (including an em-dash guard), and CI.
- We do **not** scrape or train on competitor surf ratings; labels come from data we own.

## Consequences

- One language (Python) spans ML and backend, reducing a whole class of bugs, at the cost of a
  slightly harder always-on-server story on free hosts (accepted; serverless or spin-down is fine).
- The monorepo keeps shared code cohesive; adding a second sport later is a mechanical refactor,
  not a rewrite.
- No competitor data caps legal risk and keeps the product from being a derivative, at the cost of
  a cold-start on labels (mitigated by the heuristic v0 and our own annotation).
