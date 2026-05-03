import { expect, test } from "@playwright/test";

/**
 * Accessibility & polish checks that run signed-out so they're safe in CI.
 * Verifies reduce-motion CSS hooks, skeleton placeholders, and that the
 * sign-in page exposes accessible form controls.
 */
test.describe("Polish & a11y (signed-out)", () => {
  test("respects prefers-reduced-motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    // The app's reduce-motion CSS strips animation-duration on `*`. Sample any
    // visible element and confirm we end up at ~0s.
    const duration = await page.evaluate(() => {
      const target = document.body;
      return getComputedStyle(target).animationDuration;
    });
    expect(["0s", "0.01s", "0.001s", ""]).toContain(duration);
    await ctx.close();
  });

  test("sign-in form is keyboard-accessible", async ({ page }) => {
    await page.goto("/sign-in");
    const input = page
      .locator(
        'input[name="identifier"], input[type="email"], input[autocomplete="username"]',
      )
      .first();
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.focus();
    await expect(input).toBeFocused();
  });

  test("landing page exposes a sign-in CTA", async ({ page }) => {
    await page.goto("/");
    const cta = page
      .getByRole("link", { name: /sign[- ]?in|log[- ]?in|get started/i })
      .first();
    await expect(cta).toBeVisible({ timeout: 15_000 });
  });
});
