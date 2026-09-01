import { describe, expect, it } from "vitest";

import type { ForecastHour } from "./api";
import { bestHour, upcomingHours } from "./forecast";

function hour(observed_at: string, score: number | null): ForecastHour {
  return {
    observed_at,
    score,
    size: null,
    period: null,
    wind: null,
    exposure: null,
    sea_level_m: null,
    tide_state: null,
    tide_rising: null,
    swell_height_m: null,
    swell_period_s: null,
    wind_speed_kmh: null,
    wind_correction_kmh: null,
  };
}

describe("forecast helpers", () => {
  it("keeps only upcoming hours", () => {
    const hours = [
      hour("2026-07-29T06:00:00Z", 5),
      hour("2026-07-29T12:00:00Z", 6),
      hour("2026-07-29T18:00:00Z", 7),
    ];
    const kept = upcomingHours(hours, new Date("2026-07-29T12:00:00Z"));
    expect(kept.map((h) => h.observed_at)).toEqual([
      "2026-07-29T12:00:00Z",
      "2026-07-29T18:00:00Z",
    ]);
  });

  it("finds the best-scoring hour and ignores nulls", () => {
    const hours = [hour("a", 3), hour("b", null), hour("c", 8.4), hour("d", 5)];
    expect(bestHour(hours)?.observed_at).toBe("c");
  });

  it("returns null when no hour has a score", () => {
    expect(bestHour([hour("a", null)])).toBeNull();
    expect(bestHour([])).toBeNull();
  });
});
