import { describe, expect, it } from "vitest";

import { scoreColor, scoreLabel, windLabel } from "./score";

describe("score helpers", () => {
  it("labels a score to one decimal, dash for null", () => {
    expect(scoreLabel(8.24)).toBe("8.2");
    expect(scoreLabel(null)).toBe("-");
  });

  it("maps scores to distinct colors, grey for null", () => {
    const good = scoreColor(8);
    const poor = scoreColor(2);
    const unknown = scoreColor(null);
    expect(good).not.toBe(poor);
    expect(unknown).toBe("#9ca3af"); // grey
  });

  it("labels wind from the offshore component", () => {
    expect(windLabel(0.8)).toBe("offshore");
    expect(windLabel(-0.8)).toBe("onshore");
    expect(windLabel(0)).toBe("cross-shore");
    expect(windLabel(null)).toBe("-");
  });
});
