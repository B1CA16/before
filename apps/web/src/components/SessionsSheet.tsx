"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { useFocusTrap } from "@/lib/useFocusTrap";
import {
  deleteAccount,
  deleteSession,
  getMySessions,
  type SessionRow,
  type SessionTag,
} from "@/lib/api";
import { Link } from "@/i18n/navigation";
import { localeTag } from "@/lib/forecast";
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

function formatWhen(iso: string, tag: string): string {
  return new Date(iso).toLocaleString(tag, {
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
  const t = useTranslations("sessions");
  // Focus in, Tab trapped, Escape closes, focus restored. The dialog already claimed aria-modal;
  // this is what makes that claim true.
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const tAuth = useTranslations("auth");
  const tTags = useTranslations("tags");
  const tag = localeTag(useLocale());
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
          setError(tAuth("expired"));
          return null;
        }
        return getMySessions(token);
      })
      .then((r) => active && r && setRows(r))
      .catch((e) => active && setError(e instanceof Error ? e.message : t("loadFailed")));
    return () => {
      active = false;
    };
  }, [getToken, t, tAuth]);

  async function removeSession(id: number) {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) {
        setError(tAuth("expired"));
        return;
      }
      await deleteSession(token, id);
      setRows((current) => (current ?? []).filter((r) => r.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("deleteFailed"));
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
        setError(tAuth("expired"));
        return;
      }
      await deleteAccount(token);
      // The account is gone, so the stored token now refers to nothing. Clearing it locally keeps the
      // UI honest rather than leaving a signed-in shell behind.
      await supabase?.auth.signOut();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("accountDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center sm:items-center">
      <button
        className="absolute inset-0 cursor-default bg-[rgba(16,24,40,0.45)]"
        onClick={onClose}
        aria-label={t("close")}
        tabIndex={-1}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="panel-raised relative w-full max-w-[26rem] rounded-b-none p-1 sm:rounded-panel"
      >
        <div className="scroll-inset max-h-[86dvh] overflow-y-auto px-4 py-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="title text-primary">{t("title")}</h2>
              <p className="faint mt-0.5 truncate">{user?.email}</p>
            </div>
            <button className="btn btn-quiet flex-none px-3" onClick={onClose}>
              {t("close")}
            </button>
          </header>

          {error && (
            <p className="meta mt-3" style={{ color: SCORE_COLORS.flat }} role="alert">
              {error}
            </p>
          )}

          <div className="mt-4">
            {rows === null && !error && <WaveLoader label={t("loading")} className="py-4" />}

            {rows?.length === 0 && (
              <p className="meta text-secondary">{t("empty")}</p>
            )}

            {rows?.map((row) => (
              <div key={row.id} className="row-card mb-2 block p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-primary">{row.name}</p>
                    <p className="faint mt-0.5">{formatWhen(row.surfed_at, tag)}</p>
                  </div>
                  <span className="value flex-none text-primary">{t("outOf", { rating: row.rating })}</span>
                </div>

                {row.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.tags.map((name) => (
                      <span key={name} className="pill">
                        {tTags(name as SessionTag)}
                      </span>
                    ))}
                  </div>
                )}

                {row.note && <p className="meta mt-2 text-secondary">{row.note}</p>}

                {confirmDelete === row.id ? (
                  <div className="mt-3 rounded-chip bg-inset p-2.5">
                    {/* Confirmed, because deleting a session destroys a rating that cannot be
                        reconstructed from anything else we hold. */}
                    <p className="meta text-secondary">{t("confirmDelete")}</p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        className="btn btn-quiet flex-1"
                        onClick={() => setConfirmDelete(null)}
                        disabled={busy}
                      >
                        {t("keep")}
                      </button>
                      <button
                        className="btn flex-1"
                        style={{ background: SCORE_COLORS.flat, color: "#fff" }}
                        onClick={() => removeSession(row.id)}
                        disabled={busy}
                      >
                        {busy ? t("deleting") : t("delete")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-1.5">
                    <button className="btn btn-quiet flex-1" onClick={() => onEdit(row)}>
                      {t("edit")}
                    </button>
                    <button
                      className="btn btn-quiet flex-1"
                      onClick={() => setConfirmDelete(row.id)}
                    >
                      {t("delete")}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* What we hold and how to be rid of it. Plain sentences, no generated legalese. */}
          <section className="mt-5 border-t border-hairline pt-4">
            <h3 className="section-title">{t("yourData")}</h3>
            <p className="meta mt-2 text-secondary">{t("dataExplains")}</p>
            <p className="faint mt-2">{t("deletionExplains")}</p>
            {/* The summary above is the short version; this is the full one, reachable from the same
                screen as the delete button so the two are never more than a click apart. */}
            <Link href="/privacy" className="footer-link mt-2 inline-block" onClick={onClose}>
              {t("privacyLink")}
            </Link>

            {confirmAccount ? (
              <div className="mt-3 rounded-chip bg-inset p-2.5">
                <p className="meta text-secondary">
                  {t("confirmAccount", { count: rows?.length ?? 0 })}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    className="btn btn-quiet flex-1"
                    onClick={() => setConfirmAccount(false)}
                    disabled={busy}
                  >
                    {t("cancel")}
                  </button>
                  <button
                    className="btn flex-1"
                    style={{ background: SCORE_COLORS.flat, color: "#fff" }}
                    onClick={removeAccount}
                    disabled={busy}
                  >
                    {busy ? t("deleting") : t("deleteEverything")}
                  </button>
                </div>
              </div>
            ) : (
              <button className="btn btn-quiet mt-3 w-full" onClick={() => setConfirmAccount(true)}>
                {t("deleteAccount")}
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
