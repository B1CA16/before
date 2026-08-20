"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { SCORE_COLORS } from "@/lib/score";
import { supabase } from "@/lib/supabase";

/**
 * The Google sign-in button, shared by the account menu and the session form.
 *
 * Extracted rather than duplicated because both places need the same redirect behaviour and the same
 * stuck-latch fix below, and a second copy would only get one of them.
 */

// Inlined rather than fetched: Google's mark must not be restyled, and an <img> to a remote asset
// would be a third-party request on every render.
export function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden className="flex-none">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.909c1.702-1.567 2.683-3.874 2.683-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.957-2.18l-2.909-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function GoogleSignIn({ className = "" }: { className?: string }) {
  const t = useTranslations("auth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signing in navigates away and busy is deliberately never cleared, so the label does not flicker
  // back mid-redirect. The gap that leaves: abandoning Google's screen and coming back, where the
  // browser restores this page from its back/forward cache with busy still true and the button reads
  // "Redirecting" forever. pageshow fires on that restore, which is the moment to let go.
  useEffect(() => {
    function release() {
      setBusy(false);
    }
    window.addEventListener("pageshow", release);
    return () => window.removeEventListener("pageshow", release);
  }, []);

  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Returns here carrying ?code=, which supabase-js exchanges and strips from the address bar.
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
  }

  return (
    <>
      <button className={`btn btn-google w-full ${className}`} onClick={signIn} disabled={busy}>
        <GoogleMark />
        {busy ? t("redirecting") : t("continueGoogle")}
      </button>
      {error && (
        <p className="meta mt-2" style={{ color: SCORE_COLORS.flat }} role="alert">
          {error}
        </p>
      )}
    </>
  );
}
