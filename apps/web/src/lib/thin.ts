import type { ScoreNow, Spot } from "@/lib/api";

/** One spot kept on the map, plus how many others it stands in for at this zoom. */
export type ThinnedSpot = { spot: Spot; hidden: number };

/**
 * Metres per screen pixel in Web Mercator, which depends on both zoom and latitude.
 *
 * The latitude term is not pedantry: Mercator stretches east-west away from the equator, so a pixel
 * covers less ground the further north you are. Ignoring it would make the grid wrong by a factor of
 * cos(38.7 degrees), about 22 percent, on this coast.
 */
export function metresPerPixel(zoom: number, latitude: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/**
 * Thin the pins so they stop piling up, keeping the best spot in each patch of screen.
 *
 * This is a legibility problem, not a performance one. 92 markers is nothing to render; the trouble is
 * that the spots are packed into a 48 km strip of coast, so at the default zoom a 30 px pin covers
 * 3.6 km of it. Measured on the real data: 254 pairs of spots sit closer than 2 km and 21 are closer
 * than 300 m, which is three pins in the space of one.
 *
 * The rule is a grid in *screen* space rather than a distance in kilometres, because overlap is a
 * screen phenomenon: the same two spots collide at zoom 10 and sit comfortably apart at zoom 13. Cell
 * size is therefore recomputed from the zoom every time.
 *
 * Which spot survives a cell is the product decision. Keeping the highest score means the map answers
 * "where is it good near here" at every zoom, which is the question the whole app exists for. Keeping
 * the first by name or by id would have answered nothing. The survivor carries a count of what it
 * stands in for, so a thinned pin can say so rather than silently hiding places.
 *
 * `keep` always survives regardless of score: the selected spot and anything the user marked. Hiding
 * the pin someone just clicked, or the beach they deliberately starred, would be the map disagreeing
 * with the rest of the interface.
 */
export function thinSpots({
  spots,
  scores,
  zoom,
  keep,
  cellPx = 46,
}: {
  spots: Spot[];
  scores: Record<string, ScoreNow>;
  zoom: number;
  keep?: Set<string>;
  cellPx?: number;
}): ThinnedSpot[] {
  if (spots.length === 0) return [];

  // One cell size for the whole set, taken from the middle latitude. The strip is 0.43 degrees tall,
  // over which the Mercator correction varies by well under a percent, so a per-spot cell would be
  // false precision and would also make the grid non-uniform.
  const midLat = spots.reduce((sum, s) => sum + s.latitude, 0) / spots.length;
  const cellMetres = metresPerPixel(zoom, midLat) * cellPx;
  const dLat = cellMetres / 111_320;
  const dLon = cellMetres / (111_320 * Math.cos((midLat * Math.PI) / 180));

  const scoreOf = (slug: string) => scores[slug]?.score ?? -1;

  // Best-first, so the first spot to claim a cell is the one worth keeping and everything after it in
  // that cell is a hidden extra. Sorting once beats comparing inside the loop.
  const ordered = [...spots].sort((a, b) => scoreOf(b.slug) - scoreOf(a.slug));

  const cells = new Map<string, ThinnedSpot>();
  const forced: ThinnedSpot[] = [];

  for (const spot of ordered) {
    const key = `${Math.floor(spot.latitude / dLat)}:${Math.floor(spot.longitude / dLon)}`;
    const cell = cells.get(key);

    if (keep?.has(spot.slug)) {
      // Pinned open. If it is the first in its cell it also claims the cell, so a neighbour does not
      // then appear on top of it.
      if (!cell) cells.set(key, { spot, hidden: 0 });
      else forced.push({ spot, hidden: 0 });
      continue;
    }

    if (!cell) cells.set(key, { spot, hidden: 0 });
    else cell.hidden += 1;
  }

  return [...cells.values(), ...forced];
}
