"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { SCORE_COLORS } from "@/lib/score";
import { authConfigured, supabase } from "@/lib/supabase";

/**
 * Sign in with a 6-digit code, or sign out.
 *
 * A code rather than a magic link, on purpose. A link puts credentials in a URL, and even the safer
 * PKCE variant breaks on phones whenever the mail app opens a different browser than the one that
 * requested it, because the code verifier lives in the original browser's storage. A typed code has
 * neither problem.
 */

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

export default function AuthMenu() {
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
      <button className="btn btn-quiet" disabled title="Sign-in is not configured in this build">
        Sign in
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

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
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
          aria-label="Your account"
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
          aria-label="Sign in"
        >
          <PersonIcon />
          <span className="hidden sm:inline">Sign in</span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={user ? "Account" : "Sign in"}
          /* Above the top bar's own z-1000, or the popover renders behind it. */
          className="panel-raised absolute right-0 top-full z-[1100] mt-2 w-[17.5rem] p-4"
        >
          {user ? (
            <>
              <h2 className="section-title">Signed in</h2>
              <p className="meta mt-1.5 truncate text-primary">{user.email}</p>
              <p className="faint mt-2">Your logged sessions are private to this account.</p>
              <button className="btn btn-quiet mt-3 w-full" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : step === "code" ? (
            <>
              <h2 className="section-title">Enter your code</h2>
              <p className="faint mt-1.5">
                We emailed a 6-digit code to <span className="text-secondary">{email}</span>.
              </p>
              <form onSubmit={verifyCode} className="mt-3">
                <label className="field" aria-label="6-digit code">
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
                  {busy ? "Checking" : "Sign in"}
                </button>
              </form>
              <button className="btn btn-quiet mt-2 w-full" onClick={restart} disabled={busy}>
                Use a different email
              </button>
              {error && (
                <p className="meta mt-2" style={{ color: SCORE_COLORS.flat }} role="alert">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <h2 className="section-title">Sign in</h2>
              <p className="faint mt-1.5">
                To log the sessions you surf. We email you a code, so there is no password.
              </p>
              <form onSubmit={sendCode} className="mt-3">
                <label className="field" aria-label="Email address">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className="btn btn-primary mt-2.5 w-full"
                  disabled={busy || email.trim() === ""}
                >
                  {busy ? "Sending" : "Email me a code"}
                </button>
              </form>
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
