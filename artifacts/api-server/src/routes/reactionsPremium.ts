import { Router, type IRouter } from "express";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { PREMIUM_REACTIONS } from "../lib/premiumReactions";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get(
  "/reactions/premium",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const [u] = await db
      .select({ mvpPlan: usersTable.mvpPlan, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1);
    res.json({
      emojis: PREMIUM_REACTIONS,
      canUse: !!u?.mvpPlan || u?.role === "admin",
    });
  },
);

export default router;
