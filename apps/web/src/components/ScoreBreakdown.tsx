"use client";

import { useTranslations } from "next-intl";

import type { ForecastHour } from "@/lib/api";

// Keys only. The displayed word is looked up per locale, so this table cannot drift from the
// catalogue the way a hard-coded pair of key and label would.
const FACTORS = [
  ["size", "factorSize"],
  ["period", "factorPeriod"],
  ["wind", "factorWind"],
  ["exposure", "factorExposure"],
] as const;

/**
 * Why the score is what it is.
 *
 * The conjunctive mean means the weakest factor decides the total, so naming that factor is the whole
 * explanation. Shared by the map's detail panel and the spot page, because an explanation that differs
 * between two views of the same number is worse than none.
 */
export default function ScoreBreakdown({
  hour,
  bare = false,
}: {
  hour: ForecastHour;
  bare?: boolean;
}) {
  const t = useTranslations("spot");
  const rows = FACTORS.map(([key, label]) => ({ key, label: t(label), value: hour[key] }));
  const scored = rows.filter((r) => r.value !== null);
  if (scored.length === 0) return null;
  const weakest = scored.reduce((a, b) => (b.value! < a.value! ? b : a));

  return (
    <section className={bare ? "" : "mt-4 border-t border-hairline pt-3.5"}>
      <h3 className="section-title">{t("whyThisScore")}</h3>
      <div className="mt-2.5 grid gap-2">
        {rows.map(({ key, label, value }) => {
          const isWeakest = key === weakest.key;
          return (
            <div key={key} className="grid grid-cols-[66px_1fr_30px] items-center gap-3">
              <span className={`text-meta ${isWeakest ? "text-secondary" : "text-faint"}`}>
                {label}
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-inset">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(value ?? 0) * 100}%`,
                    background: isWeakest ? "var(--color-accent)" : "var(--color-edge)",
                  }}
                />
              </span>
              <span className="text-right text-meta font-semibold tabular-nums text-primary">
                {value === null ? "-" : value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="meta mt-3 text-faint">
        {t.rich("weakest", {
          factor: weakest.label,
          // Emphasised because the weakest factor IS the explanation: with a conjunctive mean, that
          // one number decides the total, and it was previously the same weight as the words around it.
          b: (chunks) => <span className="font-semibold text-secondary">{chunks}</span>,
        })}
      </p>
    </section>
  );
}
