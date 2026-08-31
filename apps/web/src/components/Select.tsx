"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
 *
 * ## Keyboard
 *
 * All of this is here because replacing a native control means inheriting the work the browser was
 * doing for free. `<select>` supports arrows, Home, End, type-ahead, Enter, Escape and focus return
 * out of the box; the moment it was swapped for buttons, every one of those stopped working, and that
 * is not a missing nicety, it is a control that cannot be operated without a mouse.
 *
 * The model is `aria-activedescendant` rather than roving focus. Focus stays on the trigger (or on the
 * filter input when searchable) and a separate "active" index moves through the options, which is what
 * lets you type in the filter and arrow through results at the same time. Moving real DOM focus into
 * the list would take it out of the input on the first arrow press.
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
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="flex-none">
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
  disabled = false,
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
  disabled?: boolean;
}) {
  const t = useTranslations("select");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Held in state, not a ref: the panel needs this element during render, and state is what
  // triggers the re-render once the button mounts.
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Type-ahead buffer, for jumping to "car" in a list of 92 spots the way a native select does.
  const typed = useRef({ text: "", at: 0 });

  const current = options.find((o) => o.value === value);
  const listId = id ? `${id}-list` : undefined;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const optionId = (index: number) => (listId ? `${listId}-opt-${index}` : undefined);

  /** Close, and hand focus back to the trigger. Losing focus to <body> strands a keyboard user. */
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    triggerEl?.focus();
  }, [triggerEl]);

  /**
   * Open, starting from the current value rather than the top, so the first arrow press moves one
   * step from where you already are.
   *
   * Computed here rather than in an effect keyed on `open`. Choosing the starting row is a
   * consequence of the click or keypress that opened the list, not of the list having become open,
   * and doing it in an effect is a cascading render React warns about.
   */
  const openList = useCallback(() => {
    const index = options.findIndex((o) => o.value === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  }, [options, value]);

  // Focusing the filter is a DOM side effect on something that has just mounted, which is what an
  // effect is actually for. It sets no state.
  useEffect(() => {
    if (open && searchable) search.current?.focus();
  }, [open, searchable]);

  // Keep the active option in view, both on open and as arrows move it.
  //
  // scrollTop is set by hand rather than using scrollIntoView, because scrollIntoView also scrolls
  // every scrollable ancestor, and this sits inside a sheet that is itself a scroll container.
  useEffect(() => {
    if (!open) return;
    const box = list.current;
    const el = box?.children[active] as HTMLElement | undefined;
    if (!box || !el) return;
    const boxRect = box.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top < boxRect.top) {
      box.scrollTop += elRect.top - boxRect.top;
    } else if (elRect.bottom > boxRect.bottom) {
      box.scrollTop += elRect.bottom - boxRect.bottom;
    }
  }, [open, active]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    setQuery("");
    triggerEl?.focus();
  }

  /** Jump to the first option starting with what was typed, the way a native select does. */
  function typeAhead(key: string) {
    const now = Date.now();
    // A pause of a second starts a new word, so "ca" then later "r" does not become "car".
    typed.current.text = now - typed.current.at > 1000 ? key : typed.current.text + key;
    typed.current.at = now;
    const prefix = typed.current.text.toLowerCase();
    const index = shown.findIndex((o) => o.label.toLowerCase().startsWith(prefix));
    if (index >= 0) setActive(index);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      // Every key a native select opens on.
      if (["ArrowDown", "ArrowUp", "Enter", " ", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        return;
      case "Tab":
        // Tab commits nothing and moves on, matching a native select. Not prevented, so focus
        // continues to the next control rather than being trapped here.
        setOpen(false);
        setQuery("");
        return;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(i + 1, shown.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(Math.max(shown.length - 1, 0));
        return;
      case "PageDown":
        event.preventDefault();
        setActive((i) => Math.min(i + 8, shown.length - 1));
        return;
      case "Enter":
        event.preventDefault();
        if (shown[active]) choose(shown[active].value);
        return;
      case "PageUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 8, 0));
        return;
      default:
        break;
    }

    // Type-ahead, but only when there is no filter box to type into: with one, the same keystrokes
    // belong to the filter and doing both would fight itself.
    if (!searchable && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      typeAhead(event.key);
    }
  }

  return (
    <div className={className} onKeyDown={onKeyDown}>
      <button
        ref={setTriggerEl}
        id={id}
        type="button"
        className="control"
        // `combobox`, not a bare button. `aria-activedescendant` is only meaningful on a role that
        // owns a set of options, and a linter caught it sitting on the implicit button role where it
        // does nothing. This is the select-only combobox pattern from the ARIA practices guide.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        // Only when focus actually stays here. With a filter box, focus moves into the input and the
        // active option is announced from there instead; claiming it in both places would have two
        // elements asserting they own the same selection.
        aria-activedescendant={open && !searchable ? optionId(active) : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
      >
        <span className="truncate">{current?.label ?? t("placeholder")}</span>
        <Chevron />
      </button>

      {open && !disabled && triggerEl && (
        <AnchoredPanel anchorEl={triggerEl} minWidth={minWidth} onDismiss={close}>
          <div className="panel-raised p-2">
            {searchable && (
              <label className="field mb-1.5" aria-label={`${t("filter")} ${label}`}>
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
                  // Focus lives here while filtering, so this is the element that has to name the
                  // active option for a screen reader.
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={listId}
                  aria-activedescendant={optionId(active)}
                  aria-autocomplete="list"
                  placeholder={t("filter")}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    // Filtering changes what is at each index, so a stale active row would
                    // highlight, and Enter would choose, something unrelated.
                    setActive(0);
                  }}
                />
              </label>
            )}

            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={label}
              className="scroll-inset max-h-56 overflow-y-auto"
            >
              {shown.length === 0 ? (
                <p className="faint px-3 py-4">{t("nothingMatches")}</p>
              ) : (
                shown.map((option, index) => {
                  const selected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      id={optionId(index)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      // Not focusable: focus stays on the trigger or the filter, and the active row
                      // is communicated by aria-activedescendant instead.
                      tabIndex={-1}
                      className={`option ${index === active ? "is-active" : ""}`}
                      onClick={() => choose(option.value)}
                      onMouseMove={() => setActive(index)}
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
