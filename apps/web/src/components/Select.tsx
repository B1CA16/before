"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AnchoredPanel from "@/components/AnchoredPanel";

/**
 * A select we own, replacing `<select>`.
 *
 * Same reason as the calendar: a native `<select>` renders its list through the operating system, so
 * no CSS can reach it and it will always look like Windows or iOS rather than like this app.
 *
 * The list floats over the form via AnchoredPanel, which explains there why neither inline nor
 * absolute positioning worked and why this ended up pinned to the viewport.
 *
 * `searchable` exists because one of these holds 92 spots. Scrolling 92 rows to find Carcavelos is
 * not a select, it is a filing cabinet.
 */

export type Option = { value: string; label: string };

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4 6.5L8 10.5l4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Tick() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      aria-hidden
      className="flex-none"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Select({
  value,
  options,
  onChange,
  label,
  searchable = false,
  className = "",
  id,
  minWidth = 0,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  /** Accessible name, since there is no native <select> to associate a <label> with. */
  label: string;
  searchable?: boolean;
  className?: string;
  id?: string;
  /** Floor for the panel width, for triggers narrower than their own content (the hour picker). */
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Held in state, not a ref: the panel needs this element during render, and state is what
  // triggers the re-render once the button mounts.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // On opening, always bring the current value into view. Without it, the hour list opens on midnight
  // while 21:00 is selected far below, and the spot list opens on "Cave" with the actual selection
  // somewhere out of sight: both look like nothing is chosen.
  //
  // scrollTop is set by hand rather than using scrollIntoView, because scrollIntoView also scrolls
  // every scrollable ancestor, and this sits inside a sheet that is itself a scroll container.
  useEffect(() => {
    if (!open) return;
    // Focusing the filter and centring the list do not conflict: moving scrollTop does not move focus.
    if (searchable) search.current?.focus();
    const box = list.current;
    const selected = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !selected) return;
    const boxRect = box.getBoundingClientRect();
    const selRect = selected.getBoundingClientRect();
    box.scrollTop +=
      selRect.top - boxRect.top - (boxRect.height - selRect.height) / 2;
  }, [open, searchable]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={className}>
      <button
        ref={setTriggerEl}
        id={id}
        type="button"
        className="control"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{current?.label ?? "Select"}</span>
        <Chevron />
      </button>

      {open && triggerEl && (
        <AnchoredPanel anchorEl={triggerEl} minWidth={minWidth} onDismiss={() => setOpen(false)}>
          <div className="panel-raised p-2">
            {searchable && (
              <label className="field mb-1.5" aria-label={`Filter ${label}`}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="flex-none opacity-50"
                >
                  <circle
                    cx="6.5"
                    cy="6.5"
                    r="4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M10 10l4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  ref={search}
                  type="search"
                  placeholder="Filter"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            )}

            <div
              ref={list}
              role="listbox"
              aria-label={label}
              className="scroll-inset max-h-56 overflow-y-auto"
            >
              {shown.length === 0 ? (
                <p className="faint px-3 py-4">Nothing matches that.</p>
              ) : (
                shown.map((option) => {
                  const selected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="option"
                      onClick={() => choose(option.value)}
                    >
                      <span className="truncate">{option.label}</span>
                      {selected && <Tick />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </AnchoredPanel>
      )}
    </div>
  );
}
