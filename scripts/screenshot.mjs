import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
  console.log(`✓ ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── DARK MODE ────────────────────────────────────────────────────────────────
  const dark = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const d = await dark.newPage();

  // Force dark theme in localStorage
  await d.addInitScript(() => {
    localStorage.setItem("theme", "dark");
  });

  // 01 — Landing screen (disconnect so overlay shows)
  await d.goto(BASE);
  await d.waitForLoadState("networkidle");
  // Clear session so landing appears
  await d.evaluate(() => {
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
  });
  await d.reload();
  await d.waitForLoadState("networkidle");
  await d.waitForTimeout(800);
  await shot(d, "01-landing-dark");

  // Click "Try Demo" to enter app
  await d.evaluate(() => {
    sessionStorage.setItem("astra_token", "demo");
    sessionStorage.setItem("astra_endpoint", "demo");
  });
  await d.reload();
  await d.waitForLoadState("networkidle");
  await d.waitForTimeout(1200);

  // 02 — Chat (empty state)
  await shot(d, "02-chat-empty-dark");

  // Now set real credentials if available via env, else just screenshot with demo state
  // Navigate using the app UI

  // 03 — Click Browse tab
  const browseBtn = await d.$("button:has-text('Browse')");
  if (browseBtn) { await browseBtn.click(); await d.waitForTimeout(800); }
  await shot(d, "03-browse-dark");

  // 04 — Click API tab
  const apiBtn = await d.$("button:has-text('API')");
  if (apiBtn) { await apiBtn.click(); await d.waitForTimeout(800); }
  await shot(d, "04-api-dark");

  // API tab — click Vector Search operation
  const vsBtn = await d.$("button:has-text('Vector Search')");
  if (vsBtn) { await vsBtn.click(); await d.waitForTimeout(500); }
  await shot(d, "05-api-vector-dark");

  // API tab — switch code lang to Python
  const pyBtn = await d.$("button:has-text('Python')");
  if (pyBtn) { await pyBtn.click(); await d.waitForTimeout(400); }
  await shot(d, "06-api-python-dark");

  // 07 — Go back to Chat tab
  const chatBtn = await d.$("button:has-text('Chat')");
  if (chatBtn) { await chatBtn.click(); await d.waitForTimeout(600); }

  // Open Ingest panel
  const ingestToggle = await d.$("[title='Ingest Data'], button:has-text('Ingest')");
  if (ingestToggle) { await ingestToggle.click(); await d.waitForTimeout(600); }
  await shot(d, "07-ingest-panel-dark");

  // 08 — Open Connect dialog (settings/gear icon in header)
  await d.evaluate(() => {
    // close ingest if open
  });
  const settingsBtn = await d.$("button[aria-label='Settings'], header button:last-of-type");
  if (settingsBtn) { await settingsBtn.click(); await d.waitForTimeout(600); }
  await shot(d, "08-quickstart-dark");
  // Close it
  await d.keyboard.press("Escape");
  await d.waitForTimeout(400);

  // 09 — New Collection dialog — click "+ New Collection" in sidebar
  const newColBtn = await d.$("button:has-text('New Collection'), [title='New Collection']");
  if (newColBtn) { await newColBtn.click(); await d.waitForTimeout(600); }
  await shot(d, "09-new-collection-dark");
  await d.keyboard.press("Escape");
  await d.waitForTimeout(300);

  // 10 — Connect dialog
  const connectBtn = await d.$("button:has-text('Connect'), header button:has-text('Connect')");
  if (connectBtn) { await connectBtn.click(); await d.waitForTimeout(600); }
  await shot(d, "10-connect-dialog-dark");
  await d.keyboard.press("Escape");
  await d.waitForTimeout(300);

  // ── LIGHT MODE ───────────────────────────────────────────────────────────────
  const light = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "light",
  });
  const l = await light.newPage();
  await l.addInitScript(() => {
    localStorage.setItem("theme", "light");
  });
  await l.goto(BASE);
  await l.waitForLoadState("networkidle");
  await l.waitForTimeout(1200);

  // 11 — Chat light
  await shot(l, "11-chat-empty-light");

  // 12 — Browse light
  const browseBtnL = await l.$("button:has-text('Browse')");
  if (browseBtnL) { await browseBtnL.click(); await l.waitForTimeout(800); }
  await shot(l, "12-browse-light");

  // 13 — API light
  const apiBtnL = await l.$("button:has-text('API')");
  if (apiBtnL) { await apiBtnL.click(); await l.waitForTimeout(800); }
  await shot(l, "13-api-light");

  // 14 — Landing light
  await l.evaluate(() => {
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
  });
  await l.reload();
  await l.waitForLoadState("networkidle");
  await l.waitForTimeout(800);
  await shot(l, "14-landing-light");

  await browser.close();
  console.log("\n✅ All screenshots saved to docs/screenshots/");
})();
