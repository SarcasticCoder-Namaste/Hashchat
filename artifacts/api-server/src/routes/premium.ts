import { Router, type IRouter } from "express";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { getUncachableStripeClient, isStripeConnected } from "../lib/stripeClient";

const router: IRouter = Router();

const PRICE_LOOKUP_KEY = "hashchat_pro_monthly";

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

async function resolvePremiumPriceId(): Promise<string | null> {
  if (process.env.STRIPE_PRICE_PREMIUM) return process.env.STRIPE_PRICE_PREMIUM;
  try {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 });
    return prices.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

router.get("/premium/status", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const [user] = await db
    .select({ verified: usersTable.verified, premiumUntil: usersTable.premiumUntil })
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
  if (!isStripeConnected()) {
    res.json({ url: `${appOrigin()}/app/premium?dev_confirm=1`, provider: "dev" });
    return;
  }
  try {
    const stripe = await getUncachableStripeClient();
    const priceId = await resolvePremiumPriceId();
    if (!priceId) {
      req.log.error("Stripe price not found; run pnpm --filter @workspace/scripts run seed-stripe-products");
      res.status(500).json({ error: "Premium price not configured" });
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
      metadata: { userId: me },
      subscription_data: { metadata: { userId: me } },
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
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db
    .update(usersTable)
    .set({ verified: true, premiumUntil: periodEnd })
    .where(eq(usersTable.id, me));
  await db
    .insert(subscriptionsTable)
    .values({
      userId: me,
      plan: "premium",
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        plan: "premium",
        status: "active",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      },
    });
  res.json({
    verified: true,
    active: true,
    plan: "premium",
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
    provider: "dev",
  });
});

export default router;
