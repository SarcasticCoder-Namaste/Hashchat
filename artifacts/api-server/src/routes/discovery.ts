import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  postsTable,
  postHashtagsTable,
  postMediaTable,
  postReactionsTable,
  messagesTable,
  eventsTable,
  eventRsvpsTable,
  mentionsTable,
  hashtagsTable,
  roomVisibilityTable,
} from "@workspace/db";
import { sql, eq, inArray, ne, and, desc, gte } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { loadFriendStatuses } from "./friends";
import {
  loadBlockWall,
  loadMyMutes,
  loadMutedHashtags,
  loadMyFollowing,
  loadSocialFlagsMap,
} from "../lib/relationships";
import { loadPrivateTags } from "../lib/roomVisibility";

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

// ----------------------------- Explore helpers -----------------------------

type Hidden = Set<string>;

async function loadMyHashtagInterests(me: string): Promise<{
  ownTags: string[];
  followedTags: string[];
  interestTags: string[];
  mutedTags: Set<string>;
}> {
  const [ownRows, followedRows, mutedTags] = await Promise.all([
    db
      .select({ tag: userHashtagsTable.tag })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.userId, me)),
    db
      .select({ tag: userFollowedHashtagsTable.tag })
      .from(userFollowedHashtagsTable)
      .where(eq(userFollowedHashtagsTable.userId, me)),
    loadMutedHashtags(me),
  ]);
  const ownTags = ownRows.map((r) => r.tag);
  const followedTags = followedRows.map((r) => r.tag);
  const interestTags = Array.from(new Set([...ownTags, ...followedTags])).filter(
    (t) => !mutedTags.has(t),
  );
  return { ownTags, followedTags, interestTags, mutedTags };
}

async function loadTrendingHashtagsForExplore(
  limit: number,
  mutedTags: Set<string>,
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      tag: messagesTable.roomTag,
      recent: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(
      and(
        sql`${messagesTable.roomTag} IS NOT NULL`,
        sql`${messagesTable.createdAt} >= ${since}`,
      ),
    )
    .groupBy(messagesTable.roomTag)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 3);
  let tags = recent
    .map((r) => r.tag)
    .filter((t): t is string => !!t && !mutedTags.has(t));
  if (tags.length < limit) {
    const fallback = await db
      .select({
        tag: userHashtagsTable.tag,
        n: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(limit * 2);
    for (const f of fallback) {
      if (mutedTags.has(f.tag)) continue;
      if (!tags.includes(f.tag)) tags.push(f.tag);
    }
  }
  const privateTags = await loadPrivateTags(tags);
  tags = tags.filter((t) => !privateTags.has(t)).slice(0, limit);
  if (tags.length === 0) return [];
  const recentMap = new Map(recent.map((r) => [r.tag!, r.recent]));
  const [memberRows, followerRows, messageRows] = await Promise.all([
    db
      .select({
        tag: userHashtagsTable.tag,
        n: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .where(inArray(userHashtagsTable.tag, tags))
      .groupBy(userHashtagsTable.tag),
    db
      .select({
        tag: userFollowedHashtagsTable.tag,
        n: sql<number>`count(*)::int`,
      })
      .from(userFollowedHashtagsTable)
      .where(inArray(userFollowedHashtagsTable.tag, tags))
      .groupBy(userFollowedHashtagsTable.tag),
    db
      .select({
        tag: messagesTable.roomTag,
        n: sql<number>`count(*)::int`,
      })
      .from(messagesTable)
      .where(inArray(messagesTable.roomTag, tags))
      .groupBy(messagesTable.roomTag),
  ]);
  const memberMap = new Map(memberRows.map((r) => [r.tag, r.n]));
  const followerMap = new Map(followerRows.map((r) => [r.tag, r.n]));
  const messageMap = new Map(
    messageRows.filter((r) => r.tag).map((r) => [r.tag!, r.n]),
  );
  const result = tags.map((tag) => {
    const recentMessages = recentMap.get(tag) ?? 0;
    const memberCount = memberMap.get(tag) ?? 0;
    const followerCount = followerMap.get(tag) ?? 0;
    const messageCount = messageMap.get(tag) ?? 0;
    return {
      tag,
      memberCount,
      followerCount,
      messageCount,
      recentMessages,
      score:
        recentMessages * 3 +
        memberCount * 1.5 +
        followerCount +
        messageCount * 0.2,
    };
  });
  result.sort((a, b) => b.score - a.score);
  return result;
}

async function loadSuggestedRoomsForExplore(
  me: string,
  limit: number,
  interestTags: string[],
  mutedTags: Set<string>,
  followedTags: string[],
) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const followedSet = new Set(followedTags);

  // Candidate tags: interest tags first, then trending tags I'm not already in.
  const recent = await db
    .select({
      tag: messagesTable.roomTag,
      n: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(
      and(
        sql`${messagesTable.roomTag} IS NOT NULL`,
        sql`${messagesTable.createdAt} >= ${since}`,
        sql`${messagesTable.deletedAt} IS NULL`,
      ),
    )
    .groupBy(messagesTable.roomTag)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 4);
  const recentMap = new Map(
    recent.filter((r) => r.tag).map((r) => [r.tag!, r.n]),
  );
  const own = new Set(interestTags);
  let candidate = recent
    .map((r) => r.tag!)
    .filter((t) => t && !mutedTags.has(t) && !own.has(t));
  // Also consider interest tags that have any activity so the section isn't empty.
  for (const t of interestTags) {
    if (!candidate.includes(t)) candidate.push(t);
  }
  if (candidate.length === 0) return [];
  const privateTags = await loadPrivateTags(candidate);
  candidate = candidate.filter((t) => !privateTags.has(t)).slice(0, limit * 2);

  const [memberRows, followerRows, messageRows, lastRows] = await Promise.all([
    db
      .select({
        tag: userHashtagsTable.tag,
        n: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .where(inArray(userHashtagsTable.tag, candidate))
      .groupBy(userHashtagsTable.tag),
    db
      .select({
        tag: userFollowedHashtagsTable.tag,
        n: sql<number>`count(*)::int`,
      })
      .from(userFollowedHashtagsTable)
      .where(inArray(userFollowedHashtagsTable.tag, candidate))
      .groupBy(userFollowedHashtagsTable.tag),
    db
      .select({
        tag: messagesTable.roomTag,
        n: sql<number>`count(*)::int`,
      })
      .from(messagesTable)
      .where(inArray(messagesTable.roomTag, candidate))
      .groupBy(messagesTable.roomTag),
    Promise.resolve([] as { tag: string }[]),
  ]);
  void lastRows;
  const memberMap = new Map(memberRows.map((r) => [r.tag, r.n]));
  const followerMap = new Map(followerRows.map((r) => [r.tag, r.n]));
  const messageMap = new Map(
    messageRows.filter((r) => r.tag).map((r) => [r.tag!, r.n]),
  );

  const interestSet = new Set(interestTags);
  const scored = candidate.map((tag) => {
    const recentMessages = recentMap.get(tag) ?? 0;
    const memberCount = memberMap.get(tag) ?? 0;
    const followerCount = followerMap.get(tag) ?? 0;
    const messageCount = messageMap.get(tag) ?? 0;
    const isInterest = interestSet.has(tag);
    const score =
      recentMessages * 2 +
      memberCount * 0.6 +
      followerCount * 0.4 +
      (isInterest ? 6 : 0);
    return {
      tag,
      memberCount,
      messageCount,
      followerCount,
      recentMessages,
      lastMessage: null as null,
      isFollowed: followedSet.has(tag),
      isPrivate: false,
      isMember: interestSet.has(tag),
      score,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ score: _score, ...rest }) => rest);
}

async function loadPeopleToFollowForExplore(
  me: string,
  limit: number,
  myTags: string[],
  hidden: Hidden,
  following: Set<string>,
) {
  if (myTags.length === 0) return [];
  const overlap = await db
    .select({
      userId: userHashtagsTable.userId,
      n: sql<number>`count(*)::int`,
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
    .limit(limit * 4);
  const candidateIds = overlap
    .map((o) => o.userId)
    .filter((id) => !hidden.has(id) && !following.has(id))
    .slice(0, limit);
  if (candidateIds.length === 0) return [];
  const overlapMap = new Map(overlap.map((o) => [o.userId, o.n]));
  const [users, allTagRows, friendMap, socialMap] = await Promise.all([
    db.select().from(usersTable).where(inArray(usersTable.id, candidateIds)),
    db
      .select()
      .from(userHashtagsTable)
      .where(inArray(userHashtagsTable.userId, candidateIds)),
    loadFriendStatuses(me, candidateIds),
    loadSocialFlagsMap(me, candidateIds),
  ]);
  const tagMap = new Map<string, string[]>();
  for (const r of allTagRows) {
    if (!tagMap.has(r.userId)) tagMap.set(r.userId, []);
    tagMap.get(r.userId)!.push(r.tag);
  }
  const myTagSet = new Set(myTags);
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
        (overlapMap.get(u.id) ?? 0) * 10 + Math.min(tags.length, 5),
      friendStatus: friendMap.get(u.id) ?? "none",
      isFollowing: flags?.isFollowing ?? false,
      followsMe: flags?.followsMe ?? false,
      isMuted: flags?.isMuted ?? false,
      isBlocked: flags?.isBlocked ?? false,
    };
  });
  result.sort((a, b) => b.matchScore - a.matchScore);
  return result;
}

async function loadHotInYourHashtagsHelper(
  me: string,
  limit: number,
  interestTags: string[],
  hidden: Hidden,
  mutedTags: Set<string>,
) {
  if (interestTags.length === 0) return [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidateRows = await db
    .select({
      id: postsTable.id,
      authorId: postsTable.authorId,
      createdAt: postsTable.createdAt,
      matchedTag: sql<string>`min(${postHashtagsTable.tag})`,
    })
    .from(postsTable)
    .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
    .where(
      and(
        inArray(postHashtagsTable.tag, interestTags),
        sql`${postsTable.deletedAt} IS NULL`,
        gte(postsTable.createdAt, since),
      ),
    )
    .groupBy(postsTable.id, postsTable.authorId, postsTable.createdAt)
    .limit(limit * 6);
  const filtered = candidateRows.filter((r) => !hidden.has(r.authorId));
  if (filtered.length === 0) return [];
  const ids = filtered.map((r) => r.id);
  const reactionRows = await db
    .select({
      postId: postReactionsTable.postId,
      n: sql<number>`count(*)::int`,
    })
    .from(postReactionsTable)
    .where(inArray(postReactionsTable.postId, ids))
    .groupBy(postReactionsTable.postId);
  const reactionMap = new Map(reactionRows.map((r) => [r.postId, r.n]));
  const scored = filtered
    .map((r) => {
      const engagement = reactionMap.get(r.id) ?? 0;
      const ageH = (Date.now() - r.createdAt.getTime()) / 3_600_000;
      const recency = Math.max(0, 1 - ageH / 24);
      return {
        id: r.id,
        authorId: r.authorId,
        matchedHashtag: r.matchedTag ?? null,
        engagement,
        score: engagement * 4 + recency * 2,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (scored.length === 0) return [];
  const topIds = scored.map((s) => s.id);
  const [postRows, authorRows, tagRows, mediaRows, allReactionRows, mentionRows] =
    await Promise.all([
      db.select().from(postsTable).where(inArray(postsTable.id, topIds)),
      db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          discriminator: usersTable.discriminator,
          role: usersTable.role,
          mvpPlan: usersTable.mvpPlan,
          verified: usersTable.verified,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, scored.map((s) => s.authorId))),
      db
        .select()
        .from(postHashtagsTable)
        .where(inArray(postHashtagsTable.postId, topIds)),
      db
        .select()
        .from(postMediaTable)
        .where(inArray(postMediaTable.postId, topIds))
        .orderBy(postMediaTable.position),
      db
        .select()
        .from(postReactionsTable)
        .where(inArray(postReactionsTable.postId, topIds)),
      db
        .select({
          targetId: mentionsTable.targetId,
          userId: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
        })
        .from(mentionsTable)
        .innerJoin(usersTable, eq(usersTable.id, mentionsTable.mentionedUserId))
        .where(
          and(
            eq(mentionsTable.targetType, "post"),
            inArray(mentionsTable.targetId, topIds),
          ),
        ),
    ]);
  const authorMap = new Map(authorRows.map((a) => [a.id, a]));
  const postMap = new Map(postRows.map((p) => [p.id, p]));
  const tagsByPost = new Map<number, string[]>();
  for (const t of tagRows) {
    if (!tagsByPost.has(t.postId)) tagsByPost.set(t.postId, []);
    tagsByPost.get(t.postId)!.push(t.tag);
  }
  const mediaByPost = new Map<number, string[]>();
  for (const m of mediaRows) {
    if (!mediaByPost.has(m.postId)) mediaByPost.set(m.postId, []);
    mediaByPost.get(m.postId)!.push(m.imageUrl);
  }
  const reactionsByPost = new Map<
    number,
    { emoji: string; count: number; reactedByMe: boolean }[]
  >();
  for (const r of allReactionRows) {
    const list = reactionsByPost.get(r.postId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.userId === me) existing.reactedByMe = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, reactedByMe: r.userId === me });
    }
    reactionsByPost.set(r.postId, list);
  }
  const mentionsByPost = new Map<
    number,
    { id: string; username: string; displayName: string }[]
  >();
  for (const m of mentionRows) {
    const list = mentionsByPost.get(m.targetId) ?? [];
    list.push({ id: m.userId, username: m.username, displayName: m.displayName });
    mentionsByPost.set(m.targetId, list);
  }
  return scored
    .map((s) => {
      const p = postMap.get(s.id);
      if (!p) return null;
      const tags = tagsByPost.get(p.id) ?? [];
      if (tags.some((t) => mutedTags.has(t))) return null;
      const a = authorMap.get(p.authorId);
      return {
        post: {
          id: p.id,
          author: {
            id: a?.id ?? p.authorId,
            username: a?.username ?? "unknown",
            displayName: a?.displayName ?? "Unknown",
            avatarUrl: a?.avatarUrl ?? null,
            discriminator: a?.discriminator ?? null,
            role: a?.role ?? "user",
            mvpPlan: a?.mvpPlan ?? false,
            verified: a?.verified ?? false,
          },
          content: p.content,
          hashtags: tags,
          imageUrls: mediaByPost.get(p.id) ?? [],
          reactions: reactionsByPost.get(p.id) ?? [],
          mentions: mentionsByPost.get(p.id) ?? [],
          createdAt: p.createdAt.toISOString(),
        },
        engagement: s.engagement,
        matchedHashtag: s.matchedHashtag,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

async function loadTrendingEventsForExplore(
  me: string,
  limit: number,
  interestTags: string[],
) {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const baseWhere = and(
    sql`${eventsTable.canceledAt} IS NULL`,
    sql`${eventsTable.startsAt} >= ${cutoff}`,
  );

  let rows: (typeof eventsTable.$inferSelect)[] = [];
  if (interestTags.length > 0) {
    rows = await db
      .select()
      .from(eventsTable)
      .where(and(baseWhere, inArray(eventsTable.roomTag, interestTags)))
      .orderBy(eventsTable.startsAt)
      .limit(limit);
  }
  if (rows.length < limit) {
    const more = await db
      .select()
      .from(eventsTable)
      .where(baseWhere)
      .orderBy(eventsTable.startsAt)
      .limit(limit * 2);
    for (const r of more) {
      if (rows.length >= limit) break;
      if (!rows.find((x) => x.id === r.id)) rows.push(r);
    }
    rows = rows.slice(0, limit);
  }
  if (rows.length === 0) return [];

  // Filter out events from private rooms the user can't see.
  const tags = Array.from(new Set(rows.map((r) => r.roomTag)));
  const privateTags = await loadPrivateTags(tags);
  const interestSet = new Set(interestTags);
  rows = rows.filter(
    (r) => !privateTags.has(r.roomTag) || interestSet.has(r.roomTag),
  );
  if (rows.length === 0) return [];

  const eventIds = rows.map((r) => r.id);
  const creatorIds = Array.from(new Set(rows.map((r) => r.creatorId)));
  const [creators, rsvpCounts, myRsvps] = await Promise.all([
    db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, creatorIds)),
    db
      .select({
        eventId: eventRsvpsTable.eventId,
        n: sql<number>`count(*)::int`,
      })
      .from(eventRsvpsTable)
      .where(inArray(eventRsvpsTable.eventId, eventIds))
      .groupBy(eventRsvpsTable.eventId),
    db
      .select({ eventId: eventRsvpsTable.eventId })
      .from(eventRsvpsTable)
      .where(
        and(
          eq(eventRsvpsTable.userId, me),
          inArray(eventRsvpsTable.eventId, eventIds),
        ),
      ),
  ]);
  const creatorMap = new Map(creators.map((c) => [c.id, c]));
  const rsvpMap = new Map(rsvpCounts.map((r) => [r.eventId, r.n]));
  const myRsvpSet = new Set(myRsvps.map((r) => r.eventId));

  const now = Date.now();
  const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
  const built = rows.map((r) => {
    const c = creatorMap.get(r.creatorId);
    const startsAtMs = r.startsAt.getTime();
    const endsAtMs = r.endsAt
      ? r.endsAt.getTime()
      : startsAtMs + LIVE_WINDOW_MS;
    const isLive = now >= startsAtMs && now < endsAtMs;
    const isPast = now >= endsAtMs;
    const rsvpCount = rsvpMap.get(r.id) ?? 0;
    const isInterest = interestSet.has(r.roomTag);
    const score =
      (isLive ? 50 : 0) +
      rsvpCount * 3 +
      (isInterest ? 20 : 0) +
      Math.max(0, 24 - (startsAtMs - now) / 3_600_000);
    return {
      id: r.id,
      roomTag: r.roomTag,
      creatorId: r.creatorId,
      creatorName: c?.displayName ?? "Unknown",
      creatorAvatarUrl: c?.avatarUrl ?? null,
      title: r.title,
      description: r.description,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt ? r.endsAt.toISOString() : null,
      canceledAt: r.canceledAt ? r.canceledAt.toISOString() : null,
      rsvpCount,
      rsvpedByMe: myRsvpSet.has(r.id),
      isLive,
      isPast,
      canModerate: r.creatorId === me,
      createdAt: r.createdAt.toISOString(),
      _score: score,
    };
  });
  built.sort((a, b) => b._score - a._score);
  return built.slice(0, limit).map(({ _score, ...rest }) => rest);
}

router.get(
  "/discovery/hot-in-your-hashtags",
  requireAuth,
  async (req, res): Promise<void> => {
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1),
      50,
    );
    const me = getUserId(req);
    const [blockWall, mutes, interests] = await Promise.all([
      loadBlockWall(me),
      loadMyMutes(me),
      loadMyHashtagInterests(me),
    ]);
    const hidden = new Set<string>([...blockWall, ...mutes]);
    const items = await loadHotInYourHashtagsHelper(
      me,
      limit,
      interests.interestTags,
      hidden,
      interests.mutedTags,
    );
    res.json(items);
  },
);

router.get(
  "/discovery/trending-events",
  requireAuth,
  async (req, res): Promise<void> => {
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1),
      50,
    );
    const me = getUserId(req);
    const interests = await loadMyHashtagInterests(me);
    const items = await loadTrendingEventsForExplore(
      me,
      limit,
      interests.interestTags,
    );
    res.json(items);
  },
);

router.get(
  "/discovery/explore",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const [blockWall, mutes, following, interests] = await Promise.all([
      loadBlockWall(me),
      loadMyMutes(me),
      loadMyFollowing(me),
      loadMyHashtagInterests(me),
    ]);
    const hidden = new Set<string>([...blockWall, ...mutes]);
    const { ownTags, followedTags, interestTags, mutedTags } = interests;

    const [
      trendingHashtags,
      trendingEvents,
      suggestedRooms,
      peopleToFollow,
      hotInYourHashtags,
      forYouPreviewRows,
    ] = await Promise.all([
      loadTrendingHashtagsForExplore(10, mutedTags),
      loadTrendingEventsForExplore(me, 8, interestTags),
      loadSuggestedRoomsForExplore(
        me,
        8,
        interestTags,
        mutedTags,
        followedTags,
      ),
      loadPeopleToFollowForExplore(me, 8, ownTags, hidden, following),
      loadHotInYourHashtagsHelper(me, 8, interestTags, hidden, mutedTags),
      // For-you preview: a small slice (8) of the existing for-you feed result
      // is computed below by reusing the same scoring logic via an internal
      // fetch-style call would add overhead. Instead we compute a tiny preview
      // inline by reusing trending and recent.
      Promise.resolve([] as unknown[]),
    ]);
    void forYouPreviewRows;

    // Build a small For You preview from already-loaded inputs.
    const previewItems: unknown[] = [];
    for (const h of hotInYourHashtags.slice(0, 4)) {
      previewItems.push({
        kind: "post" as const,
        id: `post-${(h.post as { id: number }).id}`,
        score: h.engagement,
        reason: h.matchedHashtag
          ? `Hot in #${h.matchedHashtag}`
          : "Trending now",
        post: h.post,
        room: null,
        person: null,
      });
    }
    for (const r of suggestedRooms.slice(0, 2)) {
      previewItems.push({
        kind: "room" as const,
        id: `room-${r.tag}`,
        score: r.recentMessages,
        reason: r.isMember ? "Active room you follow" : "Trending room",
        post: null,
        room: r,
        person: null,
      });
    }
    for (const p of peopleToFollow.slice(0, 2)) {
      previewItems.push({
        kind: "person" as const,
        id: `person-${p.id}`,
        score: p.matchScore,
        reason: `${p.sharedHashtags.length} hashtag${p.sharedHashtags.length === 1 ? "" : "s"} in common`,
        post: null,
        room: null,
        person: p,
      });
    }

    res.json({
      trendingHashtags,
      trendingEvents,
      suggestedRooms,
      peopleToFollow,
      hotInYourHashtags,
      forYouPreview: previewItems,
      followedHashtags: followedTags,
    });
  },
);

export default router;
