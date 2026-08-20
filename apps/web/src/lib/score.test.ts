import { describe, expect, it } from "vitest";

import { SCORE_COLORS, scoreColor, scoreLabel, scoreWordKey, windWordKey } from "./score";

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
    expect(scoreWordKey(8)).toBe("firing");
    expect(scoreWordKey(6)).toBe("fun");
    expect(scoreWordKey(4)).toBe("marginal");
    expect(scoreWordKey(1)).toBe("flat");
    expect(scoreWordKey(null)).toBe("unknown");
  });

  it("labels wind from the offshore component", () => {
    expect(windWordKey(0.8)).toBe("offshore");
    expect(windWordKey(-0.8)).toBe("onshore");
    expect(windWordKey(0)).toBe("cross");
    expect(windWordKey(null)).toBe("unknown");
  });
});

describe("verdict keys and message catalogues", () => {
  it("every key a score can produce exists in both languages", async () => {
    // The catalogues are the words; this file decides which word. If they drift, the interface renders
    // a raw key like "firing" to a user, which is the kind of bug that ships unnoticed.
    const [en, pt] = await Promise.all([
      import("../../messages/en.json"),
      import("../../messages/pt.json"),
    ]);
    const scores = [null, 0, 2.9, 3, 4.9, 5, 6.9, 7, 10];
    const winds = [null, 1, 0.31, 0.3, 0, -0.3, -0.31, -1];
    for (const catalogue of [en.default, pt.default]) {
      for (const score of scores) {
        expect(catalogue.score[scoreWordKey(score)]).toBeTruthy();
      }
      for (const wind of winds) {
        expect(catalogue.wind[windWordKey(wind)]).toBeTruthy();
      }
    }
  });
});
