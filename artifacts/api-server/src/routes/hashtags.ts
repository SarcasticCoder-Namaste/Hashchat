import { Router, type IRouter } from "express";
import {
  db,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  messagesTable,
  usersTable,
  hashtagMetricsDailyTable,
  postsTable,
  postHashtagsTable,
} from "@workspace/db";
import { eq, sql, and, desc, inArray, ilike, gte } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import {
  loadPrivateTags,
  loadMyRoomMemberships,
  getRoomAccess,
} from "../lib/roomVisibility";

const router: IRouter = Router();

async function buildHashtagRow(tag: string) {
  const [member] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.tag, tag));
  const [follower] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.tag, tag));
  const [message] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(eq(messagesTable.roomTag, tag));
  return {
    tag,
    memberCount: member?.count ?? 0,
    followerCount: follower?.count ?? 0,
    messageCount: message?.count ?? 0,
  };
}

router.get("/hashtags/trending", async (req, res): Promise<void> => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 50);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await db
    .select({
      tag: messagesTable.roomTag,
      recent: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(and(sql`${messagesTable.roomTag} IS NOT NULL`, sql`${messagesTable.createdAt} >= ${since}`))
    .groupBy(messagesTable.roomTag)
    .orderBy(desc(sql`count(*)`))
    .limit(limit * 2);

  let tags = recent.map((r) => r.tag).filter((t): t is string => !!t);
  if (tags.length < limit * 2) {
    const fallback = await db
      .select({
        tag: userHashtagsTable.tag,
        members: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(limit * 2);
    for (const f of fallback) {
      if (!tags.includes(f.tag)) tags.push(f.tag);
    }
  }
  // Filter out private rooms from trending
  const privateTags = await loadPrivateTags(tags);
  tags = tags.filter((t) => !privateTags.has(t)).slice(0, limit);

  const recentMap = new Map(recent.map((r) => [r.tag!, r.recent]));
  const rows = await Promise.all(tags.map(buildHashtagRow));
  const result = rows.map((row) => {
    const recentMessages = recentMap.get(row.tag) ?? 0;
    return {
      ...row,
      recentMessages,
      score:
        recentMessages * 3 +
        row.memberCount * 1.5 +
        row.followerCount +
        row.messageCount * 0.2,
    };
  });
  result.sort((a, b) => b.score - a.score);
  res.json(result);
});

router.get("/hashtags/suggestions", requireAuth, async (req, res): Promise<void> => {
  const myTags = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, getUserId(req)));
  const myTagList = myTags.map((t) => t.tag);

  let candidates: string[] = [];
  if (myTagList.length > 0) {
    const peers = await db
      .selectDistinct({ userId: userHashtagsTable.userId })
      .from(userHashtagsTable)
      .where(
        and(
          inArray(userHashtagsTable.tag, myTagList),
          sql`${userHashtagsTable.userId} <> ${getUserId(req)}`,
        ),
      );
    const peerIds = peers.map((p) => p.userId);
    if (peerIds.length > 0) {
      const peerTags = await db
        .select({
          tag: userHashtagsTable.tag,
          count: sql<number>`count(*)::int`,
        })
        .from(userHashtagsTable)
        .where(
          and(
            inArray(userHashtagsTable.userId, peerIds),
            sql`${userHashtagsTable.tag} NOT IN (${sql.join(myTagList.map((t) => sql`${t}`), sql`, `)})`,
          ),
        )
        .groupBy(userHashtagsTable.tag)
        .orderBy(desc(sql`count(*)`))
        .limit(12);
      candidates = peerTags.map((p) => p.tag);
    }
  }

  if (candidates.length < 12) {
    const popular = await db
      .select({
        tag: userHashtagsTable.tag,
        count: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    for (const p of popular) {
      if (!candidates.includes(p.tag) && !myTagList.includes(p.tag)) {
        candidates.push(p.tag);
      }
      if (candidates.length >= 12) break;
    }
  }

  const rows = await Promise.all(candidates.slice(0, 12).map(buildHashtagRow));
  res.json(rows);
});

router.get("/hashtags/search", async (req, res): Promise<void> => {
  const q = normalizeTag(String(req.query.q ?? ""));
  let tags: { tag: string }[];
  if (q) {
    tags = await db
      .select({ tag: hashtagsTable.tag })
      .from(hashtagsTable)
      .where(ilike(hashtagsTable.tag, `${q}%`))
      .limit(20);
  } else {
    tags = await db.select({ tag: hashtagsTable.tag }).from(hashtagsTable).limit(20);
  }
  const rows = await Promise.all(tags.map((t) => buildHashtagRow(t.tag)));
  res.json(rows);
});

router.get(
  "/hashtags/:tag/analytics",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.tag)
      ? req.params.tag[0]
      : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const days = Math.min(
      Math.max(parseInt(String(req.query.days ?? "14"), 10) || 14, 7),
      90,
    );
    const me = getUserId(req);

    const [base, rawTotalFollowers] = await Promise.all([
      buildHashtagRow(tag),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userFollowedHashtagsTable)
        .where(eq(userFollowedHashtagsTable.tag, tag)),
    ]);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.roomTag, tag),
          sql`${messagesTable.createdAt} >= ${since}`,
        ),
      );
    const [followed] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollowedHashtagsTable)
      .where(
        and(
          eq(userFollowedHashtagsTable.tag, tag),
          eq(userFollowedHashtagsTable.userId, me),
        ),
      );
    const [postCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postHashtagsTable)
      .where(eq(postHashtagsTable.tag, tag));

    const metrics = await db
      .select()
      .from(hashtagMetricsDailyTable)
      .where(eq(hashtagMetricsDailyTable.tag, tag))
      .orderBy(hashtagMetricsDailyTable.day);
    const byDay = new Map(metrics.map((m) => [m.day, m]));

    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const dayKeys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      dayKeys.push(d.toISOString().slice(0, 10));
    }

    let cumFollowersBefore = 0;
    for (const m of metrics) {
      if (m.day < dayKeys[0]) cumFollowersBefore += m.newFollowers ?? 0;
    }
    const timeline = dayKeys.map((day) => {
      const m = byDay.get(day);
      const newFollowers = m?.newFollowers ?? 0;
      cumFollowersBefore += newFollowers;
      return {
        day,
        posts: m?.posts ?? 0,
        messages: m?.messages ?? 0,
        newMembers: m?.newMembers ?? 0,
        newFollowers,
        cumulativeFollowers: cumFollowersBefore,
      };
    });

    if (timeline.length > 0) {
      const last = timeline[timeline.length - 1];
      if (last.day === todayKey) {
        const todaySince = new Date(`${todayKey}T00:00:00Z`);
        const [todayMsgs, todayPosts, todayMembers, todayFollowers] =
          await Promise.all([
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(messagesTable)
              .where(
                and(
                  eq(messagesTable.roomTag, tag),
                  sql`${messagesTable.createdAt} >= ${todaySince}`,
                  sql`${messagesTable.deletedAt} IS NULL`,
                ),
              ),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(postsTable)
              .innerJoin(
                postHashtagsTable,
                eq(postHashtagsTable.postId, postsTable.id),
              )
              .where(
                and(
                  eq(postHashtagsTable.tag, tag),
                  sql`${postsTable.createdAt} >= ${todaySince}`,
                  sql`${postsTable.deletedAt} IS NULL`,
                ),
              ),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(userHashtagsTable)
              .where(
                and(
                  eq(userHashtagsTable.tag, tag),
                  sql`${userHashtagsTable.createdAt} >= ${todaySince}`,
                ),
              ),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(userFollowedHashtagsTable)
              .where(
                and(
                  eq(userFollowedHashtagsTable.tag, tag),
                  sql`${userFollowedHashtagsTable.createdAt} >= ${todaySince}`,
                ),
              ),
          ]);
        const liveMsgs = todayMsgs[0]?.count ?? 0;
        const livePosts = todayPosts[0]?.count ?? 0;
        const liveMembers = todayMembers[0]?.count ?? 0;
        const liveFollowers = todayFollowers[0]?.count ?? 0;

        last.messages = Math.max(last.messages, liveMsgs);
        last.posts = Math.max(last.posts, livePosts);
        const followerDelta = Math.max(0, liveFollowers - last.newFollowers);
        last.newMembers = Math.max(last.newMembers, liveMembers);
        last.newFollowers = Math.max(last.newFollowers, liveFollowers);
        last.cumulativeFollowers += followerDelta;
      }
    }

    const sinceWindow = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const contribMsgs = await db
      .select({
        userId: messagesTable.senderId,
        n: sql<number>`count(*)::int`,
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.roomTag, tag),
          sql`${messagesTable.deletedAt} IS NULL`,
          sql`${messagesTable.createdAt} >= ${sinceWindow}`,
        ),
      )
      .groupBy(messagesTable.senderId)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const contribPosts = await db
      .select({
        userId: postsTable.authorId,
        n: sql<number>`count(*)::int`,
      })
      .from(postsTable)
      .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          sql`${postsTable.deletedAt} IS NULL`,
          sql`${postsTable.createdAt} >= ${sinceWindow}`,
        ),
      )
      .groupBy(postsTable.authorId)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const contribMap = new Map<string, { messages: number; posts: number }>();
    for (const c of contribMsgs) {
      contribMap.set(c.userId, {
        messages: c.n,
        posts: contribMap.get(c.userId)?.posts ?? 0,
      });
    }
    for (const c of contribPosts) {
      const cur = contribMap.get(c.userId) ?? { messages: 0, posts: 0 };
      contribMap.set(c.userId, { messages: cur.messages, posts: c.n });
    }
    const contribIds = Array.from(contribMap.keys());

    let topContributors: Array<{
      user: Record<string, unknown>;
      messageCount: number;
      postCount: number;
    }> = [];
    if (contribIds.length > 0) {
      const users = await db
        .select()
        .from(usersTable)
        .where(inArray(usersTable.id, contribIds));
      const userMap = new Map(users.map((u) => [u.id, u]));
      const allTagsRows = await db
        .select({ userId: userHashtagsTable.userId, tag: userHashtagsTable.tag })
        .from(userHashtagsTable)
        .where(inArray(userHashtagsTable.userId, contribIds));
      const tagMap = new Map<string, string[]>();
      for (const r of allTagsRows) {
        if (!tagMap.has(r.userId)) tagMap.set(r.userId, []);
        tagMap.get(r.userId)!.push(r.tag);
      }
      const myTagsRows = await db
        .select({ tag: userHashtagsTable.tag })
        .from(userHashtagsTable)
        .where(eq(userHashtagsTable.userId, me));
      const myTagSet = new Set(myTagsRows.map((r) => r.tag));
      topContributors = contribIds
        .map((id) => {
          const u = userMap.get(id);
          if (!u) return null;
          const stats = contribMap.get(id)!;
          const tags = tagMap.get(id) ?? [];
          const shared = tags.filter((t) => myTagSet.has(t));
          return {
            user: {
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
              matchScore: shared.length,
            },
            messageCount: stats.messages,
            postCount: stats.posts,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort(
          (a, b) =>
            b.messageCount + b.postCount * 2 - (a.messageCount + a.postCount * 2),
        )
        .slice(0, 8);
    }

    let related: string[] = [];
    const memberIds = await db
      .select({ userId: userHashtagsTable.userId })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.tag, tag))
      .limit(200);
    const ids = memberIds.map((m) => m.userId);
    if (ids.length > 0) {
      const relatedRows = await db
        .select({
          tag: userHashtagsTable.tag,
          count: sql<number>`count(*)::int`,
        })
        .from(userHashtagsTable)
        .where(
          and(
            inArray(userHashtagsTable.userId, ids),
            sql`${userHashtagsTable.tag} <> ${tag}`,
          ),
        )
        .groupBy(userHashtagsTable.tag)
        .orderBy(desc(sql`count(*)`))
        .limit(8);
      related = relatedRows.map((r) => r.tag);
    }

    res.json({
      tag,
      memberCount: base.memberCount,
      followerCount: rawTotalFollowers[0]?.count ?? 0,
      messageCount: base.messageCount,
      postCount: postCountRow?.count ?? 0,
      recentMessages: recent?.count ?? 0,
      days,
      timeline,
      topContributors,
      relatedHashtags: related,
      isFollowed: (followed?.count ?? 0) > 0,
    });
  },
);

router.get("/hashtags/:tag", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const base = await buildHashtagRow(tag);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(and(eq(messagesTable.roomTag, tag), sql`${messagesTable.createdAt} >= ${since}`));
  const [followed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollowedHashtagsTable)
    .where(
      and(
        eq(userFollowedHashtagsTable.tag, tag),
        eq(userFollowedHashtagsTable.userId, getUserId(req)),
      ),
    );

  const memberRows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      bio: usersTable.bio,
      avatarUrl: usersTable.avatarUrl,
      status: usersTable.status,
      featuredHashtag: usersTable.featuredHashtag,
      discriminator: usersTable.discriminator,
      role: usersTable.role,
      mvpPlan: usersTable.mvpPlan,
      verified: usersTable.verified,
      lastSeenAt: usersTable.lastSeenAt,
    })
    .from(userHashtagsTable)
    .innerJoin(usersTable, eq(userHashtagsTable.userId, usersTable.id))
    .where(eq(userHashtagsTable.tag, tag))
    .limit(8);

  const memberIds = memberRows.map((m) => m.id);
  const memberTagMap = new Map<string, string[]>();
  if (memberIds.length > 0) {
    const allTags = await db
      .select({ userId: userHashtagsTable.userId, tag: userHashtagsTable.tag })
      .from(userHashtagsTable)
      .where(inArray(userHashtagsTable.userId, memberIds));
    for (const r of allTags) {
      if (!memberTagMap.has(r.userId)) memberTagMap.set(r.userId, []);
      memberTagMap.get(r.userId)!.push(r.tag);
    }
  }

  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, getUserId(req)));
  const myTagSet = new Set(myTagsRows.map((r) => r.tag));

  const topMembers = memberRows.map((m) => {
    const tags = memberTagMap.get(m.id) ?? [];
    const shared = tags.filter((t) => myTagSet.has(t));
    return {
      id: m.id,
      username: m.username,
      displayName: m.displayName,
      bio: m.bio,
      avatarUrl: m.avatarUrl,
      status: m.status,
      featuredHashtag: m.featuredHashtag,
      discriminator: m.discriminator,
      role: m.role,
      mvpPlan: m.mvpPlan,
      verified: m.verified,
      lastSeenAt: (m.lastSeenAt ?? new Date(0)).toISOString(),
      hashtags: tags,
      sharedHashtags: shared,
      matchScore: shared.length,
    };
  });

  let related: string[] = [];
  if (memberIds.length > 0) {
    const relatedRows = await db
      .select({
        tag: userHashtagsTable.tag,
        count: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .where(
        and(
          inArray(userHashtagsTable.userId, memberIds),
          sql`${userHashtagsTable.tag} <> ${tag}`,
        ),
      )
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(6);
    related = relatedRows.map((r) => r.tag);
  }

  const access = await getRoomAccess(tag, getUserId(req));
  res.json({
    ...base,
    recentMessages: recent?.count ?? 0,
    isFollowed: (followed?.count ?? 0) > 0,
    isPrivate: access.isPrivate,
    isMember: access.isMember,
    ownerId: access.ownerId,
    topMembers: access.isPrivate && !access.isMember ? [] : topMembers,
    relatedHashtags: related,
  });
});

router.post("/hashtags/:tag/follow", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  if (!tag) {
    res.status(400).json({ error: "Invalid tag" });
    return;
  }
  await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  await db
    .insert(userFollowedHashtagsTable)
    .values({ userId: getUserId(req), tag })
    .onConflictDoNothing();
  res.status(204).end();
});

router.delete("/hashtags/:tag/follow", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
  const tag = normalizeTag(raw);
  await db
    .delete(userFollowedHashtagsTable)
    .where(
      and(
        eq(userFollowedHashtagsTable.userId, getUserId(req)),
        eq(userFollowedHashtagsTable.tag, tag),
      ),
    );
  res.status(204).end();
});

export default router;
