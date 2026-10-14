import path from "node:path";

import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://cadence:cadence@localhost:54330/cadence_test";

const env = {
  APP_ENV: "test",
  AUTH_SECRET: "test-only-auth-secret-that-is-long-enough-0000",
  DATABASE_URL: testDatabaseUrl,
  TZ: "UTC",
};

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(root, "src"),
      // `server-only` throws outside the React server runtime; tests run in plain Node.
      "server-only": path.join(root, "tests/support/server-only.ts"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/server/**/*.ts"],
      exclude: ["src/server/**/*.test.ts"],
      reporter: ["text", "text-summary", "json-summary"],
      reportsDirectory: "coverage",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
          env,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env,
          globalSetup: ["tests/integration/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
