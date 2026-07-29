// Colorblind-aware ramp: grey (unknown) -> red (poor) -> amber -> lime -> green (good).
export function scoreColor(score: number | null): string {
  if (score === null) return "#9ca3af"; // grey
  if (score < 3) return "#dc2626"; // red
  if (score < 5) return "#f59e0b"; // amber
  if (score < 7) return "#84cc16"; // lime
  return "#16a34a"; // green
}

export function scoreLabel(score: number | null): string {
  return score === null ? "-" : score.toFixed(1);
}

// offshore_component: +1 = fully offshore (clean), -1 = fully onshore (choppy).
export function windLabel(offshoreComponent: number | null): string {
  if (offshoreComponent === null) return "-";
  if (offshoreComponent > 0.3) return "offshore";
  if (offshoreComponent < -0.3) return "onshore";
  return "cross-shore";
}
