import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  postsTable,
  postHashtagsTable,
  postMediaTable,
  messagesTable,
} from "@workspace/db";
import { sql, eq, inArray, ne, and, desc } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { loadFriendStatuses } from "./friends";
import {
  loadBlockWall,
  loadMyMutes,
  loadMutedHashtags,
  loadMyFollowing,
  loadSocialFlagsMap,
} from "../lib/relationships";

const router: IRouter = Router();

router.get("/discover/people", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "24"), 10) || 24, 1),
    50,
  );
  const me = getUserId(req);
  const [blockWall, mutes] = await Promise.all([
    loadBlockWall(me),
    loadMyMutes(me),
  ]);
  const hidden = new Set<string>([...blockWall, ...mutes]);
  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, me));
  const myTags = myTagsRows.map((r) => r.tag);

  let candidateIds: string[] = [];
  if (myTags.length > 0) {
    const overlap = await db
      .select({
        userId: userHashtagsTable.userId,
        score: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .where(
        sql`${userHashtagsTable.tag} IN (${sql.join(myTags.map((t) => sql`${t}`), sql`, `)}) AND ${userHashtagsTable.userId} <> ${me}`,
      )
      .groupBy(userHashtagsTable.userId)
      .orderBy(sql`count(*) DESC`)
      .limit(limit * 2);
    candidateIds = overlap.map((o) => o.userId).filter((id) => !hidden.has(id));
  }

  if (candidateIds.length < limit) {
    const others = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(ne(usersTable.id, me))
      .limit(limit * 2);
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
  const myTagSet = new Set(myTags);

  const [friendMap, socialMap] = await Promise.all([
    loadFriendStatuses(me, candidateIds),
    loadSocialFlagsMap(me, candidateIds),
  ]);

  const result = users.map((u) => {
    const tags = tagMap.get(u.id) ?? [];
    const shared = tags.filter((t) => myTagSet.has(t));
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
      verified: u.verified,
      lastSeenAt: u.lastSeenAt.toISOString(),
      hashtags: tags,
      sharedHashtags: shared,
      matchScore:
        shared.length * 10 + (tags.length > 0 ? Math.min(tags.length, 5) : 0),
      friendStatus: friendMap.get(u.id) ?? "none",
      isFollowing: flags?.isFollowing ?? false,
      followsMe: flags?.followsMe ?? false,
      isMuted: flags?.isMuted ?? false,
      isBlocked: flags?.isBlocked ?? false,
    };
  });
  result.sort((a, b) => b.matchScore - a.matchScore);
  res.json(result);
});

router.get("/discover/foryou", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1),
    60,
  );
  const me = getUserId(req);
  const [blockWall, mutes, mutedTags, following] = await Promise.all([
    loadBlockWall(me),
    loadMyMutes(me),
    loadMutedHashtags(me),
    loadMyFollowing(me),
  ]);
  const hidden = new Set<string>([...blockWall, ...mutes]);

  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, me));
  const myTags = myTagsRows.map((r) => r.tag);
  const followedTagsRows = await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.userId, me));
  const followedTags = followedTagsRows.map((r) => r.tag);
  const interestTags = Array.from(new Set([...myTags, ...followedTags])).filter(
    (t) => !mutedTags.has(t),
  );

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let candidatePosts: Array<{
    id: number;
    authorId: string;
    matchedTags: number;
    fromFollow: number;
  }> = [];

  if (interestTags.length > 0) {
    const rows = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        matched: sql<number>`count(*)::int`,
      })
      .from(postsTable)
      .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
      .where(
        and(
          inArray(postHashtagsTable.tag, interestTags),
          sql`${postsTable.deletedAt} IS NULL`,
          sql`${postsTable.createdAt} >= ${since}`,
        ),
      )
      .groupBy(postsTable.id, postsTable.authorId)
      .orderBy(desc(postsTable.createdAt))
      .limit(limit * 2);
    candidatePosts = rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      matchedTags: r.matched,
      fromFollow: following.has(r.authorId) ? 1 : 0,
    }));
  }
  if (following.size > 0) {
    const rows = await db
      .select({ id: postsTable.id, authorId: postsTable.authorId })
      .from(postsTable)
      .where(
        and(
          inArray(postsTable.authorId, Array.from(following)),
          sql`${postsTable.deletedAt} IS NULL`,
          sql`${postsTable.createdAt} >= ${since}`,
        ),
      )
      .orderBy(desc(postsTable.createdAt))
      .limit(limit);
    for (const r of rows) {
      if (!candidatePosts.find((c) => c.id === r.id)) {
        candidatePosts.push({
          id: r.id,
          authorId: r.authorId,
          matchedTags: 0,
          fromFollow: 1,
        });
      }
    }
  }
  candidatePosts = candidatePosts.filter((c) => !hidden.has(c.authorId));

  let postItems: unknown[] = [];
  if (candidatePosts.length > 0) {
    const ids = candidatePosts.map((c) => c.id);
    const fullRows = await db
      .select()
      .from(postsTable)
      .where(inArray(postsTable.id, ids));
    const authorIds = Array.from(new Set(fullRows.map((r) => r.authorId)));
    const authors = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        discriminator: usersTable.discriminator,
        role: usersTable.role,
        mvpPlan: usersTable.mvpPlan,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, authorIds));
    const authorMap = new Map(authors.map((a) => [a.id, a]));
    const tagRows = await db
      .select()
      .from(postHashtagsTable)
      .where(inArray(postHashtagsTable.postId, ids));
    const tagsByPost = new Map<number, string[]>();
    for (const t of tagRows) {
      if (!tagsByPost.has(t.postId)) tagsByPost.set(t.postId, []);
      tagsByPost.get(t.postId)!.push(t.tag);
    }
    const mediaRows = await db
      .select()
      .from(postMediaTable)
      .where(inArray(postMediaTable.postId, ids))
      .orderBy(postMediaTable.position);
    const mediaByPost = new Map<number, string[]>();
    for (const m of mediaRows) {
      if (!mediaByPost.has(m.postId)) mediaByPost.set(m.postId, []);
      mediaByPost.get(m.postId)!.push(m.imageUrl);
    }
    const candMap = new Map(candidatePosts.map((c) => [c.id, c]));
    postItems = fullRows
      .filter((r) => {
        const tags = tagsByPost.get(r.id) ?? [];
        return !tags.some((t) => mutedTags.has(t));
      })
      .map((r) => {
        const a = authorMap.get(r.authorId);
        const cand = candMap.get(r.id)!;
        const tags = tagsByPost.get(r.id) ?? [];
        const ageHours = (Date.now() - r.createdAt.getTime()) / 3_600_000;
        const recency = Math.max(0, 1 - ageHours / (24 * 7));
        const score =
          cand.matchedTags * 5 + cand.fromFollow * 8 + recency * 6;
        const matchedTagsList = tags.filter((t) => interestTags.includes(t));
        const reason = cand.fromFollow
          ? `From ${a?.displayName ?? "someone"} you follow`
          : matchedTagsList.length > 0
            ? `Because you like #${matchedTagsList[0]}`
            : "Recent on HashChat";
        return {
          kind: "post" as const,
          id: `post-${r.id}`,
          score,
          reason,
          post: {
            id: r.id,
            author: {
              id: a?.id ?? r.authorId,
              username: a?.username ?? "unknown",
              displayName: a?.displayName ?? "Unknown",
              avatarUrl: a?.avatarUrl ?? null,
              discriminator: a?.discriminator ?? null,
              role: a?.role ?? "user",
              mvpPlan: a?.mvpPlan ?? false,
            },
            content: r.content,
            hashtags: tags,
            imageUrls: mediaByPost.get(r.id) ?? [],
            createdAt: r.createdAt.toISOString(),
          },
          room: null,
          person: null,
        };
      });
  }

  let roomItems: unknown[] = [];
  if (interestTags.length > 0) {
    const sinceRoom = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rooms = await db
      .select({
        tag: messagesTable.roomTag,
        recent: sql<number>`count(*)::int`,
      })
      .from(messagesTable)
      .where(
        and(
          sql`${messagesTable.roomTag} IS NOT NULL`,
          sql`${messagesTable.createdAt} >= ${sinceRoom}`,
          sql`${messagesTable.deletedAt} IS NULL`,
        ),
      )
      .groupBy(messagesTable.roomTag)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    const followedSet = new Set(followedTags);
    const interestSet = new Set(interestTags);
    const filtered = rooms
      .map((r) => r.tag!)
      .filter((t) => t && !mutedTags.has(t))
      .filter((t) => interestSet.has(t) || true)
      .slice(0, 10);

    if (filtered.length > 0) {
      const memberRows = await db
        .select({
          tag: userHashtagsTable.tag,
          n: sql<number>`count(*)::int`,
        })
        .from(userHashtagsTable)
        .where(inArray(userHashtagsTable.tag, filtered))
        .groupBy(userHashtagsTable.tag);
      const memberMap = new Map(memberRows.map((m) => [m.tag, m.n]));
      const followerRows = await db
        .select({
          tag: userFollowedHashtagsTable.tag,
          n: sql<number>`count(*)::int`,
        })
        .from(userFollowedHashtagsTable)
        .where(inArray(userFollowedHashtagsTable.tag, filtered))
        .groupBy(userFollowedHashtagsTable.tag);
      const followerMap = new Map(followerRows.map((f) => [f.tag, f.n]));
      const recentMap = new Map(rooms.map((r) => [r.tag!, r.recent]));
      roomItems = filtered.map((tag) => {
        const isInterest = interestSet.has(tag);
        const score =
          (recentMap.get(tag) ?? 0) * 1 +
          (memberMap.get(tag) ?? 0) * 0.4 +
          (isInterest ? 4 : 0);
        return {
          kind: "room" as const,
          id: `room-${tag}`,
          score,
          reason: isInterest
            ? `Active room you follow`
            : `Trending right now`,
          post: null,
          room: {
            tag,
            memberCount: memberMap.get(tag) ?? 0,
            messageCount: recentMap.get(tag) ?? 0,
            followerCount: followerMap.get(tag) ?? 0,
            recentMessages: recentMap.get(tag) ?? 0,
            lastMessage: null,
            isFollowed: followedSet.has(tag),
          },
          person: null,
        };
      });
    }
  }

  let peopleItems: unknown[] = [];
  if (myTags.length > 0) {
    const overlap = await db
      .select({
        userId: userHashtagsTable.userId,
        score: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .where(
        and(
          inArray(userHashtagsTable.tag, myTags),
          ne(userHashtagsTable.userId, me),
        ),
      )
      .groupBy(userHashtagsTable.userId)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const personIds = overlap
      .map((o) => o.userId)
      .filter((id) => !hidden.has(id) && !following.has(id))
      .slice(0, 6);
    if (personIds.length > 0) {
      const users = await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, personIds));
      const allTagRows = await db
        .select()
        .from(userHashtagsTable)
        .where(inArray(userHashtagsTable.userId, personIds));
      const tagMap = new Map<string, string[]>();
      for (const r of allTagRows) {
        if (!tagMap.has(r.userId)) tagMap.set(r.userId, []);
        tagMap.get(r.userId)!.push(r.tag);
      }
      const myTagSet = new Set(myTags);
      const [friendMap, socialMap] = await Promise.all([
        loadFriendStatuses(me, personIds),
        loadSocialFlagsMap(me, personIds),
      ]);
      const overlapMap = new Map(overlap.map((o) => [o.userId, o.score]));
      peopleItems = users.map((u) => {
        const tags = tagMap.get(u.id) ?? [];
        const shared = tags.filter((t) => myTagSet.has(t));
        const flags = socialMap.get(u.id);
        const overlapScore = overlapMap.get(u.id) ?? 0;
        return {
          kind: "person" as const,
          id: `person-${u.id}`,
          score: overlapScore * 4 + 2,
          reason: `${shared.length} hashtag${shared.length === 1 ? "" : "s"} in common`,
          post: null,
          room: null,
          person: {
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
            lastSeenAt: (u.lastSeenAt ?? new Date(0)).toISOString(),
            hashtags: tags,
            sharedHashtags: shared,
            matchScore: shared.length * 10,
            friendStatus: friendMap.get(u.id) ?? "none",
            isFollowing: flags?.isFollowing ?? false,
            followsMe: flags?.followsMe ?? false,
            isMuted: flags?.isMuted ?? false,
            isBlocked: flags?.isBlocked ?? false,
          },
        };
      });
    }
  }

  type Item = {
    kind: "post" | "room" | "person";
    id: string;
    score: number;
    reason: string;
    post: unknown;
    room: unknown;
    person: unknown;
  };
  const all = [...postItems, ...roomItems, ...peopleItems] as Item[];
  all.sort((a, b) => b.score - a.score);

  const result: Item[] = [];
  let sinceRoom = 0;
  let sincePerson = 0;
  for (const item of all) {
    if (result.length >= limit) break;
    if (item.kind === "room" && result.length - sinceRoom < 3 && result.length > 0) {
      continue;
    }
    if (item.kind === "person" && result.length - sincePerson < 4 && result.length > 0) {
      continue;
    }
    result.push(item);
    if (item.kind === "room") sinceRoom = result.length;
    if (item.kind === "person") sincePerson = result.length;
  }
  if (result.length < limit) {
    for (const item of all) {
      if (result.length >= limit) break;
      if (!result.find((r) => r.id === item.id)) result.push(item);
    }
  }

  res.json(result);
});

export default router;
