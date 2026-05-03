import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * These tests exercise the keyboard-shortcut UI surface. They are skipped
 * unless a Playwright storageState file is available — either via the
 * `setup` project's default at `./.auth/state.json` or via E2E_AUTH_STATE
 * pointing at one — see e2e/README.md.
 */
const AUTH_STATE = process.env.E2E_AUTH_STATE ?? "./.auth/state.json";
const HAS_AUTH = existsSync(AUTH_STATE);

test.describe("Keyboard shortcuts", () => {
  test.skip(
    !HAS_AUTH,
    "Run the `setup` project (or set E2E_AUTH_STATE) to capture a Clerk storageState",
  );

  test.use({ storageState: HAS_AUTH ? AUTH_STATE : undefined });

  test("? opens the shortcuts cheat sheet", async ({ page }) => {
    await page.goto("/app/discover");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Shift+/"); // "?"
    await expect(
      page.getByTestId("dialog-shortcuts-cheatsheet"),
    ).toBeVisible();
  });

  test("/ focuses the global search input", async ({ page }) => {
    await page.goto("/app/discover");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("/");
    const search = page.getByTestId("input-global-search");
    await expect(search).toBeFocused();
  });

  test("g h navigates to home", async ({ page }) => {
    await page.goto("/app/discover");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("g");
    await page.keyboard.press("h");
    await expect(page).toHaveURL(/\/app\/home/);
  });
});
