"use client";

import FavouriteButton from "@/components/FavouriteButton";
import { useFavourites } from "@/components/FavouritesProvider";
import { MarkIcon } from "@/components/Icons";
import type { ScoreNow, Spot } from "@/lib/api";
import { distanceKm, formatKm } from "@/lib/geo";
import { scoreColor, scoreLabel } from "@/lib/score";

import { useTranslations } from "next-intl";

import WaveLoader from "./WaveLoader";

/** The two numbers that decide everything: size and period. */
function conditions(now?: ScoreNow): string {
  if (!now || now.swell_height_m == null || now.swell_period_s == null) return "";
  return `${now.swell_height_m.toFixed(1)} m, ${Math.round(now.swell_period_s)} s`;
}

export default function RankedList({
  spots,
  scores,
  selected,
  hovered,
  onSelect,
  onHover,
  origin = null,
}: {
  spots: Spot[];
  scores: Record<string, ScoreNow>;
  /** Set only while sorting by distance, so the card can say how far away it is. */
  origin?: { latitude: number; longitude: number } | null;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}) {
  const t = useTranslations("map");
  const fav = useTranslations("favourites");
  // "de distância" already exists under spot; duplicating it into another namespace would mean two
  // strings to keep in step.
  const spotT = useTranslations("spot");
  const { isFavourite } = useFavourites();
  if (spots.length === 0) {
    return <WaveLoader label={t("findingSpots")} className="py-8" />;
  }

  // The list arrives already sorted with marked spots first, so the boundary is simply where the run
  // of marked ones ends. Computing it from the sorted order rather than re-partitioning keeps one
  // source of truth for the ordering, in lib/rank.
  const markedCount = spots.findIndex((s) => !isFavourite(s.slug));
  const boundary = markedCount === -1 ? spots.length : markedCount;

  return (
    <ul className="flex flex-col gap-1.5">
      {spots.map((spot, i) => {
        const score = scores[spot.slug]?.score ?? null;
        const marked = i < boundary;
        return (
          // The mark is a SIBLING of the card, not a child. The card is a <button>, and a button
          // inside a button is invalid HTML: browsers recover unpredictably and keyboard users get
          // one focus stop where there should be two.
          <li key={spot.slug} className="relative">
            {/* Two headings, and only when there is actually a division to explain. Without them the
                pinned spots look like a ranking glitch: a 4.7 sitting above a 4.8 with no reason
                given. The heading is the reason. */}
            {boundary > 0 && i === 0 && (
              <p className="list-head is-marked">
                <MarkIcon size={14} weight={2.1} />
                {fav("yours")}
                <span className="list-head-rule" />
              </p>
            )}
            {boundary > 0 && i === boundary && (
              <p className="list-head mt-3">
                {fav("allSpots")}
                <span className="list-head-rule" />
              </p>
            )}
            <button
              onClick={() => onSelect(spot.slug)}
              onMouseEnter={() => onHover(spot.slug)}
              onMouseLeave={() => onHover(null)}
              aria-current={spot.slug === selected ? "true" : undefined}
              className={`row-card pr-11 ${marked ? "is-marked" : ""} ${spot.slug === hovered ? "is-linked" : ""}`}
            >
              <span
                className="grid h-10 w-10 flex-none place-items-center rounded-chip text-value font-extrabold tabular-nums tracking-tight text-badge-ink"
                style={{ background: scoreColor(score) }}
              >
                {scoreLabel(score)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-primary">
                  {spot.name}
                </span>
                <span className="faint block truncate">
                  {origin
                    ? `${formatKm(
                        distanceKm(origin.latitude, origin.longitude, spot.latitude, spot.longitude)
                      )} ${spotT("away")}`
                    : conditions(scores[spot.slug])}
                </span>
              </span>
            </button>
            <FavouriteButton
              slug={spot.slug}
              className="absolute right-2 top-1/2 -translate-y-1/2"
            />
          </li>
        );
      })}
    </ul>
  );
}
