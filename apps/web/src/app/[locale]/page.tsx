"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import AuthMenu from "@/components/AuthMenu";
import LanguageSwitch from "@/components/LanguageSwitch";
import Chip from "@/components/Chip";
import { useFavourites } from "@/components/FavouritesProvider";
import FirstRunCard from "@/components/FirstRunCard";
import MarkCounter from "@/components/MarkCounter";
import Footer from "@/components/Footer";
import LogSessionSheet from "@/components/LogSessionSheet";
import SessionsSheet from "@/components/SessionsSheet";
import RankedList from "@/components/RankedList";
import SpotDetail from "@/components/SpotDetail";
import WaveLoader from "@/components/WaveLoader";
import Wordmark from "@/components/Wordmark";
import { getScores, getSpots, type ScoreNow, type SessionRow, type Spot } from "@/lib/api";
import { useGeolocation } from "@/lib/useGeolocation";
import { rankSpots, type SortMode } from "@/lib/rank";
import { thinSpots } from "@/lib/thin";
import { scoreColor, scoreLabel, scoreWordKey } from "@/lib/score";

// Leaflet touches window, so the map is browser-only.
const SpotMap = dynamic(() => import("@/components/SpotMap"), {
  ssr: false,
  loading: () => <MapLoading />,
});

/** Separate because dynamic()'s loading option runs outside any component, so it cannot call hooks. */
function MapLoading() {
  const t = useTranslations("map");
  return (
    <div className="grid h-full w-full place-items-center bg-water">
      <WaveLoader label={t("loading")} />
    </div>
  );
}

function TopBar({
  query,
  onQuery,
  loading,
  onShowSessions,
  onLogSession,
}: {
  query: string;
  onQuery: (v: string) => void;
  loading: boolean;
  onShowSessions: () => void;
  onLogSession: () => void;
}) {
  const t = useTranslations("nav");
  return (
    <header className="z-[1000] flex h-16 flex-none items-center gap-3 border-b border-hairline bg-panel px-4 shadow-[var(--shadow-1)]">
      {/* Inlined so the radar in the O can ping, faster while data is in flight. flex-none because
          otherwise the bar's other controls shrink the logo instead of themselves. */}
      <Wordmark className="h-8 w-auto flex-none" pinging={loading} />

      <label className="field ml-2 w-full max-w-64" aria-label={t("search")}>
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="flex-none opacity-50">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("search")}
          type="search"
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        <span className="pill hidden md:inline-flex">{t("region")}</span>
        <span className="pill hidden lg:inline-flex">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-accent)" }}
            aria-hidden
          />
          {t('updated')}
        </span>
        {/* Permanent, and that is the point of it. Logging a session used to live only inside the
            spot panel, which you reach by picking a spot and scrolling: buried, for the one action
            the whole project depends on. The intro card explains it once; this keeps it reachable
            forever after the card is dismissed. */}
        <button className="btn btn-primary hidden h-[2.125rem] min-h-0 sm:inline-flex" onClick={onLogSession}>
          {t("logCta")}
        </button>
        <MarkCounter />
        <LanguageSwitch />
        <AuthMenu onShowSessions={onShowSessions} />
      </div>
    </header>
  );
}

function HomeInner() {
  // Read once for the initial selection. Reading it on every render would fight the shallow URL
  // updates below, which deliberately do not re-run the router.
  const t = useTranslations("home");
  const words = useTranslations("score");
  const { isFavourite, favourites } = useFavourites();
  const params = useSearchParams();
  const initialSpot = params.get("spot");
  // The spot page's breadcrumb links here filtered to a region, so the filter has to be addressable.
  // Read once for the same reason as the selection above: later typing owns the state, not the URL.
  const initialQuery = params.get("q") ?? "";
  const [spots, setSpots] = useState<Spot[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreNow>>({});
  const [picked, setPicked] = useState<string | null>(initialSpot);
  const [failed, setFailed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"spot" | "list">("spot");
  const [query, setQuery] = useState(initialQuery);
  const [hovered, setHovered] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [sort, setSort] = useState<SortMode>("score");
  // Starts at the map's own initial zoom, then tracks it. Thinning depends on this.
  const [zoom, setZoom] = useState(10);
  const geo = useGeolocation();

  useEffect(() => {
    let active = true;
    Promise.all([getSpots(), getScores()])
      .then(([spotRows, scoreRows]) => {
        if (!active) return;
        setSpots(spotRows);
        setScores(Object.fromEntries(scoreRows.map((r) => [r.slug, r])));
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  // Favourites first, then best first, unscored last. The rule lives in lib/rank so it can be tested
  // without mounting a map.
  const ranked = useMemo(
    () => rankSpots(spots, scores, isFavourite, sort, geo.position),
    [spots, scores, isFavourite, sort, geo.position]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(
      (s) => s.name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q)
    );
  }, [ranked, query]);

  // Only the leading spots get a numbered badge on the map; the rest stay as dots, so the map
  // never turns into a wall of overlapping labels.
  const featured = useMemo(
    () => new Set(ranked.slice(0, 6).map((s) => s.slug)),
    [ranked]
  );

  // Derived, not stored: the default selection is simply the best spot.
  const selected = picked ?? ranked[0]?.slug ?? null;
  const selectedSpot = selected ? spots.find((s) => s.slug === selected) : undefined;
  const best = ranked[0];
  const bestScore = best ? (scores[best.slug]?.score ?? null) : null;

  // The map draws `visible`, not `spots`. Searching used to filter only the list, which meant typing
  // a name narrowed the rail to one row while the map carried on showing all 92 pins: the two halves
  // of the same screen disagreed about what you had asked for.
  //
  // Thinning is then applied on top, because 92 spots live in a 48 km strip and at the default zoom a
  // pin covers 3.6 km of it. The selected spot and anything marked are pinned open so the map never
  // hides what the rest of the interface is pointing at.
  const thinned = useMemo(
    () =>
      thinSpots({
        spots: visible,
        scores,
        zoom,
        keep: new Set([...favourites, ...(selected ? [selected] : [])]),
      }),
    [visible, scores, zoom, favourites, selected]
  );

  function pick(slug: string) {
    setPicked(slug);
    setSheetTab("spot");
    setSheetOpen(true);
    // replaceState rather than router.push: the map should not remount, and a selection is not a
    // separate history entry to press Back through. The URL still becomes copyable, which is the point.
    window.history.replaceState(null, "", `${window.location.pathname}?spot=${slug}`);
  }

  return (
    <div className="app-shell grid grid-rows-[auto_1fr]">
      <TopBar
        query={query}
        onQuery={setQuery}
        loading={spots.length === 0 && !failed}
        onShowSessions={() => setSessionsOpen(true)}
        onLogSession={() => setLogging(true)}
      />

      <div className="grid min-h-0 md:grid-cols-[19rem_1fr]">
        {/* Rail: a verdict card, then one card per spot. Same shapes as the detail panel. */}
        <aside className="hidden min-h-0 flex-col border-r border-hairline bg-app md:flex">
          <div className="flex flex-col gap-3 p-3">
            <FirstRunCard onLogSession={() => setLogging(true)} />
            <div className="panel p-4">
              <h2 className="section-title">{t("rightNow")}</h2>
              {failed ? (
                <p className="meta mt-2.5" style={{ color: scoreColor(1) }}>
                  {t("unreachable")}
                </p>
              ) : best ? (
                <>
                  <p className="title mt-2 text-primary">
                    {bestScore !== null && bestScore >= 5 ? t("worthGoing") : t("nothingFiring")}
                  </p>
                  <p className="meta mt-1.5 text-secondary">
                    {t("leads", { name: best.name, score: scoreLabel(bestScore) })}
                  </p>
                  <div className="mt-3">
                    <Chip color={scoreColor(bestScore)}>{words(scoreWordKey(bestScore))}</Chip>
                  </div>
                </>
              ) : (
                <WaveLoader label={t("checkingCoast")} className="mt-3 items-start" />
              )}
            </div>
          </div>

          {/* Sort control. Two questions, not two orderings: "where is it good" and "what can I
              actually reach". The second only makes sense once the browser has told us where we are,
              so the button asks for that on tap rather than on load. */}
          <div className="flex items-center gap-1.5 px-4 pb-2">
            <button
              className={`seg ${sort === "score" ? "is-on" : ""}`}
              onClick={() => setSort("score")}
              aria-pressed={sort === "score"}
            >
              {t("sortBest")}
            </button>
            <button
              className={`seg ${sort === "distance" ? "is-on" : ""}`}
              aria-pressed={sort === "distance"}
              disabled={geo.status === "asking"}
              onClick={() => {
                setSort("distance");
                if (!geo.position) geo.request();
              }}
            >
              {geo.status === "asking" ? t("locating") : t("sortNear")}
            </button>
            <span className="label ml-auto">{spots.length ? visible.length : ""}</span>
          </div>

          {/* Refusal is the common case, so it gets a real message rather than silence. The list is
              still sorted by score underneath, which is why this is a note and not an error. */}
          {sort === "distance" && geo.status === "denied" && (
            <p className="faint px-4 pb-2">{t("locationDenied")}</p>
          )}
          {sort === "distance" && geo.status === "unavailable" && (
            <p className="faint px-4 pb-2">{t("locationUnavailable")}</p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto pb-3 pl-3 pr-2">
            {spots.length > 0 && visible.length === 0 ? (
              <p className="faint px-1 py-6">{t("noMatch")}</p>
            ) : (
              <RankedList
                origin={sort === "distance" ? geo.position : null}
                spots={visible}
                scores={scores}
                selected={selected}
                hovered={hovered}
                onSelect={pick}
                onHover={setHovered}
              />
            )}
            {/* End of the list is the only place on this page where content actually ends: the map
                fills the viewport and the shell does not scroll, so a document footer would have
                nowhere to sit. */}
            <Footer bare />
          </div>
        </aside>

        <section className="relative min-h-0">
          <SpotMap
            spots={spots}
            thinned={thinned}
            onZoom={setZoom}
            scores={scores}
            featured={featured}
            favourites={favourites}
            selected={selected}
            hovered={hovered}
            onSelect={pick}
            onHover={setHovered}
          />

          {/* Leaflet's own panes and controls climb to z-index 800, so anything overlaying the
              map has to sit above that or it renders behind the tiles. */}
          {/* Mobile only: the verdict as a single line above the map. */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[900] md:hidden">
            <div className="panel-raised flex items-center gap-2.5 px-3.5 py-2.5">
              {best && !failed ? (
                <>
                  <span className="label flex-none">{t("best")}</span>
                  <span className="truncate text-body font-semibold text-primary">{best.name}</span>
                  <span
                    className="ml-auto flex-none text-value font-extrabold tabular-nums"
                    style={{ color: scoreColor(bestScore) }}
                  >
                    {scoreLabel(bestScore)}
                  </span>
                </>
              ) : (
                <span className="faint truncate">
                  {failed ? t("serviceDown") : t("loading")}
                </span>
              )}
            </div>
          </div>

          {/* Desktop: the selected spot, floating clear of the map edges. */}
          {/* Margins are symmetric by construction rather than by arithmetic. The height cap is
              `100% - 2.5rem`, where 100% is the map area and 2.5rem is bottom-5 plus an equal gap at
              the top, so the panel can never sit closer to one edge than the other. The previous
              version capped at `100dvh - 9.5rem`, a number that had to be kept in step with the
              header height by hand and had drifted: it left 3.25rem above and 1.25rem below. */}
          {selectedSpot && (
            <div className="panel-raised absolute bottom-5 right-5 z-[900] hidden max-h-[calc(100%-2.5rem)] w-[23rem] max-w-[calc(100%-2.5rem)] flex-col p-2 md:flex">
              {/* The scroll lives on the inner box, so the outer padding becomes the scrollbar's
                  margin on the top, bottom and right. min-h-0 is what allows a flex child to be
                  shorter than its content and therefore to scroll at all. */}
              <div className="scroll-inset min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <SpotDetail
                  key={selectedSpot.slug}
                  spot={selectedSpot}
                  now={scores[selectedSpot.slug]}
                  onLogSession={() => setLogging(true)}
                  permalink={`/spot/${selectedSpot.slug}`}
                />
              </div>
            </div>
          )}

          {/* Mobile: a bottom sheet, reachable with a thumb. */}
          <div className="absolute inset-x-0 bottom-0 z-[900] md:hidden">
            <div className="panel-raised rounded-b-none border-x-0 border-b-0 px-4 pb-4 pt-3">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex rounded-full bg-inset p-0.5">
                  {(["spot", "list"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setSheetTab(tab);
                        setSheetOpen(true);
                      }}
                      aria-pressed={sheetTab === tab}
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-micro font-bold uppercase tracking-[0.08em] transition-colors ${
                        sheetTab === tab ? "bg-accent text-white" : "text-secondary"
                      }`}
                    >
                      {tab === "spot" ? t("thisSpot") : t("allSpots")}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setSheetOpen((v) => !v)}
                  aria-expanded={sheetOpen}
                  className="label ml-auto cursor-pointer px-2 py-1.5"
                >
                  {sheetOpen ? t("collapse") : t("expand")}
                </button>
              </div>

              {!sheetOpen && selectedSpot && (
                <button
                  onClick={() => setSheetOpen(true)}
                  className="flex w-full cursor-pointer items-center gap-3 text-left"
                >
                  <span
                    className="grid h-11 w-11 flex-none place-items-center rounded-chip text-title font-extrabold tabular-nums text-badge-ink"
                    style={{ background: scoreColor(scores[selectedSpot.slug]?.score ?? null) }}
                  >
                    {scoreLabel(scores[selectedSpot.slug]?.score ?? null)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-body font-semibold text-primary">
                      {selectedSpot.name}
                    </span>
                    <span className="faint block">
                      {t("tapForWeek", { word: words(scoreWordKey(scores[selectedSpot.slug]?.score ?? null)) })}
                    </span>
                  </span>
                </button>
              )}

              {sheetOpen && (
                <div className="max-h-[46dvh] overflow-y-auto pr-1.5">
                  {sheetTab === "spot" && selectedSpot ? (
                    <SpotDetail
                      key={selectedSpot.slug}
                      spot={selectedSpot}
                      now={scores[selectedSpot.slug]}
                      onLogSession={() => setLogging(true)}
                      permalink={`/spot/${selectedSpot.slug}`}
                    />
                  ) : (
                    <div className="pb-1">
                      <RankedList
                        spots={visible}
                        scores={scores}
                        selected={selected}
                        hovered={hovered}
                        onSelect={pick}
                        onHover={setHovered}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {sessionsOpen && (
        <SessionsSheet
          onClose={() => setSessionsOpen(false)}
          onEdit={(session) => {
            // The editor replaces the list rather than stacking on top of it, and closing the editor
            // brings the list back, so editing several in a row does not mean reopening the menu.
            setSessionsOpen(false);
            setEditing(session);
          }}
        />
      )}

      {(logging || editing) && (
        <LogSessionSheet
          spots={spots}
          defaultSlug={selected}
          initial={editing}
          onClose={() => {
            const cameFromList = editing !== null;
            setEditing(null);
            setLogging(false);
            if (cameFromList) setSessionsOpen(true);
          }}
        />
      )}
    </div>
  );
}

/**
 * useSearchParams opts a route into dynamic rendering unless it sits inside Suspense, so the boundary
 * is what keeps this page prerenderable at build time.
 */
export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
