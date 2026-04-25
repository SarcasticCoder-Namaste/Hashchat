import { Router, type IRouter } from "express";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_PREMIUM;
}

function appOrigin(): string {
  return (
    process.env.PUBLIC_APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:5000")
  );
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
  const subActive = sub?.status === "active";
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
    provider: isStripeConfigured() ? "stripe" : "dev",
  });
});

router.post("/premium/checkout", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  if (!isStripeConfigured()) {
    // Dev mode: redirect back to the premium page with a confirm param
    const url = `${appOrigin()}/app/premium?dev_confirm=1`;
    res.json({ url, provider: "dev" });
    return;
  }
  // Real Stripe checkout. Lazy import to avoid hard dep if not installed.
  try {
    const stripeModule = (await import(/* @vite-ignore */ "stripe" as string)) as {
      default: new (key: string) => {
        customers: { create: (args: unknown) => Promise<{ id: string }> };
        checkout: {
          sessions: { create: (args: unknown) => Promise<{ url: string | null }> };
        };
      };
    };
    const Stripe = stripeModule.default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1);
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
      await db
        .update(usersTable)
        .set({ stripeCustomerId: customerId })
        .where(eq(usersTable.id, me));
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_PREMIUM!, quantity: 1 }],
      success_url: `${appOrigin()}/app/premium?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${appOrigin()}/app/premium?status=cancelled`,
      metadata: { userId: me },
    });
    res.json({ url: session.url ?? `${appOrigin()}/app/premium`, provider: "stripe" });
  } catch (err) {
    console.error("[premium] checkout error", err);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Dev-only: confirm subscription locally when Stripe isn't configured.
router.post("/premium/dev-confirm", requireAuth, async (req, res): Promise<void> => {
  if (isStripeConfigured()) {
    res.status(400).json({ error: "Stripe is configured; use the real checkout flow" });
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
