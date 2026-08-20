"use client";

import { useState } from "react";

/**
 * Share this page: the native share sheet where one exists, copying to the clipboard otherwise.
 *
 * Client-only because both APIs live on `navigator`, and it is deliberately a leaf of an otherwise
 * server-rendered page. The content around it does not depend on JavaScript; only this button does.
 */
export default function ShareLink({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      // Rejects when the sheet is dismissed, which is a choice rather than a failure worth reporting.
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button className="btn btn-quiet" onClick={share}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
