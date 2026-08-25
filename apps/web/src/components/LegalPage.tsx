import { getTranslations } from "next-intl/server";

import AuthMenu from "@/components/AuthMenu";
import Footer from "@/components/Footer";
import LanguageSwitch from "@/components/LanguageSwitch";
import SpotSearch from "@/components/SpotSearch";
import Wordmark from "@/components/Wordmark";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { LEGAL, LEGAL_UPDATED, type Block, type LegalKey } from "@/content/legal";
import { getScoresCached, getSpotsCached, type Spot } from "@/lib/api";
import { localeTag } from "@/lib/forecast";

/**
 * Renders either legal document.
 *
 * One component for both, because a privacy policy and a set of terms have identical structure and
 * differing only in words is the whole point of holding them as data. A second near-copy of this file
 * is how the two drift apart.
 *
 * Server component throughout: none of this is interactive, so none of it needs to reach the browser
 * as JavaScript.
 */
export default async function LegalPage({
  doc,
  locale,
}: {
  doc: LegalKey;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "legal" });
  const nav = await getTranslations({ locale, namespace: "nav" });
  const content = LEGAL[doc][locale];

  // Deliberately allowed to fail. These two pages are a legal obligation and the only ones that must
  // render when everything else is broken, so the surf API being down degrades the search field away
  // rather than taking the privacy policy with it.
  const { spots, scores } = await headerData();

  // Written out rather than shortened, since a legal page is exactly where an ambiguous date hurts.
  const updated = new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(LEGAL_UPDATED));

  return (
    <div className="flex min-h-full flex-col bg-app">
      {/* Same bar as the spot page, so a legal page reads as part of the app rather than as a
          document someone bolted on. The language switch matters more here than anywhere else: these
          documents exist in two languages and are the one place a reader may specifically want the
          other one. */}
      <header className="sticky top-0 z-[1000] flex h-16 items-center gap-2 border-b border-hairline bg-panel px-3 shadow-[var(--shadow-1)] sm:gap-3 sm:px-4">
        <Link href="/" aria-label={nav("home")} className="flex-none">
          <Wordmark className="h-8 w-auto" />
        </Link>
        {spots.length > 0 && (
          <div className="relative ml-1 hidden min-w-0 flex-1 sm:ml-2 sm:block sm:flex-none">
            <SpotSearch spots={spots} scores={scores} />
          </div>
        )}
        <div className="ml-auto flex flex-none items-center gap-2">
          <LanguageSwitch />
          <AuthMenu />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <nav aria-label={t("crumbNav")} className="mb-2.5 flex items-center gap-1.5 pl-0.5">
          <Link href="/" className="crumb">
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="none"
                 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 8H3.5" />
              <path d="M7 3.8 3 8l4 4.2" />
            </svg>
            {t("crumbHome")}
          </Link>
          <span className="crumb-sep" aria-hidden>
            /
          </span>
          <span className="crumb-here" aria-current="page">
            {content.title}
          </span>
        </nav>

        <article className="panel p-5 sm:p-7">
          <h1 className="title text-primary">{content.title}</h1>
          <p className="faint mt-1">{t("updated", { date: updated })}</p>

          {/* The honest short version, before the long one. Someone who reads only this box should
              still come away with an accurate idea of what is held. */}
          <p className="mt-4 rounded-panel bg-inset p-4 text-body leading-relaxed text-secondary">
            {content.summary}
          </p>

          {/* A jump list, because these are long and people arrive looking for one clause. */}
          <nav aria-label={t("onThisPage")} className="mt-5 border-t border-hairline pt-4">
            <h2 className="section-title">{t("onThisPage")}</h2>
            <ol className="mt-2.5 grid gap-1 sm:grid-cols-2">
              {content.sections.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="legal-jump">
                    <span className="legal-jump-num">{i + 1}</span>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {content.sections.map((section, i) => (
            <section key={section.id} id={section.id} className="legal-section">
              <h2 className="legal-heading">
                <span className="legal-jump-num">{i + 1}</span>
                {section.heading}
              </h2>
              {section.blocks.map((block, j) => (
                <BlockView key={j} block={block} />
              ))}
            </section>
          ))}
        </article>
      </main>

      <Footer />
    </div>
  );
}

async function headerData(): Promise<{
  spots: Spot[];
  scores: Record<string, number | null>;
}> {
  try {
    const [spots, scoreRows] = await Promise.all([getSpotsCached(), getScoresCached()]);
    return {
      spots,
      scores: Object.fromEntries(scoreRows.map((row) => [row.slug, row.score])),
    };
  } catch {
    return { spots: [], scores: {} };
  }
}

function BlockView({ block }: { block: Block }) {
  if ("p" in block) {
    return <p className="legal-p">{block.p}</p>;
  }
  if ("list" in block) {
    return (
      <ul className="legal-list">
        {block.list.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  // Tables carry the disclosures that are genuinely three-column ("what, why, on what basis"), so
  // they get a real table rather than prose pretending to be one. It scrolls inside its own box,
  // because the alternative on a phone is the whole page scrolling sideways.
  return (
    <div className="legal-table-wrap">
      <table className="legal-table">
        <thead>
          <tr>
            {block.table.head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
