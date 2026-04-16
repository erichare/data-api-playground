import { expect, test } from "@playwright/test";
import { connectToAstra, login, mockConnectionRoutes } from "./helpers";

function asNdjson(events: unknown[]) {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

test("connects successfully and shows collection metadata", async ({ page }) => {
  await mockConnectionRoutes(page);
  await login(page);
  await connectToAstra(page);

  await expect(page.locator("aside").getByText("orders", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByText("3 docs, 12 chunks")).toBeVisible();
});

test("sends a chat message and renders the streamed answer", async ({ page }) => {
  await mockConnectionRoutes(page);
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: asNdjson([
        {
          step: "analyze",
          status: "complete",
          latencyMs: 4,
          data: { searchMode: "hybrid" },
        },
        {
          step: "search",
          status: "complete",
          latencyMs: 7,
          data: {
            collection: "orders",
            results: [
              {
                id: "order-1",
                similarity: 0.98,
                preview: { customer: "Ada", status: "shipped" },
              },
            ],
          },
        },
        {
          step: "respond",
          status: "running",
          data: { content: "Orders look healthy overall." },
        },
        {
          step: "respond",
          status: "complete",
          latencyMs: 9,
          data: { content: "Orders look healthy overall." },
        },
      ]),
    });
  });

  await login(page);
  await connectToAstra(page);

  await page.getByTestId("chat-input").fill("How are my orders doing?");
  await page.getByTestId("chat-send-button").click();

  await expect(page.getByText("Orders look healthy overall.")).toBeVisible();
  await expect(page.getByText("Pipeline", { exact: true })).toBeVisible();
});

test("ingests a document and adds it to the library", async ({ page }) => {
  await mockConnectionRoutes(page);
  await page.route("**/api/documents?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ documents: [] }),
    });
  });
  await page.route("**/api/ingest-document", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: asNdjson([
        { type: "chunked", chunks: 3 },
        {
          type: "complete",
          chunks: 3,
          source_doc_id: "doc-orders-guide",
          content_hash: "hash-orders-guide",
        },
      ]),
    });
  });

  await login(page);
  await connectToAstra(page);

  await page.getByRole("button", { name: "Ingest" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "orders-guide.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fake pdf"),
  });
  await page.getByRole("button", { name: "Ingest Document" }).click();

  await expect(page.getByText("orders-guide.pdf").first()).toBeVisible();
  await expect(page.getByText("3 chunks")).toBeVisible();
});

test("runs an API Explorer request and shows the response plus runtime call log", async ({
  page,
}) => {
  let clientCallPolls = 0;

  await mockConnectionRoutes(page);
  await page.route("**/api/typescript-client-calls?limit=40", async (route) => {
    clientCallPolls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        calls:
          clientCallPolls > 1
            ? [
                {
                  id: "call-find-1",
                  label: "API Explorer: Find",
                  code: 'await db.collection("orders").find({})',
                  timestamp: "2026-04-13T19:00:00.000Z",
                },
              ]
            : [],
      }),
    });
  });
  await page.route("**/api/data-api-proxy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: 200,
        statusText: "OK",
        latencyMs: 8,
        data: [{ _id: "order-1", status: "shipped" }],
      }),
    });
  });

  await login(page);
  await connectToAstra(page);

  await page.getByTestId("view-mode-api-button").click();
  await expect(page.getByTestId("api-run-button")).toBeVisible();
  await page.getByTestId("api-run-button").click();

  await expect(page.getByText("200 OK")).toBeVisible();
  await expect(page.getByText("order-1")).toBeVisible();
  await expect(page.getByText("API Explorer: Find")).toBeVisible();
});
