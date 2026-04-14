import { expect, type Page } from "@playwright/test";

const defaultCollections = [
  {
    name: "orders",
    count: 12,
    documentCount: 3,
    vectorDim: 1536,
    vectorizeService: {
      provider: "openai",
      modelName: "text-embedding-3-small",
    },
  },
  {
    name: "customers",
    count: 4,
    documentCount: 2,
    vectorDim: null,
    vectorizeService: null,
  },
];

const defaultFields = {
  orders: ["customerId", "status", "total"],
  customers: ["name", "email"],
};

const defaultKeyspaces = ["default_keyspace", "analytics"];

export async function login(page: Page) {
  await page.goto("/");
  await page.waitForURL("**/login");
  await submitLogin(page);
  await page.waitForURL("**/");
  await expect(page.getByTestId("header-connect-button")).toBeVisible();
}

export async function submitLogin(page: Page) {
  const passwordInput = page.getByTestId("login-password");
  const submitButton = page.getByTestId("login-submit");

  await passwordInput.click();
  await passwordInput.pressSequentially("playwright-secret");
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
}

export async function mockConnectionRoutes(
  page: Page,
  overrides: {
    collections?: typeof defaultCollections;
    fields?: typeof defaultFields;
    keyspaces?: string[];
  } = {}
) {
  const collections = overrides.collections ?? defaultCollections;
  const fields = overrides.fields ?? defaultFields;
  const keyspaces = overrides.keyspaces ?? defaultKeyspaces;

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
        chatModel: "granite3.1-dense",
        embedModel: "nomic-embed-text",
      }),
    });
  });

  await page.route("**/api/astra-status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: false,
        hasToken: false,
        hasEndpoint: false,
      }),
    });
  });

  await page.route("**/api/connect", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ collections, fields }),
    });
  });

  await page.route("**/api/keyspaces", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ keyspaces }),
    });
  });

  await page.route("**/api/sample-fields", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as { collection?: string } | null;
    const collection = body?.collection ?? "orders";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        collection,
        fields: fields[collection as keyof typeof fields] ?? ["_id"],
      }),
    });
  });
}

export async function connectToAstra(
  page: Page,
  overrides: { token?: string; endpoint?: string } = {}
) {
  await page.getByTestId("header-connect-button").click();
  await expect(page.getByTestId("astra-connect-submit")).toBeVisible();
  await page
    .getByTestId("astra-token-input")
    .fill(overrides.token ?? "AstraCS:test");
  await page.getByTestId("astra-endpoint-input").fill(
    overrides.endpoint ?? "https://db-id-us-east1.apps.astra.datastax.com"
  );
  await page.getByTestId("astra-connect-submit").click();
  await expect(page.getByTestId("header-connected-button")).toBeVisible();
}
