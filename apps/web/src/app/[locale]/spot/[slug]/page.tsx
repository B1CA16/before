import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import ShareLink from "@/components/ShareLink";
import Wordmark from "@/components/Wordmark";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getForecastCached, getSpotsCached, getSpotWithScore } from "@/lib/api";
import { bestHour, formatHour, nextTideTurn, tideLabel, upcomingHours } from "@/lib/forecast";
import { scoreColor, scoreLabel, scoreWordKey, windWordKey } from "@/lib/score";

/**
 * A spot page, rendered on the server.
 *
 * This exists because the map page is one large client component, so the HTML it serves is the shell
 * and nothing else: measured at 37,872 bytes and 29 visible words, with not one of the 92 spot names
 * in it. Nothing could be linked to and nothing could be indexed. SEO here was never a metadata
 * problem, it was a rendering problem, and metadata on an empty page would have been lipstick.
 *
 * Two things follow from rendering on the server:
 *
 * - A crawler, and anyone whose JavaScript has not arrived yet, gets the actual content.
 * - With `revalidate`, these pages are cached by Vercel, so a visitor is not waiting on a Render cold
 *   start. That closes the edge-caching item deferred in ADR-0004, as a consequence of doing this
 *   properly rather than as separate work.
 */

// Matched to the data rather than picked round: conditions are ingested daily, but the "current" hour
// advances every hour, so hourly is the coarsest revalidation that stays truthful.
export const revalidate = 3600;

export async function generateStaticParams() {
  const spots = await getSpotsCached();
  // Every spot in every language, so both locales are prerendered rather than one being dynamic.
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
      // Both languages offered for the same spot, so they do not compete with each other.
      languages: { pt: path, en: `/en${path}` },
    },
    openGraph: { title: t("spotTitle", { name: spot.name }), description, type: "article" },
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
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

  const t = await getTranslations({ locale, namespace: "spot" });
  const nav = await getTranslations({ locale, namespace: "nav" });
  const words = await getTranslations({ locale, namespace: "score" });
  const winds = await getTranslations({ locale, namespace: "wind" });
  const tide = await getTranslations({ locale, namespace: "tide" });

  const { spot, now } = data;
  const score = now?.score ?? null;
  const hours = upcomingHours(await getForecastCached(slug), new Date());
  const peak = bestHour(hours);
  const tideNow = hours[0];
  const turn = nextTideTurn(hours);

  return (
    <div className="min-h-full bg-app">
      <header className="flex h-16 items-center gap-3 border-b border-hairline bg-panel px-4">
        <Link href="/" aria-label={nav("home")}>
          <Wordmark className="h-8 w-auto flex-none" />
        </Link>
        <Link href="/" className="btn btn-quiet ml-auto">
          {nav("openMap")}
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {/* A real h1 with the real name: the single most useful thing on this page both for a
                  crawler and for someone who followed a shared link. */}
              <h1 className="title text-primary">{spot.name}</h1>
              <p className="faint mt-0.5">{t("coast", { region: spot.region })}</p>
            </div>
            <div className="display-score flex-none" style={{ color: scoreColor(score) }}>
              {scoreLabel(score)}
            </div>
          </div>

          <p className="meta mt-3 text-secondary">
            {score === null
              ? t("noReadingFor", { name: spot.name })
              : t("isRightNow", {
                  name: spot.name,
                  word: words(scoreWordKey(score)),
                  score: scoreLabel(score),
                })}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat
              label={t("swell")}
              value={now?.swell_height_m == null ? "-" : `${now.swell_height_m.toFixed(1)} m`}
            />
            <Stat
              label={t("period")}
              value={now?.swell_period_s == null ? "-" : `${now.swell_period_s.toFixed(1)} s`}
            />
            <Stat label={t("wind")} value={winds(windWordKey(now?.offshore_component ?? null))} />
          </div>

          {tideNow?.sea_level_m != null && (
            <p className="meta mt-4 text-secondary">
              <span className="label">{tide("title")}</span> {tideLabel(tideNow.sea_level_m)}
              {tideNow.tide_rising !== null &&
                `, ${tideNow.tide_rising ? tide("rising") : tide("falling")}`}
              {turn && `, ${tide(turn.kind)} ${t("at")} ${formatHour(turn.at, locale)}`}
            </p>
          )}

          {peak && (
            <p className="meta mt-2 text-secondary">
              <span className="label">{t("bestAhead")}</span> {formatHour(peak.observed_at, locale)}{" "}
              {t("at")} {scoreLabel(peak.score)}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/?spot=${spot.slug}`} className="btn btn-primary">
              {t("seeOnMap")}
            </Link>
            <ShareLink title={t("shareTitle", { name: spot.name })} />
          </div>
        </div>

        {/* The hours ahead as text, not only a chart. A chart is a canvas element to a crawler. */}
        {hours.length > 0 && (
          <section className="panel mt-4 p-5">
            <h2 className="section-title">{t("nextHours", { name: spot.name })}</h2>
            <ul className="mt-3 grid gap-1.5">
              {hours.slice(0, 12).map((hour) => (
                <li key={hour.observed_at} className="flex items-baseline justify-between gap-3">
                  <span className="meta text-secondary">
                    {formatHour(hour.observed_at, locale)}
                  </span>
                  <span className="faint">
                    {hour.swell_height_m?.toFixed(1) ?? "-"} m {t("at")}{" "}
                    {hour.swell_period_s?.toFixed(1) ?? "-"} s
                  </span>
                  <span className="value tabular-nums" style={{ color: scoreColor(hour.score) }}>
                    {scoreLabel(hour.score)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="faint mt-4">{t("honesty")}</p>
      </main>
    </div>
  );
}
