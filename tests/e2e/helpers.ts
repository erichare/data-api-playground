import type { Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL("**/login");
  await page.getByTestId("login-password").fill("playwright-secret");
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/");
}
