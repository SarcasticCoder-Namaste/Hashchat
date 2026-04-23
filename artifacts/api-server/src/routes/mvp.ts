import { Router, type IRouter } from "express";
import { db, mvpCodesTable, usersTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/me/redeem-mvp-code", requireAuth, async (req, res): Promise<void> => {
  const code = String((req.body as { code?: unknown })?.code ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    res.status(400).json({ error: "Code required" });
    return;
  }
  const me = getUserId(req);
  const [existing] = await db.select().from(mvpCodesTable).where(eq(mvpCodesTable.code, code)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Invalid code" });
    return;
  }
  if (existing.redeemedBy) {
    res.status(409).json({ error: "Code already redeemed" });
    return;
  }
  const result = await db
    .update(mvpCodesTable)
    .set({ redeemedBy: me, redeemedAt: new Date() })
    .where(and(eq(mvpCodesTable.code, code), isNull(mvpCodesTable.redeemedBy)))
    .returning();
  if (result.length === 0) {
    res.status(409).json({ error: "Code already redeemed" });
    return;
  }
  await db.update(usersTable).set({ mvpPlan: true }).where(eq(usersTable.id, me));
  res.json({ ok: true });
});

export default router;
