import { Router, type IRouter } from "express";
import {
  db,
  scheduledMessagesTable,
  conversationMembersTable,
  messagesTable,
} from "@workspace/db";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import {
  ScheduleConversationMessageBody,
  RescheduleScheduledMessageBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

const MAX_PER_USER = 100;

type Row = typeof scheduledMessagesTable.$inferSelect;

function serialize(r: Row) {
  return {
    id: r.id,
    senderId: r.senderId,
    conversationId: r.conversationId,
    content: r.content,
    replyToId: r.replyToId,
    imageUrl: r.imageUrl,
    imageAlt: r.imageAlt,
    status: r.status as "scheduled" | "sent" | "cancelled" | "failed",
    scheduledFor: r.scheduledFor.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

router.get(
  "/me/scheduled-messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const rows = await db
      .select()
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.senderId, me),
          inArray(scheduledMessagesTable.status, ["scheduled", "failed"]),
        ),
      )
      .orderBy(asc(scheduledMessagesTable.scheduledFor))
      .limit(200);
    res.json(rows.map(serialize));
  },
);

router.delete(
  "/me/scheduled-messages/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const result = await db
      .delete(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.id, id),
          eq(scheduledMessagesTable.senderId, me),
          inArray(scheduledMessagesTable.status, ["scheduled", "failed"]),
        ),
      )
      .returning({ id: scheduledMessagesTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  },
);

router.post(
  "/me/scheduled-messages/:id/reschedule",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = RescheduleScheduledMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);

    const [existing] = await db
      .select()
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.id, id),
          eq(scheduledMessagesTable.senderId, me),
          eq(scheduledMessagesTable.status, "failed"),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [member] = await db
      .select()
      .from(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, existing.conversationId),
          eq(conversationMembersTable.userId, me),
        ),
      )
      .limit(1);
    if (!member) {
      res
        .status(400)
        .json({ error: "You are no longer a member of this conversation" });
      return;
    }

    const when = new Date(parsed.data.scheduledFor);
    if (Number.isNaN(when.getTime())) {
      res.status(400).json({ error: "Invalid scheduledFor" });
      return;
    }
    if (when.getTime() <= Date.now() + 5_000) {
      res.status(400).json({ error: "scheduledFor must be in the future" });
      return;
    }
    if (when.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ error: "scheduledFor too far in the future" });
      return;
    }

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.senderId, me),
          eq(scheduledMessagesTable.status, "scheduled"),
        ),
      );
    if ((countRows[0]?.count ?? 0) >= MAX_PER_USER) {
      res
        .status(400)
        .json({ error: `Limit of ${MAX_PER_USER} scheduled DMs reached` });
      return;
    }

    const [updated] = await db
      .update(scheduledMessagesTable)
      .set({ status: "scheduled", scheduledFor: when })
      .where(eq(scheduledMessagesTable.id, id))
      .returning();
    res.json(serialize(updated));
  },
);

router.post(
  "/conversations/:id/scheduled-messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const conversationId = parseInt(raw, 10);
    if (Number.isNaN(conversationId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ScheduleConversationMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);

    const [member] = await db
      .select()
      .from(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, conversationId),
          eq(conversationMembersTable.userId, me),
        ),
      )
      .limit(1);
    if (!member) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const when = new Date(parsed.data.scheduledFor);
    if (Number.isNaN(when.getTime())) {
      res.status(400).json({ error: "Invalid scheduledFor" });
      return;
    }
    if (when.getTime() <= Date.now() + 5_000) {
      res.status(400).json({ error: "scheduledFor must be in the future" });
      return;
    }
    if (when.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
      res.status(400).json({ error: "scheduledFor too far in the future" });
      return;
    }

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.senderId, me),
          eq(scheduledMessagesTable.status, "scheduled"),
        ),
      );
    if ((countRows[0]?.count ?? 0) >= MAX_PER_USER) {
      res
        .status(400)
        .json({ error: `Limit of ${MAX_PER_USER} scheduled DMs reached` });
      return;
    }

    const content = parsed.data.content.trim();
    if (!content && !parsed.data.imageUrl) {
      res.status(400).json({ error: "content or imageUrl required" });
      return;
    }

    const [created] = await db
      .insert(scheduledMessagesTable)
      .values({
        senderId: me,
        conversationId,
        content,
        replyToId: parsed.data.replyToId ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        imageAlt: parsed.data.imageAlt ?? null,
        scheduledFor: when,
        status: "scheduled",
      })
      .returning();
    res.status(201).json(serialize(created));
  },
);

export async function publishDueScheduledMessages(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(scheduledMessagesTable)
    .where(
      and(
        eq(scheduledMessagesTable.status, "scheduled"),
        lt(scheduledMessagesTable.scheduledFor, now),
      ),
    )
    .limit(50);
  if (due.length === 0) return 0;

  let published = 0;
  for (const sm of due) {
    try {
      // Verify the sender is still a member of the conversation.
      const [member] = await db
        .select()
        .from(conversationMembersTable)
        .where(
          and(
            eq(conversationMembersTable.conversationId, sm.conversationId),
            eq(conversationMembersTable.userId, sm.senderId),
          ),
        )
        .limit(1);
      if (!member) {
        await db
          .update(scheduledMessagesTable)
          .set({ status: "failed" })
          .where(eq(scheduledMessagesTable.id, sm.id));
        await createNotification({
          recipientId: sm.senderId,
          actorId: null,
          kind: "scheduled_dm_failed",
          targetType: "conversation",
          targetId: sm.conversationId,
          snippet: sm.content.slice(0, 200),
        });
        continue;
      }

      await db.insert(messagesTable).values({
        conversationId: sm.conversationId,
        senderId: sm.senderId,
        content: sm.content,
        replyToId: sm.replyToId,
        imageUrl: sm.imageUrl,
        imageAlt: sm.imageAlt,
        scheduledFor: sm.scheduledFor,
      });
      await db
        .update(scheduledMessagesTable)
        .set({ status: "sent" })
        .where(eq(scheduledMessagesTable.id, sm.id));
      published++;
      await createNotification({
        recipientId: sm.senderId,
        actorId: null,
        kind: "scheduled_dm_delivered",
        targetType: "conversation",
        targetId: sm.conversationId,
        snippet: sm.content.slice(0, 200),
      });
    } catch (err) {
      logger.warn({ err, scheduledMessageId: sm.id }, "scheduled DM publish failed");
      await db
        .update(scheduledMessagesTable)
        .set({ status: "failed" })
        .where(eq(scheduledMessagesTable.id, sm.id));
      await createNotification({
        recipientId: sm.senderId,
        actorId: null,
        kind: "scheduled_dm_failed",
        targetType: "conversation",
        targetId: sm.conversationId,
        snippet: sm.content.slice(0, 200),
      }).catch(() => {});
    }
  }
  return published;
}

export default router;
