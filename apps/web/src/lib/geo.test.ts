import { describe, expect, it } from "vitest";

import { distanceKm, formatKm } from "./geo";

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(38.68, -9.33, 38.68, -9.33)).toBe(0);
  });

  it("matches a known distance on this coast", () => {
    // Carcavelos to Guincho is about 15 km along the Cascais coast.
    const km = distanceKm(38.6796, -9.3372, 38.7332, -9.4739);
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(18);
  });

  it("is symmetric", () => {
    const a = distanceKm(38.6, -9.3, 39.0, -9.4);
    const b = distanceKm(39.0, -9.4, 38.6, -9.3);
    expect(a).toBeCloseTo(b, 10);
  });

  it("handles a degree of latitude as roughly 111 km", () => {
    expect(distanceKm(38, -9, 39, -9)).toBeCloseTo(111.2, 0);
  });
});

describe("formatKm", () => {
  it("keeps a decimal while it still means something", () => {
    expect(formatKm(2.44)).toBe("2.4 km");
    expect(formatKm(9.96)).toBe("10.0 km");
  });

  it("drops it once the number is large enough not to need it", () => {
    expect(formatKm(23.6)).toBe("24 km");
  });
});
