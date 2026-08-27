import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AuthProvider } from "@/components/AuthProvider";
import { FavouritesProvider } from "@/components/FavouritesProvider";
import { MarkFxProvider } from "@/components/MarkFx";
import { routing } from "@/i18n/routing";
import { siteJsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/site";

import "../globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    // Everything relative in a page head is resolved against this. Without it, `canonical` and every
    // `hreflang` were emitted relative, and relative hreflang is ignored by Google, so the whole
    // pt/en pairing was doing nothing. Verified against the built HTML, not assumed.
    metadataBase: SITE_URL,
    title: t("title"),
    description: t("description"),
    icons: { icon: "/before_logo_radar.svg" },
    // hreflang, so each language is offered to the right reader rather than competing with itself in
    // search results. Portuguese is unprefixed, being the default locale.
    alternates: {
      canonical: locale === routing.defaultLocale ? "/" : `/${locale}`,
      languages: { pt: "/", en: "/en" },
    },
    openGraph: {
      type: "website",
      siteName: "BeFORE",
      title: t("title"),
      description: t("description"),
      url: locale === routing.defaultLocale ? "/" : `/${locale}`,
      locale: locale === "pt" ? "pt_PT" : "en_GB",
    },
    twitter: {
      // summary_large_image, because the generated card is 1200x630 and a small square crop of a
      // coastline reads as nothing.
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // An unknown locale must 404 rather than render an untranslated page: silently falling back would
  // let /fr/spot/x serve Portuguese under a French URL, which is worse than not existing.
  if (!hasLocale(routing.locales, locale)) notFound();
  // Required for static rendering: without it every page using translations becomes dynamic.
  setRequestLocale(locale);

  const meta = await getTranslations({ locale, namespace: "meta" });

  return (
    <html lang={locale} className={`${jakarta.variable} h-full`}>
      <body className="h-full">
        {/* WebSite structured data, in the layout rather than the home page for a concrete reason: the
            home page is a client component, so anything it renders arrives after hydration and a
            crawler reading the initial HTML would never see it. The layout is a server component, so
            this is in the document as served. The cost is that it appears on every page rather than
            only the home page, which is permitted and harmless. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(siteJsonLd(meta("title"), meta("description"), locale)),
          }}
        />
        <NextIntlClientProvider>
          {/* Inside AuthProvider, because favourites only exist for a signed-in person and the
              provider re-fetches when that identity changes. */}
          <AuthProvider>
            <FavouritesProvider>
              <MarkFxProvider>{children}</MarkFxProvider>
            </FavouritesProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
