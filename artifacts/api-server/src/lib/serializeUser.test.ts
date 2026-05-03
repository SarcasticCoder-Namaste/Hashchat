import { describe, expect, it } from "vitest";
import type { User } from "@workspace/db";
import { publicUser } from "./serializeUser";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u_1",
    username: "alice",
    displayName: "Alice",
    bio: null,
    avatarUrl: null,
    bannerUrl: null,
    pronouns: null,
    location: null,
    website: null,
    statusEmoji: null,
    statusText: null,
    status: "online",
    featuredHashtag: null,
    discriminator: "12345",
    friendCode: "ABC-DEFG",
    role: "user",
    mvpPlan: false,
    verified: false,
    tier: "pro",
    billingPeriod: "monthly",
    animatedAvatarUrl: "https://cdn.example.com/avatar.gif",
    bannerGifUrl: "https://cdn.example.com/banner.gif",
    premiumUntil: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    hidePresence: false,
    bannedAt: null,
    lastSeenAt: new Date("2025-01-01T00:00:00Z"),
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  } as unknown as User;
}

describe("publicUser", () => {
  it("returns Pro-only fields when tier is 'pro'", () => {
    const u = makeUser({ tier: "pro" });
    const out = publicUser(u);
    expect(out.tier).toBe("pro");
    expect(out.animatedAvatarUrl).toBe("https://cdn.example.com/avatar.gif");
    expect(out.bannerGifUrl).toBe("https://cdn.example.com/banner.gif");
  });

  it("hides Pro-only fields after downgrade to free, leaving DB values intact", () => {
    const stored = makeUser({
      tier: "free",
      // DB values are still present after downgrade.
      animatedAvatarUrl: "https://cdn.example.com/avatar.gif",
      bannerGifUrl: "https://cdn.example.com/banner.gif",
    });
    const out = publicUser(stored);
    expect(out.tier).toBe("free");
    expect(out.animatedAvatarUrl).toBeNull();
    expect(out.bannerGifUrl).toBeNull();
    // The underlying user object is not mutated — values remain in storage.
    expect(stored.animatedAvatarUrl).toBe("https://cdn.example.com/avatar.gif");
    expect(stored.bannerGifUrl).toBe("https://cdn.example.com/banner.gif");
  });

  it("hides Pro-only fields when tier is 'premium'", () => {
    const out = publicUser(
      makeUser({
        tier: "premium",
        animatedAvatarUrl: "https://cdn.example.com/avatar.gif",
        bannerGifUrl: "https://cdn.example.com/banner.gif",
      }),
    );
    expect(out.animatedAvatarUrl).toBeNull();
    expect(out.bannerGifUrl).toBeNull();
  });
});
