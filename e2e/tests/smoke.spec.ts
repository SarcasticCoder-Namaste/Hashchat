import { expect, test } from "@playwright/test";

test.describe("HashChat smoke", () => {
  test("API health endpoint responds", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.ok()).toBeTruthy();
  });

  test("landing page renders core branding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/HashChat/i);
    // Either a sign-in CTA (signed-out) or AppShell logo (signed-in) must show.
    const branding = page.getByText("HashChat", { exact: false }).first();
    await expect(branding).toBeVisible({ timeout: 15_000 });
  });

  test("sign-in route loads Clerk form", async ({ page }) => {
    await page.goto("/sign-in");
    // Clerk renders an email or username input — either selector should match.
    const input = page
      .locator(
        'input[name="identifier"], input[type="email"], input[autocomplete="username"]',
      )
      .first();
    await expect(input).toBeVisible({ timeout: 20_000 });
  });
});
