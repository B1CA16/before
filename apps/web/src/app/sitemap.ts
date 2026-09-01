import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { getSpotsCached } from "@/lib/api";
import { absolute } from "@/lib/site";

/**
 * The sitemap: every page, in both languages.
 *
 * Each entry carries its `alternates.languages` pair rather than listing pt and en as two unrelated
 * URLs. That is the part that does the work: it tells a crawler these are the same page in two
 * languages, which is the same claim the `hreflang` tags make, and making it in both places is what
 * Google's own guidance asks for.
 *
 * Only the Portuguese URL is listed as the entry, with English as its alternate, because the pair is
 * one page. Listing both as top-level entries would double the sitemap and say nothing extra.
 *
 * `changeFrequency` and `priority` are included but worth being honest about: Google has said for
 * years that it ignores both. They are cheap, other crawlers still read them, and `lastModified` is
 * the field that actually matters.
 */
export const revalidate = 3600;

function localised(path: string) {
  const pt = absolute(path);
  const en = absolute(`/en${path === "/" ? "" : path}`);
  return {
    url: pt,
    alternates: { languages: { pt, en } },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      ...localised("/"),
      lastModified: now,
      changeFrequency: "hourly",
      priority: 1,
    },
    // Ranked above the legal pages and below the spots. It is the page that explains the product,
    // it changes when a milestone lands rather than never, and it is the one a curious reader is
    // plausibly searching for.
    {
      ...localised("/how-it-works"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      ...localised("/privacy"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      ...localised("/terms"),
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  let spotPages: MetadataRoute.Sitemap = [];
  try {
    const spots = await getSpotsCached();
    spotPages = spots.map((spot) => ({
      ...localised(`/spot/${spot.slug}`),
      lastModified: now,
      // The scores behind these pages change every hour, which is the whole point of the product.
      changeFrequency: "hourly" as const,
      priority: 0.8,
    }));
  } catch {
    // A dead API must not produce an empty sitemap, which would tell crawlers the spot pages have
    // been removed. Serving only the static pages is a smaller lie than serving a deliberate blank.
  }

  return [...staticPages, ...spotPages];
}

/** Exported for the test, so the locale pairing can be checked without running a build. */
export { localised };
export const LOCALES = routing.locales;
