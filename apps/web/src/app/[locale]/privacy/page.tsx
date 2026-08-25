import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/content/legal";
import { routing } from "@/i18n/routing";

/**
 * Static in both languages. The text changes when someone edits the content module and redeploys,
 * which is exactly when it should change, so there is nothing here to revalidate on a timer.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const doc = LEGAL.privacy[locale];
  return {
    title: doc.title,
    description: doc.summary,
    alternates: {
      canonical: locale === routing.defaultLocale ? "/privacy" : `/${locale}/privacy`,
      languages: { pt: "/privacy", en: "/en/privacy" },
    },
  };
}

export default async function Privacy({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <LegalPage doc="privacy" locale={locale} />;
}
