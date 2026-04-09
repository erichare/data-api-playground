import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}

async function closeAllDialogs(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  // Click outside any overlay
  await page.mouse.click(720, 450);
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── DARK — dialogs ────────────────────────────────────────────────────────
  const dark = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  const d = await dark.newPage();
  await d.addInitScript(() => { localStorage.setItem("theme", "dark"); });
  await d.goto(BASE);
  await d.waitForLoadState("networkidle");
  await d.waitForTimeout(1000);

  // 09 — New Collection dialog
  await closeAllDialogs(d);
  await d.waitForTimeout(500);
  // Click the sidebar "New Collection" button (the + icon at the bottom)
  const newColBtn = await d.$("text=New Collection");
  if (newColBtn) {
    await newColBtn.click({ force: true });
    await d.waitForTimeout(800);
    await shot(d, "09-new-collection-dark");
  } else {
    console.log("⚠ new collection button not found");
    await shot(d, "09-new-collection-dark-fallback");
  }
  await closeAllDialogs(d);

  // 10 — Connect / Settings dialog — click header connection button
  const headerBtns = await d.$$("header button");
  console.log(`Found ${headerBtns.length} header buttons`);
  // Try clicking the "Connected" / connection status button
  if (headerBtns.length > 0) {
    for (const btn of headerBtns) {
      const text = await btn.textContent();
      console.log("Header btn text:", text?.trim());
    }
    // Click first button that has "Connect" text
    let clicked = false;
    for (const btn of headerBtns) {
      const text = await btn.textContent();
      if (text?.includes("Connect") || text?.includes("connected")) {
        await btn.click({ force: true });
        clicked = true;
        break;
      }
    }
    if (!clicked) await headerBtns[0].click({ force: true });
  }
  await d.waitForTimeout(800);
  await shot(d, "10-connect-dialog-dark");
  await closeAllDialogs(d);

  // ── LIGHT MODE ────────────────────────────────────────────────────────────
  const light = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const l = await light.newPage();
  await l.addInitScript(() => { localStorage.setItem("theme", "light"); });
  await l.goto(BASE);
  await l.waitForLoadState("networkidle");
  await l.waitForTimeout(1200);

  // 11 — Chat light
  await shot(l, "11-chat-empty-light");

  // 12 — Browse light
  const browseBtnL = await l.$("button:has-text('Browse')");
  if (browseBtnL) { await browseBtnL.click(); await l.waitForTimeout(800); }
  await shot(l, "12-browse-light");

  // 13 — API light (find op)
  const apiBtnL = await l.$("button:has-text('API')");
  if (apiBtnL) { await apiBtnL.click(); await l.waitForTimeout(800); }
  await shot(l, "13-api-find-light");

  // 13b — API light (Vector Search)
  const vsBtnL = await l.$("button:has-text('Vector Search')");
  if (vsBtnL) { await vsBtnL.click(); await l.waitForTimeout(500); }
  await shot(l, "13b-api-vector-light");

  // 14 — Ingest panel light
  const chatBtnL = await l.$("button:has-text('Chat')");
  if (chatBtnL) { await chatBtnL.click(); await l.waitForTimeout(500); }
  // Find the ingest toggle (the right edge collapse arrow)
  const allBtns = await l.$$("button");
  for (const btn of allBtns) {
    const txt = await btn.textContent();
    if (txt?.includes("Ingest") || txt?.includes("›") || txt?.includes("Data")) {
      console.log("Ingest btn:", txt?.trim()?.slice(0,30));
    }
  }
  // Try finding by the right panel trigger
  const ingestBtns = await l.$$("button");
  for (const btn of ingestBtns) {
    const txt = await btn.textContent();
    const aria = await btn.getAttribute("aria-label") ?? "";
    if (aria.toLowerCase().includes("ingest") || txt?.toLowerCase().includes("ingest")) {
      await btn.click({ force: true });
      break;
    }
  }
  await l.waitForTimeout(600);
  await shot(l, "14-ingest-light");

  // 15 — Landing light
  await l.evaluate(() => {
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
  });
  await l.reload();
  await l.waitForLoadState("networkidle");
  await l.waitForTimeout(800);
  await shot(l, "15-landing-light");

  await browser.close();
  console.log("\n✅ Done — docs/screenshots/");
})();
