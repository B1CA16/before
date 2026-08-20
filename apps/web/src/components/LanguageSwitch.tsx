"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const NAMES: Record<string, string> = { pt: "PT", en: "EN" };

/**
 * Switch language without losing your place.
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
  const search = useSearchParams().toString();
  const [pending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    startTransition(() => {
      // usePathname from next-intl already strips the locale prefix, so this is the same route in the
      // other language. The query string is carried over so ?spot= survives the switch.
      router.replace(`${pathname}${search ? `?${search}` : ""}`, { locale: next });
    });
  }

  return (
    <div
      className="flex rounded-full bg-inset p-0.5"
      role="group"
      aria-label={t("language")}
      style={pending ? { opacity: 0.6 } : undefined}
    >
      {routing.locales.map((code) => (
        <button
          key={code}
          onClick={() => switchTo(code)}
          aria-pressed={code === locale}
          className={`cursor-pointer rounded-full px-2.5 py-1 text-micro font-bold uppercase tracking-[0.08em] transition-colors ${
            code === locale ? "bg-accent text-white" : "text-secondary"
          }`}
        >
          {NAMES[code] ?? code}
        </button>
      ))}
    </div>
  );
}
