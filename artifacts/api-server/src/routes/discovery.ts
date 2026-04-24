import { Router, type IRouter } from "express";
import { db, usersTable, userHashtagsTable } from "@workspace/db";
import { sql, eq, inArray, ne } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { loadFriendStatuses } from "./friends";
import {
  loadBlockWall,
  loadMyMutes,
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

export default router;
