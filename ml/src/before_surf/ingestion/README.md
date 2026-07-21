# Spot ingestion (static registry)

Extracts surf spots for the Lisbon/Ericeira/Cascais coast from OpenStreetMap (Overpass),
computes beach orientation from coastline geometry, and loads them into the `spots` table.

Data source: OpenStreetMap via the Overpass API (open data, ODbL). No competitor ratings.

## Re-run

1. Build the seed (overwrites `db/seeds/spots.csv`):
   `uv run python -m before_surf.ingestion.build_seed`
2. Review and hand-correct `db/seeds/spots.csv` (it is the versioned source of truth).
3. Load into the DB (idempotent upsert by slug):
   `uv run python -m before_surf.ingestion.load_seed`

## Manual corrections

Edit `db/seeds/spots.csv` directly and re-run the loader. Do not re-run the builder unless you
want to refresh from OSM, which overwrites manual edits.

## Notes

- Orientation uses the OSM convention (land on the left, water on the right of a traced
  coastline) to pick the seaward-facing normal. It is approximate on complex bays.
- `break_type` is best-effort and currently blank for all spots (OSM does not tag it); the v0
  heuristic does not require it.
- Overpass is flaky. `overpass.py` retries across mirror endpoints; override the preferred one
  with the `OVERPASS_URL` environment variable if needed.
- Surf schools and shops are filtered out (`_is_business` in `spots_osm.py`), so the table holds
  spots, not businesses.
