# beFORE - Surf Intelligence: Design Specification

**Status:** Approved (design phase)
**Date:** 2026-07-20
**Author:** Francisco Ferreira (with ML mentor)
**Module:** Surf Intelligence (first module of the beFORE platform)

---

## 1. Vision & scope

**beFORE** is a platform that helps users decide whether outdoor sports are *worth doing*
given environmental conditions. It is **not** an AI wrapper - we collect data and train our
own models. The long-term platform may cover surf, bodyboard, bodysurf, longboard, kitesurf,
windsurf, hiking, trekking, MTB, skiing, snowboarding, trail running, etc.

**We build one module at a time.** This spec covers **only the first module: Surf Intelligence.**

### In scope (this spec)
- A **BeFORE score** (0-10 surf-quality rating) for a spot at a given time.
- **~20-50 spots on the Lisbon / Ericeira coast** (one home region we can personally validate).
- A **maturity ladder**: heuristic v0 → ML v1 (on labels we own) → personalized v2 (future).
- Data collected from **free, openly-licensed APIs** only.

### Out of scope (deferred)
- Other sports / modules.
- Global coverage.
- Personalization / per-user models (v2 - future).
- Any scraping of competitor surf ratings (see §4).

---

## 2. The ML problem definition

**Prediction target:** a single **BeFORE score** expressing "how good is the surf" for a
spot at a time. This is the product the user actually wants. It is a regression (continuous
0-10) *or* ordinal classification (Poor / Fair / Good / Epic) problem.

> **Deferred decision:** regression vs. ordinal classification is decided at **Milestone 7**,
> with real data in front of us. It does not block earlier work.

### Analogy for the software engineer
- A trained **model** ≈ a compiled software component with a fixed interface.
- **Training** ≈ compilation: source (data) → artifact (model).
- The **feature pipeline** ≈ a series of transformation passes (like a compiler's passes /
  a Unix pipe).

---

## 3. The label strategy - the "maturity ladder"

Supervised ML learns a mapping **features → label**. Our features (conditions) are easy to
source; the **label** ("how good was the surf") is the hard part and is the crux of the project.

### The circularity trap (why a pure heuristic is not ML)
If we hand-write a scoring formula and then train a model to reproduce it, the model just
approximates an `if` statement we already wrote - we learn nothing. ML earns its place only
when the label comes from **real-world human judgment** too complex to hand-code.

### The ladder
The heuristic and the ML model **share the same pipeline** (ingestion, features, storage, API,
UI). Only the "brain" - the `Scorer` - changes. This is *stable interface, swappable
implementation*: define a `Scorer` interface, ship `HeuristicScorer` first, swap in `MLScorer`
later with zero changes to the rest of the system.

| Stage | Scorer | Label source | What we learn |
|-------|--------|--------------|---------------|
| **v0** | `HeuristicScorer` (transparent rules) | none - it *is* the rule | full pipeline, EDA, domain, a **baseline** |
| **v1** | `MLScorer` (gradient-boosted trees) | **labels we own**: primarily user session ratings (rate a surfed session good-or-not, needs no forecasting expertise) + measured-condition sanity checks | real supervised ML, beating a baseline, evaluation, XAI |
| **v2** *(future)* | `MLScorer` + personalization | per-user rating history | recommenders, cold-start, personalization |

**Two key properties of the ladder:**
- The heuristic is **not throwaway** - it is ~80% of the production system *plus* the mandatory
  baseline the ML model must beat. (If ML can't beat the heuristic, the ML is worthless - and
  you only know that because the heuristic exists.)
- The cold-start problem is solved *by* v0: the heuristic launches the product and the UI where
  users rate sessions, which generates the labels v1 needs. The system bootstraps its own data.

**Revision (2026-07-20):** the project owner is *not* a surf expert, so we do NOT rely on expert
annotation for labels. v1 leans primarily on **user session ratings** (rating a session you
surfed as good-or-not needs no forecasting expertise) plus **measured-condition sanity checks**.
This also pushes the whole project to be more purely data-driven, which is a feature, not a bug.
The full v1 label design is finalized at M7.

---

## 4. Legal & ethical stance

There are **two legally distinct kinds of data**:

1. **Raw environmental conditions** (wave, wind, tide, temperature) - facts about the physical
   world, produced by government/open sources, generally free and openly licensed. **We use these.**
2. **Derived competitor surf ratings** (e.g. Surfline star ratings) - a *product*, protected by
   copyright, ToS, and (in the EU) the *sui generis database right* (Directive 96/9/EC, which
   protects substantial extraction even of factual data). **We do NOT scrape or train on these.**

**Decision:** we never build on copyrighted competitor ratings. Reasons: (a) legal risk in the
EU (Portugal); (b) it's a portfolio project - questionable provenance is a career/red-flag, not
a flex; (c) it would make beFORE a *derivative* capped at "imitate the competitor," a strictly
worse product; (d) providers detect derivation via canary/honeypot entries. Building the label
pipeline ourselves is the strictly better engineering and product decision.

**GDPR:** collecting user session ratings makes us a data controller - lawful basis, privacy
policy, and deletion are designed in from the start of the user-facing features (M6+).

---

## 5. Feature engineering

Features split into two classes that behave very differently:

### Static spot metadata (per spot, rarely changes)
| Attribute | Source | Scales automatically? |
|---|---|---|
| Beach/shore orientation (°) | **Computed** from OpenStreetMap coastline geometry (shore-normal azimuth) | ✅ |
| Bathymetry / bottom slope | **GEBCO** (global) / **EMODnet** (EU) open datasets | ✅ |
| Wind shelter / exposure | **Computed** from coastline + terrain elevation (later, advanced) | ✅ (eventually) |
| Spot list + coordinates | **OpenStreetMap** (Overpass, `sport=surfing`) + **Wikidata**, extracted automatically; manual correction supported | ✅ (mostly) |
| Break type, wave character | **Best-effort** from OSM/Wikidata tags; else `NULL`/unknown. Not required by v0, which relies on computed features. Manual correction supported. | partial |

### Dynamic conditions (change hourly - scraped live)
Swell height / period / direction; wind speed / direction; tide state; water & air temperature.

### The central insight: feature interaction
Surf quality is **not** a function of conditions alone - it is conditions **interacting with the
spot's fixed geometry**. A 2 m NW swell is epic at a NW-facing beach and garbage at an SE-facing
one. We therefore compute **derived features** that encode the *relationship*, e.g.:
- `offshore_component` = alignment of wind direction with the shore-normal (captures
  offshore/onshore for *any* beach automatically).
- `swell_exposure` = how well swell direction hits the beach's opening, given orientation + shelter.

Derived geometric features are gold because they **scale to beaches we've never visited**.

---

## 6. Data sources (all free / open)

- **Forecast conditions** (serving time): **Open-Meteo** marine + weather API.
- **Archive / reanalysis conditions** (training time - reconstruct the past): **Open-Meteo
  historical API (ERA5-backed)** and/or **Copernicus Marine Service** hindcasts.
- **Bathymetry:** GEBCO / EMODnet.
- **Spot locations & metadata:** OpenStreetMap (Overpass API) + Wikidata, extracted automatically;
  individual spots can be corrected by hand in a versioned seed.
- **Map tiles:** OpenStreetMap via MapLibre / Leaflet (no paid API key).

> **Forecast ≠ training data.** Forecasts describe the future and are used at *serving* time.
> Training needs *history*: pairs of (past conditions, past quality). Hence we (a) use archive
> APIs, and (b) **start logging live conditions from day one** to accumulate a proprietary
> time-series - structured logging before we need it.

---

## 7. System architecture

A **pipeline**: each stage transforms and hands off.

```
   ┌─────────────────────────────────────────────────────────────┐
   │            STATIC (built once, rarely changes)                │
   │  Spot registry: coords, break type, orientation°, bathymetry  │
   │  ← OpenStreetMap / Wikidata / GEBCO + automated extraction     │
   └───────────────────────────────┬─────────────────────────────┘
                                    │
   ┌────────────────┐   daily   ┌───▼──────────┐   ┌──────────────────┐
   │  Open-Meteo /  │──────────▶│  INGESTION   │──▶│  STORAGE         │
   │  Copernicus    │  scrape   │  (scheduled) │   │  (Postgres)      │
   │  (forecast +   │           └──────────────┘   │  raw conditions  │
   │   archive)     │                              │  + spot registry │
   └────────────────┘                              └────────┬─────────┘
                                                            │
                                              ┌─────────────▼─────────────┐
                                              │  FEATURE ENGINEERING       │
                                              │  raw → derived features    │
                                              └─────────────┬─────────────┘
                                                            │
                    ┌───────────────────────────────────────┼──────────────────┐
              (training)                                (serving)                │
        ┌───────────▼───────────┐              ┌───────────▼───────────┐        │
        │  TRAINING             │   produces   │  SCORER (interface)   │        │
        │  features + labels    │─────────────▶│  v0 HeuristicScorer   │        │
        │  → model artifact     │   artifact   │  v1 MLScorer (swap)   │        │
        └───────────────────────┘              └───────────┬───────────┘        │
                                                            │                    │
                                              ┌─────────────▼─────────┐          │
                                              │  API (FastAPI)        │          │
                                              │  GET /score?spot&time │          │
                                              └─────────────┬─────────┘          │
                                                            │                    │
                                              ┌─────────────▼─────────┐          │
                                              │  WEB UI (map + score) │◀─────────┘
                                              │  + session logging    │  (feeds labels back)
                                              └───────────────────────┘
```

**Architectural decisions:**
- **No separate `ml-service`** in v0/v1. The model is a tiny artifact loaded *inside* the
  FastAPI process. A model-serving microservice is a scaling optimization deferred until the
  model is large or traffic is high (avoid premature abstraction).
- **Frontend is thin and last.** The intellectual/ML work is the left+middle of the diagram
  (all in `ml/`). The UI just calls `GET /score`.

---

## 8. Technology stack (100% free-tier)

| Layer | Choice | Notes |
|---|---|---|
| ML + backend | **Python + FastAPI** | One language for ML *and* serving → eliminates **training/serving skew** (features written once, imported by both). |
| Database + Auth + Storage | **Supabase (Postgres + PostGIS)** | Relational + time-series + geospatial fit. ~500 MB free DB; pauses after ~7 days idle (daily cron keeps it awake). Bundled Auth for v2. |
| Frontend | **Next.js / React** on Vercel | Best ecosystem + Vercel integration + portfolio signal. |
| Map | **MapLibre / Leaflet + OSM tiles** | No paid API key. |
| Scheduled ingestion | **GitHub Actions cron** | Daily Python job → Supabase. No server needed; versioned with code. |
| Experiment tracking *(M8)* | MLflow (local) or W&B free | Introduced only when useful. |
| Self-hosting | **No** | Managed free tiers only. |

> **Honest caveat:** the only piece without a truly frictionless free "always-on" option is the
> Python API. Free hosts either use serverless functions (cold starts, size limits) or spin down
> when idle. Plan: FastAPI → Vercel Python functions first, fall back to Hugging Face Spaces /
> Render if we hit limits. FastAPI is portable, so the host is not a locked-in decision.

---

## 9. Repository structure

```
before/
├── ml/                     # THE BRAIN - milestones 1-4 live here
│   ├── ingestion/          #   open APIs → Postgres (runs in GH Actions)
│   ├── features/           #   feature engineering - SHARED by train AND serve
│   ├── scoring/            #   Scorer interface + HeuristicScorer, later MLScorer
│   ├── training/           #   train scripts → model artifact
│   ├── evaluation/         #   metrics, backtests, baseline comparison
│   ├── notebooks/          #   EDA & experiments (exploratory)
│   └── pyproject.toml      #   ml/ is an INSTALLABLE PACKAGE
├── apps/
│   ├── api/                # FastAPI - imports `ml`      (built ~M5)
│   └── web/                # Next.js frontend            (built ~M6)
├── db/                     # SQL migrations = schema source of truth
├── docs/                   # design docs + ADRs
├── scripts/                # dev tooling
└── infrastructure/         # CI/CD & deploy config (later)
```

**Key decisions:**
- **`ml/` is an installable package**; `apps/api` depends on it. `ml/features` and `ml/scoring`
  are written once and imported by both training (offline) and API (online) → training/serving
  skew is impossible by construction.
- **`apps/` stays empty until M5-M6.** The full ML core is built before any API/UI.
- **`db/` holds SQL migrations** (schema versioned & reproducible - not dashboard clicks).

---

## 10. Multi-sport extensibility

**Stance: clean boundaries now, zero multi-sport abstraction yet** (avoid over-engineering -
don't build a plugin system for one plugin).

Natural seams already exist: `ingestion` and the `Scorer` *interface* are sport-agnostic.
Water sports (bodyboard, bodysurf, kitesurf) would reuse ~80% of surf's pipeline with a
different scoring function; land/snow sports (hiking, MTB, ski) need different data and become
separate modules later. When sport #2 actually arrives, promoting to `modules/surf`,
`modules/bodyboard` is a cheap mechanical refactor. This reasoning is recorded as an ADR.

---

## 11. Milestone roadmap

Milestones 0-6 deliver **v0** (a usable product with an honest heuristic brain); 7-8 deliver
**v1** (real ML). Each milestone begins with an objective / difficulty / learning-goals briefing.

| # | Milestone | Core learning | Difficulty |
|---|---|---|---|
| **0** | Foundations (monorepo, `uv`, `ruff`, pre-commit, Supabase, secrets, ADRs) | Reproducible env, Git workflow, tooling | 🟢 Easy |
| **1** | Spot registry (static): SQL schema (Supabase CLI), auto-extract spots (OSM/Wikidata), compute orientation; break type best-effort; bathymetry deferred | Data modeling, PostGIS, geospatial, migrations | 🟡 Medium |
| **2** | Ingestion pipeline (dynamic): daily scraper → Postgres, archive backfill, GH Actions cron | Data engineering, scheduling, idempotency | 🟡 Medium |
| **3** | EDA + feature engineering: explore data, build shared feature module | EDA, feature engineering, interactions | 🟡 Medium |
| **4** | Heuristic scorer v0 + eval harness: `Scorer` interface, `HeuristicScorer`, baseline | Baselines, abstraction, evaluation | 🟡 Medium |
| **5** | API: FastAPI wrapping the Scorer (`GET /spots`, `GET /score`), deploy | Model serving, API design | 🟡 Medium |
| **6** | Web UI: Next.js map + score + session logging (closes label loop) | Frontend integration, label collection | 🟡 Medium |
| | **── v0 shipped ──** | | |
| **7** | First ML model (v1): build training set, train `MLScorer`, beat the heuristic | Supervised training, train/val/test, CV, model selection | 🔴 Hard |
| **8** | Tuning + XAI + MLOps: hyperparameter tuning, SHAP, experiment tracking, versioning, CI | Tuning, Explainable AI, MLOps | 🔴 Hard |
| | **── v1 shipped. v2 (personalization) = future ──** | | |

> **Most important lesson:** milestones 0-6 contain almost no "AI." Real ML is ~80% data
> engineering, EDA, and evaluation plumbing; the model is the small exciting bit at the end that
> only works because the boring parts are solid.

---

## 12. Success criteria

- **v0:** a deployed, usable web app showing a BeFORE score for each spot on the target coast,
  driven by a transparent heuristic, with session logging collecting labels. Sanity is judged by
  whether scores agree with measured conditions and general surf logic, not by expert intuition.
- **v1:** an `MLScorer` that **measurably beats the `HeuristicScorer` baseline** on held-out data,
  with an evaluation report and explainability (feature importance / SHAP).
- **Throughout:** clean, tested, documented code; reproducible environment; decisions recorded
  as ADRs.

---

## 13. Deferred decisions (revisited later, deliberately)

- Regression vs. ordinal classification for the score → **M7**.
- Exact spot list (~20-50, auto-extracted from OSM/Wikidata, manually correctable) → **M1**.
- Bathymetry sourcing (GEBCO/EMODnet) → deferred until the heuristic needs it (post-M1).
- Final v1 label design (session ratings vs any expert/annotation signal) → **M7**.
- Exact API deploy host (Vercel functions vs HF Spaces vs Render) → **M5**.
- Experiment-tracking tool (MLflow vs W&B) → **M8**.
- Multi-sport module restructuring → when sport #2 is scheduled.

## Decisions made after initial approval (see ADRs)

- Schema management: Supabase CLI + hand-written SQL migrations (ADR-0002).
- Spot sourcing: automated from OSM/Wikidata, no reliance on expert annotation (ADR-0003).
