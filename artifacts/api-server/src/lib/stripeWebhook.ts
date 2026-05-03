import type { Request, Response } from "express";
import { db, usersTable, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripeSync, getUncachableStripeClient, getCachedWebhookSecret } from "./stripeClient";
import { logger } from "./logger";
import type Stripe from "stripe";

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.headers["stripe-signature"];
  if (!signature) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }
  const sig = Array.isArray(signature) ? signature[0] : signature;

  if (!Buffer.isBuffer(req.body)) {
    logger.error("Stripe webhook: req.body is not a Buffer (express.json ran first?)");
    res.status(500).json({ error: "Webhook configuration error" });
    return;
  }

  let sync;
  try {
    sync = await getStripeSync();
  } catch (err) {
    logger.error({ err }, "Stripe webhook: failed to init StripeSync");
    res.status(500).json({ error: "Stripe not configured" });
    return;
  }

  // Parse the event ourselves so we can react to it (sync.processWebhook returns void).
  let event: Stripe.Event | undefined;
  try {
    const stripe = await getUncachableStripeClient();
    const webhookSecret = await getCachedWebhookSecret();
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } else {
      event = JSON.parse((req.body as Buffer).toString("utf8")) as Stripe.Event;
    }
  } catch (err) {
    logger.warn({ err }, "Stripe webhook: failed to parse event (continuing with sync)");
  }

  try {
    await sync.processWebhook(req.body as Buffer, sig);
  } catch (err) {
    logger.error({ err }, "Stripe webhook: signature verification or sync failed");
    res.status(400).json({ error: "Webhook processing error" });
    return;
  }

  try {
    if (event && (event.type.startsWith("customer.subscription.") || event.type === "checkout.session.completed")) {
      await reflectSubscriptionFromEvent(event);
    }
  } catch (err) {
    logger.warn({ err, type: event?.type }, "Stripe webhook: failed to reflect subscription state");
  }

  res.status(200).json({ received: true });
}

async function reflectSubscriptionFromEvent(event: Stripe.Event): Promise<void> {
  const stripe = await getUncachableStripeClient();

  let subscription: Stripe.Subscription | null = null;
  let userId: string | undefined;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    userId = (session.metadata?.userId as string | undefined) ?? undefined;
    if (session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      subscription = await stripe.subscriptions.retrieve(subId);
    }
  } else {
    subscription = event.data.object as Stripe.Subscription;
    userId = (subscription.metadata?.userId as string | undefined) ?? undefined;
  }

  if (!subscription) return;

  // Resolve userId via stored stripeCustomerId if not in metadata.
  if (!userId) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const [u] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.stripeCustomerId, customerId))
      .limit(1);
    userId = u?.id;
  }
  if (!userId) {
    logger.warn({ subId: subscription.id }, "Stripe webhook: could not resolve userId for subscription");
    return;
  }

  const status = subscription.status;
  const isActive = status === "active" || status === "trialing";
  const periodEndSec = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndSec ? new Date(periodEndSec * 1000) : null;
  const cancelAtPeriodEnd = subscription.cancel_at_period_end ?? false;

  await db
    .insert(subscriptionsTable)
    .values({
      userId,
      plan: "premium",
      status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        plan: "premium",
        status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
        updatedAt: new Date(),
      },
    });

  await db
    .update(usersTable)
    .set({
      stripeSubscriptionId: subscription.id,
      premiumUntil: isActive ? periodEnd : null,
      verified: isActive ? true : false,
    })
    .where(eq(usersTable.id, userId));
}
