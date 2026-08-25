import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import AuthMenu from "@/components/AuthMenu";
import Chip from "@/components/Chip";
import Footer from "@/components/Footer";
import { PeriodIcon, PinIcon, SwellIcon, WindIcon } from "@/components/Icons";
import LanguageSwitch from "@/components/LanguageSwitch";
import LogSessionButton from "@/components/LogSessionButton";
import MiniMapCard from "@/components/MiniMapCard";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import ScoreTimeline from "@/components/ScoreTimeline";
import ShareLink from "@/components/ShareLink";
import SpotSearch from "@/components/SpotSearch";
import SwellCompass from "@/components/SwellCompass";
import TidePanel from "@/components/TidePanel";
import Wordmark from "@/components/Wordmark";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  getForecastCached,
  getScoresCached,
  getSpotsCached,
  getSpotWithScore,
} from "@/lib/api";
import { bestHour, formatHour, upcomingHours } from "@/lib/forecast";
import { distanceKm, formatKm } from "@/lib/geo";
import { scoreColor, scoreLabel, scoreWordKey, windWordKey } from "@/lib/score";

/**
 * A spot page, rendered on the server.
 *
 * It exists because the map page is one large client component, so the HTML it served was the shell and
 * nothing else: 37,872 bytes, 29 visible words, and not one of the 92 spot names. Nothing could be
 * linked to and nothing could be indexed. SEO here was never a metadata problem, it was a rendering
 * problem, and metadata on an empty page would have been lipstick.
 *
 * The layout deliberately reuses the map's own panels (compass, breakdown, tide, pin) rather than
 * restating the data in plainer markup. The first version was a single narrow column of text lines,
 * which read as a document that happened to share a stylesheet. Arriving here from a shared link should
 * feel like arriving somewhere inside the app.
 *
 * What stays server-rendered: the heading, the sentence, every number, and the hours ahead as real
 * text. Only the map is client-only, behind MiniMapCard, because `ssr: false` is not allowed with
 * `next/dynamic` inside a Server Component and Leaflet touches `window` at import time. The chart is a
 * client component imported normally, so it hydrates without a second boundary. Neither carries
 * information the text lacks: a chart is invisible to a crawler, so anything that mattered would have
 * been lost inside it.
 */

// Matched to the data rather than picked round: conditions are ingested daily, but the "current" hour
// advances every hour, so hourly is the coarsest revalidation that stays truthful.
export const revalidate = 3600;

export async function generateStaticParams() {
  const spots = await getSpotsCached();
  return routing.locales.flatMap((locale) => spots.map((s) => ({ locale, slug: s.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const words = await getTranslations({ locale, namespace: "score" });
  const data = await getSpotWithScore(slug);
  if (!data) return { title: t("notFound") };

  const { spot, now } = data;
  const score = now?.score ?? null;
  // Built from real data, because a description that reads identically on 92 pages is not a
  // description.
  const description =
    score === null
      ? t("spotDescriptionNoScore", { name: spot.name, region: spot.region })
      : t("spotDescription", {
          name: spot.name,
          word: words(scoreWordKey(score)),
          score: scoreLabel(score),
        });

  const path = `/spot/${spot.slug}`;
  return {
    title: t("spotTitle", { name: spot.name }),
    description,
    alternates: {
      canonical: locale === routing.defaultLocale ? path : `/${locale}${path}`,
      languages: { pt: path, en: `/en${path}` },
    },
    openGraph: { title: t("spotTitle", { name: spot.name }), description, type: "article" },
  };
}

function Stat({
  icon,
  label,
  value,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`stat ${className}`}>
      <div className="label flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="value mt-1 text-primary">{value}</div>
    </div>
  );
}

export default async function SpotPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const data = await getSpotWithScore(slug);
  if (!data) notFound();

  const [t, nav, words, winds, regions] = await Promise.all([
    getTranslations({ locale, namespace: "spot" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "score" }),
    getTranslations({ locale, namespace: "wind" }),
    getTranslations({ locale, namespace: "regions" }),
  ]);

  // Both cached, and both already fetched for other pages in this build, so this is not extra work
  // at request time. The list powers the search field and the nearby section; the scores let both show
  // a number rather than a bare name.
  const [allSpots, allScores, forecast] = await Promise.all([
    getSpotsCached(),
    getScoresCached(),
    getForecastCached(slug),
  ]);
  const scoreBySlug: Record<string, number | null> = Object.fromEntries(
    allScores.map((row) => [row.slug, row.score])
  );

  const { spot, now } = data;
  const score = now?.score ?? null;
  const hours = upcomingHours(forecast, new Date());
  const peak = bestHour(hours);
  // Regions are our own coarse labels rather than user data, so they translate. Spot names do not:
  // "Praia dos Coxos" is a proper noun in either language.
  const region = regions.has(spot.region) ? regions(spot.region) : spot.region;

  // Four closest, which also gives the site real internal links between spot pages: before this, every
  // report was a leaf with nothing pointing out of it.
  const nearby = allSpots
    .filter((s) => s.slug !== spot.slug)
    .map((s) => ({
      spot: s,
      km: distanceKm(spot.latitude, spot.longitude, s.latitude, s.longitude),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 4);

  return (
    <div className="min-h-full bg-app">
      {/* Same height, same surface, same shadow as the map's top bar, so this reads as the same app. */}
      <header className="sticky top-0 z-[1000] flex h-16 items-center gap-2 border-b border-hairline bg-panel px-3 shadow-[var(--shadow-1)] sm:gap-3 sm:px-4">
        <Link href="/" aria-label={nav("home")} className="hidden flex-none sm:block">
          <Wordmark className="h-8 w-auto" />
        </Link>
        {/* Search here too, so a report is not a dead end. */}
        <div className="relative ml-1 min-w-0 flex-1 sm:ml-2 sm:flex-none">
          <SpotSearch spots={allSpots} scores={scoreBySlug} />
        </div>
        <div className="ml-auto flex flex-none items-center gap-2">
          <LanguageSwitch />
          <AuthMenu />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {/* The way out lives here rather than in the top bar. A bare arrow in the corner competed with
            the wordmark and said "back" only by convention; a breadcrumb says where you are and where
            each step goes, in words, aligned to the same grid as the content. It also links to the map
            twice over, once filtered to this region, which is real anchor text between pages. */}
        <nav aria-label={t("crumbNav")} className="mb-2.5 flex items-center gap-1.5 pl-0.5">
          <Link href={`/?spot=${spot.slug}`} className="crumb">
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="none"
                 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 8H3.5" />
              <path d="M7 3.8 3 8l4 4.2" />
            </svg>
            {t("crumbMap")}
          </Link>
          <span className="crumb-sep" aria-hidden>
            /
          </span>
          {/* Filters the map to this region, which is why the home page reads `q` from the URL. */}
          <Link href={`/?q=${encodeURIComponent(spot.region)}`} className="crumb hidden sm:inline-flex">
            {t("coast", { region })}
          </Link>
          <span className="crumb-sep hidden sm:inline" aria-hidden>
            /
          </span>
          {/* The page you are on: named, not linked, because a link to here would go nowhere. */}
          <span className="crumb-here truncate" aria-current="page">
            {spot.name}
          </span>
        </nav>

        {/* Hero: who and where on the left, the map as the page's one image on the right. */}
        <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
          <div className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="title text-primary">{spot.name}</h1>
                <p className="faint mt-0.5 flex items-center gap-1.5">
                  <PinIcon size={13} />
                  {t("coast", { region })}
                </p>
                <div className="mt-2.5">
                  <Chip color={scoreColor(score)}>{words(scoreWordKey(score))}</Chip>
                </div>
              </div>
              <div className="display-score flex-none" style={{ color: scoreColor(score) }}>
                {scoreLabel(score)}
              </div>
            </div>

            <p className="meta mt-3.5 text-secondary">
              {score === null
                ? t("noReadingFor", { name: spot.name })
                : t("isRightNow", {
                    name: spot.name,
                    word: words(scoreWordKey(score)),
                    score: scoreLabel(score),
                  })}
            </p>

            {hours[0] && (
              <p className="faint mt-1">
                {t("readingFor", { hour: formatHour(hours[0].observed_at, locale) })}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat
                icon={<SwellIcon size={13} />}
                label={t("swell")}
                value={now?.swell_height_m == null ? "-" : `${now.swell_height_m.toFixed(1)} m`}
              />
              <Stat
                icon={<PeriodIcon size={13} />}
                label={t("period")}
                value={now?.swell_period_s == null ? "-" : `${now.swell_period_s.toFixed(1)} s`}
              />
              <Stat
                icon={<WindIcon size={13} />}
                label={t("wind")}
                value={winds(windWordKey(now?.offshore_component ?? null))}
                className="col-span-2 sm:col-span-1"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <LogSessionButton spots={allSpots} slug={spot.slug} />
              <ShareLink title={t("shareTitle", { name: spot.name })} />
            </div>
          </div>

          <div className="panel overflow-hidden p-1">
            <div className="h-48 overflow-hidden rounded-[calc(var(--radius-panel)-6px)] lg:h-full lg:min-h-56">
              <MiniMapCard
                latitude={spot.latitude}
                longitude={spot.longitude}
                score={score}
                name={spot.name}
              />
            </div>
          </div>
        </div>

        {hours.length > 0 && (
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            <div className="grid gap-3">
              <section className="panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="section-title">{t("nextDays")}</h2>
                  {peak && (
                    <span className="text-meta text-faint">
                      {t("peaks")}{" "}
                      <span className="font-semibold text-accent-ink">
                        {formatHour(peak.observed_at, locale)}
                      </span>{" "}
                      {t("at")}{" "}
                      <span className="font-semibold tabular-nums text-primary">
                        {scoreLabel(peak.score)}
                      </span>
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <ScoreTimeline hours={hours} />
                </div>
              </section>

              {/* Text, not only the chart above: a canvas says nothing to a crawler, and this is also
                  the fastest way to read the next few hours on a phone. */}
              <section className="panel p-5">
                <h2 className="section-title">{t("hoursAhead")}</h2>
                <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {hours.slice(0, 12).map((hour) => {
                    // The header names a peak; without marking it, finding that hour meant scanning
                    // twelve rows of numbers for the largest.
                    const isPeak = peak?.observed_at === hour.observed_at;
                    return (
                    <li
                      key={hour.observed_at}
                      className={`flex items-baseline justify-between gap-3 border-b border-hairline py-1 last:border-0 ${
                        isPeak ? "-mx-2 rounded-chip border-transparent bg-inset px-2" : ""
                      }`}
                    >
                      <span className="meta text-secondary">
                        {formatHour(hour.observed_at, locale)}
                      </span>
                      <span className="faint">
                        {hour.swell_height_m?.toFixed(1) ?? "-"} m {t("at")}{" "}
                        {hour.swell_period_s?.toFixed(1) ?? "-"} s
                      </span>
                      <span
                        className="value tabular-nums"
                        style={{ color: scoreColor(hour.score) }}
                      >
                        {scoreLabel(hour.score)}
                      </span>
                    </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <div className="grid gap-3">
              <section className="panel p-5">
                <TidePanel hours={hours} locale={locale} bare />
              </section>

              {spot.orientation_deg !== null && (
                <section className="panel p-5">
                  <h2 className="section-title">{t("angles")}</h2>
                  <div className="mt-2.5">
                    <SwellCompass
                      orientationDeg={spot.orientation_deg}
                      swellDeg={now?.swell_direction_deg ?? null}
                      windDeg={now?.wind_direction_deg ?? null}
                      labels={{
                        faces: t("faces"),
                        swellFrom: t("swellFrom"),
                        wind: t("wind"),
                        windWord: winds(windWordKey(now?.offshore_component ?? null)),
                      }}
                    />
                  </div>
                </section>
              )}

              <section className="panel p-5">
                <ScoreBreakdown hour={hours[0]} bare />
              </section>
            </div>
          </div>
        )}

        {nearby.length > 0 && (
          <section className="panel mt-3 p-5">
            <h2 className="section-title">{t("nearby")}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {nearby.map(({ spot: near, km }) => {
                const nearScore = scoreBySlug[near.slug] ?? null;
                return (
                  <Link
                    key={near.slug}
                    href={`/spot/${near.slug}`}
                    className="row-card is-linked flex items-center gap-3 p-3"
                  >
                    <span
                      className="grid h-10 w-10 flex-none place-items-center rounded-chip text-value font-extrabold tabular-nums text-badge-ink"
                      style={{ background: scoreColor(nearScore) }}
                    >
                      {scoreLabel(nearScore)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body font-semibold text-primary">
                        {near.name}
                      </span>
                      <span className="faint block">
                        {formatKm(km)} {t("away")}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <p className="faint mx-auto mt-4 max-w-2xl text-center">{t("honesty")}</p>
      </main>

      <Footer />
    </div>
  );
}
