import { describe, expect, it } from "vitest";

import type { ScoreNow, Spot } from "./api";
import { rankSpots } from "./rank";

function spot(slug: string): Spot {
  return {
    slug,
    name: slug,
    region: "Lisbon",
    latitude: 38.7,
    longitude: -9.4,
    orientation_deg: null,
    break_type: null,
  } as Spot;
}

function scores(map: Record<string, number | null>): Record<string, ScoreNow> {
  return Object.fromEntries(
    Object.entries(map).map(([slug, score]) => [slug, { slug, score } as ScoreNow])
  );
}

const none = () => false;

describe("rankSpots", () => {
  it("orders by score when nothing is favourited", () => {
    const out = rankSpots(
      [spot("a"), spot("b"), spot("c")],
      scores({ a: 4, b: 8, c: 6 }),
      none
    );
    expect(out.map((s) => s.slug)).toEqual(["b", "c", "a"]);
  });

  it("puts unscored spots last", () => {
    const out = rankSpots([spot("a"), spot("b")], scores({ a: null, b: 1 }), none);
    expect(out.map((s) => s.slug)).toEqual(["b", "a"]);
  });

  it("floats favourites above everything else", () => {
    const out = rankSpots(
      [spot("a"), spot("b"), spot("c")],
      scores({ a: 1, b: 9, c: 5 }),
      (slug) => slug === "a"
    );
    // "a" scores worst and still leads, because it was marked.
    expect(out.map((s) => s.slug)).toEqual(["a", "b", "c"]);
  });

  // The regression this file exists for: favourites first is only useful if they are still ordered
  // by score among themselves.
  it("keeps favourites ordered by score within the group", () => {
    const favs = new Set(["a", "b", "c"]);
    const out = rankSpots(
      [spot("a"), spot("b"), spot("c"), spot("d")],
      scores({ a: 2, b: 7, c: 5, d: 9 }),
      (slug) => favs.has(slug)
    );
    expect(out.map((s) => s.slug)).toEqual(["b", "c", "a", "d"]);
  });

  it("keeps non-favourites ordered by score below the group", () => {
    const out = rankSpots(
      [spot("a"), spot("b"), spot("c"), spot("d")],
      scores({ a: 3, b: 1, c: 8, d: 6 }),
      (slug) => slug === "b"
    );
    expect(out.map((s) => s.slug)).toEqual(["b", "c", "d", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [spot("a"), spot("b")];
    const order = input.map((s) => s.slug);
    rankSpots(input, scores({ a: 1, b: 9 }), none);
    expect(input.map((s) => s.slug)).toEqual(order);
  });

  it("is stable enough that an unfavourite restores the plain score order", () => {
    const spots = [spot("a"), spot("b"), spot("c")];
    const table = scores({ a: 4, b: 8, c: 6 });
    const withFav = rankSpots(spots, table, (slug) => slug === "a");
    const without = rankSpots(spots, table, none);
    expect(withFav.map((s) => s.slug)).toEqual(["a", "b", "c"]);
    expect(without.map((s) => s.slug)).toEqual(["b", "c", "a"]);
  });
});

describe("rankSpots, sorting by distance", () => {
  // Roughly north to south along the coast.
  const far = spot("far");
  const mid = spot("mid");
  const near = spot("near");
  far.latitude = 39.0;
  mid.latitude = 38.85;
  near.latitude = 38.72;
  const all = [far, mid, near];
  const table = scores({ far: 9, mid: 5, near: 1 });
  const me = { latitude: 38.72, longitude: -9.4 };

  it("puts the nearest first, even when it scores worst", () => {
    const out = rankSpots(all, table, none, "distance", me);
    expect(out.map((s) => s.slug)).toEqual(["near", "mid", "far"]);
  });

  it("still sorts by score when the mode is score", () => {
    const out = rankSpots(all, table, none, "score", me);
    expect(out.map((s) => s.slug)).toEqual(["far", "mid", "near"]);
  });

  // A refused permission must not scramble the list.
  it("falls back to score when there is no origin", () => {
    expect(rankSpots(all, table, none, "distance", null).map((s) => s.slug)).toEqual([
      "far",
      "mid",
      "near",
    ]);
    expect(rankSpots(all, table, none, "distance").map((s) => s.slug)).toEqual([
      "far",
      "mid",
      "near",
    ]);
  });

  it("keeps marked spots above everything, then sorts them by distance too", () => {
    const marked = new Set(["far", "mid"]);
    const out = rankSpots(all, table, (slug) => marked.has(slug), "distance", me);
    // far and mid are marked so they lead, and between them mid is closer.
    expect(out.map((s) => s.slug)).toEqual(["mid", "far", "near"]);
  });

  it("breaks a distance tie on score rather than leaving it to sort stability", () => {
    const a = spot("a");
    const b = spot("b");
    a.latitude = 38.8;
    b.latitude = 38.8;
    a.longitude = -9.4;
    b.longitude = -9.4;
    const out = rankSpots([a, b], scores({ a: 2, b: 7 }), none, "distance", me);
    expect(out.map((s) => s.slug)).toEqual(["b", "a"]);
  });
});
