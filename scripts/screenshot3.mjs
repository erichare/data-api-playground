import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";
const ID = "cd6f2a47-6df5-41e8-9e17-7595635fa0ad"; // server already running

async function wait(page, ms = 800) { await page.waitForTimeout(ms); }

async function shot(page, name) {
  await wait(page, 700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`✓ ${name}.png`);
}

async function closeDialogs(page) {
  await page.keyboard.press("Escape");
  await wait(page, 300);
  await page.keyboard.press("Escape");
  await wait(page, 300);
}

async function clickTab(page, label) {
  await page.click(`button:has-text("${label}")`);
  await wait(page, 900);
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ── Connected state (env vars auto-connect) ───────────────────────────────
  async function makeConnectedPage(colorScheme) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme });
    const page = await ctx.newPage();
    // Let env vars handle auth — don't touch sessionStorage
    await page.addInitScript((scheme) => { localStorage.setItem("theme", scheme); }, colorScheme === "dark" ? "dark" : "light");
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await wait(page, 1500); // let collections load
    return { ctx, page };
  }

  // ── DARK ──────────────────────────────────────────────────────────────────

  const { page: d } = await makeConnectedPage("dark");

  // 01 — Chat (empty state / with messages)
  await clickTab(d, "Chat");
  await shot(d, "01-chat-dark");

  // 02 — Browse
  await clickTab(d, "Browse");
  await shot(d, "02-browse-dark");

  // 03 — API — Find
  await clickTab(d, "API");
  await shot(d, "03-api-find-dark");

  // 04 — API — Vector Search
  await d.click("button:has-text('Vector Search')");
  await wait(d, 500);
  await shot(d, "04-api-vector-dark");

  // 05 — API — Python tab
  await d.click("button:has-text('Python')");
  await wait(d, 400);
  await shot(d, "05-api-python-dark");

  // 06 — API — Insert Many
  await d.click("button:has-text('Insert Many')");
  await wait(d, 400);
  await shot(d, "06-api-insert-dark");

  // 07 — Ingest panel open
  await clickTab(d, "Chat");
  // Open ingest panel via the right-edge toggle arrow
  const rightEdge = await d.$(".ingest-toggle, [aria-label*='ngest'], [title*='ngest']");
  if (rightEdge) {
    await rightEdge.click();
  } else {
    // Try the collapse/expand button on the right panel edge
    const btns = await d.$$("button");
    for (const btn of btns) {
      const box = await btn.boundingBox();
      if (box && box.x > 1380) { // far right edge
        await btn.click({ force: true });
        break;
      }
    }
  }
  await wait(d, 700);
  await shot(d, "07-ingest-panel-dark");

  // Close ingest
  await closeDialogs(d);

  // 08 — New Collection dialog
  await d.click("text=New Collection");
  await wait(d, 700);
  await shot(d, "08-new-collection-dark");
  await closeDialogs(d);

  // 09 — Quick Start Guide (gear/settings icon in header)
  const headerBtns = await d.$$("header button");
  // The settings button is the gear icon
  for (const btn of headerBtns) {
    const innerHTML = await btn.innerHTML();
    if (innerHTML.includes("Settings") || innerHTML.includes("cog") || innerHTML.includes("settings")) {
      await btn.click({ force: true });
      break;
    }
  }
  // Try clicking by position — settings is usually second-to-last in header
  if (headerBtns.length >= 2) {
    await headerBtns[headerBtns.length - 2].click({ force: true });
  }
  await wait(d, 700);
  await shot(d, "09-quickstart-dark");
  await closeDialogs(d);

  // 10 — Connect dialog (click "Connected" button in header)
  const connBtn = await d.$("button:has-text('Connected'), button:has-text('Connect')");
  if (connBtn) { await connBtn.click({ force: true }); }
  await wait(d, 700);
  await shot(d, "10-connect-dialog-dark");
  await closeDialogs(d);

  // 11 — Landing screen (force show by navigating to /?landing=1 and clearing state)
  // We'll render landing by manipulating React state via eval
  await d.evaluate(() => {
    // Dispatch a custom event or manipulate localStorage to force landing
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
  });
  await d.goto(`${BASE}?t=${Date.now()}`); // fresh load without creds
  await d.waitForLoadState("networkidle");
  await wait(d, 1000);
  await shot(d, "11-landing-dark");
  // Go back to connected state
  await d.goBack();
  await d.waitForLoadState("networkidle");
  await wait(d, 1200);

  // ── LIGHT ─────────────────────────────────────────────────────────────────

  const { page: l } = await makeConnectedPage("light");

  // 12 — Chat light
  await clickTab(l, "Chat");
  await shot(l, "12-chat-light");

  // 13 — Browse light
  await clickTab(l, "Browse");
  await shot(l, "13-browse-light");

  // 14 — API light (Find)
  await clickTab(l, "API");
  await shot(l, "14-api-find-light");

  // 15 — API light (Vector Search)
  await l.click("button:has-text('Vector Search')");
  await wait(l, 500);
  await shot(l, "15-api-vector-light");

  // 16 — Ingest panel light
  await clickTab(l, "Chat");
  const rightBtnsL = await l.$$("button");
  for (const btn of rightBtnsL) {
    const box = await btn.boundingBox();
    if (box && box.x > 1380) {
      await btn.click({ force: true });
      break;
    }
  }
  await wait(l, 700);
  await shot(l, "16-ingest-panel-light");
  await closeDialogs(l);

  // 17 — New Collection light
  await l.click("text=New Collection");
  await wait(l, 700);
  await shot(l, "17-new-collection-light");
  await closeDialogs(l);

  // 18 — Landing light
  await l.evaluate(() => {
    sessionStorage.removeItem("astra_token");
    sessionStorage.removeItem("astra_endpoint");
  });
  await l.goto(`${BASE}?t=${Date.now()}`);
  await l.waitForLoadState("networkidle");
  await wait(l, 1000);
  await shot(l, "18-landing-light");

  await browser.close();
  console.log(`\n✅ ${OUT}`);
})();
