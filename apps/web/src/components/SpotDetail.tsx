"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { ForecastHour, ScoreNow, Spot } from "@/lib/api";
import { getForecast } from "@/lib/api";
import { ArrowIcon } from "@/components/Icons";
import { Link } from "@/i18n/navigation";
import { bestHour, formatHour, upcomingHours } from "@/lib/forecast";
import { scoreColor, scoreLabel, scoreWordKey, windWordKey } from "@/lib/score";

import ScoreBreakdown from "./ScoreBreakdown";
import TidePanel from "./TidePanel";

import Chip from "./Chip";
import ScoreTimeline from "./ScoreTimeline";
import SwellCompass from "./SwellCompass";
import WaveLoader from "./WaveLoader";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value mt-1 text-primary">{value}</div>
    </div>
  );
}

export default function SpotDetail({
  spot,
  now,
  onLogSession,
  permalink,
}: {
  spot: Spot;
  now?: ScoreNow;
  onLogSession?: () => void;
  /** Link to the server-rendered page, which is the shareable and indexable address for this spot. */
  permalink?: string;
}) {
  const t = useTranslations("spot");
  const words = useTranslations("score");
  const winds = useTranslations("wind");
  const regions = useTranslations("regions");
  const locale = useLocale();
  const [hours, setHours] = useState<ForecastHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Keyed by slug upstream, so a new spot mounts a fresh component and the initial state
  // above applies. No state reset inside the effect.
  useEffect(() => {
    let active = true;
    getForecast(spot.slug)
      .then((rows) => active && setHours(rows))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [spot.slug]);

  const upcoming = upcomingHours(hours, new Date());
  const best = bestHour(upcoming);
  const score = now?.score ?? null;

  return (
    <div>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 pt-1">
          <h2 className="title truncate text-primary">{spot.name}</h2>
          <p className="faint mt-0.5">{regions.has(spot.region) ? regions(spot.region) : spot.region}</p>
          <div className="mt-2.5">
            <Chip color={scoreColor(score)}>{words(scoreWordKey(score))}</Chip>
          </div>
        </div>
        <div className="display-score flex-none" style={{ color: scoreColor(score) }}>
          {scoreLabel(score)}
        </div>
      </header>

      <div className="mt-3.5 grid grid-cols-3 gap-2">
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

      <section className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="section-title">{t("nextDays")}</h3>
          {best && (
            <span className="text-meta text-faint">
              {t("peaks")}{" "}
              <span className="font-semibold text-accent-ink">
                {formatHour(best.observed_at, locale)}
              </span>{" "}
              {t("at")}{" "}
              <span className="font-semibold tabular-nums text-primary">
                {scoreLabel(best.score)}
              </span>
            </span>
          )}
        </div>

        <div className="mt-2">
          {loading && <WaveLoader label={t("readingForecast")} className="py-4" />}
          {error && (
            <p className="py-10 text-center text-meta" style={{ color: scoreColor(1) }}>
              {t("forecastFailed")}
            </p>
          )}
          {!loading && !error && upcoming.length === 0 && (
            <p className="faint py-10 text-center">{t("noForecast")}</p>
          )}
          {upcoming.length > 0 && <ScoreTimeline hours={upcoming} />}
        </div>
      </section>

      {spot.orientation_deg !== null && (
        <section className="mt-4 border-t border-hairline pt-3.5">
          <h3 className="section-title">{t("angles")}</h3>
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

      {upcoming.length > 0 && <TidePanel hours={upcoming} locale={locale} />}

      {upcoming.length > 0 && <ScoreBreakdown hour={upcoming[0]} />}

            {(onLogSession || permalink) && (
        <section className="mt-4 border-t border-hairline pt-3.5">
          <div className="grid gap-1.5">
            {onLogSession && (
              <button className="btn btn-primary w-full" onClick={onLogSession}>
                {t("logHere")}
              </button>
            )}
            {permalink && (
              <Link href={permalink} className="btn btn-quiet w-full">
                {t("viewFull")}
                <ArrowIcon size={14} />
              </Link>
            )}
          </div>
          {onLogSession && <p className="faint mt-2 text-center">{t("logHint")}</p>}
        </section>
      )}
    </div>
  );
}
