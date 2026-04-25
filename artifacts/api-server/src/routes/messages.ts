import { Router, type IRouter } from "express";
import { db, reactionsTable, messagesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { AddMessageReactionBody } from "@workspace/api-zod";
import { buildMessages } from "../lib/buildMessages";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

router.post(
  "/messages/:id/reactions",
  requireAuth,
  async (req, res): Promise<void> => {
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
    const me = getUserId(req);
    const [exists] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .insert(reactionsTable)
      .values({ messageId: id, userId: me, emoji: parsed.data.emoji })
      .onConflictDoNothing();
    if (exists.senderId !== me) {
      const targetTextId = exists.roomTag
        ? `room:${exists.roomTag}`
        : exists.conversationId
          ? `conv:${exists.conversationId}`
          : null;
      await createNotification({
        recipientId: exists.senderId,
        actorId: me,
        kind: "reaction",
        targetType: "message",
        targetId: id,
        targetTextId,
        snippet: `${parsed.data.emoji} ${exists.content.slice(0, 80)}`,
      });
    }
    res.status(204).end();
  },
);

router.delete(
  "/messages/:id/reactions",
  requireAuth,
  async (req, res): Promise<void> => {
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
  },
);

router.get(
  "/messages/:id/replies",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [parent] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);
    if (!parent || parent.deletedAt) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const replyRows = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.replyToId, id),
          // deletedAt is null
          // drizzle: use sql for null check
        ),
      )
      .orderBy(asc(messagesTable.createdAt));
    const visibleReplies = replyRows.filter((r) => r.deletedAt === null);
    const built = await buildMessages([parent, ...visibleReplies], me);
    const builtParent = built[0];
    const builtReplies = built.slice(1);
    res.json({ parent: builtParent, replies: builtReplies });
  },
);

export default router;
