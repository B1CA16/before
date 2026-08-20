import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Negotiates the locale: an explicit prefix wins, then the cookie next-intl sets when someone uses the
 * language switch, then `Accept-Language`, then Portuguese.
 *
 * This is load-bearing rather than incidental. With `localePrefix: "as-needed"` the Portuguese pages
 * live at `/pt/...` internally, so the middleware is the only thing that maps the bare `/spot/x` that
 * people have already shared onto them. Without it those links 404.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Listed explicitly, because a single catch-all string does not work here. Matcher strings are
   * parsed by path-to-regexp, where `.` does not cross the `/` delimiter, so
   * `/((?!api|_next|_vercel|.*\..*).*)` matches `/` and one segment and silently stops at
   * `/spot/praia-dos-coxos`. That failure is invisible until a nested URL 404s.
   *
   * `:path*` is what spans multiple segments. The last entry still excludes anything with a dot, so
   * files and Next's internals never wake the middleware.
   */
  matcher: [
    "/",
    "/(pt|en)/:path*",
    "/((?!api|_next|_vercel|.*\\..*).*)",
    "/:path((?!api|_next|_vercel)[^.]*)/:rest*",
  ],
};
