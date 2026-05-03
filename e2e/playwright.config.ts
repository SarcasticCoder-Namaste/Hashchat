import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.E2E_BASE_URL ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:80");

const AUTH_STATE = process.env.E2E_AUTH_STATE ?? "./.auth/state.json";
// Only attach the storageState file at config time if it already exists.
// (When the `setup` project runs first, it creates this file before the
// `authenticated` project starts, and Playwright re-resolves storageState
// per project at test time.)
const AUTH_STATE_FOR_USE = existsSync(AUTH_STATE) ? AUTH_STATE : undefined;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /(auth\.setup|core-flows|shortcuts)\.(ts|spec\.ts)/,
    },
    {
      name: "authenticated",
      testMatch: /(core-flows|shortcuts)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...(AUTH_STATE_FOR_USE ? { storageState: AUTH_STATE_FOR_USE } : {}),
      },
      dependencies: ["setup"],
    },
  ],
});
