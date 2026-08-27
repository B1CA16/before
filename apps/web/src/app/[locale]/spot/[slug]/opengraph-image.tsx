import { ImageResponse } from "next/og";

import { getTranslations } from "next-intl/server";

import { getSpotWithScore } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/score";

/**
 * The card a shared spot link unfurls into.
 *
 * Built per spot rather than one static image, because the whole value of sharing a surf link is the
 * number: "Coxos is 7.2 right now" is worth opening, a generic logo is not.
 *
 * Written with inline styles and no component imports on purpose. `next/og` renders through Satori,
 * which supports a deliberately small subset of CSS: no external stylesheets, so none of the app's
 * design-token classes are available.
 *
 * Satori's sharpest edge, learned the hard way here: **any element with more than one child must
 * declare `display`**. `<div>{swell.toFixed(1)} m</div>` looks like one string but is two child nodes,
 * the interpolated number and the literal " m", and it fails the whole render with "Expected <div> to
 * have explicit display: flex". Hence the template literals below, which produce a single text node.
 *
 * Note also how this failed: `next build` passed cleanly, because this route is rendered on demand
 * rather than prerendered, so the build never executed it. A green build says nothing about a dynamic
 * route; only requesting it does.
 *
 * The colour comes from `scoreColor` rather than being retyped here, so a card can never disagree
 * with the app about what 7.2 looks like.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same cadence as the page. A card showing an hour-old score is fine; one showing yesterday is not.
export const revalidate = 3600;

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const data = await getSpotWithScore(slug).catch(() => null);

  const spot = data?.spot;
  const score = data?.now?.score ?? null;
  const colour = scoreColor(score);
  const label = spot ? scoreLabel(score) : "";

  // Accented, like the rest of the app. Written unaccented at first out of a vague worry about font
  // coverage, which is exactly the sloppiness that would ship "PONTUACAO" to every shared link;
  // Satori's bundled Noto Sans covers Latin-1, and the render below is the proof.
  const strings =
    locale === "pt"
      ? {
          tag: "PONTUAÇÃO AGORA",
          swell: "ONDULAÇÃO",
          period: "PERÍODO",
        }
      : { tag: "SCORE RIGHT NOW", swell: "SWELL", period: "PERIOD" };

  // Regions are our own coarse labels and do translate ("Lisbon" is "Lisboa" in Portuguese), so use
  // the same catalogue the pages use rather than printing the raw database value on a shared card.
  const regions = await getTranslations({ locale, namespace: "regions" });
  const region = spot?.region
    ? regions.has(spot.region)
      ? regions(spot.region)
      : spot.region
    : locale === "pt"
      ? "Costa de Lisboa"
      : "Lisbon coast";

  const swell = data?.now?.swell_height_m;
  const period = data?.now?.swell_period_s;

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
        {/* A band of the score colour down the left edge, so the card reads at thumbnail size even
            before any text is legible. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 20,
            background: colour,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 800 }}>
          <span style={{ color: "#101828" }}>Be</span>
          <span style={{ color: "#5227e5" }}>FORE</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              color: "#98a2b3",
              marginBottom: 14,
            }}
          >
            {strings.tag}
          </div>
          <div
            style={{
              fontSize: spot && spot.name.length > 24 ? 74 : 92,
              fontWeight: 800,
              color: "#101828",
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {spot?.name ?? "BeFORE"}
          </div>
          <div style={{ fontSize: 32, color: "#4a5567", marginTop: 16 }}>{region}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {swell != null && (
              <div style={{ display: "flex", flexDirection: "column", marginRight: 56 }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: "#98a2b3" }}>
                  {strings.swell}
                </div>
                <div style={{ fontSize: 44, fontWeight: 700, color: "#101828" }}>
                  {`${swell.toFixed(1)} m`}
                </div>
              </div>
            )}
            {period != null && (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: 2, color: "#98a2b3" }}>
                  {strings.period}
                </div>
                <div style={{ fontSize: 44, fontWeight: 700, color: "#101828" }}>
                  {`${Math.round(period)} s`}
                </div>
              </div>
            )}
          </div>

          {/* The number, on the same colour the app uses for it. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 220,
              height: 220,
              borderRadius: 44,
              background: colour,
              color: score === null ? "#ffffff" : "#0d1117",
              fontSize: 108,
              fontWeight: 800,
              letterSpacing: -4,
            }}
          >
            {label || "?"}
          </div>
        </div>
      </div>
    ),
    size
  );
}
