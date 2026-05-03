import { Router, type IRouter } from "express";
import {
  db,
  userFollowsTable,
  userBlocksTable,
  userMutesTable,
  hashtagMutesTable,
  hashtagsTable,
  usersTable,
  userHashtagsTable,
  messagesTable,
  friendshipsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { loadFriendStatuses } from "./friends";
import {
  presenceStateFor,
  publicCurrentRoom,
  publicLastSeenAt,
} from "../lib/presence";
import {
  loadMyBlocks,
  loadBlockersOfMe,
  loadMyMutes,
  loadMyFollowing,
  loadMutedHashtags,
  loadBlockWall,
  loadSocialFlagsMap,
  isBlockedEitherWay,
} from "../lib/relationships";

const router: IRouter = Router();

// ----- Follow -----

router.post(
  "/users/:id/follow",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    if (otherId === me) {
      res.status(400).json({ error: "Cannot follow yourself" });
      return;
    }
    const [other] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);
    if (!other) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (await isBlockedEitherWay(me, otherId)) {
      res.status(403).json({ error: "Blocked" });
      return;
    }
    const inserted = await db
      .insert(userFollowsTable)
      .values({ followerId: me, followeeId: otherId })
      .onConflictDoNothing()
      .returning({ followerId: userFollowsTable.followerId });
    if (inserted.length > 0) {
      const { createNotification } = await import("../lib/notifications");
      await createNotification({
        recipientId: otherId,
        actorId: me,
        kind: "follow",
        targetType: "user",
        targetTextId: me,
      });
    }
    res.status(204).end();
  },
);

router.delete(
  "/users/:id/follow",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    await db
      .delete(userFollowsTable)
      .where(
        and(
          eq(userFollowsTable.followerId, me),
          eq(userFollowsTable.followeeId, otherId),
        ),
      );
    res.status(204).end();
  },
);

// ----- Block -----

router.post(
  "/users/:id/block",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    if (otherId === me) {
      res.status(400).json({ error: "Cannot block yourself" });
      return;
    }
    const [other] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);
    if (!other) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db
      .insert(userBlocksTable)
      .values({ blockerId: me, blockedId: otherId })
      .onConflictDoNothing();
    // Tear down friendship and follows in both directions.
    await db
      .delete(friendshipsTable)
      .where(
        or(
          and(
            eq(friendshipsTable.requesterId, me),
            eq(friendshipsTable.addresseeId, otherId),
          ),
          and(
            eq(friendshipsTable.requesterId, otherId),
            eq(friendshipsTable.addresseeId, me),
          ),
        ),
      );
    await db
      .delete(userFollowsTable)
      .where(
        or(
          and(
            eq(userFollowsTable.followerId, me),
            eq(userFollowsTable.followeeId, otherId),
          ),
          and(
            eq(userFollowsTable.followerId, otherId),
            eq(userFollowsTable.followeeId, me),
          ),
        ),
      );
    res.status(204).end();
  },
);

router.delete(
  "/users/:id/block",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    await db
      .delete(userBlocksTable)
      .where(
        and(
          eq(userBlocksTable.blockerId, me),
          eq(userBlocksTable.blockedId, otherId),
        ),
      );
    res.status(204).end();
  },
);

// ----- Mute user -----

router.post(
  "/users/:id/mute",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    if (otherId === me) {
      res.status(400).json({ error: "Cannot mute yourself" });
      return;
    }
    await db
      .insert(userMutesTable)
      .values({ muterId: me, mutedId: otherId })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

router.delete(
  "/users/:id/mute",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    await db
      .delete(userMutesTable)
      .where(
        and(
          eq(userMutesTable.muterId, me),
          eq(userMutesTable.mutedId, otherId),
        ),
      );
    res.status(204).end();
  },
);

// ----- Mute hashtag -----

router.post(
  "/hashtags/:tag/mute",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
    await db
      .insert(hashtagMutesTable)
      .values({ userId: me, tag })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

router.delete(
  "/hashtags/:tag/mute",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    await db
      .delete(hashtagMutesTable)
      .where(
        and(
          eq(hashtagMutesTable.userId, me),
          eq(hashtagMutesTable.tag, tag),
        ),
      );
    res.status(204).end();
  },
);

// ----- My relationships -----

router.get(
  "/me/relationships",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const [following, blocks, mutes, mutedTags] = await Promise.all([
      loadMyFollowing(me),
      loadMyBlocks(me),
      loadMyMutes(me),
      loadMutedHashtags(me),
    ]);
    res.json({
      following: Array.from(following),
      blocked: Array.from(blocks),
      muted: Array.from(mutes),
      mutedHashtags: Array.from(mutedTags),
    });
  },
);

router.get(
  "/me/blocks-mutes",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const [blockRows, muteRows, hashtagMuteRows] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          discriminator: usersTable.discriminator,
          actedAt: userBlocksTable.createdAt,
        })
        .from(userBlocksTable)
        .innerJoin(usersTable, eq(usersTable.id, userBlocksTable.blockedId))
        .where(eq(userBlocksTable.blockerId, me))
        .orderBy(desc(userBlocksTable.createdAt)),
      db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          discriminator: usersTable.discriminator,
          actedAt: userMutesTable.createdAt,
        })
        .from(userMutesTable)
        .innerJoin(usersTable, eq(usersTable.id, userMutesTable.mutedId))
        .where(eq(userMutesTable.muterId, me))
        .orderBy(desc(userMutesTable.createdAt)),
      db
        .select({
          tag: hashtagMutesTable.tag,
          actedAt: hashtagMutesTable.createdAt,
        })
        .from(hashtagMutesTable)
        .where(eq(hashtagMutesTable.userId, me))
        .orderBy(desc(hashtagMutesTable.createdAt)),
    ]);
    res.json({
      blocked: blockRows.map((r) => ({
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        discriminator: r.discriminator,
        actedAt: r.actedAt.toISOString(),
      })),
      muted: muteRows.map((r) => ({
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        discriminator: r.discriminator,
        actedAt: r.actedAt.toISOString(),
      })),
      mutedHashtags: hashtagMuteRows.map((r) => ({
        tag: r.tag,
        actedAt: r.actedAt.toISOString(),
      })),
    });
  },
);

// ----- Public profile by username -----

router.get(
  "/users/by-username/:username",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.username)
      ? req.params.username[0]
      : req.params.username;
    const username = String(raw).trim().toLowerCase();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.username}) = ${username}`)
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (user.id !== me && (await isBlockedEitherWay(me, user.id))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const tags = (
      await db
        .select({ tag: userHashtagsTable.tag })
        .from(userHashtagsTable)
        .where(eq(userHashtagsTable.userId, user.id))
    ).map((r) => r.tag);
    const myTags = (
      await db
        .select({ tag: userHashtagsTable.tag })
        .from(userHashtagsTable)
        .where(eq(userHashtagsTable.userId, me))
    ).map((r) => r.tag);
    const myTagSet = new Set(myTags);
    const mutual = tags.filter((t) => myTagSet.has(t));

    const [followerCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followeeId, user.id));
    const [followingCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollowsTable)
      .where(eq(userFollowsTable.followerId, user.id));

    let isFollowing = false;
    let followsMe = false;
    let isMuted = false;
    let isBlocked = false;
    let friendStatus: string | null = null;
    if (user.id !== me) {
      const [f1] = await db
        .select()
        .from(userFollowsTable)
        .where(
          and(
            eq(userFollowsTable.followerId, me),
            eq(userFollowsTable.followeeId, user.id),
          ),
        )
        .limit(1);
      isFollowing = !!f1;
      const [f2] = await db
        .select()
        .from(userFollowsTable)
        .where(
          and(
            eq(userFollowsTable.followerId, user.id),
            eq(userFollowsTable.followeeId, me),
          ),
        )
        .limit(1);
      followsMe = !!f2;
      const [m] = await db
        .select()
        .from(userMutesTable)
        .where(
          and(
            eq(userMutesTable.muterId, me),
            eq(userMutesTable.mutedId, user.id),
          ),
        )
        .limit(1);
      isMuted = !!m;
      const [b] = await db
        .select()
        .from(userBlocksTable)
        .where(
          and(
            eq(userBlocksTable.blockerId, me),
            eq(userBlocksTable.blockedId, user.id),
          ),
        )
        .limit(1);
      isBlocked = !!b;
      const [fr] = await db
        .select()
        .from(friendshipsTable)
        .where(
          or(
            and(
              eq(friendshipsTable.requesterId, me),
              eq(friendshipsTable.addresseeId, user.id),
            ),
            and(
              eq(friendshipsTable.requesterId, user.id),
              eq(friendshipsTable.addresseeId, me),
            ),
          ),
        )
        .limit(1);
      if (fr) {
        if (fr.status === "accepted") friendStatus = "friends";
        else if (fr.status === "pending")
          friendStatus = fr.requesterId === me ? "request_sent" : "request_received";
      }
    }

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      pronouns: user.pronouns,
      location: user.location,
      website: user.website,
      statusEmoji: user.statusEmoji,
      statusText: user.statusText,
      status: user.status,
      featuredHashtag: user.featuredHashtag,
      discriminator: user.discriminator,
      role: user.role,
      mvpPlan: user.mvpPlan,
      verified: user.verified,
      lastSeenAt: publicLastSeenAt(user.lastSeenAt, user.hidePresence),
      presenceState: presenceStateFor(user.lastSeenAt, user.hidePresence),
      currentRoomTag: publicCurrentRoom(user.currentRoomTag, user.lastSeenAt, user.hidePresence),
      hidePresence: user.hidePresence,
      createdAt: user.createdAt.toISOString(),
      hashtags: tags,
      mutualHashtags: mutual,
      followerCount: followerCount?.count ?? 0,
      followingCount: followingCount?.count ?? 0,
      isFollowing,
      followsMe,
      isMuted,
      isBlocked,
      friendStatus,
    });
  },
);

// ----- Following feed -----

router.get(
  "/discover/following",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1),
      100,
    );
    const [following, blockers, mutes, mutedTags] = await Promise.all([
      loadMyFollowing(me),
      loadBlockersOfMe(me),
      loadMyMutes(me),
      loadMutedHashtags(me),
    ]);
    const followIds = Array.from(following).filter(
      (id) => !blockers.has(id) && !mutes.has(id),
    );
    if (followIds.length === 0) {
      res.json([]);
      return;
    }
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    // Posts (room messages) by followed users
    const postRows = await db
      .select({
        id: messagesTable.id,
        senderId: messagesTable.senderId,
        roomTag: messagesTable.roomTag,
        content: messagesTable.content,
        imageUrl: messagesTable.imageUrl,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(
        and(
          inArray(messagesTable.senderId, followIds),
          sql`${messagesTable.roomTag} IS NOT NULL`,
          sql`${messagesTable.deletedAt} IS NULL`,
          sql`${messagesTable.createdAt} >= ${since}`,
          mutedTags.size > 0
            ? sql`${messagesTable.roomTag} NOT IN (${sql.join(Array.from(mutedTags).map((t) => sql`${t}`), sql`, `)})`
            : sql`true`,
        ),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);

    // Room joins: from user_hashtags createdAt
    const joinRows = await db
      .select({
        userId: userHashtagsTable.userId,
        tag: userHashtagsTable.tag,
        createdAt: userHashtagsTable.createdAt,
      })
      .from(userHashtagsTable)
      .where(
        and(
          inArray(userHashtagsTable.userId, followIds),
          sql`${userHashtagsTable.createdAt} >= ${since}`,
          mutedTags.size > 0
            ? sql`${userHashtagsTable.tag} NOT IN (${sql.join(Array.from(mutedTags).map((t) => sql`${t}`), sql`, `)})`
            : sql`true`,
        ),
      )
      .orderBy(desc(userHashtagsTable.createdAt))
      .limit(limit);

    // Load user data for any referenced users
    const userIds = Array.from(
      new Set([
        ...postRows.map((r) => r.senderId),
        ...joinRows.map((r) => r.userId),
      ]),
    );
    const users =
      userIds.length === 0
        ? []
        : await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const userTagsRows =
      userIds.length === 0
        ? []
        : await db
            .select()
            .from(userHashtagsTable)
            .where(inArray(userHashtagsTable.userId, userIds));
    const userTagsMap = new Map<string, string[]>();
    for (const r of userTagsRows) {
      if (!userTagsMap.has(r.userId)) userTagsMap.set(r.userId, []);
      userTagsMap.get(r.userId)!.push(r.tag);
    }
    const myTagsRows = await db
      .select({ tag: userHashtagsTable.tag })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.userId, me));
    const myTagSet = new Set(myTagsRows.map((r) => r.tag));

    function makeMatchUser(uId: string) {
      const u = users.find((x) => x.id === uId);
      if (!u) return null;
      const tags = userTagsMap.get(uId) ?? [];
      const shared = tags.filter((t) => myTagSet.has(t));
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        bio: u.bio,
        avatarUrl: u.avatarUrl,
        status: u.status,
        featuredHashtag: u.featuredHashtag,
        discriminator: u.discriminator,
        role: u.role,
        mvpPlan: u.mvpPlan,
        verified: u.verified,
        lastSeenAt: publicLastSeenAt(u.lastSeenAt, u.hidePresence),
        presenceState: presenceStateFor(u.lastSeenAt, u.hidePresence),
        currentRoomTag: publicCurrentRoom(u.currentRoomTag, u.lastSeenAt, u.hidePresence),
        hashtags: tags,
        sharedHashtags: shared,
        matchScore: shared.length,
        isFollowing: true,
      };
    }

    const items: unknown[] = [];
    for (const r of postRows) {
      const user = makeMatchUser(r.senderId);
      if (!user) continue;
      items.push({
        kind: "post",
        id: `post-${r.id}`,
        user,
        roomTag: r.roomTag,
        content: r.content,
        imageUrl: r.imageUrl,
        createdAt: r.createdAt.toISOString(),
      });
    }
    for (const r of joinRows) {
      const user = makeMatchUser(r.userId);
      if (!user) continue;
      items.push({
        kind: "room_join",
        id: `join-${r.userId}-${r.tag}`,
        user,
        roomTag: r.tag,
        content: null,
        imageUrl: null,
        createdAt: r.createdAt.toISOString(),
      });
    }
    items.sort((a, b) =>
      String((b as { createdAt: string }).createdAt).localeCompare(
        String((a as { createdAt: string }).createdAt),
      ),
    );
    res.json(items.slice(0, limit));
  },
);

// ----- Follow suggestions -----

router.get(
  "/discover/suggestions",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "8"), 10) || 8, 1),
      20,
    );
    const usernameRaw = req.query.username;
    const username =
      typeof usernameRaw === "string" && usernameRaw.trim().length > 0
        ? usernameRaw.trim().toLowerCase()
        : null;

    // Determine the "seed" user whose hashtags drive the suggestions:
    // - When a username is provided (Similar people on a profile), seed is that user.
    // - Otherwise (Following tab empty state), seed is the current user.
    let seedUserId = me;
    if (username) {
      const [u] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`lower(${usersTable.username}) = ${username}`)
        .limit(1);
      if (!u) {
        res.json([]);
        return;
      }
      if (u.id !== me && (await isBlockedEitherWay(me, u.id))) {
        res.json([]);
        return;
      }
      seedUserId = u.id;
    }

    const [seedTagsRows, blockWall, mutes, following] = await Promise.all([
      db
        .select({ tag: userHashtagsTable.tag })
        .from(userHashtagsTable)
        .where(eq(userHashtagsTable.userId, seedUserId)),
      loadBlockWall(me),
      loadMyMutes(me),
      loadMyFollowing(me),
    ]);
    const seedTags = seedTagsRows.map((r) => r.tag);

    // Hide self, the seed (when looking at a profile), already-followed,
    // muted, and blocked (either direction).
    const hidden = new Set<string>([me, ...blockWall, ...mutes, ...following]);
    if (username) hidden.add(seedUserId);

    let candidateIds: string[] = [];
    if (seedTags.length > 0) {
      const overlap = await db
        .select({
          userId: userHashtagsTable.userId,
          score: sql<number>`count(*)::int`,
        })
        .from(userHashtagsTable)
        .where(
          sql`${userHashtagsTable.tag} IN (${sql.join(seedTags.map((t) => sql`${t}`), sql`, `)}) AND ${userHashtagsTable.userId} <> ${seedUserId}`,
        )
        .groupBy(userHashtagsTable.userId)
        .orderBy(sql`count(*) DESC`)
        .limit(limit * 3);
      candidateIds = overlap
        .map((o) => o.userId)
        .filter((id) => !hidden.has(id));
    }

    // Top up with other users (newest first) when overlap is sparse, so the
    // empty Following tab never looks empty for fresh accounts.
    if (candidateIds.length < limit) {
      const others = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(ne(usersTable.id, me))
        .orderBy(desc(usersTable.createdAt))
        .limit(limit * 3);
      for (const o of others) {
        if (hidden.has(o.id)) continue;
        if (!candidateIds.includes(o.id)) candidateIds.push(o.id);
        if (candidateIds.length >= limit) break;
      }
    }
    candidateIds = candidateIds.slice(0, limit);

    if (candidateIds.length === 0) {
      res.json([]);
      return;
    }

    const users = await db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.id, candidateIds));
    const allTagRows = await db
      .select()
      .from(userHashtagsTable)
      .where(inArray(userHashtagsTable.userId, candidateIds));
    const tagMap = new Map<string, string[]>();
    for (const r of allTagRows) {
      if (!tagMap.has(r.userId)) tagMap.set(r.userId, []);
      tagMap.get(r.userId)!.push(r.tag);
    }
    const seedTagSet = new Set(seedTags);

    const [friendMap, socialMap] = await Promise.all([
      loadFriendStatuses(me, candidateIds),
      loadSocialFlagsMap(me, candidateIds),
    ]);

    const result = users.map((u) => {
      const tags = tagMap.get(u.id) ?? [];
      const shared = tags.filter((t) => seedTagSet.has(t));
      const flags = socialMap.get(u.id);
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        bio: u.bio,
        avatarUrl: u.avatarUrl,
        status: u.status,
        featuredHashtag: u.featuredHashtag,
        discriminator: u.discriminator,
        role: u.role,
        mvpPlan: u.mvpPlan,
        lastSeenAt: publicLastSeenAt(u.lastSeenAt, u.hidePresence),
        presenceState: presenceStateFor(u.lastSeenAt, u.hidePresence),
        currentRoomTag: publicCurrentRoom(u.currentRoomTag, u.lastSeenAt, u.hidePresence),
        hashtags: tags,
        sharedHashtags: shared,
        matchScore:
          shared.length * 10 +
          (tags.length > 0 ? Math.min(tags.length, 5) : 0),
        friendStatus: friendMap.get(u.id) ?? "none",
        isFollowing: flags?.isFollowing ?? false,
        followsMe: flags?.followsMe ?? false,
        isMuted: flags?.isMuted ?? false,
        isBlocked: flags?.isBlocked ?? false,
      };
    });
    result.sort((a, b) => b.matchScore - a.matchScore);
    res.json(result);
  },
);

export default router;
