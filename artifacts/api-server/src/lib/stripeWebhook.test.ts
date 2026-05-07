import { describe, expect, it } from "vitest";
import { Stripe } from "stripe";
import { resolveTierFromSubscription } from "./stripeWebhook";

function makeSubscription(opts: {
  lookupKey?: string | null;
  metadata?: Record<string, string>;
}): Stripe.Subscription {
  return {
    id: "sub_test",
    items: {
      data: [
        {
          price: { lookup_key: opts.lookupKey ?? null },
        },
      ],
    },
    metadata: opts.metadata ?? {},
  } as unknown as Stripe.Subscription;
}

describe("resolveTierFromSubscription", () => {
  it("resolves hashchat_premium_monthly", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({ lookupKey: "hashchat_premium_monthly" }),
    );
    expect(r).toEqual({
      tier: "premium",
      billingPeriod: "monthly",
      priceLookupKey: "hashchat_premium_monthly",
    });
  });

  it("resolves hashchat_premium_annual", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({ lookupKey: "hashchat_premium_annual" }),
    );
    expect(r).toEqual({
      tier: "premium",
      billingPeriod: "annual",
      priceLookupKey: "hashchat_premium_annual",
    });
  });

  it("resolves hashchat_pro_monthly", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({ lookupKey: "hashchat_pro_monthly" }),
    );
    expect(r).toEqual({
      tier: "pro",
      billingPeriod: "monthly",
      priceLookupKey: "hashchat_pro_monthly",
    });
  });

  it("resolves hashchat_pro_annual", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({ lookupKey: "hashchat_pro_annual" }),
    );
    expect(r).toEqual({
      tier: "pro",
      billingPeriod: "annual",
      priceLookupKey: "hashchat_pro_annual",
    });
  });

  it("falls back to subscription metadata when lookup_key is missing", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({
        lookupKey: null,
        metadata: { tier: "pro", billingPeriod: "annual" },
      }),
    );
    expect(r).toEqual({
      tier: "pro",
      billingPeriod: "annual",
      priceLookupKey: null,
    });
  });

  it("falls back to metadata tier without cadence", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({
        lookupKey: null,
        metadata: { tier: "premium" },
      }),
    );
    expect(r).toEqual({
      tier: "premium",
      billingPeriod: null,
      priceLookupKey: null,
    });
  });

  it("ignores invalid metadata cadence values", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({
        lookupKey: null,
        metadata: { tier: "pro", billingPeriod: "weekly" },
      }),
    );
    expect(r).toEqual({
      tier: "pro",
      billingPeriod: null,
      priceLookupKey: null,
    });
  });

  it("falls back to metadata when lookup_key is unrecognized", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({
        lookupKey: "legacy_random_key",
        metadata: { tier: "pro", billingPeriod: "monthly" },
      }),
    );
    expect(r).toEqual({
      tier: "pro",
      billingPeriod: "monthly",
      priceLookupKey: "legacy_random_key",
    });
  });

  it("defaults to premium with no cadence when nothing matches", () => {
    const r = resolveTierFromSubscription(
      makeSubscription({ lookupKey: null, metadata: {} }),
    );
    expect(r).toEqual({
      tier: "premium",
      billingPeriod: null,
      priceLookupKey: null,
    });
  });
});
