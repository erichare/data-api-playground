import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const E2E_DB_PATH = "/tmp/data-api-playground-e2e.db";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `sh -c 'rm -f ${E2E_DB_PATH} ${E2E_DB_PATH}-shm ${E2E_DB_PATH}-wal && npm run build && npm run start -- --port ${PORT} --hostname 127.0.0.1'`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      ASTRA_DB_APPLICATION_TOKEN: "",
      ASTRA_DB_API_ENDPOINT: "",
      HUGGINGFACE_API_KEY: "",
      DATA_API_PLAYGROUND_DB_PATH: E2E_DB_PATH,
      PLAYGROUND_AUTH_PASSWORD: "playwright-secret",
      PLAYGROUND_AUTH_SECRET: "playwright-secret-key",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
