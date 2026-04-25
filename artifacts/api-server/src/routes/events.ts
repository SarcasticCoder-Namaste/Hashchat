import { Router, type IRouter } from "express";
import {
  db,
  eventsTable,
  eventRsvpsTable,
  hashtagsTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { CreateRoomEventBody } from "@workspace/api-zod";

const router: IRouter = Router();

const MOD_MESSAGE_THRESHOLD = 3;

export async function canModerateRoom(
  userId: string,
  tag: string,
): Promise<boolean> {
  // First user to send a message in the room is the de-facto creator.
  const [first] = await db
    .select({ senderId: messagesTable.senderId })
    .from(messagesTable)
    .where(eq(messagesTable.roomTag, tag))
    .orderBy(messagesTable.createdAt)
    .limit(1);
  if (first && first.senderId === userId) return true;

  // Any user with enough activity in the room can moderate.
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(
      and(eq(messagesTable.roomTag, tag), eq(messagesTable.senderId, userId)),
    );
  return (count?.n ?? 0) >= MOD_MESSAGE_THRESHOLD;
}

type EventRow = typeof eventsTable.$inferSelect;

async function buildEvents(
  rows: EventRow[],
  myUserId: string,
): Promise<unknown[]> {
  if (rows.length === 0) return [];
  const eventIds = rows.map((r) => r.id);
  const creatorIds = Array.from(new Set(rows.map((r) => r.creatorId)));
  const tags = Array.from(new Set(rows.map((r) => r.roomTag)));

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
          eq(eventRsvpsTable.userId, myUserId),
          inArray(eventRsvpsTable.eventId, eventIds),
        ),
      ),
  ]);
  const creatorMap = new Map(creators.map((c) => [c.id, c]));
  const rsvpMap = new Map(rsvpCounts.map((r) => [r.eventId, r.n]));
  const myRsvpSet = new Set(myRsvps.map((r) => r.eventId));

  // Pre-compute moderation status for all distinct (room, me) once.
  const modPerTag = new Map<string, boolean>();
  await Promise.all(
    tags.map(async (t) => {
      modPerTag.set(t, await canModerateRoom(myUserId, t));
    }),
  );

  const now = Date.now();
  const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;
  return rows.map((r) => {
    const c = creatorMap.get(r.creatorId);
    const startsAtMs = r.startsAt.getTime();
    const endsAtMs = r.endsAt
      ? r.endsAt.getTime()
      : startsAtMs + LIVE_WINDOW_MS;
    const isCanceled = r.canceledAt !== null;
    const isLive = !isCanceled && now >= startsAtMs && now < endsAtMs;
    const isPast = !isCanceled && now >= endsAtMs;
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
      rsvpCount: rsvpMap.get(r.id) ?? 0,
      rsvpedByMe: myRsvpSet.has(r.id),
      isLive,
      isPast,
      canModerate:
        r.creatorId === myUserId || (modPerTag.get(r.roomTag) ?? false),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

router.get(
  "/rooms/:tag/events",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.tag)
      ? req.params.tag[0]
      : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const me = getUserId(req);
    const rows = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          eq(eventsTable.roomTag, tag),
          sql`${eventsTable.canceledAt} IS NULL`,
        ),
      )
      .orderBy(eventsTable.startsAt)
      .limit(50);
    res.json(await buildEvents(rows, me));
  },
);

router.post(
  "/rooms/:tag/events",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.tag)
      ? req.params.tag[0]
      : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const parsed = CreateRoomEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    if (!(await canModerateRoom(me, tag))) {
      res.status(403).json({
        error:
          "You need to be active in this room before scheduling an event (send a few messages first).",
      });
      return;
    }
    const startsAt =
      parsed.data.startsAt instanceof Date
        ? parsed.data.startsAt
        : new Date(parsed.data.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      res.status(400).json({ error: "Invalid startsAt" });
      return;
    }
    const endsAtRaw = parsed.data.endsAt;
    let endsAt: Date | null = null;
    if (endsAtRaw) {
      endsAt = endsAtRaw instanceof Date ? endsAtRaw : new Date(endsAtRaw);
      if (Number.isNaN(endsAt.getTime())) {
        res.status(400).json({ error: "Invalid endsAt" });
        return;
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        res.status(400).json({ error: "endsAt must be after startsAt" });
        return;
      }
    }
    const title = parsed.data.title.trim();
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }
    await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
    const [created] = await db
      .insert(eventsTable)
      .values({
        roomTag: tag,
        creatorId: me,
        title,
        description: parsed.data.description ?? null,
        startsAt,
        endsAt,
      })
      .returning();
    // Auto-RSVP creator.
    await db
      .insert(eventRsvpsTable)
      .values({ eventId: created.id, userId: me })
      .onConflictDoNothing();
    const [built] = await buildEvents([created], me);
    res.status(201).json(built);
  },
);

router.get(
  "/events/upcoming",
  requireAuth,
  async (req, res): Promise<void> => {
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit ?? "10"), 10) || 10, 1),
      50,
    );
    const me = getUserId(req);
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const rows = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          sql`${eventsTable.canceledAt} IS NULL`,
          sql`${eventsTable.startsAt} >= ${cutoff}`,
        ),
      )
      .orderBy(eventsTable.startsAt)
      .limit(limit);
    res.json(await buildEvents(rows, me));
  },
);

router.post(
  "/events/:id/rsvp",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(
      String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id),
      10,
    );
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [evt] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, id))
      .limit(1);
    if (!evt || evt.canceledAt) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .insert(eventRsvpsTable)
      .values({ eventId: id, userId: me })
      .onConflictDoNothing();
    const [built] = await buildEvents([evt], me);
    res.json(built);
  },
);

router.delete(
  "/events/:id/rsvp",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = parseInt(
      String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id),
      10,
    );
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    await db
      .delete(eventRsvpsTable)
      .where(
        and(eq(eventRsvpsTable.eventId, id), eq(eventRsvpsTable.userId, me)),
      );
    const [evt] = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.id, id))
      .limit(1);
    if (!evt) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [built] = await buildEvents([evt], me);
    res.json(built);
  },
);

router.delete("/events/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(
    String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id),
    10,
  );
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  const [evt] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  if (!evt) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const allowed =
    evt.creatorId === me || (await canModerateRoom(me, evt.roomTag));
  if (!allowed) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }
  await db
    .update(eventsTable)
    .set({ canceledAt: new Date() })
    .where(eq(eventsTable.id, id));
  res.status(204).end();
});

export default router;
