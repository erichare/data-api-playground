import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportOnFailure: true,
      skipFull: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      thresholds: {
        statements: 85,
        branches: 70,
        functions: 80,
        lines: 87,
        "src/lib/astra.ts": {
          statements: 100,
          branches: 80,
          functions: 100,
          lines: 100,
        },
        "src/lib/auth.ts": {
          statements: 90,
          branches: 80,
          functions: 100,
          lines: 100,
        },
        "src/proxy.ts": {
          statements: 85,
          branches: 75,
          functions: 100,
          lines: 85,
        },
        "src/components/chat/**": {
          statements: 75,
          branches: 68,
          functions: 80,
          lines: 75,
        },
        "src/components/shell/**": {
          statements: 75,
          branches: 75,
          functions: 70,
          lines: 75,
        },
        "src/components/connection/**": {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
        "src/components/collection/DeleteCollectionDialog.tsx": {
          statements: 70,
          branches: 80,
          functions: 65,
          lines: 75,
        },
        "src/components/ingest/IngestUploadPanel.tsx": {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        "src/components/collection/hooks/useCollectionBrowse.ts": {
          statements: 95,
          branches: 85,
          functions: 95,
          lines: 95,
        },
        "src/components/collection/hooks/useCollectionForm.ts": {
          statements: 95,
          branches: 90,
          functions: 100,
          lines: 95,
        },
        "src/components/ingest/hooks/**": {
          statements: 98,
          branches: 95,
          functions: 100,
          lines: 98,
        },
      },
    },
  },
});
