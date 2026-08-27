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
  sea_level_m: number | null;
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
  /** Sea level relative to mean sea level, so negative is below it. */
  sea_level_m: number | null;
  /** 0 at low water, 1 at high. Normalised, so it means the same at any spot and any tidal range. */
  tide_state: number | null;
  tide_rising: boolean | null;
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

/**
 * Fetch a cached endpoint, retrying transient failures.
 *
 * This exists because of a build failure, and the failure is worth understanding. Prerendering the
 * spot pages means 184 requests at the API in a few seconds, and that API is a single free Render
 * instance. It answered most of them and returned **502** on one, which threw, which failed the entire
 * Vercel build. One overloaded response cost the whole deploy.
 *
 * A 502, 503, 504 or a dropped connection from an instance under load is transient by definition: the
 * same request a moment later succeeds. So retry those, with a widening gap to let the instance
 * recover rather than piling on.
 *
 * Deliberately NOT retried: 4xx. A 404 means the spot does not exist and a 401 means the token is
 * wrong, and repeating either just wastes time on an answer that will not change.
 */
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
  attempts = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // A retry has to look like a DIFFERENT fetch, and getting this right took two goes.
      //
      // Next memoises fetches with the same URL and options inside a single render, so a naive retry
      // loop collapses into one network call and every attempt is handed the same failed response.
      // The first version of this function looked correct, changed nothing, and the build failed on
      // the same 502.
      //
      // The obvious second fix, `cache: "no-store"` on retries, was worse in a way that is easy to
      // miss: a no-store fetch forces the whole route out of static rendering, so pages that happened
      // to hit a retry were built *without* their forecast rather than failing loudly. It traded a
      // broken build for quietly incomplete pages.
      //
      // Varying the URL instead keeps every attempt cacheable and statically renderable. The API
      // ignores the extra parameter, verified against all four endpoints including that the payload
      // is byte-identical with and without it.
      const attemptUrl =
        attempt === 1 ? url : `${url}${url.includes("?") ? "&" : "?"}_attempt=${attempt}`;
      const res = await fetch(attemptUrl, init);
      if (res.ok || !TRANSIENT.has(res.status)) return res;
      lastError = new Error(`${label} failed: ${res.status}`);
    } catch (error) {
      // A network-level failure, which a cold or restarting instance also produces.
      lastError = error;
    }
    if (attempt < attempts) {
      // 400 ms, then 1200 ms. Long enough for a Render instance to finish waking, short enough not
      // to stall a build.
      await new Promise((resolve) => setTimeout(resolve, 400 * 3 ** (attempt - 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export type SpotWithScore = { spot: Spot; now: ScoreNow | null };

export const getSpots = () => getJson<Spot[]>("/spots");

/**
 * One spot and its current reading, in a single request.
 *
 * Used by the server-rendered spot page, so `revalidate` rather than `no-store`: the page is cached
 * and served from the edge, which is also what stops a visitor waiting on a Render cold start.
 */
export async function getSpotWithScore(
  slug: string,
  revalidate = 3600
): Promise<SpotWithScore | null> {
  const res = await fetchWithRetry(
    BASE + "/spots/" + slug,
    { next: { revalidate } },
    `API /spots/${slug}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("API /spots/" + slug + " failed: " + res.status);
  return (await res.json()) as SpotWithScore;
}

/** Cached variants for server rendering, where no-store would defeat the point. */
export async function getForecastCached(slug: string, revalidate = 3600): Promise<ForecastHour[]> {
  const res = await fetchWithRetry(
    BASE + "/spots/" + slug + "/forecast",
    { next: { revalidate } },
    "API forecast"
  );
  if (!res.ok) throw new Error("API forecast failed: " + res.status);
  return (await res.json()) as ForecastHour[];
}

export async function getScoresCached(revalidate = 3600): Promise<ScoreNow[]> {
  const res = await fetchWithRetry(BASE + "/scores", { next: { revalidate } }, "API /scores");
  if (!res.ok) throw new Error("API /scores failed: " + res.status);
  return (await res.json()) as ScoreNow[];
}

export async function getSpotsCached(revalidate = 3600): Promise<Spot[]> {
  const res = await fetchWithRetry(BASE + "/spots", { next: { revalidate } }, "API /spots");
  if (!res.ok) throw new Error("API /spots failed: " + res.status);
  return (await res.json()) as Spot[];
}
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

/* --- favourites --------------------------------------------------------------------------------
 * Slugs only, on their own authenticated request. The public /spots and /scores responses stay
 * impersonal, which is what lets them keep a shared `revalidate` cache and stay prerenderable: per
 * user data in a shared cache is served to whoever asks next.
 */

export const getFavourites = (token: string) => authed<string[]>("/favourites", token);

/** Idempotent, so the caller never has to know the current state before asking. */
export const addFavourite = (token: string, slug: string) =>
  authed<void>(`/favourites/${slug}`, token, { method: "PUT" });

export const removeFavourite = (token: string, slug: string) =>
  authed<void>(`/favourites/${slug}`, token, { method: "DELETE" });

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
