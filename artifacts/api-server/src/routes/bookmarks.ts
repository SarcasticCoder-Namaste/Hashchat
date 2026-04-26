import { Router, type IRouter } from "express";
import {
  db,
  bookmarksTable,
  messagesTable,
  postsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";

const router: IRouter = Router();

type BookmarkKind = "message" | "post";

function isKind(v: unknown): v is BookmarkKind {
  return v === "message" || v === "post";
}

function snippet(s: string | null | undefined, n = 200): string | null {
  if (!s) return null;
  if (s.length <= n) return s;
  return s.slice(0, n) + "…";
}

async function buildTargets(
  rows: { kind: string; targetId: number }[],
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const messageIds = rows
    .filter((r) => r.kind === "message")
    .map((r) => r.targetId);
  const postIds = rows
    .filter((r) => r.kind === "post")
    .map((r) => r.targetId);

  if (messageIds.length > 0) {
    const msgs = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        roomTag: messagesTable.roomTag,
        conversationId: messagesTable.conversationId,
        senderId: messagesTable.senderId,
        deletedAt: messagesTable.deletedAt,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(inArray(messagesTable.id, messageIds));
    const senderIds = Array.from(new Set(msgs.map((m) => m.senderId)));
    const senders = senderIds.length
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
          .where(inArray(usersTable.id, senderIds))
      : [];
    const sm = new Map(senders.map((s) => [s.id, s]));
    for (const m of msgs) {
      const author = sm.get(m.senderId) ?? null;
      const href =
        m.roomTag != null
          ? `/app/rooms/${m.roomTag}`
          : m.conversationId != null
            ? `/app/messages/${m.conversationId}`
            : null;
      out.set(`message:${m.id}`, {
        kind: "message",
        id: m.id,
        snippet: m.deletedAt ? "[deleted]" : snippet(m.content),
        author,
        roomTag: m.roomTag,
        conversationId: m.conversationId,
        href,
        createdAt: m.createdAt.toISOString(),
        deleted: !!m.deletedAt,
      });
    }
  }

  if (postIds.length > 0) {
    const posts = await db
      .select({
        id: postsTable.id,
        content: postsTable.content,
        authorId: postsTable.authorId,
        deletedAt: postsTable.deletedAt,
        createdAt: postsTable.createdAt,
      })
      .from(postsTable)
      .where(inArray(postsTable.id, postIds));
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
    const am = new Map(authors.map((a) => [a.id, a]));
    for (const p of posts) {
      const author = am.get(p.authorId) ?? null;
      out.set(`post:${p.id}`, {
        kind: "post",
        id: p.id,
        snippet: p.deletedAt ? "[deleted]" : snippet(p.content),
        author,
        roomTag: null,
        conversationId: null,
        href: `/app/post/${p.id}`,
        createdAt: p.createdAt.toISOString(),
        deleted: !!p.deletedAt,
      });
    }
  }
  return out;
}

router.get("/me/bookmarks", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const kindRaw = String(req.query.kind ?? "all");
  const where =
    kindRaw === "message" || kindRaw === "post"
      ? and(eq(bookmarksTable.userId, me), eq(bookmarksTable.kind, kindRaw))
      : eq(bookmarksTable.userId, me);

  const rows = await db
    .select()
    .from(bookmarksTable)
    .where(where)
    .orderBy(desc(bookmarksTable.createdAt))
    .limit(200);

  const targets = await buildTargets(rows);
  res.json(
    rows.map((b) => ({
      id: b.id,
      kind: b.kind,
      targetId: b.targetId,
      note: b.note,
      target: targets.get(`${b.kind}:${b.targetId}`) ?? null,
      createdAt: b.createdAt.toISOString(),
    })),
  );
});

router.get(
  "/me/bookmarks/check",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const kind = String(req.query.kind ?? "");
    const targetId = parseInt(String(req.query.targetId ?? ""), 10);
    if (!isKind(kind) || Number.isNaN(targetId)) {
      res.status(400).json({ error: "Bad kind/targetId" });
      return;
    }
    const [row] = await db
      .select()
      .from(bookmarksTable)
      .where(
        and(
          eq(bookmarksTable.userId, me),
          eq(bookmarksTable.kind, kind),
          eq(bookmarksTable.targetId, targetId),
        ),
      )
      .limit(1);
    res.json({
      bookmarked: !!row,
      bookmarkId: row?.id ?? null,
      note: row?.note ?? null,
    });
  },
);

router.post("/me/bookmarks", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const { kind, targetId, note } = req.body ?? {};
  if (!isKind(kind) || typeof targetId !== "number") {
    res.status(400).json({ error: "kind and targetId required" });
    return;
  }
  // Validate target exists
  if (kind === "message") {
    const [m] = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(eq(messagesTable.id, targetId))
      .limit(1);
    if (!m) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
  } else {
    const [p] = await db
      .select({ id: postsTable.id })
      .from(postsTable)
      .where(eq(postsTable.id, targetId))
      .limit(1);
    if (!p) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
  }

  // Upsert via unique index
  const trimmedNote =
    typeof note === "string" ? note.slice(0, 1000) : null;
  const [existing] = await db
    .select()
    .from(bookmarksTable)
    .where(
      and(
        eq(bookmarksTable.userId, me),
        eq(bookmarksTable.kind, kind),
        eq(bookmarksTable.targetId, targetId),
      ),
    )
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(bookmarksTable)
      .set({ note: trimmedNote })
      .where(eq(bookmarksTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(bookmarksTable)
      .values({
        userId: me,
        kind,
        targetId,
        note: trimmedNote,
      })
      .returning();
  }
  const targets = await buildTargets([row]);
  res.status(201).json({
    id: row.id,
    kind: row.kind,
    targetId: row.targetId,
    note: row.note,
    target: targets.get(`${row.kind}:${row.targetId}`) ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch(
  "/me/bookmarks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }
    const { note } = req.body ?? {};
    const trimmedNote =
      typeof note === "string" ? note.slice(0, 1000) : null;
    const [row] = await db
      .update(bookmarksTable)
      .set({ note: trimmedNote })
      .where(and(eq(bookmarksTable.id, id), eq(bookmarksTable.userId, me)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const targets = await buildTargets([row]);
    res.json({
      id: row.id,
      kind: row.kind,
      targetId: row.targetId,
      note: row.note,
      target: targets.get(`${row.kind}:${row.targetId}`) ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/me/bookmarks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Bad id" });
      return;
    }
    await db
      .delete(bookmarksTable)
      .where(and(eq(bookmarksTable.id, id), eq(bookmarksTable.userId, me)));
    res.status(204).end();
  },
);

export default router;
