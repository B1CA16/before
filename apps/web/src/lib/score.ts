/**
 * Score semantics.
 *
 * These colours are deliberately NOT the brand violet. A score is data, glanced at in a hurry
 * (often on a phone in a car), so it follows the convention everyone already knows: red is bad,
 * green is good. The brand violet is reserved for interface state in globals.css.
 *
 * The ramp is ordered by lightness as well as hue, and the numeric score is always rendered
 * alongside the colour, so colour is never the only cue.
 */
export const SCORE_COLORS = {
  unknown: "#545879", // violet-tinted grey, "no reading"
  flat: "#e0475f", // under 3
  marginal: "#c67d1e", // 3 to 5
  fun: "#2f9fb5", // 5 to 7
  firing: "#35ad58", // 7 and up
} as const;
/* These four were chosen with the palette validator against a dark surface, not by eye:
   lightness band, chroma floor, normal-vision separation and contrast all pass. The red/amber
   pair sits in the 6 to 8 CVD warning band, which is only acceptable alongside a secondary
   encoding, so every score is rendered with its number and its word as well as its colour.
   An earlier, prettier all-green ramp failed outright (two steps were 5.6 apart, indistinguishable). */

export function scoreColor(score: number | null): string {
  if (score === null) return SCORE_COLORS.unknown;
  if (score < 3) return SCORE_COLORS.flat;
  if (score < 5) return SCORE_COLORS.marginal;
  if (score < 7) return SCORE_COLORS.fun;
  return SCORE_COLORS.firing;
}

/**
 * Which verdict a score earns, as a translation key rather than a word.
 *
 * The thresholds are the product decision and belong here; the wording belongs in the message
 * catalogues. Returning a key keeps the two apart, so translating "a bombar" never risks nudging the
 * boundary at which a score becomes one.
 */
export type ScoreWord = "unknown" | "flat" | "marginal" | "fun" | "firing";

export function scoreWordKey(score: number | null): ScoreWord {
  if (score === null) return "unknown";
  if (score < 3) return "flat";
  if (score < 5) return "marginal";
  if (score < 7) return "fun";
  return "firing";
}

export function scoreLabel(score: number | null): string {
  return score === null ? "-" : score.toFixed(1);
}

// offshore_component: +1 = fully offshore (clean), -1 = fully onshore (choppy).
export type WindWord = "unknown" | "offshore" | "onshore" | "cross";

export function windWordKey(offshoreComponent: number | null): WindWord {
  if (offshoreComponent === null) return "unknown";
  if (offshoreComponent > 0.3) return "offshore";
  if (offshoreComponent < -0.3) return "onshore";
  return "cross";
}

/**
 * How to render the wind correction, or null when there is nothing worth saying.
 *
 * A decision rather than markup, which is why it lives here and is tested. Two cases would
 * otherwise read as bugs to a user: a correction of 0.04 km/h formats as "+0.0", and a correction
 * of exactly nothing is not the same claim as "we looked and left it alone". Both become null.
 *
 * The sign is always explicit. "Wind adjusted by 3.2" leaves the reader guessing which way.
 */
export function windAdjustmentLabel(
  correctionKmh: number | null,
): string | null {
  if (correctionKmh === null || !Number.isFinite(correctionKmh)) return null;
  const rounded = Number(correctionKmh.toFixed(1));
  if (rounded === 0) return null;
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1);
}
