# CLAUDE.md

Project memory for the **beFORE** repository. Read this before working in the repo.

## What this project is

beFORE is a platform that helps users decide whether outdoor sports are worth doing given
environmental conditions. We train our own ML models (this is not an AI wrapper, no LLM APIs).
We build one module at a time. The first and only current module is **Surf Intelligence**.

Full approved design: `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`.
Read it for the ML problem definition, feature strategy, stack, and milestone roadmap.

## Working conventions (strict)

### Git
- **Never run `git commit` (or `git push`) automatically.** Only the user commits.
- When work reaches a sensible stopping point, tell the user it is a good time to commit and
  provide the commit message.
- Commit messages are a **single conventional-commit subject line only**. No body, no
  co-author trailer, no description.
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`.
- Example: `docs: add Surf Intelligence design specification`

### Writing style
- **No em-dashes anywhere.** Not in chat replies, code comments, docs, or app-facing text.
  Use commas, colons, parentheses, or hyphens instead.

### Teaching / collaboration style
- The user is an experienced software developer, newer to ML, who wants to understand every
  decision. Explain theory, alternatives, and trade-offs before implementing.
- Do not make architectural decisions unilaterally. Present options and a recommendation.
- Split work into small milestones. Brief objective / difficulty / learning goals at the start
  of each milestone; summarize learnings at the end.
- Free-tier tools only (Supabase, Vercel, GitHub Actions, etc.). No paid services.

## Stack (agreed)

- ML + backend: Python + FastAPI (`ml/` is an installable package the API imports).
- Database + Auth + Storage: Supabase (Postgres + PostGIS).
- Frontend: Next.js / React on Vercel; maps via MapLibre / Leaflet + OSM tiles.
- Scheduled ingestion: GitHub Actions cron.
