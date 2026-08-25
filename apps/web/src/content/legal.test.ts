import { describe, expect, it } from "vitest";

import { CONTACT_EMAIL, LEGAL, LEGAL_UPDATED, type Block, type LegalDoc } from "./legal";

const DOCS = ["privacy", "terms"] as const;
const LOCALES = ["pt", "en"] as const;

function blockKind(block: Block): string {
  if ("p" in block) return "p";
  if ("list" in block) return "list";
  return "table";
}

function allText(doc: LegalDoc): string[] {
  const out = [doc.title, doc.summary];
  for (const section of doc.sections) {
    out.push(section.heading);
    for (const block of section.blocks) {
      if ("p" in block) out.push(block.p);
      else if ("list" in block) out.push(...block.list);
      else out.push(...block.table.head, ...block.table.rows.flat());
    }
  }
  return out;
}

describe("legal documents", () => {
  // The failure this prevents is specific: a clause added to one language and forgotten in the
  // other, which for a legal page means one audience is told something the other is not.
  it.each(DOCS)("%s has the same structure in both languages", (key) => {
    const [pt, en] = [LEGAL[key].pt, LEGAL[key].en];

    expect(pt.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));

    pt.sections.forEach((section, i) => {
      const other = en.sections[i];
      expect(section.blocks.map(blockKind)).toEqual(other.blocks.map(blockKind));

      // A table with a different number of rows between languages means a disclosure went missing.
      section.blocks.forEach((block, j) => {
        const counterpart = other.blocks[j];
        if ("table" in block && "table" in counterpart) {
          expect(block.table.head).toHaveLength(counterpart.table.head.length);
          expect(block.table.rows).toHaveLength(counterpart.table.rows.length);
          block.table.rows.forEach((row, k) => {
            expect(row).toHaveLength(counterpart.table.rows[k].length);
          });
        }
        if ("list" in block && "list" in counterpart) {
          expect(block.list).toHaveLength(counterpart.list.length);
        }
      });
    });
  });

  it.each(DOCS)("%s has no empty text anywhere", (key) => {
    for (const locale of LOCALES) {
      for (const text of allText(LEGAL[key][locale])) {
        expect(text.trim()).not.toBe("");
      }
    }
  });

  it("uses no em-dashes, in either language", () => {
    for (const key of DOCS) {
      for (const locale of LOCALES) {
        for (const text of allText(LEGAL[key][locale])) {
          expect(text).not.toContain("—");
        }
      }
    }
  });

  it("keeps section anchors unique, since they are linkable", () => {
    for (const key of DOCS) {
      for (const locale of LOCALES) {
        const ids = LEGAL[key][locale].sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("publishes a contact address in every document", () => {
    for (const key of DOCS) {
      for (const locale of LOCALES) {
        const joined = allText(LEGAL[key][locale]).join(" ");
        expect(joined).toContain(CONTACT_EMAIL);
      }
    }
  });

  it("states a parseable last-updated date", () => {
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(LEGAL_UPDATED).getTime())).toBe(false);
  });

  // The Portuguese half was first written without accents. It rendered, it passed every structural
  // check, and it was wrong: this is the product's primary language and its primary audience. A
  // shape test cannot see that, so assert the characters themselves.
  it("writes real Portuguese, with accents", () => {
    for (const key of DOCS) {
      const joined = allText(LEGAL[key].pt).join(" ");
      expect(joined).toMatch(/[áàâãéêíóôõúç]/i);
      // Words that are certain to appear and certain to carry a diacritic.
      expect(joined).toMatch(/não/i);
    }
  });
});
