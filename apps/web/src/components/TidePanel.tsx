"use client";

import { useTranslations } from "next-intl";

import { TideIcon, TrendIcon } from "@/components/Icons";
import type { ForecastHour } from "@/lib/api";
import { formatHour, nextTideTurn, tideLabel } from "@/lib/forecast";

/**
 * Tide, deliberately shown and deliberately not scored.
 *
 * Surfers ask about tide before almost anything else, so leaving it out cost the product credibility.
 * It stays out of the BeFORE score though: scoring it needs to know which state each spot works best
 * at, which is per-spot bathymetry we do not have. Presenting it plainly lets a surfer apply their own
 * local knowledge, which is more honest than inventing a rule and hiding it inside a number.
 *
 * Shared by the map's detail panel and the spot page. `bare` switches between sitting inside an
 * existing panel and being its own card, which is the only difference between the two uses.
 */
export default function TidePanel({
  hours,
  locale,
  bare = false,
}: {
  hours: ForecastHour[];
  locale: string;
  bare?: boolean;
}) {
  const t = useTranslations("tide");
  const ts = useTranslations("spot");
  const now = hours[0];
  if (!now || now.sea_level_m === null) return null;
  const turn = nextTideTurn(hours);

  return (
    <section className={bare ? "" : "mt-4 border-t border-hairline pt-3.5"}>
      <h3 className="section-title flex items-center gap-1.5">
        <TideIcon size={13} className="text-faint" />
        {t("title")}
      </h3>
      <div className="mt-2.5 flex items-baseline justify-between gap-3">
        <span className="value flex items-center gap-1.5 text-primary">
          {tideLabel(now.sea_level_m)}
          {now.tide_rising !== null && (
            <span className="meta flex items-center gap-1 text-secondary">
              <TrendIcon up={now.tide_rising} size={13} />
              {now.tide_rising ? t("rising") : t("falling")}
            </span>
          )}
        </span>
        {turn && (
          <span className="text-meta text-faint">
            {t(turn.kind)} {ts("at")}{" "}
            <span className="font-semibold text-accent-ink">{formatHour(turn.at, locale)}</span>
          </span>
        )}
      </div>
      {/* A bar rather than a number, because "0.62 of the range" means nothing to a person. */}
      {now.tide_state !== null && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className="label flex-none">{t("lowLabel")}</span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-inset">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.round(now.tide_state * 100)}%`,
                background: "var(--color-accent)",
              }}
            />
          </span>
          <span className="label flex-none">{t("highLabel")}</span>
        </div>
      )}
    </section>
  );
}
