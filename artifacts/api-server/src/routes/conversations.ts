import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  conversationReadsTable,
  conversationTypingTable,
  conversationBackgroundsTable,
  messagesTable,
  usersTable,
  userHashtagsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, or, sql, gt } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { isValidStorageUrl } from "../lib/storageUrls";
import { loadBlockWall, isBlockedEitherWay } from "../lib/relationships";
import { isAllowedGifUrl } from "../lib/giphy";
import {
  buildMessages as sharedBuildMessages,
  maybeAttachLinkPreview,
  attachImage,
} from "../lib/buildMessages";
import {
  OpenConversationBody,
  SendConversationMessageBody,
  SetConversationBackgroundBody,
  MarkConversationReadBody,
} from "@workspace/api-zod";
import { resolveMentions, recordMentions } from "../lib/mentions";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function buildMessages(rows: { id: number; conversationId: number | null; roomTag: string | null; senderId: string; content: string; imageUrl: string | null; audioUrl: string | null; replyToId: number | null; createdAt: Date }[], myUserId: string) {
  return sharedBuildMessages(rows, myUserId);
}


router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const convos = await db
    .select()
    .from(conversationsTable)
    .where(or(eq(conversationsTable.userAId, me), eq(conversationsTable.userBId, me)))
    .orderBy(desc(conversationsTable.updatedAt));

  if (convos.length === 0) {
    res.json([]);
    return;
  }

  const blockWall = await loadBlockWall(me);
  const visibleConvos = convos.filter((c) => {
    const otherId = c.userAId === me ? c.userBId : c.userAId;
    return !blockWall.has(otherId);
  });
  if (visibleConvos.length === 0) {
    res.json([]);
    return;
  }
  const otherIds = visibleConvos.map((c) => (c.userAId === me ? c.userBId : c.userAId));
  const others = await db.select().from(usersTable).where(inArray(usersTable.id, otherIds));
  const otherMap = new Map(others.map((o) => [o.id, o]));
  const otherTagsRows = await db
    .select()
    .from(userHashtagsTable)
    .where(inArray(userHashtagsTable.userId, otherIds));
  const otherTags = new Map<string, string[]>();
  for (const r of otherTagsRows) {
    if (!otherTags.has(r.userId)) otherTags.set(r.userId, []);
    otherTags.get(r.userId)!.push(r.tag);
  }
  const myTagsRows = await db.select({ tag: userHashtagsTable.tag }).from(userHashtagsTable).where(eq(userHashtagsTable.userId, me));
  const myTagSet = new Set(myTagsRows.map((r) => r.tag));

  const reads = await db
    .select()
    .from(conversationReadsTable)
    .where(and(eq(conversationReadsTable.userId, me), inArray(conversationReadsTable.conversationId, convos.map((c) => c.id))));
  const readMap = new Map(reads.map((r) => [r.conversationId, r.lastReadAt]));

  const bgRows = await db
    .select()
    .from(conversationBackgroundsTable)
    .where(and(eq(conversationBackgroundsTable.userId, me), inArray(conversationBackgroundsTable.conversationId, convos.map((c) => c.id))));
  const bgMap = new Map(bgRows.map((r) => [r.conversationId, r.backgroundUrl]));

  const result: unknown[] = [];
  for (const c of visibleConvos) {
    const otherId = c.userAId === me ? c.userBId : c.userAId;
    const other = otherMap.get(otherId);
    if (!other) continue;
    const lastMessages = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.conversationId, c.id), sql`${messagesTable.deletedAt} IS NULL`))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);
    const built = await buildMessages(lastMessages, me);
    const lastReadAt = readMap.get(c.id) ?? new Date(0);
    const [unread] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, c.id),
          sql`${messagesTable.senderId} <> ${me}`,
          gt(messagesTable.createdAt, lastReadAt),
        ),
      );
    const tags = otherTags.get(otherId) ?? [];
    const shared = tags.filter((t) => myTagSet.has(t));
    result.push({
      id: c.id,
      otherUser: {
        id: other.id,
        username: other.username,
        displayName: other.displayName,
        bio: other.bio,
        avatarUrl: other.avatarUrl,
        status: other.status,
        featuredHashtag: other.featuredHashtag,
        discriminator: other.discriminator,
        role: other.role,
        mvpPlan: other.mvpPlan,
        verified: other.verified,
        lastSeenAt: other.lastSeenAt.toISOString(),
        hashtags: tags,
        sharedHashtags: shared,
        matchScore: shared.length,
      },
      lastMessage: built[0] ?? null,
      unreadCount: unread?.count ?? 0,
      backgroundUrl: bgMap.get(c.id) ?? c.backgroundUrl ?? null,
      updatedAt: c.updatedAt.toISOString(),
    });
  }
  res.json(result);
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = OpenConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  const otherId = parsed.data.userId;
  if (otherId === me) {
    res.status(400).json({ error: "Cannot open conversation with yourself" });
    return;
  }
  if (await isBlockedEitherWay(me, otherId)) {
    res.status(403).json({ error: "Blocked" });
    return;
  }
  const [a, b] = pair(me, otherId);
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.userAId, a), eq(conversationsTable.userBId, b)))
    .limit(1);
  let convoId: number;
  if (existing) {
    convoId = existing.id;
  } else {
    const [created] = await db
      .insert(conversationsTable)
      .values({ userAId: a, userBId: b })
      .returning();
    convoId = created.id;
  }

  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, convoId))
    .limit(1);
  const [other] = await db.select().from(usersTable).where(eq(usersTable.id, otherId)).limit(1);
  if (!other) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const otherTags = (await db.select({ tag: userHashtagsTable.tag }).from(userHashtagsTable).where(eq(userHashtagsTable.userId, otherId))).map((r) => r.tag);
  const myTags = (await db.select({ tag: userHashtagsTable.tag }).from(userHashtagsTable).where(eq(userHashtagsTable.userId, me))).map((r) => r.tag);
  const shared = otherTags.filter((t) => myTags.includes(t));
  res.json({
    id: convo.id,
    otherUser: {
      id: other.id,
      username: other.username,
      displayName: other.displayName,
      bio: other.bio,
      avatarUrl: other.avatarUrl,
      status: other.status,
      featuredHashtag: other.featuredHashtag,
      discriminator: other.discriminator,
      role: other.role,
      mvpPlan: other.mvpPlan,
      verified: other.verified,
      lastSeenAt: other.lastSeenAt.toISOString(),
      hashtags: otherTags,
      sharedHashtags: shared,
      matchScore: shared.length,
    },
    lastMessage: null,
    unreadCount: 0,
    updatedAt: convo.updatedAt.toISOString(),
  });
});

router.get("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);
  if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationId, id), sql`${messagesTable.deletedAt} IS NULL`))
    .orderBy(messagesTable.createdAt)
    .limit(200);

  const lastMsgId = rows.length > 0 ? rows[rows.length - 1].id : null;
  await db
    .insert(conversationReadsTable)
    .values({
      conversationId: id,
      userId: me,
      lastReadAt: new Date(),
      lastReadMessageId: lastMsgId,
    })
    .onConflictDoUpdate({
      target: [conversationReadsTable.conversationId, conversationReadsTable.userId],
      set: { lastReadAt: new Date(), lastReadMessageId: lastMsgId },
    });

  res.json(await buildMessages(rows, me));
});

router.post("/conversations/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = SendConversationMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);
  if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const otherId = convo.userAId === me ? convo.userBId : convo.userAId;
  if (await isBlockedEitherWay(me, otherId)) {
    res.status(403).json({ error: "Blocked" });
    return;
  }
  if (parsed.data.imageUrl != null && !isValidStorageUrl(parsed.data.imageUrl)) {
    res.status(400).json({ error: "imageUrl must reference an uploaded object" });
    return;
  }
  if (parsed.data.audioUrl != null && !isValidStorageUrl(parsed.data.audioUrl)) {
    res.status(400).json({ error: "audioUrl must reference an uploaded object" });
    return;
  }
  if (parsed.data.gifUrl != null && !isAllowedGifUrl(parsed.data.gifUrl)) {
    res.status(400).json({ error: "gifUrl must come from the configured GIF provider" });
    return;
  }
  const replyToId = parsed.data.replyToId ?? null;
  if (replyToId !== null) {
    // Validate target exists and isn't soft-deleted
    const [refMsg] = await db
      .select({ id: messagesTable.id, conversationId: messagesTable.conversationId })
      .from(messagesTable)
      .where(and(eq(messagesTable.id, replyToId), sql`${messagesTable.deletedAt} IS NULL`))
      .limit(1);
    if (!refMsg || refMsg.conversationId !== id) {
      res.status(400).json({ error: "Invalid replyToId" });
      return;
    }
  }
  const [created] = await db
    .insert(messagesTable)
    .values({
      conversationId: id,
      senderId: me,
      content: parsed.data.content,
      // gif URLs are mirrored into imageUrl so legacy clients still render
      // them; the kind="gif" attachment row preserves the distinction.
      imageUrl: parsed.data.imageUrl ?? parsed.data.gifUrl ?? null,
      audioUrl: parsed.data.audioUrl ?? null,
      replyToId,
    })
    .returning();
  if (parsed.data.imageUrl) {
    await attachImage(created.id, parsed.data.imageUrl, "image");
  }
  if (parsed.data.gifUrl) {
    await attachImage(created.id, parsed.data.gifUrl, "gif");
  }
  if (parsed.data.content) {
    // Detach: link preview fetch can take seconds; do not block send.
    void maybeAttachLinkPreview(created.id, parsed.data.content);
  }
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, id));

  // Clear my typing state for this convo
  await db
    .delete(conversationTypingTable)
    .where(
      and(
        eq(conversationTypingTable.conversationId, id),
        eq(conversationTypingTable.userId, me),
      ),
    );

  // Mention parsing + notifications
  const resolved = await resolveMentions(parsed.data.content);
  const recorded = await recordMentions({
    mentionerId: me,
    targetType: "message",
    targetId: created.id,
    resolved,
  });
  const mentionedSet = new Set(recorded.map((u) => u.id));
  for (const u of recorded) {
    if (u.id === otherId) continue;
    await createNotification({
      recipientId: u.id,
      actorId: me,
      kind: "mention",
      targetType: "conversation",
      targetId: id,
      snippet: parsed.data.content.slice(0, 200),
    });
  }

  // Reply notification (only if not me, and not the same as DM-counterparty getting the dm-notification anyway)
  if (replyToId !== null) {
    const [parent] = await db
      .select({ senderId: messagesTable.senderId })
      .from(messagesTable)
      .where(eq(messagesTable.id, replyToId))
      .limit(1);
    if (parent && parent.senderId !== me && !mentionedSet.has(parent.senderId)) {
      await createNotification({
        recipientId: parent.senderId,
        actorId: me,
        kind: "reply",
        targetType: "conversation",
        targetId: id,
        snippet: parsed.data.content.slice(0, 200),
      });
    }
  }

  const [built] = await buildMessages([created], me);
  res.status(201).json(built);
});

// Typing indicator endpoints
router.post(
  "/conversations/:id/typing",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .insert(conversationTypingTable)
      .values({ conversationId: id, userId: me, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          conversationTypingTable.conversationId,
          conversationTypingTable.userId,
        ],
        set: { updatedAt: new Date() },
      });
    res.status(204).end();
  },
);

router.get(
  "/conversations/:id/typing",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const cutoff = new Date(Date.now() - 4000);
    const rows = await db
      .select({
        id: conversationTypingTable.userId,
        displayName: usersTable.displayName,
      })
      .from(conversationTypingTable)
      .innerJoin(usersTable, eq(usersTable.id, conversationTypingTable.userId))
      .where(
        and(
          eq(conversationTypingTable.conversationId, id),
          gt(conversationTypingTable.updatedAt, cutoff),
          sql`${conversationTypingTable.userId} <> ${me}`,
        ),
      );
    res.json({ users: rows });
  },
);

router.post(
  "/conversations/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let messageId: number | null = null;
    if (req.body && Object.keys(req.body).length > 0) {
      const parsed = MarkConversationReadBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      messageId = parsed.data.messageId ?? null;
    }
    if (messageId === null) {
      const [latest] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, id),
            sql`${messagesTable.deletedAt} IS NULL`,
          ),
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);
      messageId = latest?.id ?? null;
    }
    await db
      .insert(conversationReadsTable)
      .values({
        conversationId: id,
        userId: me,
        lastReadAt: new Date(),
        lastReadMessageId: messageId,
      })
      .onConflictDoUpdate({
        target: [
          conversationReadsTable.conversationId,
          conversationReadsTable.userId,
        ],
        set: { lastReadAt: new Date(), lastReadMessageId: messageId },
      });
    res.status(204).end();
  },
);

router.patch("/conversations/:id/background", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = SetConversationBackgroundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isValidStorageUrl(parsed.data.backgroundUrl)) {
    res.status(400).json({ error: "backgroundUrl must reference an uploaded object" });
    return;
  }
  const me = getUserId(req);
  const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).limit(1);
  if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .insert(conversationBackgroundsTable)
    .values({ conversationId: id, userId: me, backgroundUrl: parsed.data.backgroundUrl })

    .onConflictDoUpdate({
      target: [conversationBackgroundsTable.conversationId, conversationBackgroundsTable.userId],
      set: { backgroundUrl: parsed.data.backgroundUrl, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

router.delete("/conversations/:id/background", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  await db
    .delete(conversationBackgroundsTable)
    .where(and(eq(conversationBackgroundsTable.conversationId, id), eq(conversationBackgroundsTable.userId, me)));
  res.status(204).end();
});

export default router;
