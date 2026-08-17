import { windLabel } from "@/lib/score";

/**
 * The geometry the score is built from, drawn.
 *
 * A beach faces one way (its shore-normal azimuth) and the swell arrives from another. How well
 * those line up is `swell_exposure`; the same comparison against the wind is `offshore_component`.
 * Showing it makes the score explicable rather than magic.
 *
 * Bearings are "coming from", 0 is north. The swell arrow points inward, the way the swell travels;
 * the dashed line points outward, the way the beach looks out to sea.
 */
export default function SwellCompass({
  orientationDeg,
  swellDeg,
  windDeg,
  offshoreComponent,
}: {
  orientationDeg: number | null;
  swellDeg: number | null;
  windDeg: number | null;
  offshoreComponent: number | null;
}) {
  if (orientationDeg === null) return null;

  const c = 36;
  const R = 25;
  const point = (deg: number, from: number, to: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return {
      x1: c + Math.cos(rad) * from,
      y1: c + Math.sin(rad) * from,
      x2: c + Math.cos(rad) * to,
      y2: c + Math.sin(rad) * to,
    };
  };

  return (
    <div className="flex items-center gap-4">
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="flex-none">
        <circle cx={c} cy={c} r={R} fill="var(--color-inset)" stroke="var(--color-hairline)" />
        {/* cardinals sit on the ring, large enough to read */}
        {[
          ["N", 0],
          ["E", 90],
          ["S", 180],
          ["W", 270],
        ].map(([t, deg]) => {
          const rad = (((deg as number) - 90) * Math.PI) / 180;
          return (
            <text
              key={t as string}
              x={c + Math.cos(rad) * (R + 5.5)}
              y={c + Math.sin(rad) * (R + 5.5) + 2.8}
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill="var(--color-faint)"
            >
              {t as string}
            </text>
          );
        })}

        {/* where the beach looks: outward, dashed, quiet */}
        <line
          {...point(orientationDeg, 4, R - 2)}
          stroke="var(--color-secondary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2.5 2.5"
        />

        {/* where the swell comes from: inward, solid, accented, the thing that matters */}
        {swellDeg !== null && (
          <line
            {...point(swellDeg, R - 1, 8)}
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        )}

        <circle cx={c} cy={c} r="2.2" fill="var(--color-primary)" />
      </svg>

      <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-3 gap-y-1.5">
        <dt className="label">Faces</dt>
        <dd className="text-meta tabular-nums text-primary">{Math.round(orientationDeg)}&deg;</dd>

        <dt className="label" style={{ color: "var(--color-accent)" }}>
          Swell from
        </dt>
        <dd className="text-meta tabular-nums text-primary">
          {swellDeg === null ? "-" : `${Math.round(swellDeg)}\u00b0`}
        </dd>

        <dt className="label">Wind</dt>
        <dd className="text-meta text-primary">
          {windLabel(offshoreComponent)}
          {windDeg !== null && (
            <span className="text-faint"> ({Math.round(windDeg)}&deg;)</span>
          )}
        </dd>
      </dl>
    </div>
  );
}
