import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.addInitScript((s) => { localStorage.setItem("theme", s); }, scheme);
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await wait(1200);

    // Click the Settings button (title="Quick Start & Settings")
    await page.click('button[title="Quick Start & Settings"]');
    await wait(900);
    const name = scheme === "dark" ? "09-quickstart-dark" : "19-quickstart-light";
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`✓ ${name}.png`);

    await ctx.close();
  }

  await browser.close();
  console.log("✅ Done");
})();
