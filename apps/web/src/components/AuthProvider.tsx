"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  /** The bearer token for our own API. Null when signed out. */
  accessToken: string | null;
  /** True until we know whether a stored session exists, so the UI can avoid flashing "signed out". */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, accessToken: null, loading: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Nothing to wait for when auth is not configured, so do not start in a loading state.
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    // A session may already be in storage from a previous visit.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    // Fires on sign-in, sign-out and token refresh. It also fires after the magic link lands,
    // because supabase-js reads the tokens out of the URL fragment and cleans it up for us, which
    // is why this app needs no /auth/callback route.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Everything is derived from the one session object rather than stored alongside it, so the user
  // and the token cannot drift out of sync with each other.
  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      loading,
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
