/**
 * Browser-side Supabase client, used for authentication only.
 *
 * No application data flows through this client. Scores come from our FastAPI service and logged
 * sessions will too. Supabase's job here is narrow: issue and refresh the JWT that we then send to
 * that API as a bearer token.
 *
 * That is also why this uses plain `createClient` rather than `@supabase/ssr`. Cookie-based server
 * auth would only matter if a Next.js server route needed the identity, and none does.
 *
 * The publishable key is meant to be public: it grants only what row level security allows. The
 * service-role key bypasses RLS entirely and must never appear anywhere in this app.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Null when the environment is not configured. `NEXT_PUBLIC_*` values are inlined at build time, so
 * a CI build without them would otherwise crash the whole page. Degrading to "sign-in unavailable"
 * keeps the read-only product working, and the UI says so plainly rather than offering a sign-in
 * button that silently cannot work.
 */
export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          // We sign in with a 6-digit code, so no token should ever ride in a URL. Turning off URL
          // detection makes that structural rather than a convention: even if a stale magic link
          // from the old flow is opened, its fragment is ignored instead of establishing a session.
          //
          // The flow this replaces put the access AND refresh token in the address bar, where they
          // reach browser history and get pasted into chats.
          detectSessionInUrl: false,
          // Only matters if link-based sign-in is ever reintroduced, in which case the link carries
          // a single-use code that is worthless without the verifier held in this browser.
          flowType: "pkce",
        },
      })
    : null;

export const authConfigured = supabase !== null;
