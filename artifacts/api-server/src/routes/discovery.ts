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
  presenceStateFor,
  publicCurrentRoom,
  publicLastSeenAt,
} from "../lib/presence";
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
      lastSeenAt: publicLastSeenAt(u.lastSeenAt, u.hidePresence),
      presenceState: presenceStateFor(u.lastSeenAt, u.hidePresence),
      currentRoomTag: publicCurrentRoom(u.currentRoomTag, u.lastSeenAt, u.hidePresence),
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
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
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

  // ---- Per-user behavioral signals (last 30 days) ----
  const signalsSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Posts I've reacted to → infer affinity for their authors and their tags.
  const myReactionRows = await db
    .select({ postId: postReactionsTable.postId })
    .from(postReactionsTable)
    .where(
      and(
        eq(postReactionsTable.userId, me),
        gte(postReactionsTable.createdAt, signalsSince),
      ),
    );
  const reactedPostIds = Array.from(new Set(myReactionRows.map((r) => r.postId)));
  const affinityAuthors = new Map<string, number>();
  const affinityTags = new Map<string, number>();
  if (reactedPostIds.length > 0) {
    const [authorRows, tagRows] = await Promise.all([
      db
        .select({ authorId: postsTable.authorId })
        .from(postsTable)
        .where(inArray(postsTable.id, reactedPostIds)),
      db
        .select({ tag: postHashtagsTable.tag })
        .from(postHashtagsTable)
        .where(inArray(postHashtagsTable.postId, reactedPostIds)),
    ]);
    for (const a of authorRows) {
      affinityAuthors.set(a.authorId, (affinityAuthors.get(a.authorId) ?? 0) + 1);
    }
    for (const t of tagRows) {
      if (mutedTags.has(t.tag)) continue;
      affinityTags.set(t.tag, (affinityTags.get(t.tag) ?? 0) + 1);
    }
  }

  // Replies I've sent (in rooms) → recent room visits + author affinity.
  const myMsgRows = await db
    .select({
      roomTag: messagesTable.roomTag,
      replyToId: messagesTable.replyToId,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.senderId, me),
        gte(messagesTable.createdAt, signalsSince),
      ),
    );
  const visitedRooms = new Map<string, number>();
  const replyTargetIds: number[] = [];
  for (const m of myMsgRows) {
    if (m.roomTag && !mutedTags.has(m.roomTag)) {
      visitedRooms.set(m.roomTag, (visitedRooms.get(m.roomTag) ?? 0) + 1);
    }
    if (m.replyToId) replyTargetIds.push(m.replyToId);
  }
  const recentReplies = replyTargetIds.length;
  if (replyTargetIds.length > 0) {
    const repliedTo = await db
      .select({ senderId: messagesTable.senderId })
      .from(messagesTable)
      .where(inArray(messagesTable.id, replyTargetIds));
    for (const r of repliedTo) {
      if (r.senderId === me) continue;
      affinityAuthors.set(r.senderId, (affinityAuthors.get(r.senderId) ?? 0) + 2);
    }
  }

  // Combine candidate tags: explicit interest tags + inferred affinity tags.
  const candidateTagSet = new Set<string>(interestTags);
  for (const t of affinityTags.keys()) candidateTagSet.add(t);
  const candidateTags = Array.from(candidateTagSet);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let candidatePosts: Array<{
    id: number;
    authorId: string;
    matchedTags: number;
    fromFollow: number;
  }> = [];

  const fetchHorizon = (offset + limit) * 2 + 20;
  if (candidateTags.length > 0) {
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
          inArray(postHashtagsTable.tag, candidateTags),
          sql`${postsTable.deletedAt} IS NULL`,
          sql`${postsTable.createdAt} >= ${since}`,
        ),
      )
      .groupBy(postsTable.id, postsTable.authorId)
      .orderBy(desc(postsTable.createdAt))
      .limit(fetchHorizon);
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
      .limit(fetchHorizon);
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
  // Authors I have affinity with (reactions/replies) — pull their recent posts.
  const affinityAuthorIds = Array.from(affinityAuthors.keys()).filter(
    (id) => id !== me && !hidden.has(id),
  );
  if (affinityAuthorIds.length > 0) {
    const rows = await db
      .select({ id: postsTable.id, authorId: postsTable.authorId })
      .from(postsTable)
      .where(
        and(
          inArray(postsTable.authorId, affinityAuthorIds),
          sql`${postsTable.deletedAt} IS NULL`,
          sql`${postsTable.createdAt} >= ${since}`,
        ),
      )
      .orderBy(desc(postsTable.createdAt))
      .limit(fetchHorizon);
    for (const r of rows) {
      if (!candidatePosts.find((c) => c.id === r.id)) {
        candidatePosts.push({
          id: r.id,
          authorId: r.authorId,
          matchedTags: 0,
          fromFollow: following.has(r.authorId) ? 1 : 0,
        });
      }
    }
  }
  candidatePosts = candidatePosts.filter(
    (c) => !hidden.has(c.authorId) && c.authorId !== me,
  );

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
        const authorAffinity = affinityAuthors.get(r.authorId) ?? 0;
        const tagAffinity = tags.reduce(
          (acc, t) => acc + (affinityTags.get(t) ?? 0),
          0,
        );
        const score =
          cand.matchedTags * 5 +
          cand.fromFollow * 8 +
          recency * 6 +
          Math.min(authorAffinity, 6) * 3 +
          Math.min(tagAffinity, 8) * 1.5;
        const matchedTagsList = tags.filter((t) => interestTags.includes(t));
        const affinityTagMatch = tags.find((t) => affinityTags.has(t));
        const reason = cand.fromFollow
          ? `From ${a?.displayName ?? "someone"} you follow`
          : authorAffinity > 0
            ? `${a?.displayName ?? "Someone"} you've engaged with`
            : matchedTagsList.length > 0
              ? `Because you like #${matchedTagsList[0]}`
              : affinityTagMatch
                ? `You've reacted to #${affinityTagMatch}`
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
  {
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
      .limit(30);
    const followedSet = new Set(followedTags);
    const interestSet = new Set(interestTags);
    const visitedSet = new Set(visitedRooms.keys());
    const candidatePool = new Set<string>();
    for (const r of rooms) {
      if (r.tag && !mutedTags.has(r.tag)) candidatePool.add(r.tag);
    }
    for (const t of visitedSet) candidatePool.add(t);
    for (const t of interestSet) candidatePool.add(t);
    const filtered = Array.from(candidatePool).slice(0, 16);

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
      const recentMap = new Map(
        rooms.filter((r) => r.tag).map((r) => [r.tag!, r.recent]),
      );
      roomItems = filtered.map((tag) => {
        const isInterest = interestSet.has(tag);
        const visits = visitedRooms.get(tag) ?? 0;
        const isFollowed = followedSet.has(tag);
        const score =
          (recentMap.get(tag) ?? 0) * 1 +
          (memberMap.get(tag) ?? 0) * 0.4 +
          (isInterest ? 4 : 0) +
          Math.min(visits, 10) * 2 +
          (isFollowed ? 3 : 0);
        const reason = visits > 0
          ? `You've been chatting in #${tag}`
          : isFollowed
            ? `Active room you follow`
            : isInterest
              ? `Matches your hashtags`
              : `Trending right now`;
        return {
          kind: "room" as const,
          id: `room-${tag}`,
          score,
          reason,
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
  {
    const overlap = myTags.length > 0
      ? await db
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
          .limit(20)
      : [];
    // Mix in users I've engaged with (replies/reactions) but don't already follow.
    const engagedIds = Array.from(affinityAuthors.keys()).filter(
      (id) => id !== me && !hidden.has(id) && !following.has(id),
    );
    // Mix in fellow members of rooms I've recently visited.
    let coVisitorIds: string[] = [];
    if (visitedRooms.size > 0) {
      const visitedTags = Array.from(visitedRooms.keys());
      const coVisitorRows = await db
        .select({
          userId: messagesTable.senderId,
          n: sql<number>`count(*)::int`,
        })
        .from(messagesTable)
        .where(
          and(
            inArray(messagesTable.roomTag, visitedTags),
            gte(messagesTable.createdAt, signalsSince),
            ne(messagesTable.senderId, me),
          ),
        )
        .groupBy(messagesTable.senderId)
        .orderBy(desc(sql`count(*)`))
        .limit(20);
      coVisitorIds = coVisitorRows
        .map((r) => r.userId)
        .filter((id) => !hidden.has(id) && !following.has(id));
    }
    const personIds = Array.from(
      new Set([
        ...engagedIds,
        ...coVisitorIds,
        ...overlap
          .map((o) => o.userId)
          .filter((id) => !hidden.has(id) && !following.has(id)),
      ]),
    ).slice(0, 12);
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
      const coVisitorSet = new Set(coVisitorIds);
      peopleItems = users.map((u) => {
        const tags = tagMap.get(u.id) ?? [];
        const shared = tags.filter((t) => myTagSet.has(t));
        const flags = socialMap.get(u.id);
        const overlapScore = overlapMap.get(u.id) ?? 0;
        const engaged = affinityAuthors.get(u.id) ?? 0;
        const coVisited = coVisitorSet.has(u.id);
        const score =
          overlapScore * 4 +
          engaged * 5 +
          (coVisited ? 4 : 0) +
          2;
        const reason = engaged > 0
          ? `You've engaged with ${u.displayName}`
          : coVisited
            ? `Active in rooms you visit`
            : `${shared.length} hashtag${shared.length === 1 ? "" : "s"} in common`;
        return {
          kind: "person" as const,
          id: `person-${u.id}`,
          score,
          reason,
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
            lastSeenAt: publicLastSeenAt(u.lastSeenAt ?? new Date(0), u.hidePresence),
            presenceState: presenceStateFor(u.lastSeenAt ?? new Date(0), u.hidePresence),
            currentRoomTag: publicCurrentRoom(u.currentRoomTag, u.lastSeenAt ?? new Date(0), u.hidePresence),
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

  // Build a fully-ranked, interleaved list (cap to a reasonable horizon)
  // so we can paginate by offset.
  const MAX_RANK = Math.max(offset + limit, 200);
  const ranked: Item[] = [];
  let lastRoomAt = -10;
  let lastPersonAt = -10;
  for (const item of all) {
    if (ranked.length >= MAX_RANK) break;
    if (item.kind === "room" && ranked.length - lastRoomAt < 3 && ranked.length > 0) {
      continue;
    }
    if (item.kind === "person" && ranked.length - lastPersonAt < 4 && ranked.length > 0) {
      continue;
    }
    ranked.push(item);
    if (item.kind === "room") lastRoomAt = ranked.length;
    if (item.kind === "person") lastPersonAt = ranked.length;
  }
  if (ranked.length < MAX_RANK) {
    for (const item of all) {
      if (ranked.length >= MAX_RANK) break;
      if (!ranked.find((r) => r.id === item.id)) ranked.push(item);
    }
  }

  const total = ranked.length;
  const slice = ranked.slice(offset, offset + limit);
  const nextOffset = offset + slice.length < total ? offset + slice.length : null;

  res.json({
    items: slice,
    nextOffset,
    total,
    signals: {
      ownHashtags: myTags.length,
      followedHashtags: followedTags.length,
      following: following.size,
      recentReactions: reactedPostIds.length,
      recentReplies,
      recentRoomVisits: visitedRooms.size,
    },
  });
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
      lastSeenAt: publicLastSeenAt(u.lastSeenAt, u.hidePresence),
      presenceState: presenceStateFor(u.lastSeenAt, u.hidePresence),
      currentRoomTag: publicCurrentRoom(u.currentRoomTag, u.lastSeenAt, u.hidePresence),
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
