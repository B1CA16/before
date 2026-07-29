# beFORE web

Next.js (App Router, TypeScript, Tailwind) frontend. Shows a map of surf spots colored by their
current BeFORE score, and a forecast timeline per spot. Talks to the Python API over HTTP.

## Run locally

1. Start the API (from the repo root, port 8000):
   `uv run uvicorn before_api.main:app --port 8000 --reload`
2. Start the web app:
   `cd apps/web && npm install && npm run dev`
3. Open http://localhost:3000

`NEXT_PUBLIC_API_URL` (see `.env.example`) points at the API and defaults to
`http://127.0.0.1:8000`. Note it is inlined at BUILD time, so a production build bakes in whatever
URL was set when it was built; change it and rebuild.

## Checks

- `npm test` unit tests (Vitest) for the pure helpers.
- `npm run lint` ESLint.
- `npm run build` TypeScript plus production build.

CI runs all three on every push and pull request.

## Structure

- `src/lib/api.ts` typed API client (`getSpots`, `getScores`, `getForecast`).
- `src/lib/score.ts` score to color/label helpers and the wind label. Unit-tested.
- `src/lib/forecast.ts` upcoming-hour filtering and best-hour selection. Unit-tested.
- `src/components/SpotMap.tsx` client-only Leaflet map: teardrop pins colored and numbered by
  score, with a docked info bar on hover.
- `src/components/ForecastPanel.tsx` bottom panel with a Recharts score-over-time chart.

Both components are browser-only, so they are loaded with `dynamic(..., { ssr: false })`.

## Notes

- Map tiles come from OpenStreetMap; the required attribution is displayed on the map.
- The API returns all forecast rows including past hours, so the UI filters to upcoming ones.
- Visual design is intentionally plain for now; a whole-interface design pass is a tracked task.
