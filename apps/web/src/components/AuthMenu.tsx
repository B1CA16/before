"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { SCORE_COLORS } from "@/lib/score";
import { authConfigured, supabase } from "@/lib/supabase";

/**
 * Sign in with Google, or sign out.
 *
 * Google rather than email, because this project has no domain, and without one no free mail
 * provider will send on its behalf: Resend only delivers to your own address until a domain is
 * verified, and Brevo will not enable transactional SMTP at all until one is. Google sidesteps the
 * problem rather than working around it, since no message is ever sent, and it hands us a verified
 * address for free. On a phone it is also one tap instead of copying a code out of an inbox.
 *
 * The 6-digit code flow below is kept, dormant, behind NEXT_PUBLIC_EMAIL_SIGNIN. It works and its
 * email templates are written; the only missing piece is somewhere to send from. Enable it once a
 * domain exists. It is deliberately off by default rather than deleted, because a sign-in option
 * that cannot deliver its own credential is worse than no option at all.
 */

// Inlined rather than fetched: Google's mark must not be restyled, and an <img> to a remote asset
// would be a third-party request on every popover open.
function GoogleMark() {
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

const EMAIL_SIGNIN = process.env.NEXT_PUBLIC_EMAIL_SIGNIN === "1";

type Step = "email" | "code";

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="flex-none opacity-70">
      <circle cx="8" cy="5.25" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.75 14c0-2.9 2.35-4.5 5.25-4.5s5.25 1.6 5.25 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function AuthMenu({ onShowSessions }: { onShowSessions?: () => void }) {
  const t = useTranslations("auth");
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  // React's autoFocus attribute does not land here (activeElement stays on <body>), most likely
  // because the click that submits the email form reclaims focus after the new input mounts.
  // Focusing explicitly is deterministic, and it matters more on a phone than a desktop: it is what
  // raises the keyboard so the code can be entered without an extra tap.
  useEffect(() => {
    if (step === "code") codeInput.current?.focus();
  }, [step]);

  // Leaving for Google sets busy and deliberately never clears it, so the button does not flicker
  // back to idle mid-redirect. The gap that leaves: abandoning the Google screen and coming back.
  // The browser restores this page from its back/forward cache with busy frozen at true, so the
  // button reads "Redirecting" forever. pageshow fires on that restore (and on a normal load), which
  // makes it the right moment to let go of the latch.
  useEffect(() => {
    function release() {
      setBusy(false);
    }
    window.addEventListener("pageshow", release);
    return () => window.removeEventListener("pageshow", release);
  }, []);

  // Close on an outside click or Escape, the two ways anyone expects a popover to go away.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!authConfigured) {
    return (
      <button className="btn btn-quiet" disabled title={t("notConfigured")}>
        {t("signIn")}
      </button>
    );
  }

  // Hold the shape while we find out whether a session exists, rather than flashing "Sign in" and
  // then swapping to an avatar a moment later.
  if (loading) {
    return <div className="btn-avatar animate-pulse" aria-hidden />;
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // No emailRedirectTo, because there is no link to redirect. shouldCreateUser defaults to true,
    // so signing up and signing in are the same single step.
    const { error: sendError } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setStep("code");
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    // AuthProvider picks the session up via onAuthStateChange, so there is nothing to set here.
    setOpen(false);
    setStep("email");
    setCode("");
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    // Leaves the page for Google and returns to the same URL carrying ?code=, which supabase-js
    // exchanges and then strips from the address bar. No callback route of our own is needed.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) {
      setError(oauthError.message);
      setBusy(false);
    }
    // On success the browser navigates away, so leave busy set: clearing it would flash the button
    // back to its idle state during the redirect.
  }

  async function signOut() {
    if (!supabase) return;
    // A plain signOut asks the server to revoke the session, which fails when that session is already
    // gone or revoked, and the earlier version then left the interface stuck as signed-in. Falling
    // back to a local sign-out always clears the stored token, so the button cannot become a no-op.
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) await supabase.auth.signOut({ scope: "local" });
    setOpen(false);
  }

  function restart() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <div className="relative" ref={wrapper}>
      {user ? (
        <button
          className="btn-avatar"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("account")}
        >
          {(user.email ?? "?").charAt(0).toUpperCase()}
        </button>
      ) : (
        <button
          /* Icon only on a phone. The top bar has no room to spare there, and spending it on the
             word "Sign in" would squeeze the search field and the logo. */
          /* min-w keeps the icon-only form a 40px square tap target, not a 34px sliver. */
          className="btn btn-quiet min-w-10 flex-none px-2.5 sm:min-w-0 sm:px-4"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t("signIn")}
        >
          <PersonIcon />
          <span className="hidden sm:inline">{t("signIn")}</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={user ? t("account") : t("signIn")}
          /* Above the top bar's own z-1000, or the popover renders behind it. */
          className="panel-raised absolute right-0 top-full z-[1100] mt-2 w-[17.5rem] p-4"
        >
          {user ? (
            <>
              <h2 className="section-title">{t("signedIn")}</h2>
              <p className="meta mt-1.5 truncate text-primary">{user.email}</p>
              <p className="faint mt-2">{t("privateNote")}</p>
              {onShowSessions && (
                <button
                  className="btn btn-quiet mt-3 w-full"
                  onClick={() => {
                    setOpen(false);
                    onShowSessions();
                  }}
                >
                  {t("yourSessions")}
                </button>
              )}
              <button className="btn btn-quiet mt-2 w-full" onClick={signOut}>
                {t("signOut")}
              </button>
            </>
          ) : step === "code" ? (
            <>
              <h2 className="section-title">{t("enterCode")}</h2>
              <p className="faint mt-1.5">
                {t.rich("codeSentTo", { email: () => <span className="text-secondary">{email}</span> })}
              </p>
              <form onSubmit={verifyCode} className="mt-3">
                <label className="field" aria-label={t("codeLabel")}>
                  <input
                    /* one-time-code lets iOS and Android offer the code straight from the email,
                       so on a phone most people never type it. */
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    ref={codeInput}
                    placeholder="123456"
                    className="text-center tracking-[0.35em]"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-primary mt-2.5 w-full"
                  disabled={busy || code.length < 6}
                >
                  {busy ? t("checking") : t("signIn")}
                </button>
              </form>
              <button className="btn btn-quiet mt-2 w-full" onClick={restart} disabled={busy}>
                {t("differentEmail")}
              </button>
              {error && (
                <p className="meta mt-2" style={{ color: SCORE_COLORS.flat }} role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="section-title">{t("signIn")}</h2>
              <p className="faint mt-1.5">{t("whySignIn")}</p>

              <button
                className="btn btn-google mt-3 w-full"
                onClick={signInWithGoogle}
                disabled={busy}
              >
                <GoogleMark />
                {busy ? "Redirecting" : "Continue with Google"}
              </button>

              {EMAIL_SIGNIN && (
                <>
                  <p className="label mt-3 text-center">{t("or")}</p>
                  <form onSubmit={sendCode} className="mt-2">
                    <label className="field" aria-label={t("emailLabel")}>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        placeholder={t("emailPlaceholder")}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <button
                      type="submit"
                      className="btn btn-quiet mt-2.5 w-full"
                      disabled={busy || email.trim() === ""}
                    >
                      {busy ? t("sending") : t("emailMeCode")}
                    </button>
                  </form>
                </>
              )}

              {error && (
                <p className="meta mt-2" style={{ color: SCORE_COLORS.flat }} role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
