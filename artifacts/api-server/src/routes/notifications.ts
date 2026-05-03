import { Router, type IRouter } from "express";
import {
  db,
  notificationsTable,
  notificationMutesTable,
  hashtagsTable,
  usersTable,
  conversationMembersTable,
  conversationReadsTable,
  messagesTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { buildHref } from "../lib/notifications";
import { normalizeTag } from "../lib/hashtags";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const limitRaw = parseInt(String(req.query.limit ?? "50"), 10);
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 50 : limitRaw, 1), 100);

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.recipientId, me))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  const actorIds = Array.from(
    new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v)),
  );
  const actorRows = actorIds.length
    ? await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, actorIds))
    : [];
  const actorMap = new Map(actorRows.map((a) => [a.id, a]));

  const items = rows.map((r) => {
    const actor = r.actorId ? actorMap.get(r.actorId) : null;
    return {
      id: r.id,
      kind: r.kind,
      actor: actor
        ? {
            id: actor.id,
            username: actor.username,
            displayName: actor.displayName,
            avatarUrl: actor.avatarUrl,
          }
        : null,
      targetType: r.targetType,
      targetId: r.targetId,
      targetTextId: r.targetTextId,
      snippet: r.snippet,
      href: buildHref(r.targetType, r.targetId, r.targetTextId),
      readAt: r.readAt ? r.readAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.recipientId, me),
        isNull(notificationsTable.readAt),
      ),
    );

  res.json({ items, unreadCount: unread?.count ?? 0 });
});

router.get(
  "/notifications/unread-count",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);

    const [n] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.recipientId, me),
          isNull(notificationsTable.readAt),
        ),
      );

    // Compute DM badge: number of conversations with unread messages from
    // someone other than me. Includes both direct and group conversations.
    const memberships = await db
      .select({ conversationId: conversationMembersTable.conversationId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.userId, me));
    let dms = 0;
    if (memberships.length > 0) {
      const myMemberRows = await db
        .select({
          conversationId: conversationMembersTable.conversationId,
          mutedAt: conversationMembersTable.mutedAt,
        })
        .from(conversationMembersTable)
        .where(eq(conversationMembersTable.userId, me));
      const convoIds = myMemberRows
        .filter((r) => r.mutedAt === null)
        .map((r) => r.conversationId);
      const reads = convoIds.length
        ? await db
            .select()
            .from(conversationReadsTable)
            .where(
              and(
                eq(conversationReadsTable.userId, me),
                inArray(conversationReadsTable.conversationId, convoIds),
              ),
            )
        : [];
      const readMap = new Map(reads.map((r) => [r.conversationId, r.lastReadAt]));
      for (const cid of convoIds) {
        const lastReadAt = readMap.get(cid) ?? new Date(0);
        const [u] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.conversationId, cid),
              ne(messagesTable.senderId, me),
              gt(messagesTable.createdAt, lastReadAt),
            ),
          );
        if ((u?.count ?? 0) > 0) dms += 1;
      }
    }

    const notifications = n?.count ?? 0;
    res.json({ notifications, dms, total: notifications + dms });
  },
);

router.post(
  "/notifications/read-all",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.recipientId, me),
          isNull(notificationsTable.readAt),
        ),
      );
    res.status(204).end();
  },
);

router.post(
  "/notifications/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, id),
          eq(notificationsTable.recipientId, me),
        ),
      );
    res.status(204).end();
  },
);

// ----- Notification mutes -----

router.get(
  "/notifications/mutes",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const rows = await db
      .select({
        sourceType: notificationMutesTable.sourceType,
        sourceKey: notificationMutesTable.sourceKey,
      })
      .from(notificationMutesTable)
      .where(eq(notificationMutesTable.userId, me));
    const users: string[] = [];
    const hashtags: string[] = [];
    for (const r of rows) {
      if (r.sourceType === "user") users.push(r.sourceKey);
      else if (r.sourceType === "hashtag") hashtags.push(r.sourceKey);
    }
    res.json({ users, hashtags });
  },
);

router.post(
  "/notifications/mutes/users/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    if (!otherId || otherId === me) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const [exists] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, otherId))
      .limit(1);
    if (!exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await db
      .insert(notificationMutesTable)
      .values({ userId: me, sourceType: "user", sourceKey: otherId })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

router.delete(
  "/notifications/mutes/users/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const otherId = String(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
    );
    await db
      .delete(notificationMutesTable)
      .where(
        and(
          eq(notificationMutesTable.userId, me),
          eq(notificationMutesTable.sourceType, "user"),
          eq(notificationMutesTable.sourceKey, otherId),
        ),
      );
    res.status(204).end();
  },
);

router.post(
  "/notifications/mutes/hashtags/:tag",
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
      .insert(notificationMutesTable)
      .values({ userId: me, sourceType: "hashtag", sourceKey: tag })
      .onConflictDoNothing();
    res.status(204).end();
  },
);

router.delete(
  "/notifications/mutes/hashtags/:tag",
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
      .delete(notificationMutesTable)
      .where(
        and(
          eq(notificationMutesTable.userId, me),
          eq(notificationMutesTable.sourceType, "hashtag"),
          eq(notificationMutesTable.sourceKey, tag),
        ),
      );
    res.status(204).end();
  },
);

export default router;
