import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guards on the basemap, written after it broke in production without anything noticing.
 *
 * CARTO began stamping "API KEY REQUIRED" across unkeyed tiles. The request kept returning HTTP 200
 * with a valid PNG of about the usual size, so no test, no build and no health check could see it.
 * It was found by looking at a screenshot.
 *
 * These are static checks, deliberately. A test that fetched a real tile and looked for a watermark
 * would need the network in CI, would be rate-limited by a provider that asks us not to do exactly
 * that, and could not read text baked into an image anyway. What it can do cheaply is stop the app
 * pointing at a provider that is known to require a key, and make sure attribution never quietly
 * disappears, which is the condition our right to use these tiles depends on.
 */

const MAPS = ["SpotMap.tsx", "SpotMiniMap.tsx"].map((name) => ({
  name,
  source: readFileSync(
    join(import.meta.dirname, "..", "components", name),
    "utf8",
  ),
}));

// Hosts that serve tiles without a key and then degrade them, or that require one outright.
const NEEDS_A_KEY = [
  "basemaps.cartocdn.com",
  "cartocdn.com",
  "api.mapbox.com",
  "tiles.stadiamaps.com",
  "maps.googleapis.com",
  "api.maptiler.com",
];

describe("basemap", () => {
  it.each(MAPS)(
    "$name uses no tile host that requires an API key",
    ({ source }) => {
      for (const host of NEEDS_A_KEY) {
        expect(source).not.toContain(host);
      }
    },
  );

  it.each(MAPS)("$name points at OpenStreetMap's own tiles", ({ source }) => {
    expect(source).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  it("credits OpenStreetMap on the map that shows an attribution control", () => {
    // The OSMF tile usage policy permits use like ours *with* attribution. Losing the credit is
    // not a cosmetic regression, it is the term we are relying on.
    const main = MAPS.find((m) => m.name === "SpotMap.tsx")!.source;
    expect(main).toContain("openstreetmap.org/copyright");
    expect(main).toContain("OpenStreetMap</a> contributors");
  });

  it("does not request zoom levels OpenStreetMap will not serve", () => {
    // OSM stops at 19. Without this the default would let Leaflet ask for 20 and get nothing back,
    // which shows up as blank squares only when someone zooms all the way in.
    for (const { source } of MAPS) {
      expect(source).toContain("maxZoom={19}");
    }
  });
});
