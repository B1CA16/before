const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type Spot = {
  slug: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  orientation_deg: number | null;
};

export type ScoreNow = {
  slug: string;
  score: number | null;
  swell_height_m: number | null;
  swell_period_s: number | null;
  wind_speed_kmh: number | null;
  offshore_component: number | null;
  swell_direction_deg: number | null;
  wind_direction_deg: number | null;
};

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

/* --- sessions (labels) -------------------------------------------------------------------------- */

export const SESSION_TAGS = ["good_shape", "crowded", "too_small", "too_big", "blown_out"] as const;
export type SessionTag = (typeof SESSION_TAGS)[number];

export const TAG_LABELS: Record<SessionTag, string> = {
  good_shape: "Good shape",
  crowded: "Crowded",
  too_small: "Too small",
  too_big: "Too big",
  blown_out: "Blown out",
};

export type SessionRow = {
  id: number;
  slug: string;
  name: string;
  surfed_at: string;
  rating: number;
  tags: string[];
  note: string | null;
};

export type ConditionsAt = {
  observed_at: string;
  /** "archive" is what the ocean did, "forecast" is what we predicted it would do. */
  source: string;
  score: number | null;
  swell_height_m: number | null;
  swell_period_s: number | null;
  wind_speed_kmh: number | null;
  offshore_component: number | null;
};

/**
 * Pull something human out of an error body. FastAPI returns `detail` as a string for our own
 * HTTPExceptions but as a list of field errors for schema validation, and showing a user the raw
 * JSON of the latter is not an error message.
 */
async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0];
      const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : null;
      return field ? `${field}: ${first.msg}` : String(first.msg);
    }
  } catch {
    // No JSON body, fall through to the status.
  }
  return `Request failed (${res.status})`;
}

async function authed<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await readError(res));
  // 204 has no body.
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function logSession(
  token: string,
  body: {
    slug: string;
    surfed_at: string;
    rating: number;
    tags: SessionTag[];
    note: string | null;
  }
) {
  return authed<SessionRow>("/sessions", token, { method: "POST", body: JSON.stringify(body) });
}

export const getMySessions = (token: string) => authed<SessionRow[]>("/sessions", token);

export const deleteSession = (token: string, id: number) =>
  authed<void>(`/sessions/${id}`, token, { method: "DELETE" });

/** Erase the caller's account. The server takes no id: you can only delete your own. */
export const deleteAccount = (token: string) =>
  authed<void>("/account", token, { method: "DELETE" });

/**
 * Conditions on record for one spot at one hour. Resolves to null when we hold nothing for that
 * hour, which is a real answer worth showing: without conditions the session cannot become a
 * training example.
 */
export async function getConditionsAt(slug: string, at: string): Promise<ConditionsAt | null> {
  const res = await fetch(`${BASE}/spots/${slug}/conditions?at=${encodeURIComponent(at)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ConditionsAt;
}
