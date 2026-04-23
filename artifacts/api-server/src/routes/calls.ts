import { Router, type IRouter } from "express";
import {
  db,
  callsTable,
  callParticipantsTable,
  callSignalsTable,
  conversationsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { InitiateCallBody, SendCallSignalBody } from "@workspace/api-zod";
import { normalizeTag } from "../lib/hashtags";

const router: IRouter = Router();

async function buildCall(callId: number) {
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);
  if (!call) return null;
  const parts = await db
    .select()
    .from(callParticipantsTable)
    .where(eq(callParticipantsTable.callId, callId));
  const userIds = parts.map((p) => p.userId);
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const uMap = new Map(users.map((u) => [u.id, u]));
  return {
    id: call.id,
    initiatorId: call.initiatorId,
    kind: call.kind,
    status: call.status,
    conversationId: call.conversationId,
    roomTag: call.roomTag,
    startedAt: call.startedAt.toISOString(),
    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
    participants: parts.map((p) => {
      const u = uMap.get(p.userId);
      return {
        userId: p.userId,
        username: u?.username ?? "unknown",
        displayName: u?.displayName ?? u?.username ?? "Unknown",
        avatarUrl: u?.avatarUrl ?? null,
        state: p.state,
        joinedAt: p.joinedAt ? p.joinedAt.toISOString() : null,
      };
    }),
  };
}

async function authorizedFor(callId: number, userId: string): Promise<boolean> {
  const [p] = await db
    .select()
    .from(callParticipantsTable)
    .where(and(eq(callParticipantsTable.callId, callId), eq(callParticipantsTable.userId, userId)))
    .limit(1);
  if (p) return true;
  const [call] = await db.select().from(callsTable).where(eq(callsTable.id, callId)).limit(1);
  if (!call) return false;
  if (call.roomTag) {
    const [follow] = await db
      .select()
      .from(userFollowedHashtagsTable)
      .where(and(eq(userFollowedHashtagsTable.userId, userId), eq(userFollowedHashtagsTable.tag, call.roomTag)))
      .limit(1);
    const [interest] = await db
      .select()
      .from(userHashtagsTable)
      .where(and(eq(userHashtagsTable.userId, userId), eq(userHashtagsTable.tag, call.roomTag)))
      .limit(1);
    if (follow || interest) {
      await db
        .insert(callParticipantsTable)
        .values({ callId, userId, state: "invited" })
        .onConflictDoNothing();
      return true;
    }
  }
  return false;
}

router.post("/calls", requireAuth, async (req, res): Promise<void> => {
  const parsed = InitiateCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  const { kind, conversationId, roomTag } = parsed.data;
  const tag = roomTag ? normalizeTag(roomTag) : null;
  if (!conversationId && !tag) {
    res.status(400).json({ error: "conversationId or roomTag required" });
    return;
  }

  const invitees = new Set<string>([me]);
  if (conversationId) {
    const [convo] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
    if (!convo || (convo.userAId !== me && convo.userBId !== me)) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    invitees.add(convo.userAId);
    invitees.add(convo.userBId);
  } else if (tag) {
    const followers = await db
      .select({ userId: userFollowedHashtagsTable.userId })
      .from(userFollowedHashtagsTable)
      .where(eq(userFollowedHashtagsTable.tag, tag));
    const interested = await db
      .select({ userId: userHashtagsTable.userId })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.tag, tag));
    for (const r of followers) invitees.add(r.userId);
    for (const r of interested) invitees.add(r.userId);
  }

  const [call] = await db
    .insert(callsTable)
    .values({
      initiatorId: me,
      conversationId: conversationId ?? null,
      roomTag: tag,
      kind,
      status: "ringing",
    })
    .returning();

  await db.insert(callParticipantsTable).values(
    Array.from(invitees).map((uid) => ({
      callId: call.id,
      userId: uid,
      state: uid === me ? "joined" : "invited",
      joinedAt: uid === me ? new Date() : null,
    })),
  );

  const built = await buildCall(call.id);
  res.status(201).json(built);
});

router.get("/calls/incoming", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const since = new Date(Date.now() - 60 * 1000);
  // Show calls where I'm still "invited" (haven't accepted/declined) regardless
  // of whether the initiator (or anyone else) has flipped status to "active".
  // This prevents the toast from disappearing the moment another participant joins.
  const myParts = await db
    .select({ callId: callParticipantsTable.callId })
    .from(callParticipantsTable)
    .innerJoin(callsTable, eq(callsTable.id, callParticipantsTable.callId))
    .where(
      and(
        eq(callParticipantsTable.userId, me),
        eq(callParticipantsTable.state, "invited"),
        or(eq(callsTable.status, "ringing"), eq(callsTable.status, "active")),
        gt(callsTable.startedAt, since),
      ),
    )
    .orderBy(desc(callsTable.startedAt))
    .limit(10);
  const ids = myParts.map((p) => p.callId);
  const calls = [];
  for (const id of ids) {
    const c = await buildCall(id);
    if (c) calls.push(c);
  }
  res.json(calls);
});

router.get("/calls/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  if (!(await authorizedFor(id, me))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const built = await buildCall(id);
  if (!built) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(built);
});

router.post("/calls/:id/join", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  if (!(await authorizedFor(id, me))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db
    .insert(callParticipantsTable)
    .values({ callId: id, userId: me, state: "joined", joinedAt: new Date() })
    .onConflictDoUpdate({
      target: [callParticipantsTable.callId, callParticipantsTable.userId],
      set: { state: "joined", joinedAt: new Date(), leftAt: null },
    });
  await db
    .update(callsTable)
    .set({ status: "active" })
    .where(and(eq(callsTable.id, id), eq(callsTable.status, "ringing")));
  const built = await buildCall(id);
  res.json(built);
});

router.post("/calls/:id/leave", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  await db
    .update(callParticipantsTable)
    .set({ state: "left", leftAt: new Date() })
    .where(and(eq(callParticipantsTable.callId, id), eq(callParticipantsTable.userId, me)));
  const remaining = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(callParticipantsTable)
    .where(and(eq(callParticipantsTable.callId, id), eq(callParticipantsTable.state, "joined")));
  if ((remaining[0]?.count ?? 0) === 0) {
    await db
      .update(callsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(callsTable.id, id));
  }
  res.json({ ok: true });
});

router.post("/calls/:id/signals", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = SendCallSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  if (!(await authorizedFor(id, me))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.insert(callSignalsTable).values({
    callId: id,
    fromUserId: me,
    toUserId: parsed.data.toUserId,
    kind: parsed.data.kind,
    payload: parsed.data.payload,
  });
  res.status(204).end();
});

router.get("/calls/:id/signals", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const since = parseInt(String(req.query.since ?? "0"), 10) || 0;
  const me = getUserId(req);
  if (!(await authorizedFor(id, me))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const rows = await db
    .select()
    .from(callSignalsTable)
    .where(
      and(
        eq(callSignalsTable.callId, id),
        eq(callSignalsTable.toUserId, me),
        gt(callSignalsTable.id, since),
      ),
    )
    .orderBy(callSignalsTable.id)
    .limit(200);
  const cursor = rows.length ? rows[rows.length - 1].id : since;
  res.json({
    signals: rows.map((r) => ({
      id: r.id,
      callId: r.callId,
      fromUserId: r.fromUserId,
      toUserId: r.toUserId,
      kind: r.kind,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
    })),
    cursor,
  });
});

export default router;
