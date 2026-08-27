import type { ScoreNow, Spot } from "@/lib/api";

/**
 * The order spots appear in, both in the ranked list and in what the map treats as leading.
 *
 * Two keys, in this order:
 *
 * 1. Favourites first. Favouriting is a statement about you, and a list that buries the place you
 *    marked under 40 beaches you have never heard of is not answering your question.
 * 2. Then by score, unscored last, which is the original ranking and still what decides "where do I
 *    go" inside each group.
 *
 * Keeping the score order WITHIN the favourites matters. Sorting favourites to the top and leaving
 * them in arbitrary order would trade one useful ranking for none, which is the mistake this exists
 * to make hard to reintroduce.
 *
 * Extracted from the page so it can be tested without mounting a map.
 */
export function rankSpots(
  spots: Spot[],
  scores: Record<string, ScoreNow>,
  isFavourite: (slug: string) => boolean
): Spot[] {
  return [...spots].sort((a, b) => {
    const favDelta = Number(isFavourite(b.slug)) - Number(isFavourite(a.slug));
    if (favDelta !== 0) return favDelta;
    return (scores[b.slug]?.score ?? -1) - (scores[a.slug]?.score ?? -1);
  });
}
