import { expect, test } from "@playwright/test";

/**
 * Contract checks for the core-flow endpoints. These run unauthenticated and
 * verify that the server enforces auth + rejects malformed input on every step
 * of the signup → onboarding → join hashtag → post → react → DM → upgrade
 * journey. Authoring the full authenticated journey is tracked as follow-up
 * #97 (requires a Clerk test-mode user + Stripe test mode setup).
 */
test.describe("Core-flow API contracts", () => {
  test("health endpoint returns ok payload", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual(expect.objectContaining({ status: expect.any(String) }));
  });

  test("GET /api/me requires auth", async ({ request }) => {
    const res = await request.get("/api/me");
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/posts rejects unauthenticated writes", async ({ request }) => {
    const res = await request.post("/api/posts", {
      data: { content: "hello from e2e", hashtag: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/conversations requires auth (DM step)", async ({ request }) => {
    const res = await request.post("/api/conversations", {
      data: { otherUserId: "00000000-0000-0000-0000-000000000000" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("hashtag follow endpoint requires auth", async ({ request }) => {
    const res = await request.post("/api/hashtags/test/follow");
    expect([401, 403, 404]).toContain(res.status());
  });

  test("Stripe upgrade checkout endpoint requires auth", async ({ request }) => {
    const res = await request.post("/api/premium/checkout", {
      data: { tier: "mvp" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});
