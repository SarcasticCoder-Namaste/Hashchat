import { runMigrations } from "stripe-replit-sync";
import { getStripeSync, isStripeConnected } from "./stripeClient";
import { logger } from "./logger";

let started = false;

export async function initStripe(): Promise<void> {
  if (started) return;
  started = true;

  if (!isStripeConnected()) {
    logger.warn("Stripe integration not connected; skipping init.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL missing; skipping Stripe init.");
    return;
  }

  try {
    logger.info("Stripe: running schema migrations");
    await runMigrations({ databaseUrl });

    const sync = await getStripeSync();

    const domain = process.env.PUBLIC_APP_URL?.replace(/^https?:\/\//, "") ?? process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      try {
        const endpoint = await sync.findOrCreateManagedWebhook(webhookUrl);
        logger.info({ webhook: endpoint?.url ?? webhookUrl }, "Stripe: managed webhook ready");
      } catch (err) {
        logger.warn({ err }, "Stripe: could not configure managed webhook (continuing)");
      }
    } else {
      logger.warn("Stripe: no public domain available; skipping managed webhook setup");
    }

    sync
      .syncBackfill()
      .then(() => logger.info("Stripe: backfill complete"))
      .catch((err) => logger.warn({ err }, "Stripe: backfill failed"));
  } catch (err) {
    logger.error({ err }, "Stripe: init failed");
  }
}
