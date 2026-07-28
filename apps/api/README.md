# beFORE API

FastAPI backend. Imports `before_surf` and serves BeFORE scores computed on-the-fly from
forecast conditions.

## Endpoints

- `GET /health` -> `{"status": "ok"}`
- `GET /spots` -> list of spots (slug, name, region, lat/lon, orientation).
- `GET /spots/{slug}/forecast` -> hourly BeFORE score + factor breakdown + raw conditions for the
  upcoming forecast. 404 if the slug is unknown; `[]` if the spot has no forecast rows yet.

## Run locally

`uv run uvicorn before_api.main:app --reload` then open `http://127.0.0.1:8000/docs`.
Requires `DATABASE_URL` in `.env` (same as the rest of the project).

## Design

- Data access is isolated in `SupabaseRepository`, injected via `Depends(get_repository)`, so
  endpoints are tested against a fake repo with no live DB.
- Response shaping (scores, factor breakdown, NaN -> null) is in `forecast.build_forecast_rows`.
- Scores use the shared `before_surf` feature and scoring code (same as offline analysis).
- Deployment is deferred (paired with the frontend milestone).

## Known limitations

- `/spots/{slug}/forecast` returns all `forecast`-source rows, including past hours (old forecasts
  are not pruned yet). Trimming to future hours and a retention policy are deferred (M6 / later).
