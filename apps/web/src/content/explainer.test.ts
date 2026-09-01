import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXPLAINER,
  LIVE,
  SNIPPETS,
  type Block,
  type ExplainerDoc,
  type SnippetKey,
} from "./explainer";

const LOCALES = ["pt", "en"] as const;
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

function blockKind(block: Block): string {
  if ("p" in block) return "p";
  if ("list" in block) return "list";
  if ("table" in block) return "table";
  if ("code" in block) return "code";
  if ("note" in block) return "note";
  if ("steps" in block) return "steps";
  if ("stats" in block) return "stats";
  return "chart";
}

function allText(doc: ExplainerDoc): string[] {
  const out = [doc.title, doc.summary];
  for (const chapter of doc.chapters) {
    out.push(chapter.heading, chapter.lede);
    for (const block of chapter.blocks) {
      if ("p" in block) out.push(block.p);
      else if ("list" in block) out.push(...block.list);
      else if ("table" in block)
        out.push(...block.table.head, ...block.table.rows.flat());
      else if ("note" in block) out.push(block.note.text);
      else if ("steps" in block)
        out.push(...block.steps.flatMap((s) => [s.title, s.text]));
      else if ("stats" in block)
        out.push(...block.stats.flatMap((s) => [s.value, s.label]));
    }
  }
  return out;
}

describe("how-it-works content", () => {
  it("has the same structure in both languages", () => {
    const [pt, en] = [EXPLAINER.pt, EXPLAINER.en];
    expect(pt.chapters.map((c) => c.id)).toEqual(en.chapters.map((c) => c.id));

    pt.chapters.forEach((chapter, i) => {
      const other = en.chapters[i];
      expect(chapter.blocks.map(blockKind)).toEqual(
        other.blocks.map(blockKind),
      );

      chapter.blocks.forEach((block, j) => {
        const counterpart = other.blocks[j];
        if ("table" in block && "table" in counterpart) {
          expect(block.table.head).toHaveLength(counterpart.table.head.length);
          expect(block.table.rows).toHaveLength(counterpart.table.rows.length);
        }
        if ("list" in block && "list" in counterpart) {
          expect(block.list).toHaveLength(counterpart.list.length);
        }
        // A step missing from one language means one audience is told the pipeline has five
        // stages and the other that it has six.
        if ("steps" in block && "steps" in counterpart) {
          expect(block.steps).toHaveLength(counterpart.steps.length);
        }
        // The figures are the one thing that must be identical, not merely parallel.
        if ("stats" in block && "stats" in counterpart) {
          expect(block.stats.map((s) => s.value)).toEqual(
            counterpart.stats.map((s) => s.value),
          );
        }
        // A note that is an "insight" in one language and a "we got this wrong" in the other would
        // render in a different colour with a different label. Same claim, same framing.
        if ("note" in block && "note" in counterpart) {
          expect(block.note.tone).toBe(counterpart.note.tone);
        }
      });
    });
  });

  it("quotes identical code in both languages", () => {
    // The code is the one part of this page that is not a translation. If the two locales ever
    // showed different snippets, one of them would be describing software that does not exist.
    const codeOf = (doc: ExplainerDoc) =>
      doc.chapters.flatMap((c) =>
        c.blocks.filter((b) => "code" in b).map((b) => b),
      );
    expect(codeOf(EXPLAINER.pt)).toEqual(codeOf(EXPLAINER.en));
  });

  it("has no empty text anywhere", () => {
    for (const locale of LOCALES) {
      for (const text of allText(EXPLAINER[locale])) {
        expect(text.trim()).not.toBe("");
      }
    }
  });

  it("uses no em-dashes, in either language", () => {
    for (const locale of LOCALES) {
      for (const text of allText(EXPLAINER[locale])) {
        expect(text).not.toContain("—");
      }
    }
  });

  it("keeps chapter anchors unique and identical across locales", () => {
    for (const locale of LOCALES) {
      const ids = EXPLAINER[locale].chapters.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("writes real Portuguese, with accents", () => {
    const joined = allText(EXPLAINER.pt).join(" ");
    expect(joined).toMatch(/[áàâãéêíóôõúç]/i);
    expect(joined).toMatch(/não/i);
  });

  it("closes every bold marker it opens", () => {
    // The renderer splits on `**`, so an odd number would silently emphasise the rest of a
    // paragraph rather than one phrase.
    for (const locale of LOCALES) {
      for (const text of allText(EXPLAINER[locale])) {
        expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0);
      }
    }
  });
});

describe("code snippets", () => {
  const keys = Object.keys(SNIPPETS) as SnippetKey[];

  // The point of the whole page. A snippet that has drifted from the file it claims to quote is
  // worse than no snippet, because it is confidently wrong about code the reader cannot see.
  it.each(keys)("%s still appears verbatim in its source file", (key) => {
    const snippet = SNIPPETS[key];
    const source = readFileSync(join(REPO_ROOT, snippet.source), "utf8");
    expect(source).toContain(snippet.text);
  });

  it.each(keys)("%s is actually shown on the page", (key) => {
    const shown = EXPLAINER.en.chapters
      .flatMap((c) => c.blocks)
      .filter((b): b is Extract<Block, { code: unknown }> => "code" in b)
      .map((b) => b.code.text);
    expect(shown).toContain(SNIPPETS[key].text);
  });
});

describe("live figures", () => {
  // These come from the deployed artefact's metadata rather than from prose, so the page cannot
  // quietly overstate the model after a retrain. These assertions guard the wiring, not the values.
  it("reads the deployed correction, covering every hour", () => {
    expect(LIVE.byHour).toHaveLength(24);
    expect(LIVE.byHour.map((p) => p.hour)).toEqual([...Array(24).keys()]);
  });

  it("reports an improvement over doing nothing", () => {
    expect(LIVE.holdoutMae).toBeLessThan(LIVE.doNothingMae);
    expect(LIVE.improvement).toBeGreaterThan(0);
  });

  it("describes a real dataset", () => {
    expect(LIVE.pairedRows).toBeGreaterThan(1000);
    expect(LIVE.spots).toBeGreaterThan(1);
    // Rows outnumber hours because every hour is observed once per spot. If this ever inverts,
    // the page's whole "count hours, not rows" argument is describing something else.
    expect(LIVE.pairedRows).toBeGreaterThan(LIVE.pairedHours);
  });

  it("states dates the page can print", () => {
    for (const date of [LIVE.dataFrom, LIVE.dataTo]) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("readability", () => {
  // The feedback that produced these: the page was a wall of even-weight prose. Emphasis is not
  // decoration here, it is what lets someone skim a chapter and still take the point away.
  it("emphasises something in every long chapter, in both languages", () => {
    for (const locale of LOCALES) {
      for (const chapter of EXPLAINER[locale].chapters) {
        const prose = chapter.blocks.filter((b) => "p" in b || "steps" in b);
        if (prose.length < 3) continue;
        const text = allText({
          ...EXPLAINER[locale],
          chapters: [chapter],
        }).join(" ");
        expect(text, `${locale}/${chapter.id} has no emphasis`).toContain("**");
      }
    }
  });

  it("walks the reader through the pipeline in numbered steps", () => {
    for (const locale of LOCALES) {
      const pipeline = EXPLAINER[locale].chapters.find(
        (c) => c.id === "the-pipeline",
      );
      expect(pipeline).toBeDefined();
      const steps = pipeline!.blocks.find((b) => "steps" in b);
      expect(steps).toBeDefined();
    }
  });
});
