"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useFavourites } from "@/components/FavouritesProvider";
import { MarkIcon } from "@/components/Icons";
import { useMarkFx } from "@/components/MarkFx";

/**
 * The shaka. Marking a spot as one of yours.
 *
 * Renders nothing at all when signed out. The alternative, a control that prompts you to sign in,
 * puts a dead button on 92 cards for the majority of visitors who have no account; the sign-in button
 * in the top bar is already the answer to "how do I get one".
 *
 * `stopPropagation` matters on the ranked list, where the whole card is a button that selects the
 * spot. Without it, marking would also navigate, which is the classic nested-interactive bug.
 */
export default function FavouriteButton({
  slug,
  size = 19,
  className = "",
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const t = useTranslations("favourites");
  const { user } = useAuth();
  const { isFavourite, toggle } = useFavourites();
  const { announce } = useMarkFx();
  const ref = useRef<HTMLButtonElement>(null);

  if (!user) return null;

  const on = isFavourite(slug);

  return (
    <button
      ref={ref}
      type="button"
      className={`mark ${on ? "is-on" : ""} ${className}`}
      aria-pressed={on}
      aria-label={on ? t("remove") : t("add")}
      title={on ? t("remove") : t("add")}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        // Read the state before toggling: `on` is what it was, so the message describes what changed.
        // The flight only happens on the way in, because there is nothing to catch on the way out.
        announce(on ? t("removed") : t("added"), on ? null : ref.current);
        void toggle(slug);
      }}
    >
      <MarkIcon size={size} weight={on ? 2.15 : 1.8} />
    </button>
  );
}
