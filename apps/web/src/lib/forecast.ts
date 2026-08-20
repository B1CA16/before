import type { ForecastHour } from "./api";

// The API returns every forecast-source row, including hours already past
// (old forecasts are not pruned yet), so the UI trims to what is still ahead.
export function upcomingHours(hours: ForecastHour[], now: Date): ForecastHour[] {
  const cutoff = now.getTime();
  return hours.filter((h) => new Date(h.observed_at).getTime() >= cutoff);
}

export function bestHour(hours: ForecastHour[]): ForecastHour | null {
  let best: ForecastHour | null = null;
  for (const h of hours) {
    if (h.score === null) continue;
    if (best === null || h.score > (best.score ?? -1)) best = h;
  }
  return best;
}

/**
 * The BCP 47 tag to format dates with, for a given app locale.
 *
 * `UI_LOCALE` used to be pinned to `en-GB`, because following the *browser* locale produced Portuguese
 * day names inside an English interface. That was the right fix for an English-only app and the wrong
 * one now: the mismatch it prevented is exactly what a real locale switch fixes properly. Dates now
 * follow the chosen language rather than the browser's guess or a hard-coded constant.
 */
export function localeTag(locale: string): string {
  return locale === "pt" ? "pt-PT" : "en-GB";
}

export function formatHour(iso: string, locale = "en"): string {
  return new Date(iso).toLocaleString(localeTag(locale), {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* --- tide ---------------------------------------------------------------------------------------- */

export type TideTurn = { at: string; kind: "high" | "low"; height: number | null };

/**
 * The next high or low water in a forecast series, or null if none is in range.
 *
 * Found from the flip in `tide_rising` rather than by hunting for extreme heights, because that flag
 * already encodes exactly this: it is true when the following hour is higher. Where it goes from true
 * to false, the hour in between is the peak.
 */
export function nextTideTurn(hours: ForecastHour[]): TideTurn | null {
  for (let i = 0; i < hours.length - 1; i++) {
    const rising = hours[i].tide_rising;
    const next = hours[i + 1].tide_rising;
    // Nulls are unknowns, not falses: the last hour of a series has no successor to compare with.
    if (rising === null || next === null || rising === next) continue;
    const turn = hours[i + 1];
    return { at: turn.observed_at, kind: rising ? "high" : "low", height: turn.sea_level_m };
  }
  return null;
}

/** How to say a tide height out loud. Signed, because below mean sea level is meaningful. */
export function tideLabel(metres: number | null): string {
  if (metres === null) return "-";
  return `${metres > 0 ? "+" : ""}${metres.toFixed(1)} m`;
}
