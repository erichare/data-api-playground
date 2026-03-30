import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("shows request-aware connect errors in the dialog", async ({ page }) => {
  await login(page);

  await page.route("**/api/connect", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Connection failed",
        requestId: "req-connect-123",
      }),
    });
  });

  await page.getByTestId("header-connect-button").click();
  await page.getByTestId("astra-token-input").fill("AstraCS:test");
  await page.getByTestId("astra-endpoint-input").fill(
    "https://db-id-us-east1.apps.astra.datastax.com"
  );
  await page.getByTestId("astra-connect-submit").click();

  await expect(
    page.getByText("Connection failed (request req-connect-123)")
  ).toBeVisible();
});

test("shows a chat error banner when the streaming route fails", async ({ page }) => {
  await login(page);

  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: `${JSON.stringify({
        error: "Search pipeline failed",
        requestId: "req-chat-456",
      })}\n`,
    });
  });

  await page.getByTestId("chat-input").fill("What is in my data?");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByTestId("chat-error-banner")).toContainText(
    "Search pipeline failed (request req-chat-456)"
  );
});
