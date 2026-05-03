import { test as setup, expect } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Provision a Clerk test-mode user and capture a reusable storageState.
 *
 * Strategy:
 *  - Use Clerk's test-mode "+clerk_test" email pattern (verification code is
 *    always "424242"), so no real inbox is required.
 *  - Drive the hosted Clerk SignUp UI mounted at /sign-up in the social app.
 *  - On success, save storage state to E2E_AUTH_STATE (default
 *    `./.auth/state.json`) so subsequent specs can reuse it.
 *
 * Skipped when:
 *  - VITE_CLERK_PUBLISHABLE_KEY is missing or not a `pk_test_*` key, OR
 *  - E2E_SKIP_AUTH_SETUP is set (use a pre-captured state file instead).
 *
 * If a usable storage state already exists at the target path and
 * E2E_REUSE_AUTH_STATE is truthy, the setup is a no-op.
 */

const PUB_KEY =
  process.env.VITE_CLERK_PUBLISHABLE_KEY ??
  process.env.CLERK_PUBLISHABLE_KEY ??
  "";

const STATE_PATH = process.env.E2E_AUTH_STATE ?? "./.auth/state.json";

function randomEmail(): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `hashchat_e2e_${id}+clerk_test@example.com`;
}

function randomPassword(): string {
  return `Test-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

setup("authenticate (clerk test-mode)", async ({ page }) => {
  setup.skip(
    process.env.E2E_SKIP_AUTH_SETUP === "1",
    "E2E_SKIP_AUTH_SETUP=1 — using a pre-captured storage state",
  );
  setup.skip(
    !PUB_KEY.startsWith("pk_test_"),
    "VITE_CLERK_PUBLISHABLE_KEY is not a Clerk test-mode key",
  );
  if (process.env.E2E_REUSE_AUTH_STATE === "1" && existsSync(STATE_PATH)) {
    setup.info().annotations.push({
      type: "reuse",
      description: `Reusing existing storage state at ${STATE_PATH}`,
    });
    return;
  }

  const email = randomEmail();
  const password = randomPassword();
  const username = `e2e${Math.random().toString(36).slice(2, 8)}`;

  await page.goto("/sign-up");

  // Clerk renders fields with stable name attributes.
  const usernameField = page.locator('input[name="username"]').first();
  if (await usernameField.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await usernameField.fill(username);
  }
  await page
    .locator(
      'input[name="emailAddress"], input[type="email"], input[name="identifier"]',
    )
    .first()
    .fill(email);
  const passwordField = page.locator('input[name="password"]').first();
  if (await passwordField.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await passwordField.fill(password);
  }

  // Continue / Sign up
  await page
    .getByRole("button", { name: /^(continue|sign up|create account)$/i })
    .first()
    .click();

  // Email verification step — Clerk test mode accepts "424242".
  const codeInput = page
    .locator('input[name="code"], input[autocomplete="one-time-code"]')
    .first();
  if (await codeInput.isVisible({ timeout: 20_000 }).catch(() => false)) {
    // Clerk often renders a 6-segment OTP; fill works on the underlying input.
    await codeInput.fill("424242");
    // Some Clerk variants auto-submit; otherwise click continue.
    const cont = page.getByRole("button", { name: /^(continue|verify)$/i });
    if (await cont.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cont.first().click().catch(() => undefined);
    }
  }

  // After verification we should land on /onboarding (new user) or app root.
  await page.waitForURL(/\/(onboarding|app\/)/, { timeout: 30_000 });
  // Sanity: cookies for the Clerk session should now exist.
  const cookies = await page.context().cookies();
  expect(
    cookies.some((c) => c.name.startsWith("__session") || c.name.startsWith("__client")),
  ).toBeTruthy();

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STATE_PATH });

  setup.info().annotations.push({
    type: "credentials",
    description: `Provisioned ${email} (state: ${STATE_PATH})`,
  });
});
