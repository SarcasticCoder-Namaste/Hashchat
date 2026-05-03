import { Router, type IRouter } from "express";
import {
  db,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  messagesTable,
  roomVisibilityTable,
  roomMembersTable,
  roomInvitesTable,
  roomJoinRequestsTable,
  roomTypingTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { isValidStorageUrl } from "../lib/storageUrls";
import { serializeWaveform } from "../lib/waveform";
import { transcribeMessageAudio } from "../lib/transcribeAudio";
import { isAllowedGifUrl } from "../lib/giphy";
import { SendRoomMessageBody } from "@workspace/api-zod";
import { normalizeTag } from "../lib/hashtags";
import { resolveMentions, recordMentions } from "../lib/mentions";
import { createNotification } from "../lib/notifications";
import {
  buildMessages,
  maybeAttachLinkPreview,
  attachImage,
} from "../lib/buildMessages";
import {
  loadBlockWall,
  loadMyMutes,
  loadMutedHashtags,
} from "../lib/relationships";
import {
  getRoomAccess,
  loadPrivateTags,
  loadMyRoomMemberships,
} from "../lib/roomVisibility";

const router: IRouter = Router();

async function roomDataFor(
  tags: string[],
  myUserId: string,
  followedSet: Set<string>,
  hidden: Set<string>,
) {
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

  const privateTags = await loadPrivateTags(tags);
  const myMemberTags = await loadMyRoomMemberships(myUserId, Array.from(privateTags));

  const result = [];
  for (const tag of tags) {
    const isPrivate = privateTags.has(tag);
    const isMember = !isPrivate || myMemberTags.has(tag);
    const lastRows =
      isPrivate && !isMember
        ? []
        : await db
            .select()
            .from(messagesTable)
            .where(and(eq(messagesTable.roomTag, tag), sql`${messagesTable.deletedAt} IS NULL`))
            .orderBy(desc(messagesTable.createdAt))
            .limit(10);
    const filteredRows = hidden.size > 0 ? lastRows.filter((r) => !hidden.has(r.senderId)) : lastRows;
    const built = await buildMessages(filteredRows, myUserId);
    result.push({
      tag,
      memberCount: memberMap.get(tag) ?? 0,
      messageCount: messageMap.get(tag) ?? 0,
      followerCount: followerMap.get(tag) ?? 0,
      recentMessages: recentMap.get(tag) ?? 0,
      lastMessage: built[0] ?? null,
      isFollowed: followedSet.has(tag),
      isPrivate,
      isMember,
    });
  }
  return result;
}

router.get("/rooms", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const [followed, interested, blockWall, mutes, mutedTags] = await Promise.all([
    db
      .select({ tag: userFollowedHashtagsTable.tag })
      .from(userFollowedHashtagsTable)
      .where(eq(userFollowedHashtagsTable.userId, me)),
    db
      .select({ tag: userHashtagsTable.tag })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.userId, me)),
    loadBlockWall(me),
    loadMyMutes(me),
    loadMutedHashtags(me),
  ]);
  // Also include rooms I'm a private member of
  const privMember = await db
    .select({ tag: roomMembersTable.tag })
    .from(roomMembersTable)
    .where(eq(roomMembersTable.userId, me));
  const tags = Array.from(
    new Set([
      ...followed.map((r) => r.tag),
      ...interested.map((r) => r.tag),
      ...privMember.map((r) => r.tag),
    ]),
  ).filter((t) => !mutedTags.has(t));
  const followedSet = new Set(followed.map((r) => r.tag));
  const hidden = new Set<string>([...blockWall, ...mutes]);
  const rooms = await roomDataFor(tags, me, followedSet, hidden);
  rooms.sort((a, b) => (b.lastMessage?.createdAt ?? "").localeCompare(a.lastMessage?.createdAt ?? ""));
  res.json(rooms);
});

router.get("/rooms/trending", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 50);
  const me = getUserId(req);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [blockWall, mutes, mutedTags] = await Promise.all([
    loadBlockWall(me),
    loadMyMutes(me),
    loadMutedHashtags(me),
  ]);
  const recent = await db
    .select({ tag: messagesTable.roomTag, count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(sql`${messagesTable.roomTag} IS NOT NULL`, sql`${messagesTable.createdAt} >= ${since}`))
    .groupBy(messagesTable.roomTag)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 4);
  let candidate = recent.map((r) => r.tag).filter((t): t is string => !!t && !mutedTags.has(t));
  if (candidate.length < limit) {
    const fallback = await db
      .select({ tag: userHashtagsTable.tag, count: sql<number>`count(*)::int` })
      .from(userHashtagsTable)
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(limit * 2);
    for (const f of fallback) {
      if (mutedTags.has(f.tag)) continue;
      if (!candidate.includes(f.tag)) candidate.push(f.tag);
    }
  }
  // Filter out private rooms from trending
  const privTrending = await loadPrivateTags(candidate);
  const tags = candidate.filter((t) => !privTrending.has(t)).slice(0, limit);
  const followed = await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.userId, me));
  const followedSet = new Set(followed.map((r) => r.tag));
  const hidden = new Set<string>([...blockWall, ...mutes]);
  res.json(await roomDataFor(tags, me, followedSet, hidden));
});

router.get("/rooms/:tag/messages", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (access.isPrivate && !access.isMember) {
    res.status(403).json({ error: "This is a private room. You need an invite to view messages." });
    return;
  }
  const [blockWall, mutes] = await Promise.all([
    loadBlockWall(me),
    loadMyMutes(me),
  ]);
  const hidden = new Set<string>([...blockWall, ...mutes]);
  const rows = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.roomTag, tag), sql`${messagesTable.deletedAt} IS NULL`))
    .orderBy(messagesTable.createdAt)
    .limit(200);
  const filtered = hidden.size > 0 ? rows.filter((r) => !hidden.has(r.senderId)) : rows;
  res.json(await buildMessages(filtered, me));
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
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (access.isPrivate && !access.isMember) {
    res.status(403).json({ error: "This is a private room. You need an invite to post." });
    return;
  }
  const replyToId = parsed.data.replyToId ?? null;
  if (parsed.data.imageUrl != null && !isValidStorageUrl(parsed.data.imageUrl)) {
    res.status(400).json({ error: "imageUrl must reference an uploaded object" });
    return;
  }
  if (parsed.data.audioUrl != null && !isValidStorageUrl(parsed.data.audioUrl)) {
    res.status(400).json({ error: "audioUrl must reference an uploaded object" });
    return;
  }
  if (parsed.data.audioWaveform != null && parsed.data.audioUrl == null) {
    res.status(400).json({ error: "audioWaveform requires audioUrl" });
    return;
  }
  const waveformJson = serializeWaveform(parsed.data.audioWaveform ?? null);
  if (parsed.data.gifUrl != null && !isAllowedGifUrl(parsed.data.gifUrl)) {
    res.status(400).json({ error: "gifUrl must come from the configured GIF provider" });
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
      senderId: me,
      content: parsed.data.content,
      // gif URLs are mirrored into imageUrl so legacy clients still render
      // them; the kind="gif" attachment row preserves the distinction.
      imageUrl: parsed.data.imageUrl ?? parsed.data.gifUrl ?? null,
      audioUrl: parsed.data.audioUrl ?? null,
      audioWaveform: waveformJson,
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
    void maybeAttachLinkPreview(created.id, parsed.data.content);
  }
  if (parsed.data.audioUrl) {
    transcribeMessageAudio(created.id, parsed.data.audioUrl);
  }

  const resolved = await resolveMentions(parsed.data.content);
  const recorded = await recordMentions({
    mentionerId: me,
    targetType: "message",
    targetId: created.id,
    resolved,
  });
  const mentionedSet = new Set(recorded.map((u) => u.id));
  for (const u of recorded) {
    await createNotification({
      recipientId: u.id,
      actorId: me,
      kind: "mention",
      targetType: "message",
      targetId: created.id,
      targetTextId: `room:${tag}`,
      snippet: parsed.data.content.slice(0, 200),
    });
  }

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
        targetType: "message",
        targetId: created.id,
        targetTextId: `room:${tag}`,
        snippet: parsed.data.content.slice(0, 200),
      });
    }
  }

  // Clear my typing state for this room
  await db
    .delete(roomTypingTable)
    .where(and(eq(roomTypingTable.tag, tag), eq(roomTypingTable.userId, me)));

  const [built] = await buildMessages([created], me);
  res.status(201).json(built);
});

// ---------- Typing indicator ----------

router.post("/rooms/:tag/typing", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (access.isPrivate && !access.isMember) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  await db
    .insert(roomTypingTable)
    .values({ tag, userId: me, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [roomTypingTable.tag, roomTypingTable.userId],
      set: { updatedAt: new Date() },
    });
  res.status(204).end();
});

router.get("/rooms/:tag/typing", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (access.isPrivate && !access.isMember) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  const cutoff = new Date(Date.now() - 4000);
  const rows = await db
    .select({
      id: roomTypingTable.userId,
      displayName: usersTable.displayName,
    })
    .from(roomTypingTable)
    .innerJoin(usersTable, eq(usersTable.id, roomTypingTable.userId))
    .where(
      and(
        eq(roomTypingTable.tag, tag),
        gt(roomTypingTable.updatedAt, cutoff),
        sql`${roomTypingTable.userId} <> ${me}`,
      ),
    );
  res.json({ users: rows });
});

// ---------- Visibility (private rooms) ----------

async function isUserPremium(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ verified: usersTable.verified, premiumUntil: usersTable.premiumUntil })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return false;
  if (u.premiumUntil && u.premiumUntil > new Date()) return true;
  return u.verified;
}

router.get("/rooms/:tag/visibility", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  res.json({
    tag,
    isPrivate: access.isPrivate,
    ownerId: access.ownerId,
    canManage: access.canManage,
    isMember: access.isMember,
  });
});

router.put("/rooms/:tag/visibility", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const isPrivate = !!(req.body as { isPrivate?: boolean })?.isPrivate;
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  const [existing] = await db
    .select()
    .from(roomVisibilityTable)
    .where(eq(roomVisibilityTable.tag, tag))
    .limit(1);
  if (existing) {
    if (existing.ownerId !== me) {
      res.status(403).json({ error: "Only the room owner can change visibility" });
      return;
    }
    if (isPrivate && !existing.isPrivate) {
      // upgrading to private — check premium limit
      const isPremium = await isUserPremium(me);
      if (!isPremium) {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(roomVisibilityTable)
          .where(and(eq(roomVisibilityTable.ownerId, me), eq(roomVisibilityTable.isPrivate, true)));
        if ((count ?? 0) >= 1) {
          res
            .status(402)
            .json({ error: "Free tier supports 1 private room. Upgrade to Premium for unlimited." });
          return;
        }
      }
    }
    await db
      .update(roomVisibilityTable)
      .set({ isPrivate, updatedAt: new Date() })
      .where(eq(roomVisibilityTable.tag, tag));
  } else {
    if (isPrivate) {
      const isPremium = await isUserPremium(me);
      if (!isPremium) {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(roomVisibilityTable)
          .where(and(eq(roomVisibilityTable.ownerId, me), eq(roomVisibilityTable.isPrivate, true)));
        if ((count ?? 0) >= 1) {
          res
            .status(402)
            .json({ error: "Free tier supports 1 private room. Upgrade to Premium for unlimited." });
          return;
        }
      }
    }
    await db.insert(roomVisibilityTable).values({ tag, ownerId: me, isPrivate });
    // owner is automatically a member
    await db
      .insert(roomMembersTable)
      .values({ tag, userId: me })
      .onConflictDoNothing();
  }
  const access = await getRoomAccess(tag, me);
  res.json({
    tag,
    isPrivate: access.isPrivate,
    ownerId: access.ownerId,
    canManage: access.canManage,
    isMember: access.isMember,
  });
});

// ---------- Invites ----------

function generateInviteCode(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(
    { length: 12 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

router.get("/rooms/:tag/invites", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (!access.canManage && !access.isMember) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  const invites = await db
    .select()
    .from(roomInvitesTable)
    .where(eq(roomInvitesTable.tag, tag))
    .orderBy(desc(roomInvitesTable.createdAt));
  const origin =
    process.env.PUBLIC_APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  res.json(
    invites.map((i) => ({
      code: i.code,
      tag: i.tag,
      url: `${origin}/app/r/invite/${i.code}`,
      createdBy: i.createdBy,
      maxUses: i.maxUses,
      useCount: i.useCount,
      expiresAt: i.expiresAt ? i.expiresAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
    })),
  );
});

router.post("/rooms/:tag/invites", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (!access.isMember && !access.canManage) {
    res.status(403).json({ error: "Not a member" });
    return;
  }
  const body = (req.body ?? {}) as { maxUses?: number | null; expiresInHours?: number | null };
  const maxUses =
    typeof body.maxUses === "number" && body.maxUses > 0 ? Math.floor(body.maxUses) : null;
  const expiresAt =
    typeof body.expiresInHours === "number" && body.expiresInHours > 0
      ? new Date(Date.now() + Math.floor(body.expiresInHours) * 60 * 60 * 1000)
      : null;

  let code = generateInviteCode();
  for (let i = 0; i < 5; i++) {
    const [exists] = await db
      .select({ code: roomInvitesTable.code })
      .from(roomInvitesTable)
      .where(eq(roomInvitesTable.code, code))
      .limit(1);
    if (!exists) break;
    code = generateInviteCode();
  }
  await db.insert(roomInvitesTable).values({
    code,
    tag,
    createdBy: me,
    maxUses,
    expiresAt,
  });
  const origin =
    process.env.PUBLIC_APP_URL ??
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  res.status(201).json({
    code,
    tag,
    url: `${origin}/app/r/invite/${code}`,
    createdBy: me,
    maxUses,
    useCount: 0,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    createdAt: new Date().toISOString(),
  });
});

router.get("/rooms/invites/:code", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const code = String(raw).trim();
  const [invite] = await db
    .select()
    .from(roomInvitesTable)
    .where(eq(roomInvitesTable.code, code))
    .limit(1);
  if (!invite) {
    res.status(404).json({ tag: "", valid: false, memberCount: 0, joined: false, reason: "Invite not found" });
    return;
  }
  const expired = invite.expiresAt && invite.expiresAt < new Date();
  const exhausted = invite.maxUses != null && invite.useCount >= invite.maxUses;
  const me = getUserId(req);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMembersTable)
    .where(eq(roomMembersTable.tag, invite.tag));
  const [member] = await db
    .select()
    .from(roomMembersTable)
    .where(and(eq(roomMembersTable.tag, invite.tag), eq(roomMembersTable.userId, me)))
    .limit(1);
  res.json({
    tag: invite.tag,
    valid: !expired && !exhausted,
    memberCount: count ?? 0,
    joined: !!member,
    reason: expired ? "Invite expired" : exhausted ? "Invite reached max uses" : null,
  });
});

router.post("/rooms/invites/:code", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const code = String(raw).trim();
  const me = getUserId(req);
  const [invite] = await db
    .select()
    .from(roomInvitesTable)
    .where(eq(roomInvitesTable.code, code))
    .limit(1);
  if (!invite) {
    res.status(404).json({ tag: "", valid: false, memberCount: 0, joined: false, reason: "Invite not found" });
    return;
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    res.status(410).json({ tag: invite.tag, valid: false, memberCount: 0, joined: false, reason: "Invite expired" });
    return;
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    res.status(410).json({ tag: invite.tag, valid: false, memberCount: 0, joined: false, reason: "Invite reached max uses" });
    return;
  }
  const [existing] = await db
    .select()
    .from(roomMembersTable)
    .where(and(eq(roomMembersTable.tag, invite.tag), eq(roomMembersTable.userId, me)))
    .limit(1);
  if (!existing) {
    await db.insert(roomMembersTable).values({ tag: invite.tag, userId: me });
    await db
      .update(roomInvitesTable)
      .set({ useCount: invite.useCount + 1 })
      .where(eq(roomInvitesTable.code, code));
    // Auto-follow the tag
    await db
      .insert(userFollowedHashtagsTable)
      .values({ userId: me, tag: invite.tag })
      .onConflictDoNothing();
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(roomMembersTable)
    .where(eq(roomMembersTable.tag, invite.tag));
  res.json({
    tag: invite.tag,
    valid: true,
    memberCount: count ?? 0,
    joined: true,
    reason: null,
  });
});

// ---------- Join requests ----------

router.get("/rooms/:tag/join-requests", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  const access = await getRoomAccess(tag, me);
  if (!access.canManage) {
    res.status(403).json({ error: "Only the owner can view join requests" });
    return;
  }
  const rows = await db
    .select({
      tag: roomJoinRequestsTable.tag,
      userId: roomJoinRequestsTable.userId,
      status: roomJoinRequestsTable.status,
      createdAt: roomJoinRequestsTable.createdAt,
      uId: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      bio: usersTable.bio,
      featuredHashtag: usersTable.featuredHashtag,
      discriminator: usersTable.discriminator,
      role: usersTable.role,
      mvpPlan: usersTable.mvpPlan,
      verified: usersTable.verified,
      status_user: usersTable.status,
      lastSeenAt: usersTable.lastSeenAt,
    })
    .from(roomJoinRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, roomJoinRequestsTable.userId))
    .where(and(eq(roomJoinRequestsTable.tag, tag), eq(roomJoinRequestsTable.status, "pending")))
    .orderBy(desc(roomJoinRequestsTable.createdAt));
  res.json(
    rows.map((r) => ({
      tag: r.tag,
      userId: r.userId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      user: r.uId
        ? {
            id: r.uId,
            username: r.username!,
            displayName: r.displayName!,
            bio: r.bio,
            avatarUrl: r.avatarUrl,
            status: r.status_user!,
            featuredHashtag: r.featuredHashtag,
            discriminator: r.discriminator,
            role: r.role!,
            mvpPlan: r.mvpPlan!,
            verified: r.verified!,
            lastSeenAt: (r.lastSeenAt ?? new Date(0)).toISOString(),
            hashtags: [],
            sharedHashtags: [],
            matchScore: 0,
          }
        : null,
    })),
  );
});

router.post("/rooms/:tag/join-requests", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  const me = getUserId(req);
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  const access = await getRoomAccess(tag, me);
  if (!access.isPrivate) {
    res.status(400).json({ error: "Room is not private; just join it." });
    return;
  }
  if (access.isMember) {
    res.json({
      tag,
      userId: me,
      status: "approved",
      createdAt: new Date().toISOString(),
    });
    return;
  }
  await db
    .insert(roomJoinRequestsTable)
    .values({ tag, userId: me, status: "pending" })
    .onConflictDoUpdate({
      target: [roomJoinRequestsTable.tag, roomJoinRequestsTable.userId],
      set: { status: "pending", createdAt: new Date(), decidedAt: null, decidedBy: null },
    });
  res.json({
    tag,
    userId: me,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
});

router.post(
  "/rooms/:tag/join-requests/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const rawTag = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
    const rawUser = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const tag = normalizeTag(rawTag);
    const userId = String(rawUser);
    const decision = (req.body as { decision?: string })?.decision;
    if (!tag || !["approve", "deny"].includes(decision ?? "")) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomAccess(tag, me);
    if (!access.canManage) {
      res.status(403).json({ error: "Only the owner can decide join requests" });
      return;
    }
    const newStatus = decision === "approve" ? "approved" : "denied";
    await db
      .update(roomJoinRequestsTable)
      .set({ status: newStatus, decidedAt: new Date(), decidedBy: me })
      .where(
        and(
          eq(roomJoinRequestsTable.tag, tag),
          eq(roomJoinRequestsTable.userId, userId),
        ),
      );
    if (decision === "approve") {
      await db
        .insert(roomMembersTable)
        .values({ tag, userId })
        .onConflictDoNothing();
      await db
        .insert(userFollowedHashtagsTable)
        .values({ userId, tag })
        .onConflictDoNothing();
    }
    res.json({ ok: true });
  },
);

export default router;
