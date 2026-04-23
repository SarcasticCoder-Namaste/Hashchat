import { Router, type IRouter } from "express";
import {
  db,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  messagesTable,
  usersTable,
  reactionsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { SendRoomMessageBody } from "@workspace/api-zod";
import { normalizeTag } from "../lib/hashtags";

const router: IRouter = Router();

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
        .where(
          and(
            inArray(messagesTable.id, replyIds),
            or(...scopeFilters),
            sql`${messagesTable.deletedAt} IS NULL`,
          ),
        );
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

async function roomDataFor(tags: string[], myUserId: string, followedSet: Set<string>) {
  if (tags.length === 0) return [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const memberCounts = await db
    .select({ tag: userHashtagsTable.tag, count: sql<number>`count(*)::int` })
    .from(userHashtagsTable)
    .where(inArray(userHashtagsTable.tag, tags))
    .groupBy(userHashtagsTable.tag);
  const followerCounts = await db
    .select({ tag: userFollowedHashtagsTable.tag, count: sql<number>`count(*)::int` })
    .from(userFollowedHashtagsTable)
    .where(inArray(userFollowedHashtagsTable.tag, tags))
    .groupBy(userFollowedHashtagsTable.tag);
  const messageCounts = await db
    .select({ tag: messagesTable.roomTag, count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(inArray(messagesTable.roomTag, tags))
    .groupBy(messagesTable.roomTag);
  const recentCounts = await db
    .select({ tag: messagesTable.roomTag, count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(inArray(messagesTable.roomTag, tags), sql`${messagesTable.createdAt} >= ${since}`))
    .groupBy(messagesTable.roomTag);

  const memberMap = new Map(memberCounts.map((r) => [r.tag, r.count]));
  const followerMap = new Map(followerCounts.map((r) => [r.tag, r.count]));
  const messageMap = new Map(messageCounts.filter((r) => r.tag).map((r) => [r.tag!, r.count]));
  const recentMap = new Map(recentCounts.filter((r) => r.tag).map((r) => [r.tag!, r.count]));

  const result = [];
  for (const tag of tags) {
    const lastRows = await db
      .select()
      .from(messagesTable)
      .where(and(eq(messagesTable.roomTag, tag), sql`${messagesTable.deletedAt} IS NULL`))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);
    const built = await buildMessages(lastRows, myUserId);
    result.push({
      tag,
      memberCount: memberMap.get(tag) ?? 0,
      messageCount: messageMap.get(tag) ?? 0,
      followerCount: followerMap.get(tag) ?? 0,
      recentMessages: recentMap.get(tag) ?? 0,
      lastMessage: built[0] ?? null,
      isFollowed: followedSet.has(tag),
    });
  }
  return result;
}

router.get("/rooms", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const followed = await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.userId, me));
  const interested = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, me));
  const tags = Array.from(new Set([...followed.map((r) => r.tag), ...interested.map((r) => r.tag)]));
  const followedSet = new Set(followed.map((r) => r.tag));
  const rooms = await roomDataFor(tags, me, followedSet);
  rooms.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
  res.json(rooms);
});

router.get("/rooms/trending", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 50);
  const me = getUserId(req);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db
    .select({ tag: messagesTable.roomTag, count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(sql`${messagesTable.roomTag} IS NOT NULL`, sql`${messagesTable.createdAt} >= ${since}`))
    .groupBy(messagesTable.roomTag)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 2);
  let tags = recent.map((r) => r.tag).filter((t): t is string => !!t);
  if (tags.length < limit) {
    const fallback = await db
      .select({ tag: userHashtagsTable.tag, count: sql<number>`count(*)::int` })
      .from(userHashtagsTable)
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    for (const f of fallback) {
      if (!tags.includes(f.tag)) tags.push(f.tag);
    }
  }
  tags = tags.slice(0, limit);
  const followed = await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.userId, me));
  const followedSet = new Set(followed.map((r) => r.tag));
  res.json(await roomDataFor(tags, me, followedSet));
});

router.get("/rooms/:tag/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  const rows = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.roomTag, tag), sql`${messagesTable.deletedAt} IS NULL`))
    .orderBy(messagesTable.createdAt)
    .limit(200);
  res.json(await buildMessages(rows, getUserId(req)));
});

router.post("/rooms/:tag/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const parsed = SendRoomMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  const replyToId = parsed.data.replyToId ?? null;
  if (replyToId !== null) {
    const [refMsg] = await db
      .select({ id: messagesTable.id, roomTag: messagesTable.roomTag })
      .from(messagesTable)
      .where(and(eq(messagesTable.id, replyToId), sql`${messagesTable.deletedAt} IS NULL`))
      .limit(1);
    if (!refMsg || refMsg.roomTag !== tag) {
      res.status(400).json({ error: "Invalid replyToId" });
      return;
    }
  }
  const [created] = await db
    .insert(messagesTable)
    .values({
      roomTag: tag,
      senderId: getUserId(req),
      content: parsed.data.content,
      replyToId,
    })
    .returning();
  const [built] = await buildMessages([created], getUserId(req));
  res.status(201).json(built);
});

export default router;
