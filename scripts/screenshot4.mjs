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
  await wait(700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Fresh light page — no ingest panel, clean state
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const l = await ctx.newPage();
  await l.addInitScript(() => { localStorage.setItem("theme", "light"); });
  await l.goto(BASE);
  await l.waitForLoadState("networkidle");
  await wait(1500);

  // 17 — New Collection dialog (fresh page, no overlays)
  await l.click("text=New Collection");
  await wait(800);
  await shot(l, "17-new-collection-light");
  await l.keyboard.press("Escape");
  await wait(400);

  // 18 — Landing light
  await l.evaluate(() => {
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
  });
  await l.reload();
  await l.waitForLoadState("networkidle");
  await wait(900);
  await shot(l, "18-landing-light");

  await browser.close();
  console.log("✅ Done");
})();
