import { expect, test } from "@playwright/test";
import { login, submitLogin } from "./helpers";

test("redirects unauthenticated users to login and allows sign-in", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Playground Login")).toBeVisible();

  await submitLogin(page);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Data API Playground")).toBeVisible();
  await expect(page.getByTestId("header-signout-button")).toBeVisible();
});

test("creates incrementing untitled conversations", async ({ page }) => {
  await login(page);

  await page.getByTestId("new-conversation-button").click();
  await page.getByTestId("new-conversation-button").click();

  await expect(
    page.locator("aside").getByText("Untitled", { exact: true }).first()
  ).toBeVisible();
  await expect(
    page.locator("aside").getByText("Untitled (1)", { exact: true }).first()
  ).toBeVisible();
});
