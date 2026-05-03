import { expect, test, type Page } from "@playwright/test";

/**
 * Core-flow regression: sign up → onboarding → join hashtag → post → react →
 * DM another user → upgrade to MVP (Stripe test mode or dev fallback).
 *
 * The whole suite is skipped unless an authenticated storage state is
 * available (set by `auth.setup.ts` or pointed at via `E2E_AUTH_STATE`).
 *
 * Each step is best-effort: a failed sub-step that depends on data that may
 * not exist (e.g. discoverable people, populated rooms) marks the step as
 * skipped rather than failing the whole journey, while the headline upgrade
 * step is asserted strictly.
 */

const AUTH_STATE = process.env.E2E_AUTH_STATE ?? "./.auth/state.json";
const STARTER_TAGS = ["coding", "music", "gaming"] as const;

async function settle(page: Page, ms = 800): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

test.describe("Core flow: sign up → upgrade", () => {
  test.skip(
    !process.env.E2E_AUTH_STATE && !require("node:fs").existsSync(AUTH_STATE),
    "Run auth.setup.ts (or set E2E_AUTH_STATE) to capture a Clerk storage state",
  );

  test.use({ storageState: AUTH_STATE });
  // Steps share state — ordering matters.
  test.describe.configure({ mode: "serial" });

  test("completes onboarding with at least three hashtags", async ({ page }) => {
    await page.goto("/onboarding");
    // Already-onboarded users get bounced to /app/discover; that's fine.
    if (page.url().includes("/app/")) {
      test.info().annotations.push({
        type: "skip-step",
        description: "User already onboarded — skipping tag selection",
      });
      return;
    }

    for (const tag of STARTER_TAGS) {
      const starter = page.getByTestId(`starter-room-${tag}`);
      const inline = page.getByTestId(`tag-${tag}`);
      if (await starter.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
        await starter.first().click();
      } else if (await inline.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
        await inline.first().click();
      }
    }
    const save = page.getByTestId("button-save-tags");
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    await page.waitForURL(/\/app\/discover/, { timeout: 20_000 });
  });

  test("joins a hashtag room and sends a chat message", async ({ page }) => {
    const tag = STARTER_TAGS[0];
    await page.goto(`/app/rooms/${tag}`);
    await settle(page);

    // Private-room gate would block us — skip cleanly if encountered.
    if (
      await page
        .getByTestId("private-room-gate")
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      test.skip(true, "Hashtag room is private — skipping");
    }

    // Optional follow CTA — click if present (idempotent for joined users).
    const follow = page.getByTestId("button-room-follow");
    if (await follow.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await follow.click().catch(() => undefined);
    }

    const list = page.getByTestId("room-message-list");
    await expect(list).toBeVisible({ timeout: 15_000 });

    const composer = page.locator(
      '[data-testid="room-message-list"] ~ * textarea, textarea',
    ).first();
    await composer.click();
    const stamp = `e2e ping ${Date.now()}`;
    await composer.fill(stamp);
    await page.getByTestId("button-send-room").click();
    await expect(list.getByText(stamp).first()).toBeVisible({ timeout: 15_000 });
  });

  test("creates a post via the home composer", async ({ page }) => {
    await page.goto("/app/home");
    await settle(page);

    const composer = page.getByTestId("post-composer");
    if (!(await composer.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Post composer not present on /app/home");
    }
    const stamp = `e2e post ${Date.now()}`;
    const textarea = composer.locator("textarea").first();
    await textarea.click();
    await textarea.fill(stamp);
    await page.getByTestId("button-submit-post").click();

    const feed = page.getByTestId("post-feed").or(page.getByTestId("post-feed-virtualized"));
    await expect(feed.first().getByText(stamp).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("reacts to a post in the feed", async ({ page }) => {
    await page.goto("/app/home");
    await settle(page);

    const firstPost = page.locator('[data-testid^="post-"]').first();
    if (!(await firstPost.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No posts available to react to");
    }
    const postId = (await firstPost.getAttribute("data-testid"))?.replace(
      /^post-/,
      "",
    );
    if (!postId) test.skip(true, "Could not resolve post id");

    await firstPost.getByTestId(`button-post-react-${postId}`).click();
    // Click the first emoji in the popover; Clerk-style emoji popovers expose
    // role="button" within a role="menu" / role="dialog".
    const emoji = page
      .locator('[role="menu"], [role="dialog"]')
      .last()
      .locator('button, [role="menuitem"]')
      .first();
    await emoji.click();

    // The reaction chip should now be present on the post.
    await expect(
      firstPost.locator(`[data-testid^="post-reaction-${postId}-"]`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sends a DM to another discoverable user", async ({ page }) => {
    await page.goto("/app/discover");
    await settle(page);

    const messageBtn = page
      .locator('[data-testid^="button-message-"]')
      .first();
    if (!(await messageBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No discoverable users with a Message button");
    }
    await messageBtn.click();
    await page.waitForURL(/\/app\/messages\/\d+/, { timeout: 15_000 });

    const list = page.getByTestId("conv-message-list");
    await expect(list).toBeVisible({ timeout: 15_000 });
    const dm = `e2e dm ${Date.now()}`;
    const composer = page.locator("textarea").first();
    await composer.click();
    await composer.fill(dm);
    await page.getByTestId("button-send-dm").click();
    await expect(list.getByText(dm).first()).toBeVisible({ timeout: 15_000 });
  });

  test("upgrades to the Premium (MVP) tier", async ({ page }) => {
    await page.goto("/app/premium");
    await settle(page);

    // Already premium? Nothing to test on this run — leave a clear note.
    if (
      await page
        .getByTestId("premium-active-badge")
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      test.info().annotations.push({
        type: "skip-step",
        description: "Account is already premium",
      });
      return;
    }

    await page.getByTestId("cadence-monthly").click();
    const choose = page.getByTestId("button-choose-premium");
    await expect(choose).toBeEnabled({ timeout: 10_000 });

    // Capture provider preference from the API. We piggy-back on the
    // already-running app: the dev fallback completes inline; the Stripe
    // path navigates to checkout.stripe.com.
    const [maybeNav] = await Promise.all([
      page.waitForURL(/checkout\.stripe\.com|\/app\/premium/, {
        timeout: 30_000,
      }),
      choose.click(),
    ]);
    void maybeNav;

    if (page.url().includes("checkout.stripe.com")) {
      // Stripe Checkout test-mode card.
      await page.getByLabel(/email/i).fill(`e2e+${Date.now()}@example.com`);
      await page
        .getByLabel(/card number/i)
        .fill("4242 4242 4242 4242");
      await page.getByLabel(/expiration|expiry|mm \/ yy/i).fill("12 / 34");
      await page.getByLabel(/cvc|security code/i).fill("123");
      const nameField = page.getByLabel(/name on card|cardholder/i);
      if (await nameField.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await nameField.fill("E2E Tester");
      }
      const country = page.getByLabel(/country/i);
      if (await country.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await country.selectOption({ label: "United States" }).catch(() => undefined);
      }
      const zip = page.getByLabel(/zip|postal/i);
      if (await zip.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await zip.fill("94103");
      }
      await page
        .getByRole("button", { name: /(subscribe|pay|start trial)/i })
        .first()
        .click();
      await page.waitForURL(/\/app\/premium\?session_id=/, { timeout: 60_000 });
    } else if (page.url().includes("dev_confirm=1")) {
      // Dev fallback handed us back a confirmation URL — Premium page picks it
      // up; just navigate to /app/premium to see active state.
      await page.goto("/app/premium");
    }

    await expect(page.getByTestId("premium-active-badge")).toBeVisible({
      timeout: 30_000,
    });
  });
});
