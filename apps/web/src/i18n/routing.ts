import { defineRouting } from "next-intl/routing";

/**
 * Two locales, Portuguese first.
 *
 * The product covers the Portuguese coast and the people whose ratings it needs are Portuguese, so
 * Portuguese is the default rather than the translation. English exists because the project is also a
 * portfolio piece read by people who do not speak Portuguese.
 *
 * `localePrefix: "as-needed"` means Portuguese keeps the bare paths (`/`, `/spot/praia-dos-coxos`) and
 * English is prefixed (`/en/spot/praia-dos-coxos`). That is chosen for one concrete reason: links to
 * spot pages have already been shared, and switching to always-prefixed would turn every one of them
 * into a redirect. It also keeps the shortest URL pointing at the primary audience.
 */
export const routing = defineRouting({
  locales: ["pt", "en"],
  defaultLocale: "pt",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
