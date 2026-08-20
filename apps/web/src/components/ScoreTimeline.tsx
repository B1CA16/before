"use client";

import {
  Area,
  AreaChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ForecastHour } from "@/lib/api";
import { useLocale } from "next-intl";

import { bestHour, localeTag } from "@/lib/forecast";
import { scoreLabel } from "@/lib/score";

type Point = { iso: string; day: string; clock: string; score: number };

function toPoints(hours: ForecastHour[], tag: string): Point[] {
  return hours
    .filter((h) => h.score !== null)
    .map((h) => {
      const d = new Date(h.observed_at);
      return {
        iso: h.observed_at,
        day: d.toLocaleDateString(tag, { weekday: "short" }),
        clock: d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" }),
        score: h.score as number,
      };
    });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="panel-raised px-2.5 py-2">
      <div className="label">
        {p.day} {p.clock}
      </div>
      <div className="value mt-0.5 text-primary">{scoreLabel(p.score)}</div>
    </div>
  );
}

/** One series, so no legend: the section heading names it. No gridlines, no y-axis furniture. */
export default function ScoreTimeline({ hours }: { hours: ForecastHour[] }) {
  const tag = localeTag(useLocale());
  const data = toPoints(hours, tag);
  if (data.length === 0) return null;

  const best = bestHour(hours);
  const peak = best ? data.find((p) => p.iso === best.observed_at) : undefined;
  const dayTicks = data.filter((p, i) => i === 0 || p.day !== data[i - 1].day).map((p) => p.iso);

  return (
    <div className="h-[6.5rem] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="iso"
            ticks={dayTicks}
            tickFormatter={(iso: string) =>
              new Date(iso).toLocaleDateString(tag, { weekday: "short" })
            }
            tick={{ fill: "var(--color-faint)", fontSize: 10, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            minTickGap={4}
            interval="preserveStartEnd"
          />
          {/* Fixed scale so days are comparable, but the axis itself stays invisible. */}
          <YAxis domain={[0, 10]} hide />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--color-edge)", strokeWidth: 1 }}
            offset={12}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#scoreFill)"
            dot={false}
            activeDot={{ r: 4, fill: "var(--color-accent)", stroke: "var(--color-panel)", strokeWidth: 2 }}
            animationDuration={420}
          />
          {peak && (
            <ReferenceDot
              x={peak.iso}
              y={peak.score}
              r={3.5}
              fill="var(--color-accent)"
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
