import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/**
 * The site footer, and the place the legal pages are reachable from everywhere.
 *
 * `useTranslations` rather than `getTranslations` on purpose: the hook form works in both server and
 * client components, and this has to render inside the map page (a client component) as well as the
 * spot and legal pages (server components). The alternative was two near-identical footers, which is
 * how the privacy link ends up present in one place and stale in the other.
 *
 * The data-source credits are not decoration. Open-Meteo and OpenStreetMap are used under licences
 * that ask for attribution, and saying where the numbers come from also supports the honesty the rest
 * of the product claims: a visitor can go and check the source.
 *
 * `bare` drops the panel chrome, for the map sidebar where it sits at the end of a scrolling list
 * rather than at the bottom of a document.
 */
export default function Footer({ bare = false }: { bare?: boolean }) {
  const t = useTranslations("footer");

  const links = (
    <nav
      aria-label={t("legal")}
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5"
    >
      {/* First, because it is the one link here a curious visitor actually wants. The legal pages
          are an obligation; this one is the argument for the product. */}
      <Link href="/how-it-works" className="footer-link">
        {t("howItWorks")}
      </Link>
      <Link href="/privacy" className="footer-link">
        {t("privacy")}
      </Link>
      <Link href="/terms" className="footer-link">
        {t("terms")}
      </Link>
    </nav>
  );

  if (bare) {
    return (
      <div className="mt-3 border-t border-hairline px-1 pt-3">
        {links}
        <p className="faint mt-1.5">{t("credits")}</p>
      </div>
    );
  }

  return (
    <footer className="mt-6 border-t border-hairline bg-panel px-4 py-5">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {links}
        <p className="faint">{t("credits")}</p>
      </div>
    </footer>
  );
}
