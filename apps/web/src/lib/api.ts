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
export const getForecast = (slug: string) => getJson<ForecastHour[]>(`/spots/${slug}/forecast`);
