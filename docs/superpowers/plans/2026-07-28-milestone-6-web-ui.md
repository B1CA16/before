# Milestone 6: Web UI (read-only) and Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js/React read-only frontend showing a map of spots (markers colored + numbered by current BeFORE score) and, for a selected spot, its forecast timeline. Backed by a new `GET /scores` endpoint. Then deploy the API and frontend to free hosts.

**Architecture:** `apps/web` is a standalone Next.js (App Router, TypeScript, Tailwind) app in the monorepo, not a uv member; it talks to the Python API over HTTP (`NEXT_PUBLIC_API_URL`). The map is a client-only Leaflet component (`ssr: false`). The forecast panel fetches per-spot forecasts and renders a Recharts timeline. A small `GET /scores` endpoint (current-hour score per spot) powers the map colors. Deploy: frontend to Vercel, API to a free Python host.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, react-leaflet + Leaflet, Recharts, Vitest (pure-helper tests); Python/FastAPI for the new endpoint.

## Global Constraints

- Python floor `>=3.12`. Free-tier only. No em-dashes anywhere (pre-commit enforces this).
- Never auto-commit: each Commit step provides a single conventional-commit subject line for Francisco.
- Commands are PowerShell on Windows. Prepend uv to PATH if needed: `$env:Path = "C:\Users\franc\.local\bin;$env:Path"`.
- Backend code under `apps/api`/`ml`; frontend under `apps/web` (npm, TypeScript).
- Attribution "© OpenStreetMap contributors" is required on the map (Leaflet shows it by default).

## Implementation decisions (flagged for review)

- New `GET /scores` returns `[{slug, score}]` for the current-hour forecast per spot (map colors).
- Frontend: Next.js App Router + TS + Tailwind, `apps/web`, npm, API URL via `NEXT_PUBLIC_API_URL`.
- Map: react-leaflet, client-only via dynamic import `ssr:false`, OSM raster tiles + attribution.
  Markers colored AND numbered by score (color is never the only cue: accessibility).
- Forecast timeline: Recharts line chart of score over time; raw conditions on hover/below.
- Frontend tests: Vitest for pure helpers only (score->color, formatting); components verified by
  build + manual. Component/e2e testing deferred.
- Deploy: frontend to Vercel; API to a free Python host (try Render/HF Spaces; cold starts accepted).
- Renumber roadmap: this M6 (read-only UI+deploy); M7 session logging; M8 ML model; M9 tuning.

---

### Task 1: `GET /scores` endpoint and roadmap update

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md` (roadmap renumber)
- Modify: `apps/api/src/before_api/repository.py` (add `get_current_conditions`)
- Modify: `apps/api/src/before_api/forecast.py` (add `build_score_rows`)
- Modify: `apps/api/src/before_api/schemas.py` (add `ScoreOut`)
- Modify: `apps/api/src/before_api/main.py` (add `/scores`)
- Test: `apps/api/tests/test_scores.py`

**Interfaces:**
- `SupabaseRepository.get_current_conditions() -> pd.DataFrame` (one current-hour row per spot).
- `build_score_rows(df, scorer) -> list[dict]` -> `[{slug, score}]`, NaN->None.
- `ScoreOut(slug: str, score: float | None)`; `GET /scores -> list[ScoreOut]`.

- [ ] **Step 1: update the design-spec roadmap (reflect the M6 split)**

In `docs/superpowers/specs/2026-07-20-surf-intelligence-design.md`, section 11 roadmap, change the
M6 row and following so they read (keep table formatting consistent with the file):
```
| **6** | Web UI (read-only): Next.js map + score forecast; deploy API + frontend | Frontend, deployment | Medium |
| **7** | Session logging + labels: auth, sessions table, ratings (closes the label loop) | Auth, data modeling, GDPR | Medium |
| **8** | First ML model: train MLScorer on collected labels, beat the heuristic | Supervised training, CV | Hard |
| **9** | Tuning + XAI + MLOps: hyperparameter tuning, SHAP, tracking, versioning | Tuning, XAI, MLOps | Hard |
```
Add a one-line note under the table: "Roadmap renumbered 2026-07-28: original M6 split into read-only UI (M6) and session logging (M7); model and tuning shifted to M8/M9."

- [ ] **Step 2: write a failing test for the score-row builder and endpoint**

`apps/api/tests/test_scores.py`:
```python
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from before_api.forecast import build_score_rows
from before_api.main import app
from before_api.repository import get_repository
from before_surf.scoring.heuristic import HeuristicScorer


def _current_df():
    return pd.DataFrame(
        [
            {
                "slug": "carcavelos", "orientation_deg": 270.0, "swell_height_m": 1.8,
                "swell_period_s": 12.0, "swell_direction_deg": 270.0,
                "wind_speed_kmh": 8.0, "wind_direction_deg": 90.0,
            },
            {
                "slug": "unknown-orient", "orientation_deg": np.nan, "swell_height_m": 1.0,
                "swell_period_s": 9.0, "swell_direction_deg": 250.0,
                "wind_speed_kmh": 10.0, "wind_direction_deg": 100.0,
            },
        ]
    )


def test_build_score_rows_and_nan():
    rows = build_score_rows(_current_df(), HeuristicScorer())
    by_slug = {r["slug"]: r["score"] for r in rows}
    assert 0.0 <= by_slug["carcavelos"] <= 10.0
    assert by_slug["unknown-orient"] is None  # unknown orientation -> null score


def test_build_score_rows_empty():
    assert build_score_rows(pd.DataFrame(), HeuristicScorer()) == []


class FakeRepo:
    def get_current_conditions(self):
        return _current_df()


def test_scores_endpoint():
    app.dependency_overrides[get_repository] = lambda: FakeRepo()
    try:
        response = TestClient(app).get("/scores")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = {r["slug"]: r["score"] for r in response.json()}
    assert "carcavelos" in body
    assert body["unknown-orient"] is None
```

- [ ] **Step 3: run it, confirm failure**

Run: `uv run pytest apps/api/tests/test_scores.py -v`
Expected: FAIL with `ImportError: cannot import name 'build_score_rows'`.

- [ ] **Step 4: implement the builder, schema, repository method, endpoint**

Add to `apps/api/src/before_api/forecast.py` (reuses `_clean`, `build_features`):
```python
def build_score_rows(df: pd.DataFrame, scorer: HeuristicScorer) -> list[dict]:
    if df.empty:
        return []
    scores = build_features(df).pipe(scorer.score)
    return [
        {"slug": df["slug"].iloc[i], "score": _clean(scores.iloc[i])}
        for i in range(len(df))
    ]
```

Add to `apps/api/src/before_api/schemas.py`:
```python
class ScoreOut(BaseModel):
    slug: str
    score: float | None
```

Add to `apps/api/src/before_api/repository.py`:
```python
_CURRENT_CONDITIONS_QUERY = """
select distinct on (s.slug)
       s.slug, s.orientation_deg,
       c.swell_height_m, c.swell_period_s, c.swell_direction_deg,
       c.wind_speed_kmh, c.wind_direction_deg
from spots s
join conditions c on c.spot_id = s.id and c.source = 'forecast'
where c.observed_at >= now()
order by s.slug, c.observed_at
"""
```
and a method on `SupabaseRepository`:
```python
    def get_current_conditions(self) -> pd.DataFrame:
        with psycopg.connect(self.database_url) as conn:
            cur = conn.execute(_CURRENT_CONDITIONS_QUERY)
            columns = [desc.name for desc in cur.description]
            data = cur.fetchall()
        return pd.DataFrame(data, columns=columns)
```

Add to `apps/api/src/before_api/main.py` (import `ScoreOut` and `build_score_rows`):
```python
@app.get("/scores", response_model=list[ScoreOut])
def scores(repo: RepoDep):
    return build_score_rows(repo.get_current_conditions(), _scorer)
```

- [ ] **Step 5: run tests, expect pass**

Run: `uv run pytest apps/api/tests/ -q`
Expected: all API tests pass (including the 3 new ones).

- [ ] **Step 6: verify against real DB and commit**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "from fastapi.testclient import TestClient; from before_api.main import app; r=TestClient(app).get('/scores').json(); print('count', len(r)); print('sample', r[:3])"
```
Expected: a list of `{slug, score}` (some scores may be null). Then commit:
```
feat: add /scores endpoint and renumber roadmap
```

---

### Task 2: scaffold the Next.js app and API client

**Files:**
- Create: `apps/web/` (Next.js app via create-next-app)
- Create: `apps/web/.env.local` (gitignored) and `apps/web/.env.example`
- Create: `apps/web/src/lib/api.ts` (typed API client)

**Interfaces:**
- A running Next.js dev app; `api.ts` exports `getSpots()`, `getScores()`, `getForecast(slug)`.

- [ ] **Step 1: ensure Node is installed (Francisco, own terminal)**

Check: `node --version` (need 18+). If missing, install (e.g. `scoop install nodejs-lts`, or the installer from nodejs.org), then reopen the terminal.

- [ ] **Step 2: scaffold the app**

Remove the placeholder and scaffold:
```powershell
Remove-Item apps/web/.gitkeep -ErrorAction SilentlyContinue
npx create-next-app@latest apps/web --ts --tailwind --app --src-dir --eslint --use-npm --import-alias "@/*" --yes
```
Answer any remaining prompts with defaults (no Turbopack requirement, no React Compiler needed). This creates the Next.js app under `apps/web`.

- [ ] **Step 3: configure the API URL env**

`apps/web/.env.example`:
```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```
`apps/web/.env.local` (gitignored by the Next template):
```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

- [ ] **Step 4: write the typed API client**

`apps/web/src/lib/api.ts`:
```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type Spot = {
  slug: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  orientation_deg: number | null;
};

export type ScoreNow = { slug: string; score: number | null };

export type ForecastHour = {
  observed_at: string;
  score: number | null;
  size: number | null;
  period: number | null;
  wind: number | null;
  exposure: number | null;
  swell_height_m: number | null;
  swell_period_s: number | null;
  wind_speed_kmh: number | null;
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const getSpots = () => getJson<Spot[]>("/spots");
export const getScores = () => getJson<ScoreNow[]>("/scores");
export const getForecast = (slug: string) =>
  getJson<ForecastHour[]>(`/spots/${slug}/forecast`);
```

- [ ] **Step 5: verify dev server and build**

Run (in `apps/web`, own terminal):
```powershell
cd apps/web; npm run dev
```
Expected: Next.js starts at `http://localhost:3000` (default template page). Stop with Ctrl+C.
Then verify a production build compiles:
```powershell
npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

Message:
```
build: scaffold Next.js web app with API client
```

---

### Task 3: the spot map (score-colored markers)

**Files:**
- Create: `apps/web/src/lib/score.ts` (score -> color/label helpers)
- Create: `apps/web/src/components/SpotMap.tsx` (client-only Leaflet map)
- Test: `apps/web/src/lib/score.test.ts`
- Modify: `apps/web/src/app/page.tsx` (render the map)
- Modify: `apps/web/src/app/globals.css` (import Leaflet CSS) or import in the component

**Interfaces:**
- `scoreColor(score: number | null) -> string` (hex/tailwind color; grey for null).
- `scoreLabel(score: number | null) -> string` (e.g. "8.2" or "-").
- `SpotMap` renders markers for spots, colored + numbered by score, calls `onSelect(slug)`.

- [ ] **Step 1: install map + test deps**

Run (in `apps/web`):
```powershell
npm install leaflet react-leaflet
npm install -D @types/leaflet vitest
```

- [ ] **Step 2: write failing tests for the score helpers**

`apps/web/src/lib/score.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { scoreColor, scoreLabel } from "./score";

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
});
```
Add a test script to `apps/web/package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 3: run it, confirm failure**

Run (in `apps/web`): `npm test`
Expected: FAIL (cannot resolve `./score`).

- [ ] **Step 4: implement the helpers**

`apps/web/src/lib/score.ts`:
```typescript
// Colorblind-aware ramp: grey (unknown) -> red (poor) -> amber -> green (good).
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
```

- [ ] **Step 5: run tests, expect pass**

Run (in `apps/web`): `npm test`
Expected: 2 passed.

- [ ] **Step 6: implement the map component**

`apps/web/src/components/SpotMap.tsx`:
```tsx
"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";

import type { ScoreNow, Spot } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/score";

function numberedIcon(score: number | null): L.DivIcon {
  const color = scoreColor(score);
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border-radius:9999px;
      width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:600;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">
      ${scoreLabel(score)}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export default function SpotMap({
  spots,
  scores,
  onSelect,
}: {
  spots: Spot[];
  scores: Record<string, number | null>;
  onSelect: (slug: string) => void;
}) {
  return (
    <MapContainer center={[38.9, -9.4]} zoom={10} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {spots.map((spot) => (
        <Marker
          key={spot.slug}
          position={[spot.latitude, spot.longitude]}
          icon={numberedIcon(scores[spot.slug] ?? null)}
          eventHandlers={{ click: () => onSelect(spot.slug) }}
        >
          <Tooltip>{spot.name}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 7: render it on the page (client-side, dynamic import, ssr:false)**

Replace `apps/web/src/app/page.tsx`:
```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getScores, getSpots, type Spot } from "@/lib/api";

const SpotMap = dynamic(() => import("@/components/SpotMap"), { ssr: false });

export default function Home() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getSpots().then(setSpots).catch(console.error);
    getScores()
      .then((rows) => setScores(Object.fromEntries(rows.map((r) => [r.slug, r.score]))))
      .catch(console.error);
  }, []);

  return (
    <main className="h-screen w-screen">
      <div className="h-full w-full">
        <SpotMap spots={spots} scores={scores} onSelect={setSelected} />
      </div>
      {selected && (
        <div className="absolute right-2 top-2 rounded bg-white p-3 shadow">
          selected: {selected}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 8: verify in the browser (Francisco)**

With the API running (`uv run uvicorn before_api.main:app` at :8000) and `npm run dev` in `apps/web`,
open `http://localhost:3000`. Expected: a map of the Lisbon coast with ~92 colored, numbered markers;
clicking a marker shows its slug in the corner. Sanity-check that colors vary by score.

- [ ] **Step 9: Commit**

Message:
```
feat: add spot map with score-colored markers
```

---

### Task 4: the forecast panel (Recharts timeline)

**Files:**
- Create: `apps/web/src/components/ForecastPanel.tsx`
- Modify: `apps/web/src/app/page.tsx` (show the panel on selection)

**Interfaces:**
- `ForecastPanel({ slug })` fetches `/spots/{slug}/forecast` and renders a score-over-time chart
  plus the latest raw conditions; responsive (side panel desktop, bottom sheet mobile).

- [ ] **Step 1: install Recharts**

Run (in `apps/web`): `npm install recharts`

- [ ] **Step 2: implement the panel**

`apps/web/src/components/ForecastPanel.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { getForecast, type ForecastHour } from "@/lib/api";

export default function ForecastPanel({ slug }: { slug: string }) {
  const [hours, setHours] = useState<ForecastHour[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHours([]);
    setError(null);
    getForecast(slug)
      .then(setHours)
      .catch(() => setError("Could not load forecast"));
  }, [slug]);

  const data = hours
    .filter((h) => h.score !== null)
    .map((h) => ({ t: h.observed_at.slice(5, 16).replace("T", " "), score: h.score }));

  return (
    <section
      className="absolute bottom-0 left-0 right-0 max-h-[45%] overflow-auto bg-white p-4 shadow-lg
        md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:max-h-none md:w-96"
      aria-label={`Forecast for ${slug}`}
    >
      <h2 className="mb-2 text-lg font-semibold">{slug}</h2>
      {error && <p className="text-red-600">{error}</p>}
      {!error && data.length === 0 && <p className="text-gray-500">No forecast available.</p>}
      {data.length > 0 && (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" hide />
              <YAxis domain={[0, 10]} width={24} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#16a34a" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: wire the panel into the page**

In `apps/web/src/app/page.tsx`, replace the `selected &&` corner div with the panel:
```tsx
import ForecastPanel from "@/components/ForecastPanel";
// ...
{selected && <ForecastPanel slug={selected} />}
```

- [ ] **Step 4: verify in the browser (Francisco)**

With API + `npm run dev` running, open `http://localhost:3000`, click a spot with forecast data.
Expected: a panel (right on desktop, bottom on mobile/narrow window) with a score-over-time line chart.
Resize the window narrow to confirm the responsive bottom-sheet layout.

- [ ] **Step 5: build check and commit**

Run (in `apps/web`): `npm run build`
Expected: build succeeds. Then commit:
```
feat: add forecast timeline panel
```

---

### Task 5: frontend CI and dev docs

**Files:**
- Modify: `.github/workflows/ci.yml` (add a web job)
- Create: `apps/web/README.md`

**Interfaces:**
- CI lints, type-checks, tests, and builds the web app on push/PR.

- [ ] **Step 1: add a web CI job**

Add a second job to `.github/workflows/ci.yml`:
```yaml
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
        env:
          NEXT_PUBLIC_API_URL: http://127.0.0.1:8000
```
(Keep the existing `quality` Python job; this adds `web` alongside it.)

- [ ] **Step 2: validate the workflow yaml**

Run:
```powershell
$env:Path = "C:\Users\franc\.local\bin;$env:Path"; uv run python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml',encoding='utf-8')); print('yaml ok')"
```
Expected: `yaml ok`.

- [ ] **Step 3: write the web README**

`apps/web/README.md`:
```markdown
# beFORE web

Next.js (App Router, TypeScript, Tailwind) frontend. Shows a map of spots colored by current
BeFORE score and a forecast timeline per spot. Talks to the API over HTTP.

## Run locally

1. Run the API: `uv run uvicorn before_api.main:app` (from the repo root, port 8000).
2. `cd apps/web && npm install && npm run dev`, then open http://localhost:3000.

Set `NEXT_PUBLIC_API_URL` in `.env.local` (defaults to http://127.0.0.1:8000). It is inlined at
BUILD time, so production builds bake in the deployed API URL.

## Structure

- `src/lib/api.ts` typed API client.
- `src/lib/score.ts` score -> color/label helpers (unit-tested with Vitest).
- `src/components/SpotMap.tsx` client-only Leaflet map (dynamic import, ssr:false).
- `src/components/ForecastPanel.tsx` Recharts score-over-time timeline.
```

- [ ] **Step 4: run web checks locally and commit**

Run (in `apps/web`): `npm run lint; npm test; npm run build`
Expected: all pass. Then commit:
```
ci: add web lint/test/build job and docs
```

---

### Task 6: UI design pass (whole-interface polish)

Deliberately after the functional pieces: a component's look can only be judged in context, so we
build everything first (map, info bar, forecast panel, chart) and then style them as one coherent
system. Reordered 2026-07-29 to run before deployment, so the first public URL is presentable.

**Files:**
- Modify: `apps/web/src/app/globals.css` (design tokens), `layout.tsx` (shell, fonts)
- Modify: `apps/web/src/components/SpotMap.tsx`, `ForecastPanel.tsx`, `src/lib/score.ts` (palette)

**Interfaces:**
- Produces: a consistent visual system (palette, type scale, spacing, radii, shadows) applied across
  the map, info bar, and forecast panel.

- [ ] **Step 1: agree the direction with mockups**

Load the `frontend-design` skill. Build a single self-contained HTML file showing ~5 whole-UI
directions (not single components): header + map + info bar + forecast panel together, each with its
own palette, type treatment, and density. Serve it locally for Francisco to compare, then he picks.

- [ ] **Step 2: define design tokens**

In `globals.css`, define CSS variables for the chosen palette (surface, text, accent, and the score
ramp), plus a type scale and spacing/radius/shadow values. The score ramp must stay colorblind-safe
and keep the numeric score as a second cue.

- [ ] **Step 3: restyle the components against the tokens**

Update `SpotMap` (pins, info bar), `ForecastPanel` (panel, chart colors, axis/grid styling), and the
app shell to use the tokens. No hard-coded one-off colors left in components; `score.ts` reads the
ramp from the tokens.

- [ ] **Step 4: verify**

Run: `npm test; npm run build`, then check the live app at desktop and mobile widths.
Expected: tests and build pass; the map, bar, and panel visibly read as one designed product.

- [ ] **Step 5: Commit**

Message:
```
style: apply a coherent UI design system
```

---

### Task 7: deploy API and frontend

Runs last so the first public URL shows the designed UI. Deploy is still inside M6 because M7
(session logging) needs a live URL to collect labels from real users.

**Files:**
- Create: deploy config as needed (host-specific; e.g. `apps/api` start command).
- Modify: `apps/api/src/before_api/main.py` (tighten CORS to the deployed origin).

**Interfaces:**
- Produces: a live API URL and a live frontend URL.

- [ ] **Step 1: deploy the API to a free Python host (Francisco)**

Recommended: Render (free web service) or Hugging Face Spaces.
- Start command: `uvicorn before_api.main:app --host 0.0.0.0 --port $PORT`.
- Set env var `DATABASE_URL` (the Supabase session-pooler URI) in the host's dashboard.
- Note: free tiers spin down when idle (cold start ~30s on first request). Accepted for now.
- Verify the live API: open `<api-url>/docs` and `<api-url>/spots`.

- [ ] **Step 2: deploy the frontend to Vercel (Francisco)**

- Import the GitHub repo in Vercel; set the project root to `apps/web`.
- Set env var `NEXT_PUBLIC_API_URL` to the live API URL from Step 1 (remember: build-time inlined,
  so redeploy if you change it).
- Deploy; Vercel gives a live URL.

- [ ] **Step 3: tighten CORS to the deployed origin**

`CORSMiddleware` is already wired up (added in Task 3 with `allow_origins=["*"]`, since the browser
needs CORS even for local dev). Now that the Vercel domain is known, replace the wildcard with the
real origins:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://<your-app>.vercel.app"],
    allow_methods=["GET"],
    allow_headers=["*"],
)
```
Run `uv run pytest apps/api/tests/ -q` (expected: all pass), then commit and redeploy the API:
```
chore: restrict API CORS to known origins
```

- [ ] **Step 4: verify the live site (Francisco)**

Open the Vercel URL. Expected: the map loads with colored markers (data from the live API), and
clicking a spot shows its forecast. Confirm on both desktop and phone. Also confirm the `web` CI job
went green on GitHub.

- [ ] **Step 5: full suite, hooks, and final docs commit**

Run: `uv run pytest` then `uv run pre-commit run --all-files`
Expected: all pass. Record the live URLs in `README.md`, then commit:
```
docs: note deployment URLs and setup
```

---

## Definition of done for Milestone 6

- `GET /scores` implemented and tested; roadmap renumbered in the spec.
- `apps/web` Next.js app: score-colored map + forecast timeline, talking to the API; pure helpers
  unit-tested; `npm run build` and lint pass; web CI job green.
- A whole-interface design pass applied (Task 6): shared design tokens, and the map, info bar, and
  forecast panel read as one coherent product rather than default-styled components.
- API and frontend deployed to free hosts (Task 7, after the design pass); the live site loads real
  data on desktop and mobile, with CORS restricted to the known origins.
- Python suite + pre-commit pass; CI green.

## Deferred (not in M6)

- Session logging, auth, ratings (Milestone 7, the label loop).
- Marker clustering, richer charts, custom domain.
- Pruning old forecast rows / filtering the forecast to future hours (revisit in M7 or as cleanup).
