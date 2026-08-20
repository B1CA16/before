"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import AnchoredPanel from "@/components/AnchoredPanel";
import { GlobeIcon } from "@/components/Icons";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAMES: Record<string, { short: string; full: string }> = {
  pt: { short: "PT", full: "Português" },
  en: { short: "EN", full: "English" },
};

/**
 * Switch language without losing your place.
 *
 * A menu rather than the two-button segmented control this replaced. That version put both codes in the
 * bar competing with the search field and the account button, and read as a pair of tabs for something
 * unrelated. A globe with the current language is quieter, and naming both languages in full inside the
 * menu is clearer than a two-letter code either way.
 *
 * It replaces the current route in the other locale rather than sending you home, because losing the
 * spot you were reading is a strange price to pay for changing language. next-intl also persists the
 * choice in a cookie, so the middleware stops guessing from Accept-Language after the first switch.
 */
export default function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  function switchTo(next: string) {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => {
      // Read the query string here rather than through useSearchParams, for two reasons. That hook
      // forces a Suspense boundary on any prerendered page, which broke the build for all 92 spot
      // pages. It also would not see the truth: the map updates ?spot= with history.replaceState,
      // which the router never hears about, so switching language would have silently dropped the
      // selected spot. window.location is the URL as it actually is.
      const search = window.location.search;
      // usePathname from next-intl already strips the locale prefix, so this is the same route in
      // the other language.
      router.replace(`${pathname}${search}`, { locale: next });
    });
  }

  return (
    <>
      <button
        ref={setTriggerEl}
        className="btn btn-quiet min-w-10 flex-none gap-1.5 px-2.5 sm:px-3"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("language")}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
      >
        <GlobeIcon size={14} />
        <span className="hidden sm:inline">{NAMES[locale]?.short ?? locale.toUpperCase()}</span>
      </button>

      {open && triggerEl && (
        <AnchoredPanel anchorEl={triggerEl} minWidth={168} onDismiss={() => setOpen(false)}>
          <div className="panel-raised p-2" role="menu" aria-label={t("language")}>
            {routing.locales.map((code) => (
              <button
                key={code}
                role="menuitemradio"
                aria-checked={code === locale}
                className="option"
                onClick={() => switchTo(code)}
              >
                <span>{NAMES[code]?.full ?? code}</span>
                <span className="label">{NAMES[code]?.short ?? code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </AnchoredPanel>
      )}
    </>
  );
}
