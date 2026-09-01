/**
 * "How this works": the whole project, explained to someone who did not build it.
 *
 * Same shape as `legal.ts`, and for the same reasons: long prose does not belong in the message
 * catalogue that ships to every page, and a typed structure lets a test assert the two languages
 * have not drifted apart.
 *
 * Two rules govern the content, and they are what make the page worth having.
 *
 * **Numbers are imported, never typed.** Every figure about the correction model comes from the
 * shipped artefact's own metadata. Prose can go stale silently; an import cannot. If the artefact is
 * rebuilt on more data, this page changes with it and nobody has to remember.
 *
 * **Code snippets are checked against the files they claim to come from.** `explainer.test.ts`
 * reads each `source` path and asserts the snippet still appears in it verbatim. A snippet that
 * drifts from the code it documents is worse than no snippet, because it is confidently wrong.
 */

// The committed copy inside this app, written by `python -m before_surf.correction.build` at the
// same moment as the artefact the API loads. Imported rather than read from disk so it works the
// same in dev, in a static build, and when the page revalidates. See WEB_COPY_PATH in artifact.py.
import correction from "./wind-correction.json";

import type { Locale } from "@/i18n/routing";

/** Figures pulled from the deployed correction artefact, so the page cannot overstate them. */
export const LIVE = {
  pairedRows: correction.metadata.fitted_rows,
  pairedHours: correction.metadata.fitted_hours,
  spots: correction.metadata.spots,
  holdoutMae: correction.metadata.holdout_mae_kmh,
  doNothingMae: correction.metadata.do_nothing_mae_kmh,
  improvement: correction.metadata.improvement_kmh,
  dataFrom: correction.metadata.data_from.slice(0, 10),
  dataTo: correction.metadata.data_to.slice(0, 10),
  timezone: correction.timezone,
  byHour: Object.entries(correction.by_local_hour)
    .map(([hour, value]) => ({ hour: Number(hour), value: value as number }))
    .sort((a, b) => a.hour - b.hour),
} as const;

export const REPO = "https://github.com/b1ca16/before";

/** A block of content. Deliberately few kinds: enough to explain a system, and no more. */
export type Block =
  | { p: string }
  | { list: string[] }
  | { table: { head: string[]; rows: string[][] } }
  /** A real excerpt from a real file, verified by test against `source`. */
  | {
      code: {
        source: string;
        language: "python" | "typescript" | "sql";
        text: string;
      };
    }
  /** A pulled-out lesson. `wrong` marks something we got wrong and had to fix. */
  | { note: { tone: "insight" | "wrong"; text: string } }
  /** A numbered walkthrough, for the places where prose was hiding a sequence. */
  | { steps: { title: string; text: string }[] }
  /** Headline figures, so the important numbers survive a reader who is skimming. */
  | { stats: { value: string; label: string }[] }
  /** The correction curve, drawn from the deployed artefact. */
  | { chart: "correction" };

export type Chapter = {
  /** Stable anchor, identical across locales, so a section can be linked to directly. */
  id: string;
  heading: string;
  /** One line under the heading, so the table of contents can say what each chapter is for. */
  lede: string;
  blocks: Block[];
};

export type ExplainerDoc = {
  title: string;
  summary: string;
  chapters: Chapter[];
};

/**
 * Excerpts, kept next to the paths they came from.
 *
 * Held separately from the prose so both languages quote the identical code, which is the point:
 * the code is the one part of this page that is not a translation.
 */
export const SNIPPETS = {
  offshore: {
    source: "ml/src/before_surf/features/derive.py",
    language: "python",
    text: `def offshore_component(wind_direction_deg, orientation_deg):
    """Wind alignment with offshore: +1 fully offshore (clean), -1 fully onshore (blown out)."""
    return -np.cos(np.radians(wind_direction_deg - orientation_deg))`,
  },
  windRamp: {
    source: "ml/src/before_surf/scoring/ramps.py",
    language: "python",
    text: `def wind_score(offshore_component, wind_speed_kmh, strong_kmh: float = 30.0):
    onshore = (1.0 - offshore_component) / 2.0  # 1 = full onshore, 0 = full offshore
    strength = np.clip(wind_speed_kmh / strong_kmh, 0.0, 1.0)
    return 1.0 - onshore * strength`,
  },
  harmonic: {
    source: "ml/src/before_surf/scoring/heuristic.py",
    language: "python",
    text: `        with np.errstate(divide="ignore"):
            reciprocal_sum = sum(1.0 / s for s in sub.values())
        return 10.0 * len(sub) / reciprocal_sum`,
  },
  split: {
    source: "ml/src/before_surf/correction/dataset.py",
    language: "python",
    text: `    train = frame[times < cutoff - embargo]
    test = frame[times >= cutoff]`,
  },
  fit: {
    source: "ml/src/before_surf/correction/artifact.py",
    language: "python",
    text: `    grouped = pairs.groupby(moments.dt.hour)["error_kmh"]
    medians = grouped.median()
    trusted = medians[grouped.size() >= min_rows]`,
  },
  bootstrap: {
    source: "ml/src/before_surf/correction/model.py",
    language: "python",
    text: `    sum_worse = grouped["worse"].sum().to_numpy()
    sum_better = grouped["better"].sum().to_numpy()
    counts = grouped.size().to_numpy()`,
  },
} as const;

export type SnippetKey = keyof typeof SNIPPETS;

const code = (key: SnippetKey): Block => ({
  code: {
    source: SNIPPETS[key].source,
    language: SNIPPETS[key].language,
    text: SNIPPETS[key].text,
  },
});

const n = (value: number) => value.toLocaleString("en-US");

// Two decimals for anything shown to a reader. The artefact stores four, which is the right
// precision to keep and the wrong precision to display: "2.9454 km/h" invites someone to believe
// the fourth decimal means something.
const km = (value: number) => value.toFixed(2);

// -------------------------------------------------------------------------------------------------
// English
// -------------------------------------------------------------------------------------------------

const EN: ExplainerDoc = {
  title: "How this works",
  summary:
    "BeFORE decides whether a surf spot is worth the drive. Nothing here is a language model or a " +
    "wrapper around somebody else's API: the score is a formula we can show you, and the one " +
    "machine-learned part is a correction we fit ourselves, from data the site collected. This page " +
    "is the whole thing, including the parts that went wrong.",
  chapters: [
    {
      id: "what-this-is",
      heading: "What this is, and what it is not",
      lede: "A formula first, a model second, and the reason that order matters.",
      blocks: [
        {
          p:
            "BeFORE answers one question for each of the " +
            `${LIVE.spots} spots on the Lisbon coast: given the swell, the wind and the shape of ` +
            "the beach, is it worth going right now? The answer is a number from 0 to 10 and a word.",
        },
        {
          p:
            "There is a temptation, building something like this, to reach for a large model and " +
            "let it decide. We did not, and the reason is not purity. **A model trained to imitate a " +
            "formula can only ever be a slower, less honest copy of that formula.** So the project " +
            "climbs a ladder instead: a transparent heuristic first, machine learning only where it " +
            "can be shown to beat the heuristic on data the heuristic never saw.",
        },
        {
          list: [
            "v0, live now: a hand-built score from four factors, every one of which we can explain.",
            "v1, in progress: machine learning where it earns its place. The first piece is shipped, and it corrects the wind forecast rather than replacing the score.",
            "v2, later: personalisation, once enough people have rated enough sessions.",
          ],
        },
        {
          note: {
            tone: "insight",
            text:
              "The trap this avoids has a name: circularity. If you train a model on scores your " +
              "own formula produced, it learns your formula's opinions and its mistakes, then " +
              "reports back that it agrees with you. Every evaluation looks excellent and nothing " +
              "has been learned about the ocean.",
          },
        },
      ],
    },
    {
      id: "the-pipeline",
      heading: "From a forecast to a number on your phone",
      lede: "Six steps, repeated every hour, for every spot on the coast.",
      blocks: [
        {
          p:
            "All of this happens **before you open the page**. By the time you look, the answer is " +
            "already sitting in a database waiting for you.",
        },
        {
          steps: [
            {
              title: "Collect the forecast",
              text:
                "A scheduled job asks Open-Meteo what the swell, the wind and the tide will do at " +
                `each of the ${LIVE.spots} spots, hour by hour, and writes it all down.`,
            },
            {
              title: "Correct the wind",
              text:
                "The forecast wind is adjusted using a table learned from how this forecast has " +
                "missed in the past. **This is the machine-learned step**, and it is the only one.",
            },
            {
              title: "Work out the geometry",
              text:
                "How offshore is the wind, and can the swell physically reach this beach? Both " +
                "come from the angle between the conditions and the direction the beach faces.",
            },
            {
              title: "Score the four factors",
              text:
                "Size, period, wind and exposure each become a number between 0 and 1, using " +
                "ramps chosen against a year of historical data.",
            },
            {
              title: "Combine them so the weakest wins",
              text:
                "One number out of ten. The four are combined so that **the worst factor drags " +
                "the result down** instead of being averaged away by the other three.",
            },
            {
              title: "Say why",
              text:
                "The page names the factor that held the score back, so you can disagree with it. " +
                "A number you cannot argue with is not much use.",
            },
          ],
        },
        {
          p:
            "Later, once that hour has actually passed, a second job fetches what the archive says " +
            "really happened and stores it next to the forecast. **That pairing is what makes step " +
            "2 possible at all**, and it is what the machine learning chapter is about.",
        },
      ],
    },
    {
      id: "data-sources",
      heading: "Where the numbers come from",
      lede: "Two public sources, one cron job, and no scraping of anyone's ratings.",
      blocks: [
        {
          table: {
            head: ["Source", "What it gives us", "How often"],
            rows: [
              [
                "Open-Meteo Marine and Weather",
                "Swell height, period and direction; wind speed and direction; sea level",
                "Forecast refreshed daily",
              ],
              [
                "Open-Meteo Archive (ERA5)",
                "The same variables, reanalysed after the fact",
                "Backfilled daily as hours age",
              ],
              [
                "OpenStreetMap and Wikidata",
                "Where the surf spots are",
                "Once, at spot registry build",
              ],
            ],
          },
        },
        {
          p:
            "A scheduled job pulls the forecast every day and writes it to Postgres. A second job " +
            "backfills the archive for hours that have already passed. That second job is the " +
            "quiet hero of this project: it is what turns a forecast into a training example, " +
            "because once an hour has passed we know both what was predicted and what was " +
            "recorded.",
        },
        {
          note: {
            tone: "insight",
            text:
              "We do not scrape other surf sites' ratings, and not only for legal reasons. A model " +
              "trained on somebody else's ratings learns to imitate their opinion, which caps it at " +
              "being a worse version of them. The archive gives us something they cannot: ground " +
              "our own predictions were later measured against.",
          },
        },
      ],
    },
    {
      id: "the-spots",
      heading: `The ${LIVE.spots} spots`,
      lede: "Found from open data, not from an expert with a map.",
      blocks: [
        {
          p:
            "A surf score needs to know which way a beach faces. A wind from the east is offshore " +
            "and clean at a west-facing beach, and onshore and ruinous at an east-facing one. " +
            "**That one number, the direction the beach faces, decides more than anything else on " +
            "the page.**",
        },
        {
          p:
            "The obvious way to get it is to ask a local surfer for all " +
            `${LIVE.spots} of them. We could not, so the spots and their orientations are derived ` +
            "from open geographic data instead: candidate spots from OpenStreetMap and Wikidata, " +
            "then the orientation computed from the coastline geometry around each one using " +
            "PostGIS. It is reproducible, it covers the whole coast, and it can be rerun.",
        },
        {
          p:
            "It is also imperfect, and the page shows where. A handful of spots have no reliable " +
            "orientation, and rather than guess one, the score for those spots is reported as " +
            "unknown. **A missing number is honest; an invented one is not.**",
        },
        code("offshore"),
        {
          p:
            "That is the whole of it. The cosine of the angle between where the wind is coming from " +
            "and where the beach faces, negated so that +1 means clean offshore and -1 means blown " +
            "out.",
        },
      ],
    },
    {
      id: "the-score",
      heading: "The score",
      lede: "Four factors, each on a 0-to-1 ramp, combined so the weakest one decides.",
      blocks: [
        {
          p: "**Four things have to be right at once, and every one of them can ruin it alone.** That structure is the whole design of the score.",
        },
        {
          table: {
            head: ["Factor", "What it measures", "Ruined when"],
            rows: [
              [
                "Size",
                "Swell height against a usable range",
                "Flat, or beyond what the spot holds",
              ],
              [
                "Period",
                "Seconds between waves, which separates groundswell from windslop",
                "Short period: choppy, gutless waves",
              ],
              [
                "Wind",
                "Direction relative to the beach, scaled by strength",
                "Strong and onshore",
              ],
              [
                "Exposure",
                "Whether the swell can physically reach the beach",
                "Shadowed by a headland",
              ],
            ],
          },
        },
        code("windRamp"),
        {
          p:
            "Note what the wind ramp implies: strength only matters to the extent the wind is " +
            "onshore. A 40 km/h offshore wind barely moves the score, which is correct, and is the " +
            "kind of thing a model would have to learn from thousands of examples to get right.",
        },
        {
          p:
            "The four factors are then combined with a harmonic mean rather than an average. " +
            "This is the single most consequential line in the scoring code.",
        },
        code("harmonic"),
        {
          note: {
            tone: "wrong",
            text:
              "The first version used a geometric mean, and it was too kind. With four factors it " +
              "takes a fourth root, so a hopeless period of 0.2 next to three excellent 0.9s still " +
              "scored 6.2 out of 10, which would send someone to a beach full of gutless chop. The " +
              "harmonic mean returns 3.7 for the same conditions. Any factor at zero still vetoes " +
              "the whole score, which is what makes a shadowed beach report zero rather than a " +
              "polite average.",
          },
        },
      ],
    },
    {
      id: "correcting-the-forecast",
      heading: "The machine learning part",
      lede: "The forecast is wrong in a pattern. A pattern is something you can learn.",
      blocks: [
        {
          p:
            "Every hour, we store what the forecast said. Later, the same hour arrives in the " +
            "reanalysis archive, and we store that too. Subtract one from the other and you have a " +
            "labelled example: this is how wrong the forecast was, and these are the conditions it " +
            `was wrong under. There are **${n(LIVE.pairedRows)} such pairs**, from ` +
            `${LIVE.dataFrom} to ${LIVE.dataTo}.`,
        },
        {
          stats: [
            { value: n(LIVE.pairedRows), label: "paired examples" },
            { value: `${km(LIVE.doNothingMae)}`, label: "km/h error before" },
            { value: `${km(LIVE.holdoutMae)}`, label: "km/h error after" },
            { value: `${LIVE.spots}`, label: "spots covered" },
          ],
        },
        {
          p:
            "The wind forecast for this coast runs light, and not by a constant. It is out by " +
            "**about 4.4 km/h at midnight and by almost nothing at 15:00**. That is a sea-breeze cycle, " +
            "and it is exactly the kind of stable, physical pattern worth learning.",
        },
        { chart: "correction" },
        {
          p:
            "Those are the numbers actually deployed, read from the model file the API loads. The " +
            "correction is added to the forecast wind before the score is computed, and the spot " +
            "page tells you when it has been applied, because you deserve to know why our wind " +
            "differs from the one the forecaster published.",
        },
        {
          p:
            "Fitting it is three lines. Everything difficult about this was deciding whether to " +
            "believe the result.",
        },
        code("fit"),
        {
          p:
            "The median rather than the average, because the metric we report is mean absolute " +
            "error, and the median is the constant that minimises absolute error. Fitting one thing " +
            "and reporting another is how a benchmark quietly flatters itself.",
        },
        {
          table: {
            head: ["Approach", "Average error on data it had never seen"],
            rows: [
              [
                "Trust the forecast as published",
                `${km(LIVE.doNothingMae)} km/h`,
              ],
              ["The correction we deployed", `${km(LIVE.holdoutMae)} km/h`],
            ],
          },
        },
        {
          p:
            `An improvement of ${km(LIVE.improvement)} km/h. Small in absolute terms, and it moves the ` +
            "displayed rating on roughly one spot-hour in twenty from the wrong word to the right " +
            "one.",
        },
      ],
    },
    {
      id: "honest-evaluation",
      heading: "How we know it actually works",
      lede: "The part most write-ups skip, and the part that changed our conclusions twice.",
      blocks: [
        {
          p:
            "**It is easy to produce an impressive number for a model. The hard part is producing one " +
            "that survives contact with next week.** Three habits did most of the work here.",
        },
        {
          p:
            "**Split by time, never at random.** The obvious way to test a model is to hold back a " +
            `random quarter of the ${n(LIVE.pairedRows)} rows. It would have been a lie. The ` +
            `${LIVE.spots} spots share weather, so 09:00 at one beach and 09:00 at the next are ` +
            "nearly the same example, and the same beach at 09:00 and 10:00 nearly are too. Put one " +
            "in training and its twin in testing and the model is being asked to recall, not to " +
            "predict.",
        },
        code("split"),
        {
          note: {
            tone: "wrong",
            text:
              "This is not theoretical. A correction fitted per spot was the best method on the " +
              "training weeks (2.414 km/h) and nearly the worst on the held-out weeks (2.623). A " +
              "random split would have scored it around 2.41 and recommended shipping it. The " +
              "per-spot bias was real for those weeks and did not survive to the next ones.",
          },
        },
        {
          p:
            `**Count hours, not rows.** Those ${n(LIVE.pairedRows)} rows contain only about ` +
            `${n(LIVE.pairedHours)} distinct hours, because each hour appears once per spot. Any ` +
            "confidence interval that treats them as independent observations will be far too " +
            "narrow. So when we test whether one method really beats another, we resample whole " +
            "hours rather than rows.",
        },
        code("bootstrap"),
        {
          p:
            "**Write the baselines down first.** Before any model existed we measured the laziest " +
            "things that could work: do nothing, subtract one number, subtract a number per spot, " +
            "subtract a number per hour. **A baseline invented after the model is a baseline chosen to lose.**",
        },
        {
          note: {
            tone: "insight",
            text:
              "The gradient boosting model beat every baseline, and we shipped the per-hour table " +
              "anyway. Its remaining advantage was 0.6 percentage points of displayed ratings, and " +
              "it would have cost 75 MB of memory on a server with 512 MB, plus the ability to " +
              "explain the adjustment to you in a sentence. A model winning the metric is not the " +
              "same as a model earning its place.",
          },
        },
      ],
    },
    {
      id: "what-we-got-wrong",
      heading: "What we got wrong",
      lede: "Kept deliberately, because the corrections are more instructive than the successes.",
      blocks: [
        {
          p:
            "Everything below was believed, written down, and then disproved by a measurement. They " +
            "are listed because a project that only publishes its wins teaches nothing about how " +
            "the wins were found.",
        },
        {
          table: {
            head: ["What we believed", "What was actually true"],
            rows: [
              [
                "A geometric mean combines the four factors sensibly.",
                "Too generous. A hopeless period beside three good factors still scored 6.2. The harmonic mean gives 3.7.",
              ],
              [
                "The site needed better metadata to be findable.",
                "It served 29 visible words and not one spot name. It was a rendering problem, not a metadata problem.",
              ],
              [
                "A correction per spot should help, since the bias differs by beach.",
                "Best on training data, second worst on held-out data. It was memorising, not learning.",
              ],
              [
                "Beating a constant correction means the model is good.",
                "That constant was measured on the same data it was scored on. The real bar was harder, and moved twice.",
              ],
              [
                "We chose the model's settings fairly.",
                "The model was tuned blind, then compared against a baseline we picked by peeking at the answers. The comparison was rigged in the baseline's favour.",
              ],
              [
                "The tests cover the correction logic.",
                "Every mutation we could invent was caught, and a live call still found archive readings reporting an adjustment of zero where they should report none at all.",
              ],
            ],
          },
        },
        {
          note: {
            tone: "insight",
            text:
              "The pattern across all six: the belief was reasonable, and the only thing that " +
              "exposed it was measuring the specific thing rather than the convenient thing.",
          },
        },
      ],
    },
    {
      id: "whats-blocked",
      heading: "What is still missing",
      lede: "The honest gap, and the one thing that would close it.",
      blocks: [
        {
          p:
            "The goal was never to correct a wind forecast. It was to learn **what makes a session worth it**, which is a different and better question: it involves crowds, tide, board " +
            "choice and how good you are, none of which appear in any forecast.",
        },
        {
          p:
            "That model needs labels, and labels mean surfers rating sessions they actually " +
            "surfed. The bar is 80 rated sessions with a reasonable spread of good and bad. **Right now the count is zero**, and no amount of engineering moves it.",
        },
        {
          p:
            "So the session-rating model is deferred, not cancelled, and the forecast correction is " +
            "genuine work found in the meantime rather than a substitute for it. If you surf this " +
            "coast: sign in, log a session, rate it. That is the blocker.",
        },
        {
          list: [
            "Bathymetry, which is what an honest tide term in the score would need.",
            "A session-rating model, blocked on labels alone.",
            "Whether the wind correction holds in a winter swell regime. Right now it has seen one summer.",
          ],
        },
      ],
    },
    {
      id: "the-code",
      heading: "The code",
      lede: "All of it is public, including the decision records.",
      blocks: [
        {
          p:
            "Python and FastAPI for the API and the machine learning, Postgres with PostGIS on " +
            "Supabase, Next.js on Vercel for this site, scheduled jobs on GitHub Actions. Every " +
            "part of it is on a free tier, which is a constraint that shaped several of the " +
            "decisions above, the deployed correction among them.",
        },
        {
          p:
            "Significant decisions are recorded as ADRs in the repository, each one written when " +
            "the decision was made rather than reconstructed afterwards. If any part of this page " +
            "seems too confident, the ADR behind it will show the argument and usually the " +
            "measurement that settled it.",
        },
      ],
    },
  ],
};

// -------------------------------------------------------------------------------------------------
// Portuguese. Informal throughout, matching the rest of the app; the legal pages are the formal ones.
// -------------------------------------------------------------------------------------------------

const PT: ExplainerDoc = {
  title: "Como isto funciona",
  summary:
    "O BeFORE decide se vale a pena ir a um spot. Nada aqui é um modelo de linguagem nem um " +
    "invólucro à volta da API de outra pessoa: a pontuação é uma fórmula que te podemos mostrar, e " +
    "a única parte com aprendizagem automática é uma correção que treinámos nós, com dados que o " +
    "próprio site recolheu. Esta página é tudo, incluindo aquilo em que nos enganámos.",
  chapters: [
    {
      id: "what-this-is",
      heading: "O que isto é, e o que não é",
      lede: "Primeiro uma fórmula, depois um modelo, e a razão de a ordem importar.",
      blocks: [
        {
          p:
            "O BeFORE responde a uma pergunta para cada um dos " +
            `${LIVE.spots} spots da costa de Lisboa: dada a ondulação, o vento e a forma da praia, ` +
            "vale a pena ir agora? A resposta é um número de 0 a 10 e uma palavra.",
        },
        {
          p:
            "Ao construir uma coisa destas há a tentação de pegar num modelo grande e deixá-lo " +
            "decidir. Não foi o que fizemos, e a razão não é purismo. **Um modelo treinado para " +
            "imitar uma fórmula nunca pode ser mais do que uma cópia mais lenta e menos honesta " +
            "dessa fórmula.** Por isso o projeto sobe uma escada: primeiro uma heurística " +
            "transparente, e aprendizagem automática só onde se conseguir demonstrar que ganha à " +
            "heurística em dados que ela nunca viu.",
        },
        {
          list: [
            "v0, no ar: uma pontuação construída à mão a partir de quatro fatores, todos explicáveis.",
            "v1, em curso: aprendizagem automática onde merece o lugar. A primeira peça já está no ar e corrige a previsão de vento, em vez de substituir a pontuação.",
            "v2, mais tarde: personalização, quando houver pessoas suficientes a avaliar sessões suficientes.",
          ],
        },
        {
          note: {
            tone: "insight",
            text:
              "A armadilha que isto evita tem nome: circularidade. Se treinares um modelo com " +
              "pontuações produzidas pela tua própria fórmula, ele aprende as opiniões e os erros " +
              "dessa fórmula, e depois vem dizer-te que concorda contigo. Todas as avaliações ficam " +
              "excelentes e não se aprendeu nada sobre o mar.",
          },
        },
      ],
    },
    {
      id: "the-pipeline",
      heading: "Da previsão até ao número no teu telemóvel",
      lede: "Seis passos, repetidos a cada hora, para cada spot da costa.",
      blocks: [
        {
          p:
            "Isto tudo acontece **antes de abrires a página**. Quando olhas, a resposta já está " +
            "numa base de dados à tua espera.",
        },
        {
          steps: [
            {
              title: "Ir buscar a previsão",
              text:
                "Um trabalho agendado pergunta ao Open-Meteo o que vão fazer a ondulação, o vento " +
                `e a maré em cada um dos ${LIVE.spots} spots, hora a hora, e grava tudo.`,
            },
            {
              title: "Corrigir o vento",
              text:
                "O vento previsto é ajustado com uma tabela aprendida a partir dos erros " +
                "anteriores desta previsão. **É este o passo com aprendizagem automática**, e é o " +
                "único.",
            },
            {
              title: "Calcular a geometria",
              text:
                "Quão offshore está o vento, e consegue a ondulação chegar mesmo a esta praia? As " +
                "duas coisas saem do ângulo entre as condições e a direção para onde a praia está " +
                "virada.",
            },
            {
              title: "Pontuar os quatro fatores",
              text:
                "Tamanho, período, vento e exposição passam cada um a ser um número entre 0 e 1, " +
                "com rampas escolhidas contra um ano de dados históricos.",
            },
            {
              title: "Juntá-los de forma a que o mais fraco mande",
              text:
                "Um número de 0 a 10. Os quatro são combinados de maneira a que **o pior fator " +
                "puxe o resultado para baixo**, em vez de ser diluído pelos outros três.",
            },
            {
              title: "Dizer porquê",
              text:
                "A página diz qual foi o fator que travou a pontuação, para poderes discordar. Um " +
                "número com que não se pode discutir não serve de muito.",
            },
          ],
        },
        {
          p:
            "Mais tarde, depois de essa hora ter mesmo passado, um segundo trabalho vai buscar o " +
            "que o arquivo diz que aconteceu e guarda-o ao lado da previsão. **É esse par que " +
            "torna o passo 2 possível**, e é disso que trata o capítulo da aprendizagem automática.",
        },
      ],
    },
    {
      id: "data-sources",
      heading: "De onde vêm os números",
      lede: "Duas fontes públicas, um trabalho agendado, e nenhuma cópia das avaliações de outros.",
      blocks: [
        {
          table: {
            head: ["Fonte", "O que nos dá", "Com que frequência"],
            rows: [
              [
                "Open-Meteo Marine e Weather",
                "Altura, período e direção da ondulação; velocidade e direção do vento; nível do mar",
                "Previsão atualizada diariamente",
              ],
              [
                "Open-Meteo Archive (ERA5)",
                "As mesmas variáveis, reanalisadas depois do facto",
                "Preenchido diariamente à medida que as horas passam",
              ],
              [
                "OpenStreetMap e Wikidata",
                "Onde ficam os spots",
                "Uma vez, ao construir o registo de spots",
              ],
            ],
          },
        },
        {
          p:
            "Um trabalho agendado vai buscar a previsão todos os dias e grava-a no Postgres. Um " +
            "segundo trabalho preenche o arquivo das horas que já passaram. Esse segundo trabalho é " +
            "o herói silencioso do projeto: é ele que transforma uma previsão num exemplo de " +
            "treino, porque depois de a hora passar sabemos ao mesmo tempo o que foi previsto e o " +
            "que ficou registado.",
        },
        {
          note: {
            tone: "insight",
            text:
              "Não copiamos as avaliações de outros sites de surf, e não é só por razões legais. Um " +
              "modelo treinado com as avaliações de outra pessoa aprende a imitar a opinião dela, o " +
              "que o limita a ser uma versão pior dessa pessoa. O arquivo dá-nos uma coisa que eles " +
              "não têm: terreno contra o qual as nossas próprias previsões foram medidas depois.",
          },
        },
      ],
    },
    {
      id: "the-spots",
      heading: `Os ${LIVE.spots} spots`,
      lede: "Encontrados a partir de dados abertos, não de um especialista com um mapa.",
      blocks: [
        {
          p:
            "Uma pontuação de surf precisa de saber para onde a praia está virada. Um vento de " +
            "leste é offshore e limpo numa praia virada a oeste, e onshore e destruidor numa praia " +
            "virada a leste. **Esse número, o azimute virado ao mar, decide mais do que qualquer " +
            "outra coisa nesta página.**",
        },
        {
          p:
            "A forma óbvia de o obter é perguntar a um surfista local, para os " +
            `${LIVE.spots} spots todos. Não podíamos, por isso os spots e as orientações são ` +
            "derivados de dados geográficos abertos: candidatos vindos do OpenStreetMap e do " +
            "Wikidata, e depois a orientação calculada a partir da geometria da linha de costa à " +
            "volta de cada um, com PostGIS. É reproduzível, cobre a costa toda, e pode ser corrido " +
            "outra vez.",
        },
        {
          p:
            "Também é imperfeito, e a página mostra onde. Alguns spots não têm orientação fiável e, " +
            "em vez de a inventar, a pontuação desses spots aparece como desconhecida. **Um número em falta é honesto; um número inventado não é.**",
        },
        code("offshore"),
        {
          p:
            "É só isto. O cosseno do ângulo entre a direção de onde vem o vento e a direção para " +
            "onde a praia está virada, com o sinal trocado para que +1 seja offshore limpo e -1 " +
            "seja mar todo estragado.",
        },
      ],
    },
    {
      id: "the-score",
      heading: "A pontuação",
      lede: "Quatro fatores, cada um numa rampa de 0 a 1, combinados de modo a que o mais fraco decida.",
      blocks: [
        {
          p:
            "**Para uma sessão valer a pena, quatro coisas têm de estar certas ao mesmo tempo, e " +
            "qualquer uma delas sozinha consegue estragar tudo.** É essa estrutura que define o " +
            "desenho da pontuação.",
        },
        {
          table: {
            head: ["Fator", "O que mede", "Estragado quando"],
            rows: [
              [
                "Tamanho",
                "Altura da ondulação face a um intervalo utilizável",
                "Está flat, ou passa o que o spot aguenta",
              ],
              [
                "Período",
                "Segundos entre ondas, que separa ondulação de fundo de borrego de vento",
                "Período curto: ondas picadas e sem força",
              ],
              [
                "Vento",
                "Direção face à praia, escalada pela intensidade",
                "Forte e onshore",
              ],
              [
                "Exposição",
                "Se a ondulação consegue mesmo chegar à praia",
                "Tapada por uma ponta",
              ],
            ],
          },
        },
        code("windRamp"),
        {
          p:
            "Repara no que a rampa do vento implica: a intensidade só conta na medida em que o " +
            "vento é onshore. Um offshore de 40 km/h quase não mexe na pontuação, o que está " +
            "correto, e é o tipo de coisa que um modelo teria de aprender com milhares de exemplos " +
            "para acertar.",
        },
        {
          p:
            "Os quatro fatores são depois combinados com uma média harmónica, e não com uma média " +
            "normal. É a linha mais consequente de todo o código de pontuação.",
        },
        code("harmonic"),
        {
          note: {
            tone: "wrong",
            text:
              "A primeira versão usava média geométrica e era demasiado simpática. Com quatro " +
              "fatores tira uma raiz de índice quatro, por isso um período miserável de 0,2 ao lado " +
              "de três fatores em 0,9 ainda dava 6,2 em 10, o que mandava alguém para uma praia " +
              "cheia de borrego sem força. A média harmónica devolve 3,7 para as mesmas condições. " +
              "Qualquer fator a zero continua a vetar a pontuação toda, e é isso que faz uma praia " +
              "tapada dar zero em vez de uma média educada.",
          },
        },
      ],
    },
    {
      id: "correcting-the-forecast",
      heading: "A parte de aprendizagem automática",
      lede: "A previsão erra com um padrão. Um padrão é algo que se pode aprender.",
      blocks: [
        {
          p:
            "Todas as horas guardamos o que a previsão disse. Mais tarde, essa mesma hora chega ao " +
            "arquivo de reanálise, e guardamos isso também. Subtrai uma coisa à outra e tens um " +
            "exemplo etiquetado: foi assim que a previsão errou, e estas eram as condições em que " +
            `errou. Existem **${n(LIVE.pairedRows)} pares destes**, de ${LIVE.dataFrom} a ` +
            `${LIVE.dataTo}.`,
        },
        {
          stats: [
            { value: n(LIVE.pairedRows), label: "exemplos emparelhados" },
            { value: `${km(LIVE.doNothingMae)}`, label: "km/h de erro antes" },
            { value: `${km(LIVE.holdoutMae)}`, label: "km/h de erro depois" },
            { value: `${LIVE.spots}`, label: "spots cobertos" },
          ],
        },
        {
          p:
            "A previsão de vento para esta costa fica curta, e não por uma constante. Erra **cerca de 4,4 km/h à meia-noite e quase nada às 15:00**. Isto é um ciclo de nortada, e é " +
            "exatamente o tipo de padrão estável e físico que vale a pena aprender.",
        },
        { chart: "correction" },
        {
          p:
            "Estes são os números que estão mesmo no ar, lidos do ficheiro do modelo que a API " +
            "carrega. A correção é somada ao vento previsto antes de a pontuação ser calculada, e a " +
            "página do spot diz-te quando foi aplicada, porque tens direito a saber porque é que o " +
            "nosso vento é diferente do que o serviço de previsão publicou.",
        },
        {
          p:
            "Treiná-la são três linhas. Tudo o que foi difícil nisto foi decidir se havíamos de " +
            "acreditar no resultado.",
        },
        code("fit"),
        {
          p:
            "A mediana em vez da média, porque a métrica que reportamos é o erro absoluto médio, e " +
            "a mediana é a constante que minimiza o erro absoluto. Treinar uma coisa e reportar " +
            "outra é a forma silenciosa de um teste se elogiar a si próprio.",
        },
        {
          table: {
            head: ["Abordagem", "Erro médio em dados que nunca tinha visto"],
            rows: [
              [
                "Confiar na previsão tal como publicada",
                `${km(LIVE.doNothingMae)} km/h`,
              ],
              ["A correção que pusemos no ar", `${km(LIVE.holdoutMae)} km/h`],
            ],
          },
        },
        {
          p:
            `Uma melhoria de ${km(LIVE.improvement)} km/h. Pequena em termos absolutos, e muda a ` +
            "classificação mostrada em cerca de uma em vinte horas-spot, da palavra errada para a " +
            "certa.",
        },
      ],
    },
    {
      id: "honest-evaluation",
      heading: "Como sabemos que funciona mesmo",
      lede: "A parte que a maioria dos artigos salta, e a que mudou as nossas conclusões duas vezes.",
      blocks: [
        {
          p:
            "**É fácil produzir um número impressionante para um modelo. O difícil é produzir um que " +
            "sobreviva ao contacto com a semana seguinte.** Três hábitos fizeram quase todo o " +
            "trabalho.",
        },
        {
          p:
            "**Dividir por tempo, nunca ao acaso.** A forma óbvia de testar um modelo é guardar um " +
            `quarto das ${n(LIVE.pairedRows)} linhas ao acaso. Teria sido mentira. Os ` +
            `${LIVE.spots} spots partilham o mesmo tempo meteorológico, por isso as 09:00 numa ` +
            "praia e as 09:00 na praia seguinte são quase o mesmo exemplo, e a mesma praia às 09:00 " +
            "e às 10:00 quase também. Põe um no treino e o gémeo no teste e estás a pedir ao modelo " +
            "que se lembre, não que preveja.",
        },
        code("split"),
        {
          note: {
            tone: "wrong",
            text:
              "Isto não é teórico. Uma correção por spot foi o melhor método nas semanas de treino " +
              "(2,414 km/h) e quase o pior nas semanas guardadas (2,623). Uma divisão ao acaso " +
              "ter-lhe-ia dado cerca de 2,41 e recomendado que fosse para produção. O desvio por " +
              "spot era real naquelas semanas e não sobreviveu às seguintes.",
          },
        },
        {
          p:
            `**Contar horas, não linhas.** Aquelas ${n(LIVE.pairedRows)} linhas contêm apenas cerca ` +
            `de ${n(LIVE.pairedHours)} horas distintas, porque cada hora aparece uma vez por spot. ` +
            "Qualquer intervalo de confiança que as trate como observações independentes vai ficar " +
            "estreito de mais. Por isso, quando testamos se um método ganha mesmo a outro, " +
            "reamostramos horas inteiras em vez de linhas.",
        },
        code("bootstrap"),
        {
          p:
            "**Escrever as referências primeiro.** Antes de existir qualquer modelo medimos as " +
            "coisas mais preguiçosas que podiam funcionar: não fazer nada, subtrair um número, " +
            "subtrair um número por spot, subtrair um número por hora. **Uma referência inventada depois do modelo é uma referência escolhida para perder.**",
        },
        {
          note: {
            tone: "insight",
            text:
              "O modelo de gradient boosting ganhou a todas as referências, e mesmo assim pusemos " +
              "no ar a tabela por hora. A vantagem que lhe restava eram 0,6 pontos percentuais de " +
              "classificações mostradas, e teria custado 75 MB de memória num servidor com 512 MB, " +
              "mais a possibilidade de te explicar o ajuste numa frase. Um modelo ganhar a métrica " +
              "não é o mesmo que merecer o lugar.",
          },
        },
      ],
    },
    {
      id: "what-we-got-wrong",
      heading: "Aquilo em que nos enganámos",
      lede: "Guardado de propósito, porque as correções ensinam mais do que os acertos.",
      blocks: [
        {
          p:
            "Tudo o que está em baixo foi acreditado, escrito, e depois desmentido por uma medição. " +
            "Está listado porque um projeto que só publica as vitórias não ensina nada sobre como " +
            "as vitórias foram encontradas.",
        },
        {
          table: {
            head: ["O que acreditávamos", "O que era verdade"],
            rows: [
              [
                "Uma média geométrica combina bem os quatro fatores.",
                "Generosa de mais. Um período miserável ao lado de três fatores bons ainda dava 6,2. A harmónica dá 3,7.",
              ],
              [
                "O site precisava de melhores metadados para ser encontrado.",
                "Servia 29 palavras visíveis e nem um nome de spot. Era um problema de renderização, não de metadados.",
              ],
              [
                "Uma correção por spot devia ajudar, já que o desvio difere de praia para praia.",
                "A melhor nos dados de treino, a segunda pior nos dados guardados. Estava a decorar, não a aprender.",
              ],
              [
                "Ganhar a uma correção constante quer dizer que o modelo é bom.",
                "Essa constante tinha sido medida nos mesmos dados em que foi avaliada. A fasquia real era mais alta, e subiu duas vezes.",
              ],
              [
                "Escolhemos bem as definições do modelo.",
                "O modelo foi afinado às cegas e depois comparado com uma referência escolhida a espreitar as respostas. A comparação estava viciada a favor da referência.",
              ],
              [
                "Os testes cobrem a lógica da correção.",
                "Todas as mutações que conseguimos inventar foram apanhadas, e uma chamada real ainda encontrou leituras de arquivo a reportar um ajuste de zero onde não deviam reportar ajuste nenhum.",
              ],
            ],
          },
        },
        {
          note: {
            tone: "insight",
            text:
              "O padrão nos seis casos: a crença era razoável, e a única coisa que a expôs foi " +
              "medir a coisa específica em vez da coisa conveniente.",
          },
        },
      ],
    },
    {
      id: "whats-blocked",
      heading: "O que ainda falta",
      lede: "A lacuna honesta, e a única coisa que a fecharia.",
      blocks: [
        {
          p:
            "O objetivo nunca foi corrigir uma previsão de vento. Era aprender **o que faz uma sessão valer a pena**, que é uma pergunta diferente e melhor: envolve gente na água, maré, " +
            "escolha de prancha e o teu nível, e nada disso aparece em previsão nenhuma.",
        },
        {
          p:
            "Esse modelo precisa de etiquetas, e etiquetas são surfistas a avaliar sessões que " +
            "surfaram mesmo. A fasquia são 80 sessões avaliadas, com uma distribuição razoável " +
            "entre boas e más. **Neste momento a contagem é zero**, e não há engenharia que mexa nisso.",
        },
        {
          p:
            "Por isso o modelo de avaliação de sessões está adiado, não cancelado, e a correção da " +
            "previsão é trabalho genuíno encontrado entretanto, e não um substituto. Se surfas esta " +
            "costa: entra, regista uma sessão, avalia-a. É esse o bloqueio.",
        },
        {
          list: [
            "Batimetria, que é o que faltaria para ter um termo de maré honesto na pontuação.",
            "Um modelo de avaliação de sessões, bloqueado apenas por etiquetas.",
            "Saber se a correção de vento se aguenta num regime de ondulação de inverno. Para já viu um verão.",
          ],
        },
      ],
    },
    {
      id: "the-code",
      heading: "O código",
      lede: "Está tudo público, incluindo os registos de decisão.",
      blocks: [
        {
          p:
            "Python e FastAPI para a API e para a aprendizagem automática, Postgres com PostGIS no " +
            "Supabase, Next.js na Vercel para este site, trabalhos agendados no GitHub Actions. " +
            "Está tudo em plano gratuito, uma restrição que moldou várias das decisões acima, " +
            "incluindo a correção que ficou no ar.",
        },
        {
          p:
            "As decisões importantes ficam registadas como ADRs no repositório, cada uma escrita no " +
            "momento em que foi tomada e não reconstruída depois. Se alguma parte desta página " +
            "parecer confiante de mais, o ADR por trás mostra o argumento e, quase sempre, a " +
            "medição que o resolveu.",
        },
      ],
    },
  ],
};

export const EXPLAINER: Record<Locale, ExplainerDoc> = { pt: PT, en: EN };
