import { LIVE } from "@/content/explainer";

/**
 * The deployed wind correction, drawn from the artefact the API actually loads.
 *
 * Hand-rolled SVG rather than a charting library: this is a server component, so as drawn it ships
 * zero JavaScript, where a library would add tens of kilobytes to a page whose whole argument is
 * that it is honest and cheap.
 *
 * SVG rather than the div-and-percentage-height version this replaces, which overflowed its box the
 * moment the value labels needed room. Inside a `viewBox` the layout is arithmetic instead of a
 * negotiation with the flexbox algorithm, and it cannot overflow because there is nowhere to
 * overflow to.
 *
 * The earlier version was also unreadable: 24 bars, no axis, no zero line, and a number crammed over
 * every bar. A reader could see a shape and had no way to know what it meant. This one has a
 * baseline, two gridlines with units, hours along the bottom, and the peak and the trough called out
 * by name, because those two points are the entire story the chart is telling.
 */

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 26, right: 14, bottom: 42, left: 40 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

export default function CorrectionCurve({
  caption,
  axisLabel,
  peakLabel,
  troughLabel,
}: {
  caption: string;
  axisLabel: string;
  peakLabel: (hour: string, value: string) => string;
  troughLabel: (hour: string, value: string) => string;
}) {
  const points = LIVE.byHour;

  // The scale always includes zero, so the bars are read against "no correction" rather than
  // against the smallest value that happens to be in the data. A chart whose baseline floats is how
  // a small difference gets drawn as a dramatic one.
  const values = points.map((p) => p.value);
  const top = Math.max(...values, 0);
  const bottom = Math.min(...values, 0);
  const span = top - bottom || 1;

  const y = (value: number) => PAD.top + ((top - value) / span) * PLOT_H;
  const zeroY = y(0);
  const bandW = PLOT_W / points.length;
  const barW = bandW * 0.62;

  // Two gridlines and no more. The point of the chart is the shape of the day, not reading precise
  // values off an axis, and every extra line competes with the bars for attention.
  const ticks = [top, 0].filter((value, i, all) => all.indexOf(value) === i);

  const peak = points.reduce((a, b) =>
    Math.abs(b.value) > Math.abs(a.value) ? b : a,
  );
  const trough = points.reduce((a, b) =>
    Math.abs(b.value) < Math.abs(a.value) ? b : a,
  );
  const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

  return (
    <figure className="explain-figure">
      <svg
        className="explain-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={caption}
        preserveAspectRatio="xMidYMid meet"
      >
        {ticks.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className={
                value === 0 ? "explain-axis-zero" : "explain-axis-line"
              }
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 4}
              className="explain-axis-text"
              textAnchor="end"
            >
              {value === 0 ? "0" : `+${value.toFixed(0)}`}
            </text>
          </g>
        ))}

        {points.map(({ hour, value }, i) => {
          const x = PAD.left + i * bandW + (bandW - barW) / 2;
          const barTop = value >= 0 ? y(value) : zeroY;
          const height = Math.max(Math.abs(zeroY - y(value)), 1.5);
          const notable = hour === peak.hour || hour === trough.hour;
          return (
            <g key={hour}>
              <rect
                x={x}
                y={barTop}
                width={barW}
                height={height}
                rx={2}
                className={
                  notable ? "explain-bar-rect is-notable" : "explain-bar-rect"
                }
              />
              {notable && (
                <text
                  x={x + barW / 2}
                  y={barTop - 7}
                  className="explain-bar-callout"
                  textAnchor="middle"
                >
                  {value.toFixed(1)}
                </text>
              )}
              {hour % 3 === 0 && (
                <text
                  x={x + barW / 2}
                  y={HEIGHT - PAD.bottom + 18}
                  className="explain-axis-text"
                  textAnchor="middle"
                >
                  {hour}
                </text>
              )}
            </g>
          );
        })}

        <text
          x={PAD.left + PLOT_W / 2}
          y={HEIGHT - 8}
          className="explain-axis-text"
          textAnchor="middle"
        >
          {axisLabel}
        </text>
      </svg>

      <figcaption className="explain-caption">
        <strong className="text-secondary">{caption}</strong>{" "}
        {peakLabel(hh(peak.hour), peak.value.toFixed(1))}{" "}
        {troughLabel(hh(trough.hour), trough.value.toFixed(1))}
      </figcaption>

      {/* The same numbers as a table, because a bar chart is unreadable to a screen reader and
          "see the chart" is not an accessible instruction. Visually hidden, fully navigable. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{axisLabel}</th>
            <th scope="col">km/h</th>
          </tr>
        </thead>
        <tbody>
          {points.map(({ hour, value }) => (
            <tr key={hour}>
              <th scope="row">{hh(hour)}</th>
              <td>{value.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
