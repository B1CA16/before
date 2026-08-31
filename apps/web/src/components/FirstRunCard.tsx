"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";

/** One key, versioned, so a future rewrite of the copy can be shown again to people who dismissed v1. */
const KEY = "before.intro.v1";

/** Nothing outside this component ever changes the flag, so there is nothing to subscribe to. */
const subscribe = () => () => {};

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "dismissed";
  } catch {
    // Private browsing can throw on localStorage. Treating that as "not dismissed" shows the card,
    // which is the safer failure: worst case someone sees it twice, rather than a first-time visitor
    // never seeing it at all.
    return false;
  }
}

/**
 * What this app is, for someone who has just arrived.
 *
 * A visitor lands on a map of numbers with nothing saying what a number means, where it came from, or
 * that they could improve it. That last part is not a nicety: ratings are the only source of training
 * data this project has, and nobody contributes to something they were never asked to contribute to.
 *
 * Dismissible and remembered, because an explanation you cannot turn off stops being an explanation
 * and becomes furniture.
 *
 * `useSyncExternalStore` rather than reading localStorage in an effect. The server cannot see
 * localStorage, so the server snapshot reports "dismissed" and the card renders nothing during SSR,
 * then appears on hydration if it has not been dismissed. That avoids both a hydration mismatch and
 * the flash of an explanation being ripped away from someone who closed it months ago. Doing it with
 * `useEffect` plus `setState` works too, but it is a cascading render that React now warns about.
 */
export default function FirstRunCard({ onLogSession }: { onLogSession: () => void }) {
  const t = useTranslations("intro");
  const stored = useSyncExternalStore(subscribe, readDismissed, () => true);
  // Separate from the stored flag: dismissing is an event, and re-rendering from an event handler is
  // exactly what state is for.
  const [dismissedNow, setDismissedNow] = useState(false);

  if (stored || dismissedNow) return null;

  function dismiss() {
    setDismissedNow(true);
    try {
      window.localStorage.setItem(KEY, "dismissed");
    } catch {
      // Dismissed for this visit at least.
    }
  }

  return (
    <div className="intro-card">
      <div className="flex items-center gap-2">
        <h2 className="section-title text-accent">{t("title")}</h2>
        <button className="intro-x" onClick={dismiss} aria-label={t("dismiss")} title={t("dismiss")}>
          <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <ol className="intro-steps">
        {[t("step1"), t("step2"), t("step3")].map((step, i) => (
          <li key={i}>
            <span className="intro-n">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <button className="btn btn-primary mt-3 w-full" onClick={onLogSession}>
        {t("cta")}
      </button>
    </div>
  );
}
