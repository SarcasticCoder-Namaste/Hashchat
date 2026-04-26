import { Router, type IRouter } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/push/vapid-public-key", async (_req, res): Promise<void> => {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? null;
  res.json({ publicKey, configured: !!publicKey });
});

router.post(
  "/push/subscribe",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const { endpoint, keys, userAgent } = (req.body ?? {}) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string | null;
    };
    if (
      typeof endpoint !== "string" ||
      !endpoint ||
      typeof keys?.p256dh !== "string" ||
      typeof keys?.auth !== "string"
    ) {
      res.status(400).json({ error: "Invalid subscription payload" });
      return;
    }

    const [existing] = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.endpoint, endpoint))
      .limit(1);

    if (existing) {
      // Re-attach to current user / refresh keys
      await db
        .update(pushSubscriptionsTable)
        .set({
          userId: me,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent ?? existing.userAgent,
        })
        .where(eq(pushSubscriptionsTable.id, existing.id));
    } else {
      await db.insert(pushSubscriptionsTable).values({
        userId: me,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      });
    }
    res.json({ ok: true });
  },
);

router.post(
  "/push/unsubscribe",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const { endpoint } = (req.body ?? {}) as { endpoint?: string };
    if (typeof endpoint !== "string" || !endpoint) {
      res.status(400).json({ error: "endpoint required" });
      return;
    }
    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.endpoint, endpoint),
          eq(pushSubscriptionsTable.userId, me),
        ),
      );
    res.status(204).end();
  },
);

export default router;
