import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * Target:  E2E_BASE_URL (default http://localhost:3000). When unset and not in
 *          CI, Playwright starts `pnpm dev` itself. In CI the pipeline points
 *          it at the Docker stack built from the same commit.
 * Auth:    the `setup` project signs in once with E2E_USER_EMAIL /
 *          E2E_USER_PASSWORD (defaults = seeded demo tenant admin) and stores
 *          the session in tests/e2e/.auth/user.json; every other project reuses it.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isCI = Boolean(process.env.CI);

export const STORAGE_STATE = "tests/e2e/.auth/user.json";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.(spec|setup)\.ts/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "on-failure" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: isCI ? "retain-on-failure" : "off",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer:
    process.env.E2E_BASE_URL || isCI
      ? undefined
      : {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
});
