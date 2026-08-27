import type { ScoreNow, Spot } from "@/lib/api";
import { distanceKm } from "@/lib/geo";

/** What the list is answering. */
export type SortMode = "score" | "distance";

export type Origin = { latitude: number; longitude: number };

/**
 * The order spots appear in, both in the ranked list and in what the map treats as leading.
 *
 * Marked spots always come first. Marking is a statement about you, and a list that buries the place
 * you deliberately starred under 40 beaches you have never heard of is not answering your question.
 *
 * Inside each group the order depends on what you asked for:
 *
 * - `score`: best first, unscored last. The default, and the question "where is it good right now".
 * - `distance`: nearest first, from a position the browser gave us. The question changes to "of the
 *   places I could actually reach, which is best", which is the real one when you are holding a board.
 *
 * Keeping the sort inside each group matters. Floating marked spots to the top and then leaving them
 * unordered would trade one useful ranking for none, which is the regression the tests guard.
 *
 * Distance sorting falls back to score when there is no origin, so a refused or unavailable
 * geolocation degrades to the previous behaviour rather than to an arbitrary order.
 */
export function rankSpots(
  spots: Spot[],
  scores: Record<string, ScoreNow>,
  isFavourite: (slug: string) => boolean,
  mode: SortMode = "score",
  origin?: Origin | null
): Spot[] {
  const byScore = (a: Spot, b: Spot) =>
    (scores[b.slug]?.score ?? -1) - (scores[a.slug]?.score ?? -1);

  const useDistance = mode === "distance" && origin != null;
  const byDistance = (a: Spot, b: Spot) =>
    distanceKm(origin!.latitude, origin!.longitude, a.latitude, a.longitude) -
    distanceKm(origin!.latitude, origin!.longitude, b.latitude, b.longitude);

  return [...spots].sort((a, b) => {
    const favDelta = Number(isFavourite(b.slug)) - Number(isFavourite(a.slug));
    if (favDelta !== 0) return favDelta;
    if (useDistance) {
      const d = byDistance(a, b);
      // Two spots at the same distance is possible on this coast, so fall through to score rather
      // than leaving the tie to the engine's sort stability.
      if (d !== 0) return d;
    }
    return byScore(a, b);
  });
}
