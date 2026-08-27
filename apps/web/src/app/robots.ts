import type { MetadataRoute } from "next";

import { absolute, SITE_ORIGIN } from "@/lib/site";

/**
 * robots.txt.
 *
 * Two things are disallowed, both for the same reason: they are not pages, and letting a crawler spend
 * its budget on them costs the pages that matter.
 *
 * `/api/` has nothing under it in this app today, but Next reserves the prefix and the proxy matcher
 * already excludes it, so blocking it keeps the two consistent.
 *
 * Query strings are deliberately **not** blocked. `?spot=` and `?q=` are how the map is deep-linked,
 * and they resolve to the same page as the bare path with a self-referencing canonical, so there is
 * nothing to protect against. Blocking them would also block the links shared out of the app.
 *
 * Preview deployments get a blanket disallow. A Vercel preview is a full copy of the site on a
 * different hostname, and letting it be indexed is how you end up competing with yourself.
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && !SITE_ORIGIN.includes("localhost"));

  if (!isProduction) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: absolute("/sitemap.xml"),
    host: SITE_ORIGIN,
  };
}
