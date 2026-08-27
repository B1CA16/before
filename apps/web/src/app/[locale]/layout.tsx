import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { AuthProvider } from "@/components/AuthProvider";
import { FavouritesProvider } from "@/components/FavouritesProvider";
import { MarkFxProvider } from "@/components/MarkFx";
import { routing } from "@/i18n/routing";

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
    title: t("title"),
    description: t("description"),
    icons: { icon: "/before_logo_radar.svg" },
    // hreflang, so each language is offered to the right reader rather than competing with itself in
    // search results. Portuguese is unprefixed, being the default locale.
    alternates: {
      languages: { pt: "/", en: "/en" },
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

  return (
    <html lang={locale} className={`${jakarta.variable} h-full`}>
      <body className="h-full">
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
