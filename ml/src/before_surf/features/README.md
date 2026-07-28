# Features (derived, model-ready)

Transforms raw conditions plus spot orientation into features shared by training and serving.
The primitives are pure numpy, so the same function works on a single value (serving) and a whole
column (training), which makes training/serving skew impossible.

## Modules

- `derive.py`
  - `offshore_component(wind_direction_deg, orientation_deg)` -> [-1, 1]; +1 offshore, -1 onshore.
  - `swell_exposure(swell_direction_deg, orientation_deg)` -> [0, 1]; 1 head-on, 0 shadowed.
  - `build_features(df)` -> DataFrame with those columns added (non-mutating).
- `dataset.py`
  - `load_joined(database_url, source='archive')` -> conditions joined with spot metadata.

## Notes

- Directions are "coming from" (0 = north); `orientation_deg` is the seaward-facing azimuth.
- Spots with unknown `orientation_deg` yield NaN interaction features; NaN propagates, we never
  fabricate an orientation.
- Deferred to M7: swell-energy proxy, sin/cos of raw directions, cross/along-shore wind split.
  Deferred (no data): tide.
