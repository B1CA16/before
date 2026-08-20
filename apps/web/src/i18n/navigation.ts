import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware navigation. Use these in place of `next/link` and `next/navigation`, so a link written
 * once resolves to `/spot/x` in Portuguese and `/en/spot/x` in English without every call site
 * knowing which locale it is in.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
