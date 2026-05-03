import { Router, type IRouter } from "express";
import {
  db,
  postsTable,
  postHashtagsTable,
  postImpressionsTable,
  postStatsDailyTable,
  postReactionsTable,
  userFollowsTable,
  userFollowerStatsDailyTable,
  hashtagMetricsDailyTable,
  messagesTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  postMediaTable,
  usersTable,
  hashtagsTable,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { getRoomAccess } from "../lib/roomVisibility";
import { RecordPostImpressionBody } from "@workspace/api-zod";

const router: IRouter = Router();

const ALLOWED_KINDS = new Set(["view", "profile_click", "link_click"]);

function parseDays(raw: unknown): number {
  const n = parseInt(String(raw ?? "30"), 10);
  if (n === 90) return 90;
  if (n === 365) return 365;
  return 30;
}

function dayList(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// Build minimal post payloads for analytics top lists.
async function buildTopPosts(
  rows: Array<{
    postId: number;
    impressions: number;
    uniqueViewers: number;
    likes: number;
  }>,
  myUserId: string,
): Promise<unknown[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.postId);
  const posts = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.id, ids));
  const authorIds = Array.from(new Set(posts.map((p) => p.authorId)));
  const authors = authorIds.length
    ? await db
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
        .where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  const tagRows = await db
    .select()
    .from(postHashtagsTable)
    .where(inArray(postHashtagsTable.postId, ids));
  const tagsByPost = new Map<number, string[]>();
  for (const t of tagRows) {
    const list = tagsByPost.get(t.postId) ?? [];
    list.push(t.tag);
    tagsByPost.set(t.postId, list);
  }

  const mediaRows = await db
    .select()
    .from(postMediaTable)
    .where(inArray(postMediaTable.postId, ids))
    .orderBy(postMediaTable.position);
  const mediaByPost = new Map<number, string[]>();
  for (const m of mediaRows) {
    const list = mediaByPost.get(m.postId) ?? [];
    list.push(m.imageUrl);
    mediaByPost.set(m.postId, list);
  }

  const reactionRows = await db
    .select()
    .from(postReactionsTable)
    .where(inArray(postReactionsTable.postId, ids));
  const reactionsByPost = new Map<
    number,
    { emoji: string; count: number; reactedByMe: boolean }[]
  >();
  for (const r of reactionRows) {
    const list = reactionsByPost.get(r.postId) ?? [];
    const existing = list.find((x) => x.emoji === r.emoji);
    if (existing) {
      existing.count += 1;
      if (r.userId === myUserId) existing.reactedByMe = true;
    } else {
      list.push({
        emoji: r.emoji,
        count: 1,
        reactedByMe: r.userId === myUserId,
      });
    }
    reactionsByPost.set(r.postId, list);
  }

  const postMap = new Map(posts.map((p) => [p.id, p]));
  return rows
    .map((r) => {
      const p = postMap.get(r.postId);
      if (!p) return null;
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
          hashtags: tagsByPost.get(p.id) ?? [],
          imageUrls: mediaByPost.get(p.id) ?? [],
          reactions: reactionsByPost.get(p.id) ?? [],
          mentions: [],
          createdAt: p.createdAt.toISOString(),
        },
        impressions: r.impressions,
        uniqueViewers: r.uniqueViewers,
        likes: r.likes,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ---------- POST /posts/:id/impression ----------

router.post(
  "/posts/:id/impression",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = RecordPostImpressionBody.safeParse(req.body ?? {});
    const kind = parsed.success ? (parsed.data.kind ?? "view") : "view";
    if (!ALLOWED_KINDS.has(kind)) {
      res.status(400).json({ error: "Invalid kind" });
      return;
    }
    const me = getUserId(req);
    const [post] = await db
      .select({ id: postsTable.id, authorId: postsTable.authorId, deletedAt: postsTable.deletedAt })
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (!post || post.deletedAt) {
      // Don't 404 - silently succeed so beacons don't spam errors.
      res.status(204).end();
      return;
    }
    // Don't count author's own self-views.
    if (post.authorId === me) {
      res.status(204).end();
      return;
    }
    const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    await db
      .insert(postImpressionsTable)
      .values({ postId: id, viewerId: me, hourBucket, kind })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

// ---------- GET /posts/:id/stats ----------

router.get(
  "/posts/:id/stats",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [post] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (!post || post.deletedAt) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (post.authorId !== me) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    // Live counts from raw post_impressions for accuracy.
    const impressionRows = await db
      .select({
        kind: postImpressionsTable.kind,
        count: sql<number>`count(*)::int`,
        unique: sql<number>`count(distinct ${postImpressionsTable.viewerId})::int`,
      })
      .from(postImpressionsTable)
      .where(eq(postImpressionsTable.postId, id))
      .groupBy(postImpressionsTable.kind);
    let impressions = 0;
    let uniqueViewers = 0;
    let profileClicks = 0;
    let linkClicks = 0;
    for (const r of impressionRows) {
      if (r.kind === "view") {
        impressions = r.count;
        uniqueViewers = r.unique;
      } else if (r.kind === "profile_click") {
        profileClicks = r.count;
      } else if (r.kind === "link_click") {
        linkClicks = r.count;
      }
    }

    const [likeRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(postReactionsTable)
      .where(eq(postReactionsTable.postId, id));
    const likes = likeRow?.count ?? 0;

    // Daily timeline since post creation (cap to 90 days for chart sanity).
    const sinceDate = new Date(
      Math.max(post.createdAt.getTime(), Date.now() - 90 * 86400_000),
    );
    sinceDate.setUTCHours(0, 0, 0, 0);
    const sinceIso = sinceDate.toISOString();

    const dailyRows = await db
      .select({
        kind: postImpressionsTable.kind,
        day: sql<string>`to_char(date_trunc('day', ${postImpressionsTable.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
        unique: sql<number>`count(distinct ${postImpressionsTable.viewerId})::int`,
      })
      .from(postImpressionsTable)
      .where(
        and(
          eq(postImpressionsTable.postId, id),
          sql`${postImpressionsTable.createdAt} >= ${sinceIso}::timestamptz`,
        ),
      )
      .groupBy(
        postImpressionsTable.kind,
        sql`date_trunc('day', ${postImpressionsTable.createdAt} AT TIME ZONE 'UTC')`,
      );

    const dailyLikes = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${postReactionsTable.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(postReactionsTable)
      .where(
        and(
          eq(postReactionsTable.postId, id),
          sql`${postReactionsTable.createdAt} >= ${sinceIso}::timestamptz`,
        ),
      )
      .groupBy(
        sql`date_trunc('day', ${postReactionsTable.createdAt} AT TIME ZONE 'UTC')`,
      );

    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const startDay = sinceDate.toISOString().slice(0, 10);
    const days: string[] = [];
    for (
      let d = new Date(startDay + "T00:00:00Z");
      d.getTime() <= todayUtc.getTime();
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      days.push(d.toISOString().slice(0, 10));
    }
    const map = new Map<
      string,
      {
        impressions: number;
        uniqueViewers: number;
        likes: number;
        profileClicks: number;
        linkClicks: number;
      }
    >();
    for (const day of days) {
      map.set(day, {
        impressions: 0,
        uniqueViewers: 0,
        likes: 0,
        profileClicks: 0,
        linkClicks: 0,
      });
    }
    for (const r of dailyRows) {
      const cur = map.get(r.day);
      if (!cur) continue;
      if (r.kind === "view") {
        cur.impressions = r.count;
        cur.uniqueViewers = r.unique;
      } else if (r.kind === "profile_click") {
        cur.profileClicks = r.count;
      } else if (r.kind === "link_click") {
        cur.linkClicks = r.count;
      }
    }
    for (const r of dailyLikes) {
      const cur = map.get(r.day);
      if (cur) cur.likes = r.count;
    }
    const timeline = days.map((day) => ({ day, ...map.get(day)! }));

    res.json({
      postId: id,
      impressions,
      uniqueViewers,
      likes,
      replies: 0,
      reposts: 0,
      profileClicks,
      linkClicks,
      timeline,
    });
  },
);

// ---------- GET /me/analytics ----------

router.get("/me/analytics", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const days = parseDays(req.query.days);
  const dayKeys = dayList(days);
  const startDay = dayKeys[0];
  const startIso = `${startDay}T00:00:00Z`;

  const [totalFollowersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followeeId, me));
  const totalFollowers = totalFollowersRow?.count ?? 0;

  const [windowFollowersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollowsTable)
    .where(
      and(
        eq(userFollowsTable.followeeId, me),
        sql`${userFollowsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    );
  const followerDelta = windowFollowersRow?.count ?? 0;

  const followerByDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${userFollowsTable.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(userFollowsTable)
    .where(
      and(
        eq(userFollowsTable.followeeId, me),
        sql`${userFollowsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${userFollowsTable.createdAt} AT TIME ZONE 'UTC')`);
  const newByDay = new Map(followerByDay.map((r) => [r.day, r.count]));

  const postByDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${postsTable.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.authorId, me),
        sql`${postsTable.deletedAt} IS NULL`,
        sql`${postsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${postsTable.createdAt} AT TIME ZONE 'UTC')`);
  const postsByDay = new Map(postByDay.map((r) => [r.day, r.count]));

  const impressionByDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${postImpressionsTable.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(postImpressionsTable)
    .innerJoin(postsTable, eq(postsTable.id, postImpressionsTable.postId))
    .where(
      and(
        eq(postsTable.authorId, me),
        eq(postImpressionsTable.kind, "view"),
        sql`${postImpressionsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    )
    .groupBy(sql`date_trunc('day', ${postImpressionsTable.createdAt} AT TIME ZONE 'UTC')`);
  const impByDay = new Map(impressionByDay.map((r) => [r.day, r.count]));

  let runningFollowers = totalFollowers - followerDelta;
  const timeline = dayKeys.map((day) => {
    const newF = newByDay.get(day) ?? 0;
    runningFollowers += newF;
    return {
      day,
      followers: runningFollowers,
      newFollowers: newF,
      posts: postsByDay.get(day) ?? 0,
      impressions: impByDay.get(day) ?? 0,
    };
  });

  const [totalPostsRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postsTable)
    .where(
      and(
        eq(postsTable.authorId, me),
        sql`${postsTable.deletedAt} IS NULL`,
        sql`${postsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    );
  const totalPosts = totalPostsRow?.count ?? 0;

  const [totalImpRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postImpressionsTable)
    .innerJoin(postsTable, eq(postsTable.id, postImpressionsTable.postId))
    .where(
      and(
        eq(postsTable.authorId, me),
        eq(postImpressionsTable.kind, "view"),
        sql`${postImpressionsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    );
  const totalImpressions = totalImpRow?.count ?? 0;

  const [totalLikesRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postReactionsTable)
    .innerJoin(postsTable, eq(postsTable.id, postReactionsTable.postId))
    .where(
      and(
        eq(postsTable.authorId, me),
        sql`${postReactionsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    );
  const totalLikes = totalLikesRow?.count ?? 0;

  const topRows = await db
    .select({
      postId: postImpressionsTable.postId,
      impressions: sql<number>`count(*) filter (where ${postImpressionsTable.kind} = 'view')::int`,
      uniqueViewers: sql<number>`count(distinct ${postImpressionsTable.viewerId}) filter (where ${postImpressionsTable.kind} = 'view')::int`,
    })
    .from(postImpressionsTable)
    .innerJoin(postsTable, eq(postsTable.id, postImpressionsTable.postId))
    .where(
      and(
        eq(postsTable.authorId, me),
        sql`${postsTable.deletedAt} IS NULL`,
        sql`${postImpressionsTable.createdAt} >= ${startIso}::timestamptz`,
      ),
    )
    .groupBy(postImpressionsTable.postId)
    .orderBy(desc(sql`count(*) filter (where ${postImpressionsTable.kind} = 'view')`))
    .limit(5);

  let topPosts: unknown[] = [];
  if (topRows.length > 0) {
    const ids = topRows.map((r) => r.postId);
    const likeRows = await db
      .select({
        postId: postReactionsTable.postId,
        count: sql<number>`count(*)::int`,
      })
      .from(postReactionsTable)
      .where(inArray(postReactionsTable.postId, ids))
      .groupBy(postReactionsTable.postId);
    const likeMap = new Map(likeRows.map((r) => [r.postId, r.count]));
    topPosts = await buildTopPosts(
      topRows.map((r) => ({
        postId: r.postId,
        impressions: r.impressions,
        uniqueViewers: r.uniqueViewers,
        likes: likeMap.get(r.postId) ?? 0,
      })),
      me,
    );
  }

  res.json({
    days,
    totalFollowers,
    followerDelta,
    totalPosts,
    totalImpressions,
    totalLikes,
    timeline,
    topPosts,
  });
});

// ---------- GET /rooms/:tag/analytics ----------

router.get(
  "/rooms/:tag/analytics",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomAccess(tag, me);
    if (!access.canManage) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const days = parseDays(req.query.days);
    const dayKeys = dayList(days);
    const startDay = dayKeys[0];
    const startIso = `${startDay}T00:00:00Z`;

    const [memberRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.tag, tag));
    const [followerRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollowedHashtagsTable)
      .where(eq(userFollowedHashtagsTable.tag, tag));
    const [messageRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.roomTag, tag),
          sql`${messagesTable.deletedAt} IS NULL`,
        ),
      );
    const [postRow] = await db
      .select({ count: sql<number>`count(distinct ${postHashtagsTable.postId})::int` })
      .from(postHashtagsTable)
      .innerJoin(postsTable, eq(postsTable.id, postHashtagsTable.postId))
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          sql`${postsTable.deletedAt} IS NULL`,
        ),
      );

    const dailyRows = await db
      .select({
        day: hashtagMetricsDailyTable.day,
        messages: hashtagMetricsDailyTable.messages,
        posts: hashtagMetricsDailyTable.posts,
        newMembers: hashtagMetricsDailyTable.newMembers,
      })
      .from(hashtagMetricsDailyTable)
      .where(
        and(
          eq(hashtagMetricsDailyTable.tag, tag),
          gte(hashtagMetricsDailyTable.day, startDay),
        ),
      );
    const byDay = new Map(dailyRows.map((r) => [r.day, r]));

    const impByDay = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${postImpressionsTable.createdAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(postImpressionsTable)
      .innerJoin(
        postHashtagsTable,
        eq(postHashtagsTable.postId, postImpressionsTable.postId),
      )
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          eq(postImpressionsTable.kind, "view"),
          sql`${postImpressionsTable.createdAt} >= ${startIso}::timestamptz`,
        ),
      )
      .groupBy(sql`date_trunc('day', ${postImpressionsTable.createdAt} AT TIME ZONE 'UTC')`);
    const impMap = new Map(impByDay.map((r) => [r.day, r.count]));

    const timeline = dayKeys.map((day) => {
      const m = byDay.get(day);
      return {
        day,
        messages: m?.messages ?? 0,
        posts: m?.posts ?? 0,
        newMembers: m?.newMembers ?? 0,
        impressions: impMap.get(day) ?? 0,
      };
    });

    let totalImpressions = 0;
    for (const t of timeline) totalImpressions += t.impressions;

    const topRows = await db
      .select({
        postId: postImpressionsTable.postId,
        impressions: sql<number>`count(*) filter (where ${postImpressionsTable.kind} = 'view')::int`,
        uniqueViewers: sql<number>`count(distinct ${postImpressionsTable.viewerId}) filter (where ${postImpressionsTable.kind} = 'view')::int`,
      })
      .from(postImpressionsTable)
      .innerJoin(
        postHashtagsTable,
        eq(postHashtagsTable.postId, postImpressionsTable.postId),
      )
      .innerJoin(postsTable, eq(postsTable.id, postImpressionsTable.postId))
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          sql`${postsTable.deletedAt} IS NULL`,
          sql`${postImpressionsTable.createdAt} >= ${startIso}::timestamptz`,
        ),
      )
      .groupBy(postImpressionsTable.postId)
      .orderBy(desc(sql`count(*) filter (where ${postImpressionsTable.kind} = 'view')`))
      .limit(5);

    let topPosts: unknown[] = [];
    if (topRows.length > 0) {
      const ids = topRows.map((r) => r.postId);
      const likeRows = await db
        .select({
          postId: postReactionsTable.postId,
          count: sql<number>`count(*)::int`,
        })
        .from(postReactionsTable)
        .where(inArray(postReactionsTable.postId, ids))
        .groupBy(postReactionsTable.postId);
      const likeMap = new Map(likeRows.map((r) => [r.postId, r.count]));
      topPosts = await buildTopPosts(
        topRows.map((r) => ({
          postId: r.postId,
          impressions: r.impressions,
          uniqueViewers: r.uniqueViewers,
          likes: likeMap.get(r.postId) ?? 0,
        })),
        me,
      );
    }

    // Make sure tag exists so the response makes sense (silently no-op upsert).
    await db
      .insert(hashtagsTable)
      .values({ tag })
      .onConflictDoNothing();

    res.json({
      tag,
      days,
      memberCount: memberRow?.count ?? 0,
      followerCount: followerRow?.count ?? 0,
      messageCount: messageRow?.count ?? 0,
      postCount: postRow?.count ?? 0,
      totalImpressions,
      timeline,
      topPosts,
    });
  },
);

export default router;
