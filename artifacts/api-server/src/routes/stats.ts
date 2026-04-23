import { Router, type IRouter } from "express";
import { db, usersTable, hashtagsTable, messagesTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/stats/overview", async (_req, res): Promise<void> => {
  const [u] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable);
  const [h] = await db.select({ count: sql<number>`count(*)::int` }).from(hashtagsTable);
  const [m] = await db.select({ count: sql<number>`count(*)::int` }).from(messagesTable);
  const [r] = await db
    .select({ count: sql<number>`count(distinct ${messagesTable.roomTag})::int` })
    .from(messagesTable)
    .where(sql`${messagesTable.roomTag} IS NOT NULL`);
  res.json({
    userCount: u?.count ?? 0,
    hashtagCount: h?.count ?? 0,
    messageCount: m?.count ?? 0,
    roomCount: r?.count ?? 0,
  });
});

export default router;
