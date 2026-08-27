import { describe, expect, it } from "vitest";

import type { Spot } from "./api";
import { breadcrumbJsonLd, siteJsonLd, spotJsonLd } from "./jsonld";

const spot = {
  slug: "praia-dos-coxos",
  name: "Praia dos Coxos",
  region: "Lisbon",
  latitude: 38.9944558,
  longitude: -9.424889,
  orientation_deg: 334,
  break_type: "point",
} as Spot;

function isAbsolute(url: unknown): boolean {
  return typeof url === "string" && /^https?:\/\/[^/]+\//.test(url);
}

describe("spotJsonLd", () => {
  it("is a Place with real coordinates", () => {
    const ld = spotJsonLd(spot, "pt");
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Place");
    expect(ld.name).toBe("Praia dos Coxos");
    expect(ld.geo["@type"]).toBe("GeoCoordinates");
    expect(ld.geo.latitude).toBeCloseTo(38.9944558, 6);
    expect(ld.geo.longitude).toBeCloseTo(-9.424889, 6);
  });

  // A crawler has no page context, so every URL in structured data has to be absolute.
  it("uses absolute URLs", () => {
    const ld = spotJsonLd(spot, "pt");
    expect(isAbsolute(ld.url)).toBe(true);
    expect(isAbsolute(ld["@id"])).toBe(true);
  });

  it("points at the right locale path", () => {
    expect(String(spotJsonLd(spot, "pt").url)).toMatch(/\/spot\/praia-dos-coxos$/);
    expect(String(spotJsonLd(spot, "en").url)).toMatch(/\/en\/spot\/praia-dos-coxos$/);
  });

  // The specific dishonest thing this markup must never do.
  it("never claims a rating or review count", () => {
    const json = JSON.stringify(spotJsonLd(spot, "pt"));
    for (const forbidden of ["aggregateRating", "ratingValue", "reviewCount", "Review"]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe("breadcrumbJsonLd", () => {
  const trail = [
    { name: "Mapa", path: "/" },
    { name: "Costa de Lisboa", path: "/?q=Lisbon" },
    { name: "Praia dos Coxos", path: "/spot/praia-dos-coxos" },
  ];

  it("numbers positions from 1, in order", () => {
    const ld = breadcrumbJsonLd(trail, "pt");
    expect(ld["@type"]).toBe("BreadcrumbList");
    expect(ld.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(ld.itemListElement.map((i) => i.name)).toEqual([
      "Mapa",
      "Costa de Lisboa",
      "Praia dos Coxos",
    ]);
  });

  // schema.org asks for the final crumb to carry no item: it is the page you are already on.
  it("omits the item on the last crumb only", () => {
    const items = breadcrumbJsonLd(trail, "pt").itemListElement;
    expect(items[0].item).toBeDefined();
    expect(items[1].item).toBeDefined();
    expect(items[2].item).toBeUndefined();
  });

  it("makes every present item absolute", () => {
    for (const locale of ["pt", "en"]) {
      const items = breadcrumbJsonLd(trail, locale).itemListElement;
      for (const item of items) {
        if (item.item !== undefined) expect(isAbsolute(item.item)).toBe(true);
      }
    }
  });

  it("prefixes non-default locales", () => {
    const items = breadcrumbJsonLd(trail, "en").itemListElement;
    expect(String(items[0].item)).toMatch(/\/en$|\/en\/$/);
  });

  it("handles a single-crumb trail without emitting an item", () => {
    const items = breadcrumbJsonLd([{ name: "Mapa", path: "/" }], "pt").itemListElement;
    expect(items).toHaveLength(1);
    expect(items[0].item).toBeUndefined();
  });
});

describe("siteJsonLd", () => {
  it("declares the language it is describing", () => {
    expect(siteJsonLd("BeFORE", "d", "pt").inLanguage).toBe("pt-PT");
    expect(siteJsonLd("BeFORE", "d", "en").inLanguage).toBe("en-GB");
  });

  it("is serialisable, since it goes into a script tag", () => {
    expect(() => JSON.stringify(siteJsonLd("BeFORE", "d", "pt"))).not.toThrow();
  });
});
