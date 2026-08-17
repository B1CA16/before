/**
 * Screenshot the running app so a human (or an agent) can actually look at it.
 *
 * Reviewing a UI by reading its source does not work. This drives a headless browser over the real
 * app at three viewports, captures the states that are otherwise hard to reach (the mobile sheet
 * expanded, an active search, the loading states), and fails loudly on any console or page error.
 *
 * Usage, with the API and the dev server already running:
 *   npm run shots                       capture the normal states
 *   npm run shots -- --loading          also capture the loading states, by stalling the API
 *   npm run shots -- --url=http://...   point at a deployed build instead of localhost
 *
 * Output goes to .screenshots/ (gitignored). Browsers come from `npx playwright install chromium`.
 *
 * Known blind spot: headless Chromium uses overlay scrollbars, so scrollbar appearance cannot be
 * judged from these images. Check that in a real browser.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const URL = arg("url", "http://localhost:3000");
const OUT = arg("out", ".screenshots");
const CAPTURE_LOADING = has("loading");

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const problems = [];

/** Watch a page for anything that would show up as a red console line. */
function watch(page, label) {
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${label}] console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${label}] pageerror: ${e.message}`));
}

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  watch(page, vp.name);

  try {
    await page.goto(URL, { waitUntil: "networkidle", timeout: 45_000 });
  } catch (e) {
    problems.push(`[${vp.name}] navigation: ${e.message}`);
  }
  // let tiles, fonts and the chart settle before capturing
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${vp.name}.png` });

  // An active search: proves filtering works and shows the field in its filled state.
  if (vp.name === "laptop") {
    const search = page.getByPlaceholder("Search a spot");
    if (await search.count()) {
      await search.fill("guincho");
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/laptop-search.png` });
    }
  }

  // The mobile sheet only shows its chart and breakdown once expanded.
  if (vp.name === "mobile") {
    const expand = page.getByRole("button", { name: /expand/i }).first();
    if (await expand.count()) {
      await expand.click().catch(() => {});
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `${OUT}/mobile-expanded.png` });
    }
  }

  // The sign-in popover is closed by default, so it needs opening to be seen at all. Captured on
  // mobile too, because the top bar is tightest there and that is where it would overflow.
  if (vp.name === "laptop" || vp.name === "mobile") {
    const signIn = page.getByRole("button", { name: /^sign in$/i }).first();
    if (await signIn.count()) {
      await signIn.click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${vp.name}-signin.png` });
      await page.keyboard.press("Escape");
    }
  }

  await page.close();
}

// Loading states are invisible on a fast local API, so stall it deliberately.
if (CAPTURE_LOADING) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  watch(page, "loading");
  await page.route("**/*:8000/**", async (route) => {
    await new Promise((r) => setTimeout(r, 20_000));
    await route.continue();
  });
  await page.goto(URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/loading.png` });
  await page.close();
}

await browser.close();

const unique = [...new Set(problems)];
if (unique.length) {
  console.error("Problems found:");
  for (const p of unique) console.error(" -", p);
  process.exitCode = 1;
} else {
  console.log("No console or page errors.");
}
console.log(`Screenshots written to ${OUT}/`);
