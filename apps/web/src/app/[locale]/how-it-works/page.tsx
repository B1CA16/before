import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import ExplainerPage from "@/components/ExplainerPage";
import { EXPLAINER } from "@/content/explainer";
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
  const doc = EXPLAINER[locale];
  return {
    title: doc.title,
    description: doc.summary,
    alternates: {
      canonical:
        locale === routing.defaultLocale
          ? "/how-it-works"
          : `/${locale}/how-it-works`,
      languages: { pt: "/how-it-works", en: "/en/how-it-works" },
    },
  };
}

export default async function HowItWorks({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <ExplainerPage locale={locale} />;
}
