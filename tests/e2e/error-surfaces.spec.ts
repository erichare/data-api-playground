import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("shows request-aware connect errors in the dialog", async ({ page }) => {
  await login(page);

  await page.route("**/api/ai-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hasHuggingFaceEnvKey: false,
        ollamaReachable: true,
        ollamaBaseUrl: "http://127.0.0.1:11434",
        chatModelInstalled: true,
        embedModelInstalled: true,
        huggingfaceChatModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
        huggingfaceEmbedModel: "ibm-granite/granite-embedding-125m-english",
        ollamaChatModel: "granite3.1-dense:8b",
        ollamaEmbedModel: "granite-embedding:278m",
      }),
    });
  });

  await page.route("**/api/knowledge-backend-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        openrag: {
          kind: "openrag",
          ready: false,
          hasApiKey: false,
          hasBaseUrl: false,
        },
      }),
    });
  });

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
  await page.getByTestId("backend-connect-submit").click();

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
