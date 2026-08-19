"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import {
  deleteAccount,
  deleteSession,
  getMySessions,
  TAG_LABELS,
  type SessionRow,
  type SessionTag,
} from "@/lib/api";
import { UI_LOCALE } from "@/lib/forecast";
import { SCORE_COLORS } from "@/lib/score";
import { supabase } from "@/lib/supabase";

import WaveLoader from "./WaveLoader";

/**
 * Everything the account holds, and the means to get rid of it.
 *
 * List, edit and delete sit beside the privacy note and account erasure on purpose: this is the one
 * screen answering "what do you have on me, and how do I remove it", and splitting that across the
 * interface is how those questions end up unanswerable.
 */

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(UI_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionsSheet({
  onClose,
  onEdit,
}: {
  onClose: () => void;
  onEdit: (session: SessionRow) => void;
}) {
  const { user, getToken } = useAuth();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmAccount, setConfirmAccount] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getToken()
      .then((token) => {
        if (!active) return null;
        if (!token) {
          // Rows stay null rather than empty. With no usable token we do not know whether there are
          // sessions, and claiming "nothing logged yet" beside "your session expired" is two answers
          // to the same question, one of them invented.
          setError("Your session has expired. Sign in again to continue.");
          return null;
        }
        return getMySessions(token);
      })
      .then((r) => active && r && setRows(r))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Could not load sessions."));
    return () => {
      active = false;
    };
  }, [getToken]);

  async function removeSession(id: number) {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Your session has expired. Sign in again to continue.");
        return;
      }
      await deleteSession(token, id);
      setRows((current) => (current ?? []).filter((r) => r.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that session.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError("Your session has expired. Sign in again to continue.");
        return;
      }
      await deleteAccount(token);
      // The account is gone, so the stored token now refers to nothing. Clearing it locally keeps the
      // UI honest rather than leaving a signed-in shell behind.
      await supabase?.auth.signOut();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
      <button
        className="absolute inset-0 cursor-default bg-[rgba(16,24,40,0.45)]"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your sessions"
        className="panel-raised relative w-full max-w-[26rem] rounded-b-none p-1 sm:rounded-panel"
      >
        <div className="scroll-inset max-h-[86dvh] overflow-y-auto px-4 py-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="title text-primary">Your sessions</h2>
              <p className="faint mt-0.5 truncate">{user?.email}</p>
            </div>
            <button className="btn btn-quiet flex-none px-3" onClick={onClose}>
              Close
            </button>
          </header>

          {error && (
            <p className="meta mt-3" style={{ color: SCORE_COLORS.flat }} role="alert">
              {error}
            </p>
          )}

          <div className="mt-4">
            {rows === null && !error && <WaveLoader label="Loading your sessions" className="py-4" />}

            {rows?.length === 0 && (
              <p className="meta text-secondary">
                Nothing logged yet. Rate a session you surfed and it will show up here.
              </p>
            )}

            {rows?.map((row) => (
              <div key={row.id} className="row-card mb-2 block p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-primary">{row.name}</p>
                    <p className="faint mt-0.5">{formatWhen(row.surfed_at)}</p>
                  </div>
                  <span className="value flex-none text-primary">{row.rating}/5</span>
                </div>

                {row.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.tags.map((tag) => (
                      <span key={tag} className="pill">
                        {TAG_LABELS[tag as SessionTag] ?? tag}
                      </span>
                    ))}
                  </div>
                )}

                {row.note && <p className="meta mt-2 text-secondary">{row.note}</p>}

                {confirmDelete === row.id ? (
                  <div className="mt-3 rounded-chip bg-inset p-2.5">
                    {/* Confirmed, because deleting a session destroys a rating that cannot be
                        reconstructed from anything else we hold. */}
                    <p className="meta text-secondary">
                      Delete this session? The rating is gone for good.
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        className="btn btn-quiet flex-1"
                        onClick={() => setConfirmDelete(null)}
                        disabled={busy}
                      >
                        Keep
                      </button>
                      <button
                        className="btn flex-1"
                        style={{ background: SCORE_COLORS.flat, color: "#fff" }}
                        onClick={() => removeSession(row.id)}
                        disabled={busy}
                      >
                        {busy ? "Deleting" : "Delete"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-1.5">
                    <button className="btn btn-quiet flex-1" onClick={() => onEdit(row)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-quiet flex-1"
                      onClick={() => setConfirmDelete(row.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* What we hold and how to be rid of it. Plain sentences, no generated legalese. */}
          <section className="mt-5 border-t border-hairline pt-4">
            <h3 className="section-title">Your data</h3>
            <p className="meta mt-2 text-secondary">
              We store your email address and the sessions you log. Sessions are private to your
              account: nobody else can read them, and they are used to teach the score what good surf
              actually feels like.
            </p>
            <p className="faint mt-2">
              Deleting your account removes your email and every session with it, immediately and for
              good.
            </p>

            {confirmAccount ? (
              <div className="mt-3 rounded-chip bg-inset p-2.5">
                <p className="meta text-secondary">
                  Delete your account and all {rows?.length ?? 0} session
                  {rows?.length === 1 ? "" : "s"}? This cannot be undone.
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    className="btn btn-quiet flex-1"
                    onClick={() => setConfirmAccount(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn flex-1"
                    style={{ background: SCORE_COLORS.flat, color: "#fff" }}
                    onClick={removeAccount}
                    disabled={busy}
                  >
                    {busy ? "Deleting" : "Delete everything"}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-quiet mt-3 w-full" onClick={() => setConfirmAccount(true)}>
                Delete my account
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
