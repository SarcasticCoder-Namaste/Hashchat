import { expect, test } from "@playwright/test";

/**
 * These tests exercise the keyboard-shortcut UI surface. They are skipped
 * unless E2E_AUTH_STATE points at a Playwright storageState file produced by
 * a signed-in Clerk session — see e2e/README.md for setup.
 */
const AUTH_STATE = process.env.E2E_AUTH_STATE;

test.describe("Keyboard shortcuts", () => {
  test.skip(
    !AUTH_STATE,
    "Set E2E_AUTH_STATE to a saved Clerk storageState to run signed-in flows",
  );

  test.use({ storageState: AUTH_STATE ?? undefined });

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
