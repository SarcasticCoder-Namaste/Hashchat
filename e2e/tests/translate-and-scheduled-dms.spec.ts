import { expect, test, type Page } from "@playwright/test";

/**
 * Voice-room hand-raise flows are covered at the API level by Vitest
 * (`artifacts/api-server/src/routes/calls.test.ts`). This spec covers the
 * UI side of the new messaging features that ship in the same surface area:
 *
 *  1. Inline message translation (Languages icon on a message bubble)
 *  2. Scheduling a DM via the composer's Clock icon
 *  3. Cancelling that scheduled DM from the CalendarClock sheet
 *
 * The whole suite is skipped unless an authenticated storage state is
 * available (set by `auth.setup.ts` or pointed at via `E2E_AUTH_STATE`).
 *
 * The spec is conservative: each step gracefully marks itself skipped when
 * the dev environment lacks the data it needs (e.g. no other discoverable
 * users) so the suite acts as a regression net rather than a hard gate.
 */

const AUTH_STATE = process.env.E2E_AUTH_STATE ?? "./.auth/state.json";
const SPANISH_MSG = "Hola, ¿cómo estás?";

async function settle(page: Page, ms = 600): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(ms);
}

async function openOrCreateDirectConversation(page: Page): Promise<number> {
  // Try the existing list first.
  const listed = await page.evaluate(async () => {
    const r = await fetch("/api/conversations", { credentials: "include" });
    if (!r.ok) return null;
    return (await r.json()) as Array<{ id: number; kind?: string }>;
  });
  const existing = listed?.find((c) => c.kind === "direct" || !c.kind);
  if (existing) return existing.id;

  // Otherwise create one against any other discoverable user.
  const otherId = await page.evaluate(async () => {
    for (const url of [
      "/api/users/discover",
      "/api/users/search?q=a",
      "/api/users",
    ]) {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) continue;
      const data = (await r.json()) as
        | Array<{ id: string }>
        | { users?: Array<{ id: string }> };
      const users = Array.isArray(data) ? data : (data.users ?? []);
      const me = (
        await (await fetch("/api/me", { credentials: "include" })).json()
      ) as { id?: string };
      const other = users.find((u) => u.id && u.id !== me.id);
      if (other) return other.id;
    }
    return null;
  });
  if (!otherId) throw new Error("no other discoverable user available");

  const created = await page.evaluate(async (uid: string) => {
    const r = await fetch("/api/conversations", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "direct", memberIds: [uid] }),
    });
    if (!r.ok) throw new Error(`create convo failed: ${r.status}`);
    return (await r.json()) as { id: number };
  }, otherId);
  return created.id;
}

async function postMessage(
  page: Page,
  convoId: number,
  content: string,
): Promise<{ id: number }> {
  const created = await page.evaluate(
    async ({ convoId, content }) => {
      const r = await fetch(`/api/conversations/${convoId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error(`send msg failed: ${r.status}`);
      return (await r.json()) as { id: number };
    },
    { convoId, content },
  );
  return created;
}

test.describe("Inline translate + scheduled DMs", () => {
  test.skip(
    !process.env.E2E_AUTH_STATE && !require("node:fs").existsSync(AUTH_STATE),
    "Run auth.setup.ts (or set E2E_AUTH_STATE) to capture a Clerk storage state",
  );

  test.use({ storageState: AUTH_STATE });
  test.describe.configure({ mode: "serial" });

  let convoId: number;
  let messageId: number;
  let scheduledText: string;

  test("set up a conversation with a translatable Spanish message", async ({
    page,
  }) => {
    await page.goto("/app/discover");
    await settle(page);

    try {
      convoId = await openOrCreateDirectConversation(page);
    } catch (err) {
      test.skip(true, `cannot open a direct conversation: ${(err as Error).message}`);
    }
    const msg = await postMessage(page, convoId, SPANISH_MSG);
    messageId = msg.id;

    await page.goto(`/app/messages/${convoId}`);
    await settle(page);
    const list = page.getByTestId("conv-message-list");
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.getByText(SPANISH_MSG).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("translates a message inline to English", async ({ page }) => {
    test.skip(!messageId, "previous step did not seed a message");
    await page.goto(`/app/messages/${convoId}`);
    await settle(page);

    const bubble = page.getByTestId(`msg-${messageId}`);
    await expect(bubble).toBeVisible({ timeout: 15_000 });
    // Surface the inline action toolbar (it's hover-revealed on desktop).
    await bubble.hover();

    const trigger = page.getByTestId(`button-translate-${messageId}`);
    await expect(trigger).toBeVisible({ timeout: 5_000 });
    await trigger.click();

    // The translate popover defaults to Spanish; the source IS Spanish, so
    // we must switch to English or the LLM round-trips and the UI looks
    // like nothing happened.
    const select = page.getByTestId(`select-translate-language-${messageId}`);
    await select.click();
    await page.getByRole("option", { name: "English" }).click();

    await page.getByTestId(`button-do-translate-${messageId}`).click();

    const translation = page.getByTestId(`translation-${messageId}`);
    await expect(translation).toBeVisible({ timeout: 30_000 });
    // Label shows the language in uppercase.
    await expect(translation).toContainText(/ENGLISH/i, { timeout: 10_000 });
    // The translation must NOT still read as the Spanish source.
    await expect(translation).not.toContainText(SPANISH_MSG, {
      timeout: 5_000,
    });
  });

  test("schedules a DM from the composer", async ({ page }) => {
    test.skip(!convoId, "previous step did not seed a conversation");
    await page.goto(`/app/messages/${convoId}`);
    await settle(page);

    scheduledText = `e2e sched ${Date.now().toString(36)}`;
    const composer = page.locator("textarea").first();
    await composer.click();
    await composer.fill(scheduledText);

    // Open the schedule dialog.
    await page.getByTestId("button-schedule-dm").click();

    const dateInput = page.getByTestId("input-schedule-date");
    const timeInput = page.getByTestId("input-schedule-time");
    await expect(dateInput).toBeVisible({ timeout: 5_000 });

    // Pick ~60 minutes from now in the browser's local time.
    const when = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number): string => n.toString().padStart(2, "0");
    const dateStr =
      `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
    const timeStr = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
    await dateInput.fill(dateStr);
    await timeInput.fill(timeStr);

    await page.getByTestId("button-confirm-schedule").click();
    await expect(dateInput).toBeHidden({ timeout: 10_000 });
  });

  test("lists and cancels the scheduled DM from the sheet", async ({
    page,
  }) => {
    test.skip(!scheduledText, "previous step did not schedule a DM");
    await page.goto(`/app/messages/${convoId}`);
    await settle(page);

    await page.getByTestId("button-open-scheduled-dms").click();

    const item = page.locator(
      `[data-testid^="scheduled-"]:has-text("${scheduledText}")`,
    );
    await expect(item).toBeVisible({ timeout: 10_000 });

    // Each item exposes a cancel button with a stable testid suffix.
    await item.locator('[data-testid^="button-cancel-scheduled-"]').click();
    // Confirm dialog (if shown).
    const confirm = page.getByRole("button", {
      name: /^(cancel scheduled|confirm|yes)/i,
    });
    if (await confirm.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      await confirm.first().click();
    }

    await expect(item).toHaveCount(0, { timeout: 10_000 });
  });
});
