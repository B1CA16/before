import { describe, expect, it } from "vitest";

import type { ForecastHour } from "./api";
import { nextTideTurn, tideLabel } from "./forecast";

/**
 * A semidiurnal curve: low at hour 0, high at 6, low at 12, then flooding again.
 *
 * It deliberately runs past the second low. A curve that merely ends at low water contains no
 * detectable turn there, because a turn is a *flip* in direction and the flip needs the hour after.
 * The first version of this fixture stopped at hour 12 and the low-water test failed for that reason,
 * which was the fixture being wrong rather than the code.
 */
function curve(): ForecastHour[] {
  const heights = [
    -1.2, -1.09, -0.8, -0.41, -0.03, 0.27, 0.4, 0.33, 0.09, -0.28, -0.66, -0.96,
    -1.09, -1.02, -0.78, -0.4, 0.0, 0.3,
  ];
  return heights.map((h, i) => ({
    observed_at: `2026-08-20T${String(i).padStart(2, "0")}:00:00Z`,
    score: 5,
    sea_level_m: h,
    tide_state: null,
    // rising is "the next hour is higher", so the last entry has no successor.
    tide_rising: i === heights.length - 1 ? null : heights[i + 1] > h,
    size: null,
    period: null,
    wind: null,
    exposure: null,
    swell_height_m: null,
    swell_period_s: null,
    wind_speed_kmh: null,
    wind_correction_kmh: null,
  }));
}

describe("nextTideTurn", () => {
  it("finds high water at the hour the tide stops rising", () => {
    const turn = nextTideTurn(curve());
    expect(turn?.kind).toBe("high");
    expect(turn?.at).toContain("T06:00");
    expect(turn?.height).toBe(0.4);
  });

  it("finds low water when the series starts on the ebb", () => {
    // Start just after high water, so the next turn is the following low.
    const turn = nextTideTurn(curve().slice(7));
    expect(turn?.kind).toBe("low");
    expect(turn?.at).toContain("T12:00");
  });

  it("returns null rather than guessing when direction is unknown", () => {
    const unknown = curve().map((h) => ({ ...h, tide_rising: null }));
    expect(nextTideTurn(unknown)).toBeNull();
  });

  it("returns null on a series with no turn in it", () => {
    expect(nextTideTurn(curve().slice(0, 4))).toBeNull();
  });

  it("does not treat a null as falling", () => {
    // A null followed by false must not read as a high-water turn.
    const hours = curve()
      .slice(0, 3)
      .map((h, i) => ({ ...h, tide_rising: i === 0 ? null : false }));
    expect(nextTideTurn(hours)).toBeNull();
  });
});

describe("tideLabel", () => {
  it("signs the height, because below mean sea level is meaningful", () => {
    expect(tideLabel(0.4)).toBe("+0.4 m");
    expect(tideLabel(-1.2)).toBe("-1.2 m");
    expect(tideLabel(null)).toBe("-");
  });
});
