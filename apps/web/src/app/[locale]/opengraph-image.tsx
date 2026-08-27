import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";

import { getScoresCached, getSpotsCached } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/score";

/**
 * The card the home page unfurls into, and by inheritance the legal pages too.
 *
 * It shows the best spot on the coast right now rather than a logo, because that is the whole promise
 * of the product in one line: a shared link that says "Praia da Calada, 6.2 right now" is worth
 * opening, and a wordmark on a gradient is not.
 *
 * Same Satori constraints as the spot card next door: inline styles only, and every element with more
 * than one child must declare `display`. Text is assembled into single template literals for exactly
 * that reason.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  // A dead API must still produce a card, so the whole lookup is optional.
  let best: { name: string; score: number | null } | null = null;
  try {
    const [spots, scores] = await Promise.all([getSpotsCached(), getScoresCached()]);
    const byScore = [...scores].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const top = byScore[0];
    const spot = top ? spots.find((s) => s.slug === top.slug) : undefined;
    if (spot && top) best = { name: spot.name, score: top.score };
  } catch {
    // Fall through to the brand-only card below.
  }

  const colour = scoreColor(best?.score ?? null);
  const leadLabel = locale === "pt" ? "MELHOR AGORA" : "BEST RIGHT NOW";
  const tagline =
    locale === "pt"
      ? "Pontuações de surf hora a hora para a costa de Lisboa"
      : "Hourly surf scores for the Lisbon coast";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "68px 76px",
          background: "#f4f6f8",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 20, background: colour }}
        />

        <div style={{ display: "flex", alignItems: "center", fontSize: 38, fontWeight: 800 }}>
          <span style={{ color: "#101828" }}>Be</span>
          <span style={{ color: "#5227e5" }}>FORE</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 44, color: "#4a5567", lineHeight: 1.25 }}>{tagline}</div>
        </div>

        {best ? (
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 3, color: "#98a2b3" }}>
                {leadLabel}
              </div>
              <div
                style={{
                  fontSize: best.name.length > 22 ? 58 : 70,
                  fontWeight: 800,
                  color: "#101828",
                  letterSpacing: -2,
                  marginTop: 10,
                }}
              >
                {best.name}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 200,
                height: 200,
                borderRadius: 40,
                background: colour,
                color: best.score === null ? "#ffffff" : "#0d1117",
                fontSize: 100,
                fontWeight: 800,
                letterSpacing: -4,
              }}
            >
              {scoreLabel(best.score)}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 30, color: "#98a2b3" }}>{t("title")}</div>
        )}
      </div>
    ),
    size
  );
}
