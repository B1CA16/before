/**
 * Where this site lives, as an absolute origin.
 *
 * This exists because several things in a page head are only valid when absolute, and Next cannot
 * guess the deployed origin at build time. Measured on the live build before adding it: `canonical`
 * and every `hreflang` were being emitted as `/spot/praia-dos-coxos`. A relative canonical is merely
 * discouraged, but **relative hreflang is ignored outright** by Google, which means the whole
 * Portuguese/English pairing was silently doing nothing. Open Graph images have the same requirement:
 * a crawler fetching a preview has no page context to resolve a relative path against.
 *
 * Resolution order, most specific first:
 *
 * 1. `NEXT_PUBLIC_SITE_URL`, for when the site gets a real domain.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL`, which Vercel injects and which stays stable across deploys,
 *    unlike `VERCEL_URL` (that one is per-deployment, so using it would make every preview build
 *    advertise itself as canonical and compete with production in search results).
 * 3. The current Vercel deployment URL, so preview builds at least produce working links.
 * 4. Localhost, for development.
 */
function resolveOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/\/+$/, "")}`;

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export const SITE_ORIGIN = resolveOrigin();

/** `metadataBase` wants a URL object, and building it once avoids parsing it per page. */
export const SITE_URL = new URL(SITE_ORIGIN);

/** Absolute URL for a site-relative path. */
export function absolute(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}
