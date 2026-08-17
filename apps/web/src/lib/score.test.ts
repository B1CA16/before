import { describe, expect, it } from "vitest";

import { SCORE_COLORS, scoreColor, scoreLabel, scoreWord, windLabel } from "./score";

describe("score helpers", () => {
  it("labels a score to one decimal, dash for null", () => {
    expect(scoreLabel(8.24)).toBe("8.2");
    expect(scoreLabel(null)).toBe("-");
  });

  it("maps each score band to its own colour", () => {
    expect(scoreColor(null)).toBe(SCORE_COLORS.unknown);
    expect(scoreColor(1)).toBe(SCORE_COLORS.flat);
    expect(scoreColor(4)).toBe(SCORE_COLORS.marginal);
    expect(scoreColor(6)).toBe(SCORE_COLORS.fun);
    expect(scoreColor(8)).toBe(SCORE_COLORS.firing);
    // every band is visually distinct
    expect(new Set(Object.values(SCORE_COLORS)).size).toBe(5);
  });

  it("describes a score in plain words", () => {
    expect(scoreWord(8)).toBe("firing");
    expect(scoreWord(6)).toBe("fun");
    expect(scoreWord(4)).toBe("marginal");
    expect(scoreWord(1)).toBe("flat");
    expect(scoreWord(null)).toBe("no reading");
  });

  it("labels wind from the offshore component", () => {
    expect(windLabel(0.8)).toBe("offshore");
    expect(windLabel(-0.8)).toBe("onshore");
    expect(windLabel(0)).toBe("cross-shore");
    expect(windLabel(null)).toBe("-");
  });
});
