"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { addFavourite, getFavourites, removeFavourite } from "@/lib/api";

type FavouritesState = {
  /** Slugs the signed-in person has favourited. Empty when signed out. */
  favourites: Set<string>;
  /** Whether the answer is settled, so a mark can avoid flashing the wrong state. */
  ready: boolean;
  isFavourite: (slug: string) => boolean;
  toggle: (slug: string) => Promise<void>;
};

/** Module-level so the identity is stable: a fresh `new Set()` each render would retrigger memos. */
const EMPTY: Set<string> = new Set();

const Ctx = createContext<FavouritesState>({
  favourites: EMPTY,
  ready: false,
  isFavourite: () => false,
  toggle: async () => {},
});

/**
 * Favourites, held once for the whole app.
 *
 * They live in their own request rather than on `/spots`, and that is a caching decision: `/spots`
 * and `/scores` are fetched with a shared `revalidate` cache, so anything per-user in them would be
 * cached under one visitor and served to the next. Keeping the public data impersonal is what lets it
 * stay cached and prerendered, and this provider layers the personal part on top in the browser.
 *
 * A context rather than a hook per component because four separate places need the same answer (the
 * ranked list, the map markers, the map's detail panel, and the spot page), and four independent
 * fetches would both waste requests and let the marks disagree with each other.
 *
 * Note what is stored versus derived. The fetched set is tagged with the user id it belongs to, and
 * the exposed set is empty unless that tag matches the current user. That is not tidiness: holding a
 * single unconditional set meant that signing out of one account and into another showed the first
 * account's marks until the new fetch landed.
 */
export function FavouritesProvider({ children }: { children: React.ReactNode }) {
  const { user, getToken } = useAuth();
  const [fetched, setFetched] = useState<Set<string>>(EMPTY);
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  const userId = user?.id ?? null;

  useEffect(() => {
    // Signed out is not an error and needs no request. The derived values below already report an
    // empty set, so there is nothing to set here either.
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        if (!token || !active) return;
        const slugs = await getFavourites(token);
        if (!active) return;
        setFetched(new Set(slugs));
        setFetchedFor(userId);
      } catch {
        // Mark the attempt as finished so the UI stops waiting. Favourites are a convenience and the
        // surf report behind them still works without them.
        if (active) setFetchedFor(userId);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, getToken]);

  // Derived, not stored: belongs to this user, or it does not count.
  const favourites = userId !== null && fetchedFor === userId ? fetched : EMPTY;
  const ready = userId === null || fetchedFor === userId;

  const toggle = useCallback(
    async (slug: string) => {
      if (!userId) return;
      const token = await getToken();
      if (!token) return;

      const wasFavourite = favourites.has(slug);
      // Optimistic: the mark fills on tap, not a round trip later. A favourite is a low-stakes,
      // instantly reversible action, which is exactly where optimism is worth the complexity.
      setFetched((prev) => {
        const next = new Set(prev);
        if (wasFavourite) next.delete(slug);
        else next.add(slug);
        return next;
      });

      try {
        await (wasFavourite ? removeFavourite(token, slug) : addFavourite(token, slug));
      } catch {
        // Put it back. A filled mark the server never recorded is worse than a tap that appears not
        // to work, because the next reload would silently disagree with what you saw.
        setFetched((prev) => {
          const next = new Set(prev);
          if (wasFavourite) next.add(slug);
          else next.delete(slug);
          return next;
        });
      }
    },
    [favourites, getToken, userId]
  );

  const value = useMemo<FavouritesState>(
    () => ({
      favourites,
      ready,
      isFavourite: (slug: string) => favourites.has(slug),
      toggle,
    }),
    [favourites, ready, toggle]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavourites(): FavouritesState {
  return useContext(Ctx);
}
