import { Router, type IRouter } from "express";
import { db, reactionsTable, messagesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { AddMessageReactionBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/messages/:id/reactions", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = AddMessageReactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [exists] = await db.select().from(messagesTable).where(eq(messagesTable.id, id)).limit(1);
  if (!exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .insert(reactionsTable)
    .values({ messageId: id, userId: getUserId(req), emoji: parsed.data.emoji })
    .onConflictDoNothing();
  res.status(204).end();
});

router.delete("/messages/:id/reactions", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const emoji = String(req.query.emoji ?? "");
  if (Number.isNaN(id) || !emoji) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  await db
    .delete(reactionsTable)
    .where(
      and(
        eq(reactionsTable.messageId, id),
        eq(reactionsTable.userId, getUserId(req)),
        eq(reactionsTable.emoji, emoji),
      ),
    );
  res.status(204).end();
});

export default router;
