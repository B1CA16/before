import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import LegalPage from "@/components/LegalPage";
import { LEGAL } from "@/content/legal";
import { routing } from "@/i18n/routing";

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
  const doc = LEGAL.terms[locale];
  return {
    title: doc.title,
    description: doc.summary,
    alternates: {
      canonical: locale === routing.defaultLocale ? "/terms" : `/${locale}/terms`,
      languages: { pt: "/terms", en: "/en/terms" },
    },
  };
}

export default async function Terms({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <LegalPage doc="terms" locale={locale} />;
}
