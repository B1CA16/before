# Conditions ingestion (dynamic time-series)

Fetches hourly ocean and weather conditions per spot from Open-Meteo and stores them in the
`conditions` table, keyed uniquely by `(spot_id, observed_at, source)`.

Data source: Open-Meteo (free, no key). Marine API for waves/swell/sea-temperature; Weather API
for wind and air temperature. Directions are "coming from" (0 = north). Times are UTC.

## Modes

- **Backfill (archive):** `uv run python -m before_surf.ingestion.run_backfill`
  Pulls ~1 year of hourly ERA5-based history per spot, `source='archive'`. For EDA and heuristic
  calibration. Idempotent: safe to re-run.
- **Forecast (daily):** `uv run python -m before_surf.ingestion.run_forecast`
  Pulls the next 7 days per spot, `source='forecast'`. Runs daily via GitHub Actions
  (`.github/workflows/ingest.yml`) using the `DATABASE_URL` repo secret.

## Notes

- Two API calls per spot (marine + weather), merged on timestamp; missing values are NULL.
- Archive lags ~5 days, so the backfill window ends 5 days before today.
- Storage: ~800k archive rows plus daily forecast accumulation. Watch the 500 MB free tier; a
  retention policy for old forecast rows is a likely future addition.
