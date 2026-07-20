# ADR 0003: Data-driven spot sourcing, no reliance on expert annotation

- Status: accepted
- Date: 2026-07-20

## Context

The initial design assumed the project owner was a local surf expert who would hand-curate spots,
annotate break types, and validate scores by intuition. That assumption is false: the owner is not
a surf expert and is not local to the target coast. Relying on a non-existent expert would produce
low-quality, biased data.

## Decision

Source the spot registry automatically from openly-licensed data: OpenStreetMap (Overpass API,
ODbL) and Wikidata (CC0). Beach orientation is computed from OSM coastline geometry. Break type is
best-effort from tags, otherwise left unknown; the v0 heuristic relies on computed features
(orientation-driven offshore and swell exposure) plus general surf-quality thresholds, not on
per-spot expert knowledge. Individual spots can be corrected by hand in a versioned seed. For v1
labels we lean on user session ratings and measured-condition sanity checks rather than expert
annotation; the final label design is settled at M7.

## Consequences

- The project becomes more purely data-driven, which is closer to good ML practice and less biased.
- No dependency on scarce expertise, and the pipeline scales to new regions for free.
- Some qualitative attributes (break type, wave character) may be missing; we design around that
  rather than fabricating them.
- Validation shifts from expert intuition to agreement with measured conditions and general surf
  logic, plus user session ratings.
