import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest ran with no config at all until now, which meant it did not know about the `@/` path alias
 * that `tsconfig.json` defines and the whole app imports with. The symptom was misleading: a test file
 * would fail to load with "Cannot find package '@/lib/geo'", pointing at the *source* file rather than
 * at the missing configuration, and the obvious workaround (rewrite the import as `./geo`) fixes the
 * test while leaving the alias broken for the next person.
 *
 * Type-only imports hid it for a while, because `import type` is erased before resolution ever
 * happens. It only surfaced once a test pulled in a module that imported a real value through the
 * alias.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
