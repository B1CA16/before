"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useFocusTrap } from "@/lib/useFocusTrap";
import AnchoredPanel from "@/components/AnchoredPanel";
import DayPicker from "@/components/DayPicker";
import GoogleSignIn from "@/components/GoogleSignIn";
import Select from "@/components/Select";
import {
  getConditionsAt,
  logSession,
  SESSION_TAGS,
  type ConditionsAt,
  type SessionRow,
  type SessionTag,
  type Spot,
} from "@/lib/api";
import { localeTag } from "@/lib/forecast";
import { SCORE_COLORS, scoreColor, scoreLabel, windWordKey } from "@/lib/score";

/**
 * Log a surfed session and rate it. This is where labels come from, so a few things are deliberate:
 *
 * - The date and time is an ordinary editable field, not hidden behind an "advanced" toggle. Logging
 *   sessions from memory is the difference between the model having tens of examples and having a
 *   handful, so retrospective entry is the primary case, not an edge case.
 * - The conditions we hold for the chosen hour are shown before submitting, so a wrong date is
 *   visible rather than silently producing a mislabelled example. When we hold nothing for that hour
 *   it says so, because such a session cannot become training data at all.
 * - Rating is five buttons rather than a dropdown: one tap, and large enough for cold hands.
 */

/**
 * Snap to the top of the hour.
 *
 * Conditions are stored hourly and the training join truncates to the hour, so minutes carry no
 * information at all. Dropping them is not just tidiness: `surfed_at` is part of the natural key, so
 * logging the same session twice at 08:23 and 08:47 would otherwise create two rows for one session,
 * defeating the upsert. On the hour, a second submission updates the first.
 */
function onTheHour(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function formatDay(date: Date, tag: string): string {
  return date.toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" });
}

// Keys, resolved where they are rendered, so the wording lives in the catalogues.
const RATING_HINT_KEYS = ["rating1", "rating2", "rating3", "rating4", "rating5"] as const;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

/**
 * Shortcuts for when a session actually happened. Almost every entry is today or yesterday, morning
 * or evening, so these cover the common cases in one tap and leave the picker for the long tail.
 */
function presets(now: Date): { key: string; at: Date }[] {
  const at = (daysAgo: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  // Three, so they sit on one row. A fourth wrapped onto a line of its own and read as a mistake.
  // These are the cases that actually occur: just got out, surfed at dawn and logging later, or
  // catching up on yesterday. Anything else is a few taps in the field below.
  const out = [{ key: "now", at: onTheHour(now) }];
  const thisMorning = at(0, 8);
  // Only offer this morning once it has actually happened.
  if (thisMorning <= now) out.push({ key: "thisMorning", at: thisMorning });
  out.push({ key: "yesterday", at: at(1, 8) });
  return out;
}

export default function LogSessionSheet({
  spots,
  defaultSlug,
  initial = null,
  onClose,
  onLogged,
}: {
  spots: Spot[];
  defaultSlug: string | null;
  /** Present when editing an existing session rather than logging a new one. */
  initial?: SessionRow | null;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const t = useTranslations("log");
  // Focus in, Tab trapped, Escape closes, focus restored. The dialog already claimed aria-modal;
  // this is what makes that claim true.
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const tTags = useTranslations("tags");
  const tAuth = useTranslations("auth");
  const tSpot = useTranslations("spot");
  const winds = useTranslations("wind");
  const locale = useLocale();
  const tag = localeTag(locale);
  const { user, getToken } = useAuth();
  // Editing needs no separate endpoint: POST upserts on (user, spot, surfed_at), so re-submitting the
  // same key updates. The consequence is that spot and time are the session's identity, so they are
  // locked below. Changing one would create a second session rather than move this one.
  const editing = initial !== null;

  const [slug, setSlug] = useState(initial?.slug ?? defaultSlug ?? spots[0]?.slug ?? "");
  const [when, setWhen] = useState(() =>
    onTheHour(initial ? new Date(initial.surfed_at) : new Date())
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [whenRowEl, setWhenRowEl] = useState<HTMLDivElement | null>(null);
  const [dateBtnEl, setDateBtnEl] = useState<HTMLButtonElement | null>(null);
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [tags, setTags] = useState<SessionTag[]>((initial?.tags ?? []) as SessionTag[]);
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [conditions, setConditions] = useState<ConditionsAt | null>(null);
  const [checking, setChecking] = useState(false);

  // Look up what we hold for the chosen spot and hour. Still debounced: changing the hour repeatedly
  // should not fire a request per click.
  useEffect(() => {
    if (!slug) return;
    const at = when;
    let active = true;
    // setChecking lives inside the timeout, not in the effect body. Partly because
    // react-hooks/set-state-in-effect forbids the latter, and partly because it is more honest: we
    // are not checking anything during the debounce window, only after it elapses.
    const timer = setTimeout(() => {
      if (!active) return;
      setChecking(true);
      getConditionsAt(slug, at.toISOString())
        .then((row) => active && setConditions(row))
        .catch(() => active && setConditions(null))
        .finally(() => active && setChecking(false));
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [slug, when]);

  function pickDay(day: Date) {
    // Keep the chosen hour, change only the date.
    const next = new Date(day);
    next.setHours(when.getHours(), 0, 0, 0);
    setWhen(next);
    setCalendarOpen(false);
  }

  function toggleTag(tag: SessionTag) {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === null) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError(tAuth("expired"));
        return;
      }
      // toISOString carries the offset, which the API requires: a timestamp without one would have
      // to be guessed, and a wrong guess pairs the rating with a different hour's conditions.
      await logSession(token, {
        slug,
        surfed_at: when.toISOString(),
        rating,
        tags,
        note: note.trim() === "" ? null : note.trim(),
      });
      setDone(true);
      onLogged?.();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function logAnother() {
    setDone(false);
    setRating(null);
    setTags([]);
    setNote("");
  }

  const spotName = spots.find((s) => s.slug === slug)?.name ?? slug;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
      {/* Scrim. Clicking it closes, which is what everyone expects of a dimmed backdrop. */}
      <button
        className="absolute inset-0 cursor-default bg-[rgba(16,24,40,0.45)]"
        onClick={onClose}
        aria-label={t("cancel")}
        tabIndex={-1}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="panel-raised relative w-full max-w-[26rem] rounded-b-none p-1 sm:rounded-panel"
      >
        <div className="scroll-inset max-h-[86dvh] overflow-y-auto px-4 py-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="title text-primary">
                {done ? t("savedTitle") : editing ? t("editTitle") : t("title")}
              </h2>
              <p className="faint mt-0.5">
                {done ? (editing ? t("updated") : t("thanks")) : editing ? t("editSubtitle") : t("subtitle")}
              </p>
            </div>
            <button className="btn btn-quiet flex-none px-3" onClick={onClose}>
              {done ? t("done") : t("cancel")}
            </button>
          </header>

          {!user ? (
            <div className="mt-4">
              <p className="meta text-secondary">
                {t("signInFirst")}
              </p>
              <div className="mt-3">
                <GoogleSignIn />
              </div>
            </div>
          ) : done ? (
            <div className="mt-4">
              <p className="meta text-secondary">
                {t("ratedSummary", { name: spotName, rating: rating ?? 0 })}
              </p>
              {!editing && (
                <button className="btn btn-primary mt-3 w-full" onClick={logAnother}>
                  {t("logAnother")}
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4">
              <label className="label block" htmlFor="session-spot">
                {t("spot")}
              </label>
              {/* Searchable: there are 92 spots, and scrolling to find one is not a select. */}
              <Select
                id="session-spot"
                className="mt-1.5"
                label={t("spot")}
                searchable
                disabled={editing}
                value={slug}
                options={spots.map((s) => ({ value: s.slug, label: s.name }))}
                onChange={setSlug}
              />

              <label className="label mt-3.5 block" htmlFor="session-when">
                {t("when")}
              </label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {presets(new Date()).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="toggle"
                    disabled={editing}
                    aria-pressed={when.getTime() === p.at.getTime()}
                    onClick={() => {
                      setWhen(p.at);
                      setCalendarOpen(false);
                    }}
                  >
                    {t(p.key)}
                  </button>
                ))}
              </div>

              <div ref={setWhenRowEl} className="relative mt-1.5 flex gap-1.5">
                <button
                  ref={setDateBtnEl}
                  id="session-when"
                  type="button"
                  className="control flex-1 text-left"
                  aria-expanded={calendarOpen}
                  disabled={editing}
                  onClick={() => setCalendarOpen((v) => !v)}
                >
                  <span className="truncate">{formatDay(when, tag)}</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
                    <rect
                      x="2.25"
                      y="3.25"
                      width="11.5"
                      height="10.5"
                      rx="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M2.25 6.5h11.5M5.5 2v2.5M10.5 2v2.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
                {/* Hours only. Conditions are hourly, so a minutes field would offer precision the
                    data does not have. */}
                <Select
                  className="w-28 flex-none"
                  label={t("hour")}
                  minWidth={132}
                  disabled={editing}
                  value={String(when.getHours())}
                  options={HOUR_OPTIONS}
                  onChange={(hour) => {
                    const next = new Date(when);
                    next.setHours(Number(hour), 0, 0, 0);
                    setWhen(next);
                  }}
                />

                {/* Anchored to the row, not the date button, so the month grid gets full width. */}
                {calendarOpen && whenRowEl && (
                  <AnchoredPanel
                    anchorEl={whenRowEl}
                    /* Positioned against the row so the grid gets full width, but owned by the date
                       button, so pointing at the hour select counts as outside and closes this. */
                    triggerEl={dateBtnEl}
                    expectedHeight={380}
                    onDismiss={() => setCalendarOpen(false)}
                  >
                    <DayPicker value={when} max={new Date()} onSelect={pickDay} />
                  </AnchoredPanel>
                )}

              </div>

              <p className="faint mt-1.5">
                {editing ? t("identityLocked") : t("anyPastDate")}
              </p>

              {/* What we hold for that hour, so a wrong date is caught before it becomes a label. */}
              <div className="mt-2.5 rounded-chip bg-inset p-3">
                {checking ? (
                  <p className="faint">{t("checkingConditions")}</p>
                ) : conditions ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="label">{t("onRecord")}</span>
                      <span
                        className="text-meta font-bold tabular-nums"
                        style={{ color: scoreColor(conditions.score) }}
                      >
                        {scoreLabel(conditions.score)}
                      </span>
                    </div>
                    <p className="meta mt-1.5 text-secondary">
                      {conditions.swell_height_m?.toFixed(1) ?? "-"} m {tSpot("at")}{" "}
                      {conditions.swell_period_s?.toFixed(1) ?? "-"} s,{" "}
                      {winds(windWordKey(conditions.offshore_component))}
                    </p>
                    <p className="faint mt-1">
                      {conditions.source === "archive" ? t("measured") : t("forecastOnly")}
                    </p>
                  </>
                ) : (
                  <p className="meta text-secondary">{t("noConditions")}</p>
                )}
              </div>

              <fieldset className="mt-4">
                <legend className="label">{t("howWasIt")}</legend>
                <div className="mt-1.5 flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      aria-pressed={rating === value}
                      className="rating"
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="faint mt-1.5">
                  {rating === null ? t("ratingHint") : t(RATING_HINT_KEYS[rating - 1])}
                </p>
              </fieldset>

              <fieldset className="mt-4">
                <legend className="label">
                  {t("whatStoodOut")} <span className="text-faint">({t("optional")})</span>
                </legend>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SESSION_TAGS.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleTag(name)}
                      aria-pressed={tags.includes(name)}
                      className="toggle"
                    >
                      {tTags(name)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="label mt-4 block" htmlFor="session-note">
                {t("note")}
              </label>
              <textarea
                id="session-note"
                className="control mt-1.5 min-h-16"
                maxLength={500}
                placeholder={t("notePlaceholder")}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

              <button
                type="submit"
                className="btn btn-primary mt-4 w-full"
                disabled={busy || rating === null}
              >
                {busy ? t("saving") : editing ? t("saveChanges") : t("submit")}
              </button>
              {rating === null && <p className="faint mt-1.5 text-center">{t("pickRating")}</p>}

              {error && (
                <p className="meta mt-2" style={{ color: SCORE_COLORS.flat }} role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
