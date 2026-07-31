"use client";

import type { ScoreNow, Spot } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/score";

import WaveLoader from "./WaveLoader";

/** The two numbers that decide everything: size and period. */
function conditions(now?: ScoreNow): string {
  if (!now || now.swell_height_m == null || now.swell_period_s == null) return "";
  return `${now.swell_height_m.toFixed(1)} m, ${Math.round(now.swell_period_s)} s`;
}

export default function RankedList({
  spots,
  scores,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  spots: Spot[];
  scores: Record<string, ScoreNow>;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}) {
  if (spots.length === 0) {
    return <WaveLoader label="Finding spots" className="py-8" />;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {spots.map((spot) => {
        const score = scores[spot.slug]?.score ?? null;
        return (
          <li key={spot.slug}>
            <button
              onClick={() => onSelect(spot.slug)}
              onMouseEnter={() => onHover(spot.slug)}
              onMouseLeave={() => onHover(null)}
              aria-current={spot.slug === selected ? "true" : undefined}
              className={`row-card ${spot.slug === hovered ? "is-linked" : ""}`}
            >
              <span
                className="grid h-10 w-10 flex-none place-items-center rounded-chip text-value font-extrabold tabular-nums tracking-tight text-badge-ink"
                style={{ background: scoreColor(score) }}
              >
                {scoreLabel(score)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold text-primary">
                  {spot.name}
                </span>
                <span className="faint block truncate">{conditions(scores[spot.slug])}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
