/* eslint-disable @typescript-eslint/no-require-imports */
// Screenshot script for Data API Playground docs
// Run with: npx playwright-chromium node docs/scripts/take-screenshots.js
// Or: node docs/scripts/take-screenshots.js (with playwright installed)

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '../screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE_URL = 'http://localhost:3000';

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function clickTrace(page) {
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.filter(b => b.textContent.trim() === 'Trace').forEach(b => b.click());
  });
  await wait(300);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 820 } });
  const page = await ctx.newPage();

  console.log('Navigating to app...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await wait(2000);

  // ── 1. Chat empty state ────────────────────────────────────────────────────
  console.log('1. Chat empty state');
  await page.screenshot({ path: path.join(OUT_DIR, '01-chat-empty.png'), fullPage: false });

  // ── 2. Chat with messages (click Demo conversation if available) ───────────
  console.log('2. Chat with messages');
  const demoLink = page.locator('text=Demo').first();
  if (await demoLink.isVisible()) {
    await demoLink.click();
    await wait(2500);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '02-chat-messages.png') });

  // ── 3. Code tab ────────────────────────────────────────────────────────────
  console.log('3. Code tab');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const codeBtn = btns.find(b => b.textContent.trim() === 'Code' && b.className.includes('px-3'));
    if (codeBtn) codeBtn.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(OUT_DIR, '03-chat-code-tab.png') });

  // ── 4. Trace tab ───────────────────────────────────────────────────────────
  console.log('4. Trace tab');
  await clickTrace(page);
  await page.screenshot({ path: path.join(OUT_DIR, '04-chat-trace-tab.png') });

  // ── 5. Browse – Output tab ─────────────────────────────────────────────────
  console.log('5. Browse output');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'Browse')?.click();
  });
  await wait(1500);
  await page.screenshot({ path: path.join(OUT_DIR, '05-browse-output.png') });

  // ── 6. Browse – Code tab ───────────────────────────────────────────────────
  console.log('6. Browse code');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'Code' && b.className.includes('px-3'))?.click();
  });
  await wait(300);
  await page.screenshot({ path: path.join(OUT_DIR, '06-browse-code.png') });

  // ── 7. Browse + Ingest panel ───────────────────────────────────────────────
  console.log('7. Ingest panel');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title === 'Expand ingest panel')?.click();
  });
  await wait(500);
  await page.screenshot({ path: path.join(OUT_DIR, '07-ingest-panel.png') });

  // ── 8. New Collection dialog ───────────────────────────────────────────────
  console.log('8. New collection dialog');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'New Collection')?.click();
  });
  await wait(500);
  await page.screenshot({ path: path.join(OUT_DIR, '08-dialog-new-collection.png') });

  // ── 9. Connect dialog ──────────────────────────────────────────────────────
  console.log('9. Connect dialog');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'Cancel')?.click();
  });
  await wait(200);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title === 'Manage connection')?.click();
  });
  await wait(400);
  await page.screenshot({ path: path.join(OUT_DIR, '09-dialog-connect.png') });

  // ── 10. Quick Start Guide ──────────────────────────────────────────────────
  console.log('10. Quick start guide');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'Cancel')?.click();
  });
  await wait(200);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title === 'Quick Start & Settings')?.click();
  });
  await wait(400);
  await page.screenshot({ path: path.join(OUT_DIR, '10-quick-start-guide.png') });

  // ── 11. Delete Collection dialog ──────────────────────────────────────────
  console.log('11. Delete collection dialog');
  // Close quick start
  const closeBtn = page.locator('button[class*="absolute"][class*="top"]').first();
  if (await closeBtn.isVisible()) await closeBtn.click();
  await wait(200);
  // Navigate to browse and open delete
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'Browse')?.click();
  });
  await wait(800);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title === 'Delete collection')?.click();
  });
  await wait(400);
  await page.screenshot({ path: path.join(OUT_DIR, '11-dialog-delete-collection.png') });

  // ── 12. Light mode ─────────────────────────────────────────────────────────
  console.log('12. Light mode');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.textContent.trim() === 'Cancel')?.click();
  });
  await wait(200);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    btns.find(b => b.title?.includes('light mode'))?.click();
  });
  await wait(400);
  await page.screenshot({ path: path.join(OUT_DIR, '12-light-mode.png') });

  await browser.close();
  console.log('\nAll screenshots saved to docs/screenshots/');
})();
