import { getTranslations } from "next-intl/server";

import AuthMenu from "@/components/AuthMenu";
import CorrectionCurve from "@/components/CorrectionCurve";
import Footer from "@/components/Footer";
import LanguageSwitch from "@/components/LanguageSwitch";
import SpotSearch from "@/components/SpotSearch";
import Wordmark from "@/components/Wordmark";
import { EXPLAINER, REPO, type Block } from "@/content/explainer";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getScoresCached, getSpotsCached, type Spot } from "@/lib/api";

/**
 * "How this works", rendered.
 *
 * A server component from top to bottom, including the chart, so a page of several thousand words
 * ships no JavaScript of its own. The table of contents is sticky on wide screens and inline on
 * narrow ones, which is the one concession to length.
 *
 * Deliberately close to `LegalPage` in structure without sharing code with it. They look alike
 * today, but a legal document is a fixed list of sections of prose while this has code, charts and
 * pulled-out notes; merging them would mean a component that serves two masters and does neither
 * well. The shared parts (header, footer, breadcrumb) are already components.
 */
export default async function ExplainerPage({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "explain" });
  const nav = await getTranslations({ locale, namespace: "nav" });
  const legal = await getTranslations({ locale, namespace: "legal" });
  const content = EXPLAINER[locale];

  // Allowed to fail, like the legal pages: the search field degrades away rather than taking an
  // explanatory page down with the surf API.
  const { spots, scores } = await headerData();

  return (
    <div className="flex min-h-full flex-col bg-app">
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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <nav
          aria-label={legal("crumbNav")}
          className="mb-2.5 flex items-center gap-1.5 pl-0.5"
        >
          <Link href="/" className="crumb">
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 8H3.5" />
              <path d="M7 3.8 3 8l4 4.2" />
            </svg>
            {legal("crumbHome")}
          </Link>
          <span className="crumb-sep" aria-hidden>
            /
          </span>
          <span className="crumb-here" aria-current="page">
            {content.title}
          </span>
        </nav>

        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* Sticky on wide screens only. On a phone it is a plain jump list at the top, which is
              what the legal pages do and what people actually use there. */}
          <nav
            aria-label={legal("onThisPage")}
            className="panel mb-4 p-4 lg:sticky lg:top-20 lg:mb-0"
          >
            <h2 className="section-title">{legal("onThisPage")}</h2>
            <ol className="mt-2.5 grid gap-1">
              {content.chapters.map((chapter, i) => (
                <li key={chapter.id}>
                  <a href={`#${chapter.id}`} className="legal-jump">
                    <span className="legal-jump-num">{i + 1}</span>
                    {chapter.heading}
                  </a>
                </li>
              ))}
            </ol>
            <p className="faint mt-3 border-t border-hairline pt-3">
              <a
                href={REPO}
                className="footer-link"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("repoLink")}
              </a>
            </p>
          </nav>

          <article className="panel p-5 sm:p-7">
            <h1 className="title text-primary">{content.title}</h1>
            <p className="mt-4 rounded-panel bg-inset p-4 text-body leading-relaxed text-secondary">
              {content.summary}
            </p>

            {content.chapters.map((chapter, i) => (
              <section
                key={chapter.id}
                id={chapter.id}
                className="legal-section"
              >
                <h2 className="legal-heading">
                  <span className="legal-jump-num">{i + 1}</span>
                  {chapter.heading}
                </h2>
                <p className="explain-lede">{chapter.lede}</p>
                {chapter.blocks.map((block, j) => (
                  <BlockView key={j} block={block} t={t} />
                ))}
              </section>
            ))}
          </article>
        </div>
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
    const [spots, scoreRows] = await Promise.all([
      getSpotsCached(),
      getScoresCached(),
    ]);
    return {
      spots,
      scores: Object.fromEntries(scoreRows.map((row) => [row.slug, row.score])),
    };
  } catch {
    return { spots: [], scores: {} };
  }
}

/**
 * Bold runs written as `**like this**` in the content, rendered without a markdown dependency.
 *
 * The content module holds plain strings on purpose, so the locale-parity test can compare them as
 * text. Three paragraphs need one emphasised lead-in, which is not worth a parser.
 */
function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-secondary">
            {part}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  );
}

type Translate = Awaited<ReturnType<typeof getTranslations>>;

function BlockView({ block, t }: { block: Block; t: Translate }) {
  if ("p" in block) {
    return (
      <p className="legal-p">
        <RichText text={block.p} />
      </p>
    );
  }

  if ("list" in block) {
    return (
      <ul className="legal-list">
        {block.list.map((item, i) => (
          <li key={i}>
            <RichText text={item} />
          </li>
        ))}
      </ul>
    );
  }

  if ("table" in block) {
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

  if ("code" in block) {
    return (
      <figure className="explain-code">
        {/* The path is part of the snippet, not decoration: it is what lets a reader go and check
            that the code says what the page claims, and a test asserts the file still contains it. */}
        <figcaption className="explain-code-path">
          {t("sourceLabel")} {block.code.source}
        </figcaption>
        <pre>
          <code>{block.code.text}</code>
        </pre>
      </figure>
    );
  }

  if ("note" in block) {
    const wrong = block.note.tone === "wrong";
    return (
      <aside className={`explain-note ${wrong ? "is-wrong" : "is-insight"}`}>
        <p className="explain-note-label">
          {wrong ? t("weGotThisWrong") : t("worthKnowing")}
        </p>
        <p>
          <RichText text={block.note.text} />
        </p>
      </aside>
    );
  }

  if ("steps" in block) {
    return (
      <ol className="explain-steps">
        {block.steps.map((step, i) => (
          <li key={i}>
            <span className="explain-step-num">{i + 1}</span>
            <div>
              <p className="explain-step-title">{step.title}</p>
              <p className="explain-step-text">
                <RichText text={step.text} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if ("stats" in block) {
    return (
      <div className="explain-stats">
        {block.stats.map((stat, i) => (
          <div key={i} className="explain-stat">
            <span className="explain-stat-value">{stat.value}</span>
            <span className="explain-stat-label">{stat.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <CorrectionCurve
      caption={t("chartCaption")}
      axisLabel={t("chartAxis")}
      peakLabel={(hour, value) => t("chartPeak", { hour, value })}
      troughLabel={(hour, value) => t("chartTrough", { hour, value })}
    />
  );
}
