import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ShareLink from "@/components/ShareLink";
import Wordmark from "@/components/Wordmark";
import { getForecastCached, getSpotsCached, getSpotWithScore } from "@/lib/api";
import { bestHour, formatHour, nextTideTurn, tideLabel, upcomingHours } from "@/lib/forecast";
import { scoreColor, scoreLabel, scoreWord, windLabel } from "@/lib/score";

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
  return spots.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getSpotWithScore(slug);
  if (!data) return { title: "Spot not found" };
  const { spot, now } = data;
  const score = now?.score ?? null;
  // Built from real data, because a description that reads identically on 92 pages is not a
  // description.
  const description =
    score === null
      ? `Surf conditions and forecast for ${spot.name} on the ${spot.region} coast.`
      : `${spot.name} is ${scoreWord(score)} right now, scoring ${scoreLabel(score)} out of 10. ` +
        `Swell, wind, tide and the hours ahead.`;
  return {
    title: `${spot.name} surf report and forecast`,
    description,
    alternates: { canonical: `/spot/${spot.slug}` },
    openGraph: { title: `${spot.name} surf report`, description, type: "article" },
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

export default async function SpotPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getSpotWithScore(slug);
  if (!data) notFound();

  const { spot, now } = data;
  const score = now?.score ?? null;
  const hours = upcomingHours(await getForecastCached(slug), new Date());
  const peak = bestHour(hours);
  const tideNow = hours[0];
  const turn = nextTideTurn(hours);

  return (
    <div className="min-h-full bg-app">
      <header className="flex h-16 items-center gap-3 border-b border-hairline bg-panel px-4">
        <Link href="/" aria-label="beFORE home">
          <Wordmark className="h-8 w-auto flex-none" />
        </Link>
        <Link href="/" className="btn btn-quiet ml-auto">
          Open the map
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="panel p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {/* A real h1 with the real name: the single most useful thing on this page both for a
                  crawler and for someone who followed a shared link. */}
              <h1 className="title text-primary">{spot.name}</h1>
              <p className="faint mt-0.5">{spot.region} coast</p>
            </div>
            <div className="display-score flex-none" style={{ color: scoreColor(score) }}>
              {scoreLabel(score)}
            </div>
          </div>

          <p className="meta mt-3 text-secondary">
            {score === null
              ? `We have no current reading for ${spot.name}.`
              : `${spot.name} is ${scoreWord(score)} right now, scoring ${scoreLabel(
                  score
                )} out of 10.`}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat
              label="Swell"
              value={now?.swell_height_m == null ? "-" : `${now.swell_height_m.toFixed(1)} m`}
            />
            <Stat
              label="Period"
              value={now?.swell_period_s == null ? "-" : `${now.swell_period_s.toFixed(1)} s`}
            />
            <Stat label="Wind" value={windLabel(now?.offshore_component ?? null)} />
          </div>

          {tideNow?.sea_level_m != null && (
            <p className="meta mt-4 text-secondary">
              <span className="label">Tide</span> {tideLabel(tideNow.sea_level_m)}
              {tideNow.tide_rising !== null && (tideNow.tide_rising ? ", rising" : ", falling")}
              {turn && `, ${turn.kind} at ${formatHour(turn.at)}`}
            </p>
          )}

          {peak && (
            <p className="meta mt-2 text-secondary">
              <span className="label">Best ahead</span> {formatHour(peak.observed_at)} at{" "}
              {scoreLabel(peak.score)}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/?spot=${spot.slug}`} className="btn btn-primary">
              See it on the map
            </Link>
            <ShareLink title={`${spot.name} surf report`} />
          </div>
        </div>

        {/* The hours ahead as text, not only a chart. A chart is a canvas element to a crawler. */}
        {hours.length > 0 && (
          <section className="panel mt-4 p-5">
            <h2 className="section-title">Next hours at {spot.name}</h2>
            <ul className="mt-3 grid gap-1.5">
              {hours.slice(0, 12).map((hour) => (
                <li key={hour.observed_at} className="flex items-baseline justify-between gap-3">
                  <span className="meta text-secondary">{formatHour(hour.observed_at)}</span>
                  <span className="faint">
                    {hour.swell_height_m?.toFixed(1) ?? "-"} m at{" "}
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

        <p className="faint mt-4">
          Scores come from open forecast data and a transparent formula, not from anyone&apos;s
          opinion. Rating sessions you actually surfed is what will improve them.
        </p>
      </main>
    </div>
  );
}
