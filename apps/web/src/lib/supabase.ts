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
          // PKCE is the important setting, not an optional hardening. Under it, everything that
          // comes back in a URL is a single-use authorization code that is worthless without the
          // verifier held in this browser's storage.
          //
          // The flow this replaced was implicit, which put the access AND refresh token directly in
          // the address bar, where they land in history and get pasted into chats. A refresh token
          // is the worse half of that: it mints new access tokens until someone revokes it.
          flowType: "pkce",
          // Required by the Google redirect, which returns to the app carrying ?code=. Safe only
          // because of flowType above: with implicit flow this same setting is what consumes tokens
          // out of the URL fragment.
          detectSessionInUrl: true,
        },
      })
    : null;

export const authConfigured = supabase !== null;
