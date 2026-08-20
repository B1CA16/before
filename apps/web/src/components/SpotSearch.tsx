"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import AnchoredPanel from "@/components/AnchoredPanel";
import { useRouter } from "@/i18n/navigation";
import type { Spot } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/score";

/**
 * Search from the spot page, so a spot report is not a dead end.
 *
 * The map has a search field and the report did not, which meant the only way from one beach to another
 * was back out to the map and in again. The list is already on the page for the nearby section, so this
 * costs nothing extra to serve.
 *
 * Matches on region as well as name, matching the behaviour of the map's own filter.
 */
export default function SpotSearch({
  spots,
  scores = {},
}: {
  spots: Spot[];
  scores?: Record<string, number | null>;
}) {
  const t = useTranslations("nav");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [fieldEl, setFieldEl] = useState<HTMLLabelElement | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return spots
      .filter((s) => s.name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q))
      .slice(0, 8);
  }, [spots, query]);

  function go(slug: string) {
    setQuery("");
    router.push(`/spot/${slug}`);
  }

  return (
    <>
      <label ref={setFieldEl} className="field w-full max-w-64" aria-label={t("search")}>
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="flex-none opacity-50">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter takes the first match, which is what anyone who typed a name expects.
            if (e.key === "Enter" && matches[0]) go(matches[0].slug);
          }}
        />
      </label>

      {query.trim() !== "" && fieldEl && (
        <AnchoredPanel anchorEl={fieldEl} minWidth={240} onDismiss={() => setQuery("")}>
          <div className="panel-raised p-2" role="listbox" aria-label={t("search")}>
            {matches.length === 0 ? (
              <p className="faint px-3 py-3">{t("noMatch")}</p>
            ) : (
              matches.map((spot) => {
                const score = scores[spot.slug] ?? null;
                return (
                  <button
                    key={spot.slug}
                    role="option"
                    aria-selected={false}
                    className="option"
                    onClick={() => go(spot.slug)}
                  >
                    <span className="truncate">{spot.name}</span>
                    <span
                      className="flex-none font-semibold tabular-nums"
                      style={{ color: scoreColor(score) }}
                    >
                      {scoreLabel(score)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </AnchoredPanel>
      )}
    </>
  );
}
