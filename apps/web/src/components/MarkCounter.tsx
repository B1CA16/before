"use client";

import { useTranslations } from "next-intl";

import { useAuth } from "@/components/AuthProvider";
import { useFavourites } from "@/components/FavouritesProvider";
import { MarkIcon } from "@/components/Icons";
import { COUNTER_ID } from "@/components/MarkFx";

/**
 * How many spots you have marked, and the thing the flying shaka lands in.
 *
 * It exists to give the animation somewhere to go, but it earns its place on its own: it is the only
 * always-visible confirmation that marking did anything, and it turns an invisible preference into a
 * number you can watch grow. Hidden entirely at zero, so a signed-in person who has marked nothing is
 * not shown an empty scoreboard.
 *
 * Deliberately not a link. Marked spots are already pinned to the top of the list under their own
 * heading, so there is nowhere else to send you; a control that looks clickable and goes nowhere is
 * worse than one that plainly reports a number.
 */
export default function MarkCounter() {
  const t = useTranslations("favourites");
  const { user } = useAuth();
  const { favourites } = useFavourites();

  if (!user || favourites.size === 0) return null;

  return (
    <span
      id={COUNTER_ID}
      className="mark-counter"
      title={t("countLabel", { count: favourites.size })}
    >
      <MarkIcon size={15} weight={2.1} />
      <span className="tabular-nums">{favourites.size}</span>
      {/* The ring the caught shaka pings off. Separate element so the badge itself can scale. */}
      <span className="mark-counter-ring" aria-hidden />
    </span>
  );
}
