"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLocale, useTranslations } from "next-intl";

import { localeTag } from "@/lib/forecast";

/**
 * A month grid for choosing a past date.
 *
 * Written rather than pulled in, and rather than using `<input type="date">`, because the browser's
 * own picker popup is rendered by the browser and not by the page: no CSS can reach it, so it will
 * always look like Chrome instead of like this app. Roughly eighty lines buys full control over the
 * one interaction in the form that everyone will use.
 *
 * Future days are disabled rather than hidden, so the shape of the month stays readable.
 *
 * ## Keyboard
 *
 * A grid, so it follows the grid pattern rather than the list one: arrows move by day and by week,
 * Home and End go to the ends of the week, PageUp and PageDown change month. Only ONE cell is
 * tabbable at a time (roving tabindex), because 42 focusable buttons would mean 42 Tab presses to
 * cross the calendar, which is technically operable and practically unusable.
 *
 * Moving off the edge of a month rolls into the next or previous one, the way a spreadsheet does, so
 * you never have to leave the grid to reach the 1st or the 31st.
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
  const t = useTranslations("calendar");
  const tag = localeTag(useLocale());
  const [month, setMonth] = useState(() => startOfMonth(value));

  const weekdays = useMemo(() => {
    // "short" rather than "narrow": narrow gives M T W T F S S, where the repeated T and S are
    // ambiguous. Three letters still fit seven columns at phone width.
    const fmt = new Intl.DateTimeFormat(tag, { weekday: "short" });
    // 1 January 2024 was a Monday, which is the first column here.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [tag]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }).format(month),
    [month, tag]
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

  // The one day that is tabbable, and the one arrows move. Kept as a date rather than a cell index
  // because rolling into an adjacent month changes the grid under it.
  const [cursor, setCursor] = useState<Date>(() => value);

  function shiftMonth(by: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));
    // The cursor has to follow, or it ends up on a day the grid is no longer showing and NO cell has
    // tabIndex 0, which makes the whole calendar unreachable by Tab. Clamped to max so paging forward
    // cannot park the cursor on a disabled future day.
    setCursor((c) => {
      const moved = new Date(c.getFullYear(), c.getMonth() + by, c.getDate());
      return moved > max ? max : moved;
    });
  }

  const grid = useRef<HTMLDivElement>(null);
  // Only move real focus when the keyboard caused the change. Focusing on every render would steal
  // focus from the trigger the moment the calendar mounts.
  const shouldFocus = useRef(false);

  // Take focus when the grid opens, then follow the cursor as arrows move it.
  //
  // The opening focus is not a nicety. This grid is rendered through a portal into document.body, so
  // in DOM order it sits outside the sheet entirely and **Tab never reaches it**: pressing Tab from
  // the date button jumped straight to the hour select, leaving the calendar visible but unusable
  // without a mouse. Moving focus in on open is what a popup owes its keyboard users.
  useEffect(() => {
    grid.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.focus();
    // Mount only. Cursor moves are handled by the effect below.
  }, []);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    grid.current?.querySelector<HTMLElement>('[data-cursor="true"]')?.focus();
  }, [cursor, month]);

  function moveCursor(next: Date) {
    const capped = next > max ? max : next;
    shouldFocus.current = true;
    setCursor(capped);
    // Follow the cursor across a month boundary, so arrowing past the 1st shows the month it landed in.
    if (capped.getMonth() !== month.getMonth() || capped.getFullYear() !== month.getFullYear()) {
      setMonth(startOfMonth(capped));
    }
  }

  function onGridKeyDown(event: React.KeyboardEvent) {
    const d = cursor;
    const shift = (days: number) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveCursor(shift(-1));
        return;
      case "ArrowRight":
        event.preventDefault();
        moveCursor(shift(1));
        return;
      case "ArrowUp":
        event.preventDefault();
        moveCursor(shift(-7));
        return;
      case "ArrowDown":
        event.preventDefault();
        moveCursor(shift(7));
        return;
      case "Home":
        // Monday of this week, matching the Monday-first columns.
        event.preventDefault();
        moveCursor(shift(-((d.getDay() + 6) % 7)));
        return;
      case "End":
        event.preventDefault();
        moveCursor(shift(6 - ((d.getDay() + 6) % 7)));
        return;
      case "PageUp":
        event.preventDefault();
        moveCursor(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
        return;
      case "PageDown":
        event.preventDefault();
        moveCursor(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()));
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!(cursor > max && !sameDay(cursor, max))) onSelect(cursor);
        return;
      default:
        break;
    }
  }

  return (
    <div className="panel-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-avatar" onClick={() => shiftMonth(-1)} aria-label={t("previousMonth")}>
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
          aria-label={t("nextMonth")}
          style={canGoForward ? undefined : { opacity: 0.35, cursor: "not-allowed" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
            <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        ref={grid}
        role="grid"
        aria-label={monthLabel}
        onKeyDown={onGridKeyDown}
        className="mt-2.5 grid grid-cols-7 gap-1"
      >
        {weekdays.map((name, i) => (
          <span key={i} className="label text-center">
            {name}
          </span>
        ))}
        {days.map((day, i) => {
          if (!day) return <span key={i} />;
          const disabled = day > max && !sameDay(day, max);
          const selected = sameDay(day, value);
          const isCursor = sameDay(day, cursor);
          return (
            <button
              key={i}
              type="button"
              className={`day ${isCursor ? "is-cursor" : ""}`}
              aria-pressed={selected}
              aria-current={sameDay(day, today) ? "date" : undefined}
              data-cursor={isCursor || undefined}
              // Roving tabindex: exactly one cell is reachable by Tab, and the arrows do the rest.
              // With all 42 tabbable, crossing the calendar would take 42 Tab presses.
              tabIndex={isCursor ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                setCursor(day);
                onSelect(day);
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
