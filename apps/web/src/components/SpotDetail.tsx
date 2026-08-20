"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ForecastHour, ScoreNow, Spot } from "@/lib/api";
import { getForecast } from "@/lib/api";
import { bestHour, formatHour, nextTideTurn, tideLabel, upcomingHours } from "@/lib/forecast";
import { scoreColor, scoreLabel, scoreWord, windLabel } from "@/lib/score";

import Chip from "./Chip";
import ScoreTimeline from "./ScoreTimeline";
import SwellCompass from "./SwellCompass";
import WaveLoader from "./WaveLoader";

const FACTORS = [
  ["size", "Size"],
  ["period", "Period"],
  ["wind", "Wind"],
  ["exposure", "Exposure"],
] as const;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value mt-1 text-primary">{value}</div>
    </div>
  );
}

/**
 * Tide, deliberately shown and deliberately not scored.
 *
 * Surfers ask about tide before almost anything else, so leaving it out cost the product credibility.
 * It stays out of the BeFORE score though: scoring it needs to know which state each spot works best
 * at, which is per-spot bathymetry we do not have. Presenting it plainly lets a surfer apply their own
 * local knowledge, which is more honest than inventing a rule and hiding it inside a number.
 */
function Tide({ hours }: { hours: ForecastHour[] }) {
  const now = hours[0];
  if (!now || now.sea_level_m === null) return null;
  const turn = nextTideTurn(hours);

  return (
    <section className="mt-4 border-t border-hairline pt-3.5">
      <h3 className="section-title">Tide</h3>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="value text-primary">
          {tideLabel(now.sea_level_m)}
          {now.tide_rising !== null && (
            <span className="meta ml-1.5 text-secondary">
              {now.tide_rising ? "rising" : "falling"}
            </span>
          )}
        </span>
        {turn && (
          <span className="text-meta text-faint">
            {turn.kind} at{" "}
            <span className="font-semibold text-accent-ink">{formatHour(turn.at)}</span>
          </span>
        )}
      </div>
      {/* A bar rather than a number, because "0.62 of the range" means nothing to a person. */}
      {now.tide_state !== null && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="label flex-none">Low</span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-inset">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.round(now.tide_state * 100)}%`,
                background: "var(--color-accent)",
              }}
            />
          </span>
          <span className="label flex-none">High</span>
        </div>
      )}
    </section>
  );
}

function Breakdown({ hour }: { hour: ForecastHour }) {
  const rows = FACTORS.map(([key, label]) => ({ key, label, value: hour[key] }));
  const scored = rows.filter((r) => r.value !== null);
  if (scored.length === 0) return null;
  // The lowest factor is what caps the score, so it is the one worth naming.
  const weakest = scored.reduce((a, b) => (b.value! < a.value! ? b : a));

  return (
    <section className="mt-4 border-t border-hairline pt-3.5">
      <h3 className="section-title">Why this score</h3>
      <div className="mt-2.5 grid gap-2">
        {rows.map(({ key, label, value }) => {
          const isWeakest = key === weakest.key;
          return (
            <div key={key} className="grid grid-cols-[66px_1fr_30px] items-center gap-3">
              <span className={`text-meta ${isWeakest ? "text-secondary" : "text-faint"}`}>
                {label}
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-inset">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(value ?? 0) * 100}%`,
                    background: isWeakest ? "var(--color-accent)" : "var(--color-edge)",
                  }}
                />
              </span>
              <span className="text-right text-meta font-semibold tabular-nums text-primary">
                {value === null ? "-" : value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="meta mt-3 text-faint">
        <span className="text-secondary">{weakest.label}</span> is holding it back. The score only
        climbs when every factor does.
      </p>
    </section>
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
          <p className="faint mt-0.5">{spot.region}</p>
          <div className="mt-2.5">
            <Chip color={scoreColor(score)}>{scoreWord(score)}</Chip>
          </div>
        </div>
        <div className="display-score flex-none" style={{ color: scoreColor(score) }}>
          {scoreLabel(score)}
        </div>
      </header>

      <div className="mt-3.5 grid grid-cols-3 gap-2">
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

      <section className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="section-title">Next days</h3>
          {best && (
            <span className="text-meta text-faint">
              peaks{" "}
              <span className="font-semibold text-accent-ink">
                {formatHour(best.observed_at)}
              </span>{" "}
              at{" "}
              <span className="font-semibold tabular-nums text-primary">
                {scoreLabel(best.score)}
              </span>
            </span>
          )}
        </div>

        <div className="mt-2">
          {loading && <WaveLoader label="Reading the forecast" className="py-4" />}
          {error && (
            <p className="py-10 text-center text-meta" style={{ color: scoreColor(1) }}>
              The forecast did not load.
            </p>
          )}
          {!loading && !error && upcoming.length === 0 && (
            <p className="faint py-10 text-center">No forecast for this spot yet.</p>
          )}
          {upcoming.length > 0 && <ScoreTimeline hours={upcoming} />}
        </div>
      </section>

      {spot.orientation_deg !== null && (
        <section className="mt-4 border-t border-hairline pt-3.5">
          <h3 className="section-title">Angles</h3>
          <div className="mt-2.5">
            <SwellCompass
              orientationDeg={spot.orientation_deg}
              swellDeg={now?.swell_direction_deg ?? null}
              windDeg={now?.wind_direction_deg ?? null}
              offshoreComponent={now?.offshore_component ?? null}
            />
          </div>
        </section>
      )}

      {upcoming.length > 0 && <Tide hours={upcoming} />}

      {upcoming.length > 0 && <Breakdown hour={upcoming[0]} />}

      {permalink && (
        <p className="mt-3 text-center">
          <Link href={permalink} className="meta text-accent-ink underline">
            Open the full report for {spot.name}
          </Link>
        </p>
      )}

      {onLogSession && (
        <section className="mt-4 border-t border-hairline pt-3.5">
          <button className="btn btn-quiet w-full" onClick={onLogSession}>
            Log a session here
          </button>
          <p className="faint mt-2 text-center">
            Rating what you surfed is what teaches the score.
          </p>
        </section>
      )}
    </div>
  );
}
