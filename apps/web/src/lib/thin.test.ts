import { describe, expect, it } from "vitest";

import type { ScoreNow, Spot } from "./api";
import { metresPerPixel, thinSpots } from "./thin";

function spot(slug: string, latitude: number, longitude: number): Spot {
  return {
    slug,
    name: slug,
    region: "Lisbon",
    latitude,
    longitude,
    orientation_deg: null,
    break_type: null,
  } as Spot;
}

function scores(map: Record<string, number | null>): Record<string, ScoreNow> {
  return Object.fromEntries(
    Object.entries(map).map(([slug, score]) => [slug, { slug, score } as ScoreNow])
  );
}

const LAT = 38.72;

describe("metresPerPixel", () => {
  it("halves with each zoom step", () => {
    const a = metresPerPixel(10, LAT);
    const b = metresPerPixel(11, LAT);
    expect(b).toBeCloseTo(a / 2, 6);
  });

  // The latitude term is the part that is easy to leave out and hard to notice.
  it("accounts for latitude, not just zoom", () => {
    expect(metresPerPixel(11, 0)).toBeGreaterThan(metresPerPixel(11, LAT));
    expect(metresPerPixel(11, LAT) / metresPerPixel(11, 0)).toBeCloseTo(
      Math.cos((LAT * Math.PI) / 180),
      6
    );
  });
});

describe("thinSpots", () => {
  it("returns nothing for no spots", () => {
    expect(thinSpots({ spots: [], scores: {}, zoom: 11 })).toEqual([]);
  });

  it("keeps spots that are far apart", () => {
    const spots = [spot("a", 38.6, -9.4), spot("b", 39.0, -9.3)];
    const out = thinSpots({ spots, scores: scores({ a: 5, b: 6 }), zoom: 12 });
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.hidden === 0)).toBe(true);
  });

  // The behaviour the whole function exists for.
  it("collapses spots that would overlap at low zoom", () => {
    // Roughly 100 m apart, which is well inside one pin at zoom 10.
    const spots = [spot("a", 38.72, -9.4), spot("b", 38.7209, -9.4), spot("c", 38.7218, -9.4)];
    const out = thinSpots({ spots, scores: scores({ a: 4, b: 8, c: 5 }), zoom: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].hidden).toBe(2);
  });

  it("separates those same spots again once zoomed in", () => {
    const spots = [spot("a", 38.72, -9.4), spot("b", 38.7209, -9.4), spot("c", 38.7218, -9.4)];
    const out = thinSpots({ spots, scores: scores({ a: 4, b: 8, c: 5 }), zoom: 16 });
    expect(out).toHaveLength(3);
  });

  // Keeping the best is what makes the thinned map still answer "where is it good".
  it("keeps the highest scoring spot in a cell", () => {
    const spots = [spot("a", 38.72, -9.4), spot("b", 38.7205, -9.4), spot("c", 38.721, -9.4)];
    const out = thinSpots({ spots, scores: scores({ a: 4, b: 9, c: 5 }), zoom: 10 });
    expect(out).toHaveLength(1);
    expect(out[0].spot.slug).toBe("b");
  });

  it("treats an unscored spot as worse than any score", () => {
    const spots = [spot("a", 38.72, -9.4), spot("b", 38.7205, -9.4)];
    const out = thinSpots({ spots, scores: scores({ a: null, b: 1 }), zoom: 10 });
    expect(out[0].spot.slug).toBe("b");
  });

  it("never hides a spot in `keep`, even a low scoring one", () => {
    const spots = [spot("a", 38.72, -9.4), spot("b", 38.7205, -9.4), spot("c", 38.721, -9.4)];
    const out = thinSpots({
      spots,
      scores: scores({ a: 1, b: 9, c: 5 }),
      zoom: 10,
      keep: new Set(["a"]),
    });
    const slugs = out.map((t) => t.spot.slug);
    expect(slugs).toContain("a");
    expect(slugs).toContain("b");
    expect(slugs).not.toContain("c");
  });

  it("counts every spot exactly once, kept or hidden", () => {
    const spots = Array.from({ length: 30 }, (_, i) =>
      spot(`s${i}`, 38.7 + i * 0.0006, -9.4 + i * 0.0004)
    );
    const table = scores(Object.fromEntries(spots.map((s, i) => [s.slug, i % 10])));
    for (const zoom of [9, 10, 11, 12, 13, 14]) {
      const out = thinSpots({ spots, scores: table, zoom });
      const total = out.length + out.reduce((sum, t) => sum + t.hidden, 0);
      expect(total, `zoom ${zoom} lost or duplicated spots`).toBe(spots.length);
    }
  });

  it("keeps more pins as you zoom in", () => {
    // Spaced about 78 m apart, which is the number that matters below.
    const spots = Array.from({ length: 40 }, (_, i) =>
      spot(`s${i}`, 38.7 + i * 0.0007, -9.4 + i * 0.0003)
    );
    const table = scores(Object.fromEntries(spots.map((s, i) => [s.slug, i % 7])));
    const counts = [9, 11, 13, 15, 18].map(
      (z) => thinSpots({ spots, scores: table, zoom: z }).length
    );
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    // Everything separates only once the cell is smaller than the spacing. At zoom 15 a 46 px cell is
    // still about 171 m, so 78 m neighbours correctly stay collapsed; it takes roughly zoom 17 for the
    // cell to drop under 78 m. This assertion originally used zoom 15 and failed, and the code was
    // right: the arithmetic, not the expectation, decides where the boundary is.
    expect(counts.at(-1)).toBe(spots.length);
  });

  it("does not mutate its input", () => {
    const spots = [spot("a", 38.72, -9.4), spot("b", 38.7205, -9.4)];
    const order = spots.map((s) => s.slug);
    thinSpots({ spots, scores: scores({ a: 1, b: 9 }), zoom: 10 });
    expect(spots.map((s) => s.slug)).toEqual(order);
  });
});
