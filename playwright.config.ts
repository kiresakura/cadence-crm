import { defineConfig, devices } from "@playwright/test";

const PORT = 3101;
const baseURL = `http://localhost:${PORT}`;
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? "postgresql://cadence:cadence@localhost:54330/cadence_e2e";

/**
 * End-to-end tests run against a production build (`npm run build` first) on port 3101,
 * backed by a dedicated database that is migrated and re-seeded on every run.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "e2e",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "screenshots",
      testMatch: /screenshots\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "npm run e2e:server",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    env: {
      DATABASE_URL: databaseUrl,
      APP_ENV: "test",
      AUTH_SECRET: "test-only-auth-secret-that-is-long-enough-0000",
      APP_URL: baseURL,
      PORT: String(PORT),
    },
  },
});
