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

// The interface is written in English, so dates are formatted in English too rather than
// following the browser locale, which produced Portuguese day names inside an English UI.
export const UI_LOCALE = "en-GB";

export function formatHour(iso: string): string {
  return new Date(iso).toLocaleString(UI_LOCALE, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
