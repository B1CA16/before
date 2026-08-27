import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "./i18n/routing";

/**
 * Renamed from middleware.ts: Next 16 deprecates that file convention in favour of proxy.ts, and the
 * build says so on every run. Same default export, same behaviour.
 *
 * Negotiates the locale: an explicit prefix wins, then the cookie next-intl sets when someone uses the
 * language switch, then `Accept-Language`, then Portuguese.
 *
 * This is load-bearing rather than incidental. With `localePrefix: "as-needed"` the Portuguese pages
 * live at `/pt/...` internally, so the middleware is the only thing that maps the bare `/spot/x` that
 * people have already shared onto them. Without it those links 404.
 */
const handleLocale = createMiddleware(routing);

/**
 * Open Graph image routes, which must be served rather than redirected.
 *
 * These live under `app/[locale]/`, so their real URL always carries a locale segment. For Portuguese
 * that is `/pt/...`, and `as-needed` would normally redirect the redundant prefix away, which measured
 * on production as a 307 on every Portuguese card while the English ones returned 200 directly.
 *
 * A redirect on an `og:image` is not merely untidy. Facebook and X follow one, but WhatsApp's crawler
 * is strict about it, and WhatsApp is how a link to a surf spot on this coast actually gets shared.
 *
 * Matching an optional `-<id>` suffix because Next appends one when a route has several image files.
 */
const OG_IMAGE = /\/opengraph-image(-[^/]*)?$/;

export default function proxy(request: NextRequest) {
  if (OG_IMAGE.test(request.nextUrl.pathname)) return NextResponse.next();
  return handleLocale(request);
}

export const config = {
  /**
   * Listed explicitly, because a single catch-all string does not work here. Matcher strings are
   * parsed by path-to-regexp, where `.` does not cross the `/` delimiter, so
   * `/((?!api|_next|_vercel|.*\..*).*)` matches `/` and one segment and silently stops at
   * `/spot/praia-dos-coxos`. That failure is invisible until a nested URL 404s.
   *
   * `:path*` is what spans multiple segments. The last entry still excludes anything with a dot, so
   * files and Next's internals never wake the middleware.
   *
   * The OG image exclusion is applied in the handler above rather than here, because expressing "any
   * depth, ending in this segment" in path-to-regexp is exactly the kind of pattern that already went
   * wrong once in this file.
   */
  matcher: [
    "/",
    "/(pt|en)/:path*",
    "/((?!api|_next|_vercel|.*\\..*).*)",
    "/:path((?!api|_next|_vercel)[^.]*)/:rest*",
  ],
};
