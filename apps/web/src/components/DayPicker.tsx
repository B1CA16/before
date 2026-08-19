"use client";

import { useMemo, useState } from "react";

import { UI_LOCALE } from "@/lib/forecast";

/**
 * A month grid for choosing a past date.
 *
 * Written rather than pulled in, and rather than using `<input type="date">`, because the browser's
 * own picker popup is rendered by the browser and not by the page: no CSS can reach it, so it will
 * always look like Chrome instead of like this app. Roughly eighty lines buys full control over the
 * one interaction in the form that everyone will use.
 *
 * Future days are disabled rather than hidden, so the shape of the month stays readable.
 */

const CELLS = 42; // six weeks, so the popover does not change height between months

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DayPicker({
  value,
  max,
  onSelect,
}: {
  value: Date;
  /** Latest selectable day, normally today. */
  max: Date;
  onSelect: (day: Date) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(value));

  const weekdays = useMemo(() => {
    // "short" rather than "narrow": narrow gives M T W T F S S, where the repeated T and S are
    // ambiguous. Three letters still fit seven columns at phone width.
    const fmt = new Intl.DateTimeFormat(UI_LOCALE, { weekday: "short" });
    // 1 January 2024 was a Monday, which is the first column here.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, []);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(UI_LOCALE, { month: "long", year: "numeric" }).format(month),
    [month]
  );

  const days = useMemo(() => {
    const first = startOfMonth(month);
    // getDay() is Sunday-first; shift so Monday leads, which is the convention in Portugal.
    const lead = (first.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: CELLS }, (_, i) => {
      const dayNumber = i - lead + 1;
      if (dayNumber < 1 || dayNumber > count) return null;
      return new Date(month.getFullYear(), month.getMonth(), dayNumber);
    });
  }, [month]);

  const today = new Date();
  const canGoForward = startOfMonth(month) < startOfMonth(max);

  function shiftMonth(by: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
  }

  return (
    <div className="panel-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-avatar" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <span className="text-meta font-semibold text-primary">{monthLabel}</span>
        <button
          type="button"
          className="btn-avatar"
          onClick={() => shiftMonth(1)}
          disabled={!canGoForward}
          aria-label="Next month"
          style={canGoForward ? undefined : { opacity: 0.35, cursor: "not-allowed" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-7 gap-1">
        {weekdays.map((name, i) => (
          <span key={i} className="label text-center">
            {name}
          </span>
        ))}
        {days.map((day, i) => {
          if (!day) return <span key={i} />;
          const disabled = day > max && !sameDay(day, max);
          const selected = sameDay(day, value);
          return (
            <button
              key={i}
              type="button"
              className="day"
              aria-pressed={selected}
              aria-current={sameDay(day, today) ? "date" : undefined}
              disabled={disabled}
              onClick={() => onSelect(day)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
