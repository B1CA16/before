import type { Spot } from "@/lib/api";
import { absolute } from "@/lib/site";

/**
 * Structured data, built as plain objects so it can be asserted on in tests.
 *
 * The point of schema.org markup here is narrow and worth stating, because it is easy to cargo-cult:
 * it does not improve ranking. What it does is let a search engine understand that a page is about a
 * *place with coordinates*, which is what makes a result eligible for map and place treatments, and
 * `BreadcrumbList` is what turns the URL line in a result into a readable trail.
 *
 * Everything below is generated from data we actually hold. No invented ratings, no fake review
 * counts, no `aggregateRating` on a score we computed ourselves: that last one is a specific
 * temptation here and it would be misrepresenting a heuristic as user reviews, which is both
 * dishonest and against Google's structured data policies.
 */

/**
 * Typed shapes rather than `Record<string, unknown>`.
 *
 * The loose version compiled fine and pushed the cost onto every caller: the tests had to cast to
 * `any` to read a nested field, which is exactly where a typo in a schema.org key would slip through
 * unnoticed. Declaring the shape once means both the emitter and the assertions are checked.
 */
export type GeoCoordinatesLd = {
  "@type": "GeoCoordinates";
  latitude: number;
  longitude: number;
};

export type PlaceLd = {
  "@context": "https://schema.org";
  "@type": "Place";
  "@id": string;
  name: string;
  url: string;
  geo: GeoCoordinatesLd;
  address: {
    "@type": "PostalAddress";
    addressCountry: string;
    addressRegion: string;
  };
};

export type ListItemLd = {
  "@type": "ListItem";
  position: number;
  name: string;
  /** Absent on the final crumb, which is the page you are already on. */
  item?: string;
};

export type BreadcrumbLd = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: ListItemLd[];
};

export type WebSiteLd = {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  description: string;
  url: string;
  inLanguage: string;
};

/**
 * A surf spot as a `Place`.
 *
 * `Place` rather than `TouristAttraction` or `Beach`: the coordinates and the name are all we can
 * assert truthfully. `Beach` exists in schema.org but many of these breaks are reefs and points, so
 * calling all 92 a beach would be wrong for a good few of them.
 */
export function spotJsonLd(spot: Spot, locale: string): PlaceLd {
  const path = locale === "pt" ? `/spot/${spot.slug}` : `/${locale}/spot/${spot.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": absolute(path),
    name: spot.name,
    url: absolute(path),
    geo: {
      "@type": "GeoCoordinates",
      latitude: spot.latitude,
      longitude: spot.longitude,
    },
    address: {
      "@type": "PostalAddress",
      addressCountry: "PT",
      addressRegion: spot.region,
    },
  };
}

/**
 * The trail shown in a search result, matching the breadcrumb the page itself renders.
 *
 * It has to match. Structured data that describes navigation the page does not have is exactly what
 * the "markup must represent the visible page" rule is about, and the spot page grew a real
 * breadcrumb in M8 Task 2, which is what makes this honest rather than decorative.
 */
export function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
  locale: string
): BreadcrumbLd {
  const prefix = locale === "pt" ? "" : `/${locale}`;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: step.name,
      // The last item is the page itself. Omitting its `item` is what schema.org asks for, and it is
      // also what stops a result linking its own trail back to itself.
      ...(index < trail.length - 1
        ? { item: absolute(`${prefix}${step.path === "/" ? "" : step.path}` || "/") }
        : {}),
    })),
  };
}

/** The site itself, emitted once on the home page. */
export function siteJsonLd(name: string, description: string, locale: string): WebSiteLd {
  const path = locale === "pt" ? "/" : `/${locale}`;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    description,
    url: absolute(path),
    inLanguage: locale === "pt" ? "pt-PT" : "en-GB",
  };
}
