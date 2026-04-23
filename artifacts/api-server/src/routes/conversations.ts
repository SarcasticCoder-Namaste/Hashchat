import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  conversationReadsTable,
  messagesTable,
  reactionsTable,
  usersTable,
  userHashtagsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, or, sql, gt } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { OpenConversationBody, SendConversationMessageBody } from "@workspace/api-zod";

const router: IRouter = Router();

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function buildMessages(rows: { id: number; conversationId: number | null; roomTag: string | null; senderId: string; content: string; replyToId: number | null; createdAt: Date }[], myUserId: string) {
  if (rows.length === 0) return [];
  const senderIds = Array.from(new Set(rows.map((r) => r.senderId)));
  const senders = await db
    .select({ id: usersTable.id, displayName: usersTable.displayName, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
    .from(usersTable)
    .where(inArray(usersTable.id, senderIds));
  const senderMap = new Map(senders.map((s) => [s.id, s]));

  const replyIds = rows.map((r) => r.replyToId).filter((v): v is number => v !== null);
  const replyMap = new Map<number, string>();
  if (replyIds.length > 0) {
    const conversationIds = Array.from(new Set(rows.map((r) => r.conversationId).filter((v): v is number => v !== null)));
    const roomTags = Array.from(new Set(rows.map((r) => r.roomTag).filter((v): v is string => v !== null)));
    const scopeFilters = [];
    if (conversationIds.length > 0) scopeFilters.push(inArray(messagesTable.conversationId, conversationIds));
    if (roomTags.length > 0) scopeFilters.push(inArray(messagesTable.roomTag, roomTags));
    if (scopeFilters.length > 0) {
      const replies = await db
        .select({ id: messagesTable.id, content: messagesTable.content })
        .from(messagesTable)
        .where(and(inArray(messagesTable.id, replyIds), or(...scopeFilters)));
      for (const r of replies) replyMap.set(r.id, r.content);
    }
  }

  const messageIds = rows.map((r) => r.id);
  const allReactions = await db
    .select()
    .from(reactionsTable)
    .where(inArray(reactionsTable.messageId, messageIds));
  const reactionMap = new Map<number, { emoji: string; count: number; reactedByMe: boolean }[]>();
  for (const r of allReactions) {
    const list = reactionMap.get(r.messageId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.userId === myUserId) existing.reactedByMe = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, reactedByMe: r.userId === myUserId });
    }
    reactionMap.set(r.messageId, list);
  }

  return rows.map((r) => {
    const sender = senderMap.get(r.senderId);
    return {
      id: r.id,
      conversationId: r.conversationId,
      roomTag: r.roomTag,
      senderId: r.senderId,
      senderName: sender?.displayName ?? sender?.username ?? "Unknown",
      senderAvatarUrl: sender?.avatarUrl ?? null,
      content: r.content,
      replyToId: r.replyToId,
      replyToContent: r.replyToId ? (replyMap.get(r.replyToId) ?? null) : null,
      reactions: reactionMap.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
    };
  });
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

  const otherIds = convos.map((c) => (c.userAId === me ? c.userBId : c.userAId));
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

  const result: unknown[] = [];
  for (const c of convos) {
    const otherId = c.userAId === me ? c.userBId : c.userAId;
    const other = otherMap.get(otherId);
    if (!other) continue;
    const lastMessages = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, c.id))
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
        hashtags: tags,
        sharedHashtags: shared,
        matchScore: shared.length,
      },
      lastMessage: built[0] ?? null,
      unreadCount: unread?.count ?? 0,
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
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.createdAt)
    .limit(200);

  await db
    .insert(conversationReadsTable)
    .values({ conversationId: id, userId: me, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [conversationReadsTable.conversationId, conversationReadsTable.userId],
      set: { lastReadAt: new Date() },
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
  const replyToId = parsed.data.replyToId ?? null;
  if (replyToId !== null) {
    const [refMsg] = await db
      .select({ id: messagesTable.id, conversationId: messagesTable.conversationId })
      .from(messagesTable)
      .where(eq(messagesTable.id, replyToId))
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
      replyToId,
    })
    .returning();
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, id));
  const [built] = await buildMessages([created], me);
  res.status(201).json(built);
});

export default router;
