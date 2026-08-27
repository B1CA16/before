"use client";

import { useCallback, useState } from "react";

export type GeoStatus = "idle" | "asking" | "granted" | "denied" | "unavailable";

export type GeoState = {
  status: GeoStatus;
  position: { latitude: number; longitude: number } | null;
  /** Ask the browser where we are. Safe to call repeatedly. */
  request: () => void;
};

/**
 * Where the visitor is, if they choose to tell us.
 *
 * Deliberately **not** requested on mount. A permission prompt that appears before you have done
 * anything is the single most disliked pattern on the mobile web, and it is also self-defeating: a
 * prompt with no context gets denied, and a denial is sticky per origin in most browsers, so asking
 * badly once costs the feature permanently. The prompt therefore only appears after an explicit tap
 * on "near me".
 *
 * Every failure is a real outcome rather than an error to swallow:
 *
 * - `denied` means say so and leave the score ordering in place. Most people say no.
 * - `unavailable` covers no API at all (an old browser, or a page not on HTTPS, where the API is
 *   simply absent) and a position the device could not fix. Both look the same to the user.
 *
 * The distinction matters because the copy differs: "you said no, here is how to change it" is
 * useful, "we could not find you" is not the same message.
 */
export function useGeolocation(): GeoState {
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [position, setPosition] = useState<GeoState["position"]>(null);

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setStatus("granted");
      },
      (error) => {
        // PERMISSION_DENIED is 1. Everything else (position unavailable, timeout) is a failure to
        // locate rather than a refusal, and reads differently to the person holding the phone.
        setStatus(error.code === 1 ? "denied" : "unavailable");
      },
      {
        // Coarse is plenty: the nearest spot on a 48 km coast does not change because you are 500 m
        // out, and asking for high accuracy costs battery and time for no gain here.
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  }, []);

  return { status, position, request };
}
