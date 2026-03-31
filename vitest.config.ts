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
      reporter: ["text", "html", "lcov"],
      reportOnFailure: true,
      skipFull: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      thresholds: {
        statements: 43,
        branches: 36,
        functions: 40,
        lines: 45,
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
          statements: 65,
          branches: 60,
          functions: 65,
          lines: 65,
        },
        "src/components/shell/**": {
          statements: 60,
          branches: 60,
          functions: 50,
          lines: 60,
        },
        "src/components/connection/**": {
          statements: 80,
          branches: 85,
          functions: 65,
          lines: 85,
        },
        "src/components/collection/DeleteCollectionDialog.tsx": {
          statements: 70,
          branches: 80,
          functions: 65,
          lines: 75,
        },
        "src/components/ingest/IngestUploadPanel.tsx": {
          statements: 90,
          branches: 80,
          functions: 85,
          lines: 90,
        },
      },
    },
  },
});
