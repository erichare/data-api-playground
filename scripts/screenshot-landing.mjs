import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function shot(page, name) {
  await wait(800);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}

async function makeLandingPage(browser, colorScheme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme });
  const page = await ctx.newPage();
  await page.addInitScript((s) => {
    localStorage.setItem("theme", s);
    sessionStorage.clear();
  }, colorScheme === "dark" ? "dark" : "light");

  // Intercept astra-status to pretend there are no env credentials
  await page.route("**/api/astra-status", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ hasToken: false, hasEndpoint: false }) })
  );
  // Intercept connect to prevent any accidental connection
  await page.route("**/api/connect", route =>
    route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "No credentials" }) })
  );

  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await wait(1200);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  const { page: dark } = await makeLandingPage(browser, "dark");
  await shot(dark, "11-landing-dark");

  const { page: light } = await makeLandingPage(browser, "light");
  await shot(light, "18-landing-light");

  await browser.close();
  console.log("✅ Done");
})();
