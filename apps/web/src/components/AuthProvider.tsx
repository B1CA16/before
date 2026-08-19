"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  /**
   * Fetch a usable bearer token for our API, refreshing first if the stored one has expired.
   *
   * A function rather than a cached string, and that distinction is the whole point. The first version
   * exposed `accessToken` captured from the session, which works right until the token ages out:
   * access tokens last an hour, so any copy held in React state is a ticking clock. Once the session
   * had also been revoked server-side, every request carried a dead token and the UI reported
   * "invalid or expired token" with no way out of it. Asking supabase-js at call time means it
   * refreshes when it can, and signs out cleanly when it cannot.
   */
  getToken: () => Promise<string | null>;
  /** True until we know whether a stored session exists, so the UI can avoid flashing "signed out". */
  loading: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null,
  getToken: async () => null,
  loading: false,
});

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

    // Fires on sign-in, sign-out and token refresh.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    // getSession refreshes an expired token while the refresh token is still good, and signs out
    // locally when it is not, which fires onAuthStateChange and updates the UI above.
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user: session?.user ?? null, getToken, loading }),
    [session, getToken, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
