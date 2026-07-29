"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getForecast, type ForecastHour } from "@/lib/api";
import { bestHour, formatHour, upcomingHours } from "@/lib/forecast";
import { scoreColor, scoreLabel } from "@/lib/score";

export default function ForecastPanel({
  slug,
  name,
  onClose,
}: {
  slug: string;
  name: string;
  onClose: () => void;
}) {
  const [hours, setHours] = useState<ForecastHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The parent gives this component a `key` of the slug, so selecting another spot mounts a fresh
  // instance with the initial state above. That avoids resetting state inside the effect, which
  // would cause cascading renders.
  useEffect(() => {
    let active = true;
    getForecast(slug)
      .then((rows) => active && setHours(rows))
      .catch(() => active && setError("Could not load the forecast"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  const upcoming = upcomingHours(hours, new Date());
  const best = bestHour(upcoming);
  const data = upcoming
    .filter((h) => h.score !== null)
    .map((h) => ({ label: formatHour(h.observed_at), score: h.score }));

  return (
    <section
      className="absolute inset-x-3 bottom-3 z-[1000] rounded-xl bg-slate-900/95 p-4 text-white shadow-2xl backdrop-blur"
      aria-label={`Forecast for ${name}`}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{name}</h2>
          {best ? (
            <p className="text-xs text-slate-300">
              Best upcoming:{" "}
              <b className="text-white">{formatHour(best.observed_at)}</b> at{" "}
              <b style={{ color: scoreColor(best.score) }}>{scoreLabel(best.score)}</b>
            </p>
          ) : (
            <p className="text-xs text-slate-400">No scored hours ahead</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close forecast"
          className="flex-none rounded px-2 py-1 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          Close
        </button>
      </div>

      {loading && <p className="py-6 text-center text-sm text-slate-400">Loading forecast...</p>}
      {error && <p className="py-6 text-center text-sm text-red-400">{error}</p>}
      {!loading && !error && data.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">No forecast available yet.</p>
      )}

      {data.length > 0 && (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 10]} width={26} tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Line type="monotone" dataKey="score" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
