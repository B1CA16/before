"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ArrowIcon } from "@/components/Icons";
import LogSessionSheet from "@/components/LogSessionSheet";
import type { Spot } from "@/lib/api";

/**
 * Log a session from the spot page, without leaving it.
 *
 * The first version linked to `/?spot=<slug>`, which threw you onto the map to do something you had
 * already decided to do on this page, and lost the page you were reading. The sheet is the same one the
 * map uses, prefilled with this spot, so the two routes into it behave identically.
 */
export default function LogSessionButton({ spots, slug }: { spots: Spot[]; slug: string }) {
  const t = useTranslations("spot");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        {t("logCta")}
        <ArrowIcon size={14} />
      </button>
      {open && (
        <LogSessionSheet spots={spots} defaultSlug={slug} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
