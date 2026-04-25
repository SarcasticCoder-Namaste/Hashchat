import { Router, type IRouter } from "express";
import {
  db,
  notificationsTable,
  usersTable,
  userHashtagsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { loadBlockWall } from "../lib/relationships";

const router: IRouter = Router();

async function loadActorMatchUsers(myId: string, actorIds: string[]) {
  if (actorIds.length === 0) return new Map<string, unknown>();
  const others = await db
    .select()
    .from(usersTable)
    .where(inArray(usersTable.id, actorIds));
  const tagsRows = await db
    .select()
    .from(userHashtagsTable)
    .where(inArray(userHashtagsTable.userId, actorIds));
  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, myId));
  const myTagSet = new Set(myTagsRows.map((r) => r.tag));
  const otherTags = new Map<string, string[]>();
  for (const r of tagsRows) {
    if (!otherTags.has(r.userId)) otherTags.set(r.userId, []);
    otherTags.get(r.userId)!.push(r.tag);
  }
  const map = new Map<string, unknown>();
  for (const o of others) {
    const tags = otherTags.get(o.id) ?? [];
    const shared = tags.filter((t) => myTagSet.has(t));
    map.set(o.id, {
      id: o.id,
      username: o.username,
      displayName: o.displayName,
      bio: o.bio,
      avatarUrl: o.avatarUrl,
      status: o.status,
      featuredHashtag: o.featuredHashtag,
      discriminator: o.discriminator,
      role: o.role,
      mvpPlan: o.mvpPlan,
      lastSeenAt: o.lastSeenAt.toISOString(),
      hashtags: tags,
      sharedHashtags: shared,
      matchScore: shared.length,
    });
  }
  return map;
}

router.get(
  "/me/notifications",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "30"), 10) || 30, 1),
      100,
    );
    const blockWall = await loadBlockWall(me);
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, me))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);

    const visible = rows.filter((r) => !blockWall.has(r.actorId));
    const actorIds = Array.from(new Set(visible.map((r) => r.actorId)));
    const actorMap = await loadActorMatchUsers(me, actorIds);

    const items = visible
      .map((r) => {
        const actor = actorMap.get(r.actorId);
        if (!actor) return null;
        return {
          id: r.id,
          kind: r.kind,
          actor,
          createdAt: r.createdAt.toISOString(),
          readAt: r.readAt ? r.readAt.toISOString() : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    res.json(items);
  },
);

router.get(
  "/me/notifications/unread-count",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const blockWall = await loadBlockWall(me);
    const blockedIds = Array.from(blockWall);
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, me),
          isNull(notificationsTable.readAt),
          blockedIds.length > 0
            ? sql`${notificationsTable.actorId} NOT IN (${sql.join(
                blockedIds.map((id) => sql`${id}`),
                sql`, `,
              )})`
            : sql`true`,
        ),
      );
    res.json({ count: row?.count ?? 0 });
  },
);

router.post(
  "/me/notifications/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, me),
          isNull(notificationsTable.readAt),
        ),
      );
    res.status(204).end();
  },
);

export default router;
