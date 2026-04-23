import { Router, type IRouter } from "express";
import { db, usersTable, userHashtagsTable } from "@workspace/db";
import { sql, eq, inArray, ne } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { loadFriendStatuses } from "./friends";

const router: IRouter = Router();

router.get("/discover/people", requireAuth, async (req, res): Promise<void> => {
  const limit = Math.min(
    Math.max(parseInt(String(req.query.limit ?? "24"), 10) || 24, 1),
    50,
  );
  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, getUserId(req)));
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
        sql`${userHashtagsTable.tag} IN (${sql.join(myTags.map((t) => sql`${t}`), sql`, `)}) AND ${userHashtagsTable.userId} <> ${getUserId(req)}`,
      )
      .groupBy(userHashtagsTable.userId)
      .orderBy(sql`count(*) DESC`)
      .limit(limit);
    candidateIds = overlap.map((o) => o.userId);
  }

  if (candidateIds.length < limit) {
    const others = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(ne(usersTable.id, getUserId(req)))
      .limit(limit);
    for (const o of others) {
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

  const friendMap = await loadFriendStatuses(getUserId(req), candidateIds);

  const result = users.map((u) => {
    const tags = tagMap.get(u.id) ?? [];
    const shared = tags.filter((t) => myTagSet.has(t));
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      status: u.status,
      featuredHashtag: u.featuredHashtag,
      hashtags: tags,
      sharedHashtags: shared,
      matchScore:
        shared.length * 10 + (tags.length > 0 ? Math.min(tags.length, 5) : 0),
      friendStatus: friendMap.get(u.id) ?? "none",
    };
  });
  result.sort((a, b) => b.matchScore - a.matchScore);
  res.json(result);
});

export default router;
