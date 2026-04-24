import { Router, type IRouter } from "express";
import {
  db,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  messagesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { isValidStorageUrl } from "../lib/storageUrls";
import { SendRoomMessageBody } from "@workspace/api-zod";
import { normalizeTag } from "../lib/hashtags";
import {
  buildMessages,
  maybeAttachLinkPreview,
  attachImage,
} from "../lib/buildMessages";

const router: IRouter = Router();

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
  if (parsed.data.imageUrl != null && !isValidStorageUrl(parsed.data.imageUrl)) {
    res.status(400).json({ error: "imageUrl must reference an uploaded object" });
    return;
  }
  if (parsed.data.audioUrl != null && !isValidStorageUrl(parsed.data.audioUrl)) {
    res.status(400).json({ error: "audioUrl must reference an uploaded object" });
    return;
  }
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
      imageUrl: parsed.data.imageUrl ?? null,
      audioUrl: parsed.data.audioUrl ?? null,
      replyToId,
    })
    .returning();
  if (parsed.data.imageUrl) {
    await attachImage(created.id, parsed.data.imageUrl, "image");
  }
  if (parsed.data.content) {
    // Detach: link preview fetch can take seconds; do not block send.
    void maybeAttachLinkPreview(created.id, parsed.data.content);
  }
  const [built] = await buildMessages([created], getUserId(req));
  res.status(201).json(built);
});

export default router;
