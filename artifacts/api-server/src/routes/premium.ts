import { Router, type IRouter } from "express";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { getUncachableStripeClient, isStripeConnected } from "../lib/stripeClient";

const router: IRouter = Router();

type Tier = "premium" | "pro";
type Cadence = "monthly" | "annual";

function lookupKey(tier: Tier, cadence: Cadence): string {
  return `hashchat_${tier}_${cadence}`;
}

function parseBody(body: unknown): { tier: Tier; cadence: Cadence } {
  const b = (body ?? {}) as { tier?: unknown; billingPeriod?: unknown };
  const tier: Tier = b.tier === "pro" ? "pro" : "premium";
  const cadence: Cadence = b.billingPeriod === "annual" ? "annual" : "monthly";
  return { tier, cadence };
}

function appOrigin(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    (process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : "http://localhost:5000")
  );
}

async function resolvePriceId(tier: Tier, cadence: Cadence): Promise<string | null> {
  const key = lookupKey(tier, cadence);
  try {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({
      lookup_keys: [key],
      active: true,
      limit: 1,
    });
    return prices.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

router.get("/premium/status", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const [user] = await db
    .select({
      verified: usersTable.verified,
      tier: usersTable.tier,
      billingPeriod: usersTable.billingPeriod,
      premiumUntil: usersTable.premiumUntil,
    })
    .from(usersTable)
    .where(eq(usersTable.id, me))
    .limit(1);
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, me))
    .limit(1);
  const now = new Date();
  const periodActive = !!(user?.premiumUntil && user.premiumUntil > now);
  const subActive = sub?.status === "active" || sub?.status === "trialing";
  const active = subActive || periodActive;
  res.json({
    verified: !!user?.verified,
    active,
    tier: user?.tier ?? "free",
    billingPeriod: user?.billingPeriod ?? null,
    plan: sub?.plan ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd
      ? sub.currentPeriodEnd.toISOString()
      : user?.premiumUntil
        ? user.premiumUntil.toISOString()
        : null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    provider: isStripeConnected() ? "stripe" : "dev",
  });
});

router.post("/premium/checkout", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const { tier, cadence } = parseBody(req.body);
  if (!isStripeConnected()) {
    res.json({
      url: `${appOrigin()}/app/premium?dev_confirm=1&tier=${tier}&cadence=${cadence}`,
      provider: "dev",
    });
    return;
  }
  try {
    const stripe = await getUncachableStripeClient();
    const priceId = await resolvePriceId(tier, cadence);
    if (!priceId) {
      req.log.error(
        { tier, cadence, lookupKey: lookupKey(tier, cadence) },
        "Stripe price not found; run pnpm --filter @workspace/scripts run seed-stripe-products",
      );
      res.status(500).json({ error: "Subscription price not configured" });
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, me)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: user.displayName,
        metadata: { userId: user.id, username: user.username },
      });
      customerId = customer.id;
      await db.update(usersTable).set({ stripeCustomerId: customerId }).where(eq(usersTable.id, me));
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appOrigin()}/app/premium?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${appOrigin()}/app/premium?status=cancelled`,
      metadata: { userId: me, tier, billingPeriod: cadence },
      subscription_data: { metadata: { userId: me, tier, billingPeriod: cadence } },
      allow_promotion_codes: true,
    });
    res.json({ url: session.url ?? `${appOrigin()}/app/premium`, provider: "stripe" });
  } catch (err) {
    req.log.error({ err }, "premium checkout failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/premium/portal", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!isStripeConnected()) {
    res.status(400).json({ error: "Stripe not connected" });
    return;
  }
  try {
    const [user] = await db
      .select({ stripeCustomerId: usersTable.stripeCustomerId })
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1);
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No Stripe customer for this user" });
      return;
    }
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appOrigin()}/app/premium`,
    });
    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "premium portal failed");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

router.post("/premium/dev-confirm", requireAuth, async (req, res): Promise<void> => {
  if (isStripeConnected()) {
    res.status(400).json({ error: "Stripe is connected; use the real checkout flow" });
    return;
  }
  const me = getUserId(req);
  const { tier, cadence } = parseBody(req.body);
  const days = cadence === "annual" ? 365 : 30;
  const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const key = lookupKey(tier, cadence);
  await db
    .update(usersTable)
    .set({
      verified: true,
      tier,
      billingPeriod: cadence,
      premiumUntil: periodEnd,
    })
    .where(eq(usersTable.id, me));
  await db
    .insert(subscriptionsTable)
    .values({
      userId: me,
      plan: tier,
      tier,
      billingPeriod: cadence,
      priceLookupKey: key,
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        plan: tier,
        tier,
        billingPeriod: cadence,
        priceLookupKey: key,
        status: "active",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      },
    });
  res.json({
    verified: true,
    active: true,
    tier,
    billingPeriod: cadence,
    plan: tier,
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
    provider: "dev",
  });
});

export default router;
