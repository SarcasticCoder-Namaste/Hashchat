import { Router, type IRouter } from "express";
import {
  db,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { eq, sql, and, desc, inArray, ilike } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";

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
  if (tags.length < limit) {
    const fallback = await db
      .select({
        tag: userHashtagsTable.tag,
        members: sql<number>`count(*)::int`,
      })
      .from(userHashtagsTable)
      .groupBy(userHashtagsTable.tag)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    for (const f of fallback) {
      if (!tags.includes(f.tag)) tags.push(f.tag);
    }
  }
  tags = tags.slice(0, limit);

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

  res.json({
    ...base,
    recentMessages: recent?.count ?? 0,
    isFollowed: (followed?.count ?? 0) > 0,
    topMembers,
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
