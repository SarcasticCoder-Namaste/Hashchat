import { Router, type IRouter, type Request } from "express";
import {
  db,
  postsTable,
  postHashtagsTable,
  postMediaTable,
  postReactionsTable,
  postEditsTable,
  postDraftsTable,
  hashtagsTable,
  usersTable,
  userFollowedHashtagsTable,
  mentionsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, lt, sql, isNull } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { isValidStorageUrl } from "../lib/storageUrls";
import { normalizeTag } from "../lib/hashtags";
import {
  CreatePostBody,
  UpdatePostBody,
  CreateDraftBody,
  UpdateDraftBody,
  AddMessageReactionBody,
} from "@workspace/api-zod";
import { resolveMentions, recordMentions } from "../lib/mentions";
import { createNotification } from "../lib/notifications";
import { isBlockedEitherWay } from "../lib/relationships";

const router: IRouter = Router();

const EDIT_WINDOW_MS = 30 * 60 * 1000;

type PostRow = typeof postsTable.$inferSelect;

function editableUntil(row: PostRow): Date | null {
  if (row.status !== "published") return null;
  return new Date(row.createdAt.getTime() + EDIT_WINDOW_MS);
}

async function loadQuotedPosts(
  ids: number[],
  myId: string,
): Promise<
  Map<
    number,
    {
      id: number;
      author: ReturnType<typeof serializeAuthor> | null;
      content: string;
      imageUrls: string[];
      imageAlts: string[];
      createdAt: string;
      unavailable: boolean;
    }
  >
> {
  const out = new Map<
    number,
    {
      id: number;
      author: ReturnType<typeof serializeAuthor> | null;
      content: string;
      imageUrls: string[];
      imageAlts: string[];
      createdAt: string;
      unavailable: boolean;
    }
  >();
  if (ids.length === 0) return out;

  const rows = await db
    .select()
    .from(postsTable)
    .where(inArray(postsTable.id, ids));

  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));
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

  const mediaRows = rows.length
    ? await db
        .select()
        .from(postMediaTable)
        .where(inArray(postMediaTable.postId, rows.map((r) => r.id)))
        .orderBy(postMediaTable.position)
    : [];
  const mediaByPost = new Map<number, string[]>();
  const altsByPost = new Map<number, string[]>();
  for (const m of mediaRows) {
    if (!mediaByPost.has(m.postId)) mediaByPost.set(m.postId, []);
    mediaByPost.get(m.postId)!.push(m.imageUrl);
    if (!altsByPost.has(m.postId)) altsByPost.set(m.postId, []);
    altsByPost.get(m.postId)!.push(m.imageAlt ?? "");
  }

  const blockChecks = await Promise.all(
    authorIds.map(async (aid) => [aid, await isBlockedEitherWay(myId, aid)] as const),
  );
  const blockedSet = new Set(
    blockChecks.filter(([, blocked]) => blocked).map(([id]) => id),
  );

  const foundIds = new Set(rows.map((r) => r.id));

  for (const id of ids) {
    const r = rows.find((x) => x.id === id);
    if (!r || !foundIds.has(id) || r.deletedAt || r.status !== "published") {
      out.set(id, {
        id,
        author: null,
        content: "",
        imageUrls: [],
        imageAlts: [],
        createdAt: new Date(0).toISOString(),
        unavailable: true,
      });
      continue;
    }
    if (blockedSet.has(r.authorId)) {
      out.set(id, {
        id,
        author: null,
        content: "",
        imageUrls: [],
        imageAlts: [],
        createdAt: r.createdAt.toISOString(),
        unavailable: true,
      });
      continue;
    }
    const a = authorMap.get(r.authorId);
    out.set(id, {
      id: r.id,
      author: serializeAuthor(a, r.authorId),
      content: r.content,
      imageUrls: mediaByPost.get(r.id) ?? [],
      imageAlts: altsByPost.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
      unavailable: false,
    });
  }
  return out;
}

function serializeAuthor(
  a:
    | {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
        discriminator: string | null;
        role: string;
        mvpPlan: boolean;
        verified: boolean;
        tier?: string;
        animatedAvatarUrl?: string | null;
      }
    | undefined,
  fallbackId: string,
) {
  return {
    id: a?.id ?? fallbackId,
    username: a?.username ?? "unknown",
    displayName: a?.displayName ?? "Unknown",
    avatarUrl: a?.avatarUrl ?? null,
    discriminator: a?.discriminator ?? null,
    role: a?.role ?? "user",
    mvpPlan: a?.mvpPlan ?? false,
    verified: a?.verified ?? false,
    tier: a?.tier ?? "free",
    animatedAvatarUrl: a?.tier === "pro" ? a?.animatedAvatarUrl ?? null : null,
  };
}

async function buildPosts(rows: PostRow[], myUserId: string) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = Array.from(new Set(rows.map((r) => r.authorId)));

  const authors = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      discriminator: usersTable.discriminator,
      role: usersTable.role,
      mvpPlan: usersTable.mvpPlan,
      verified: usersTable.verified,
      tier: usersTable.tier,
      animatedAvatarUrl: usersTable.animatedAvatarUrl,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, authorIds));
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  const tagRows = await db
    .select()
    .from(postHashtagsTable)
    .where(inArray(postHashtagsTable.postId, ids));
  const tagsByPost = new Map<number, string[]>();
  for (const t of tagRows) {
    if (!tagsByPost.has(t.postId)) tagsByPost.set(t.postId, []);
    tagsByPost.get(t.postId)!.push(t.tag);
  }

  const mediaRows = await db
    .select()
    .from(postMediaTable)
    .where(inArray(postMediaTable.postId, ids))
    .orderBy(postMediaTable.position);
  const mediaByPost = new Map<number, string[]>();
  const altsByPost = new Map<number, string[]>();
  for (const m of mediaRows) {
    if (!mediaByPost.has(m.postId)) mediaByPost.set(m.postId, []);
    mediaByPost.get(m.postId)!.push(m.imageUrl);
    if (!altsByPost.has(m.postId)) altsByPost.set(m.postId, []);
    altsByPost.get(m.postId)!.push(m.imageAlt ?? "");
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

  const mentionRows = await db
    .select({
      targetId: mentionsTable.targetId,
      userId: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(mentionsTable)
    .innerJoin(usersTable, eq(usersTable.id, mentionsTable.mentionedUserId))
    .where(
      and(
        eq(mentionsTable.targetType, "post"),
        inArray(mentionsTable.targetId, ids),
      ),
    );
  const mentionsByPost = new Map<
    number,
    { id: string; username: string; displayName: string }[]
  >();
  for (const m of mentionRows) {
    const list = mentionsByPost.get(m.targetId) ?? [];
    list.push({ id: m.userId, username: m.username, displayName: m.displayName });
    mentionsByPost.set(m.targetId, list);
  }

  const quotedIds = Array.from(
    new Set(rows.map((r) => r.quotedPostId).filter((v): v is number => v != null)),
  );
  const quotedMap = await loadQuotedPosts(quotedIds, myUserId);

  return rows.map((r) => {
    const a = authorMap.get(r.authorId);
    const eu = editableUntil(r);
    return {
      id: r.id,
      author: serializeAuthor(a, r.authorId),
      content: r.content,
      hashtags: tagsByPost.get(r.id) ?? [],
      imageUrls: mediaByPost.get(r.id) ?? [],
      imageAlts: altsByPost.get(r.id) ?? [],
      reactions: reactionsByPost.get(r.id) ?? [],
      mentions: mentionsByPost.get(r.id) ?? [],
      status: r.status === "scheduled" ? "scheduled" : "published",
      scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
      editableUntil: eu ? eu.toISOString() : null,
      quotedPost:
        r.quotedPostId != null ? quotedMap.get(r.quotedPostId) ?? null : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

router.post("/posts", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  const content = parsed.data.content.trim();
  if (!content) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

  const inputTags = parsed.data.hashtags ?? [];
  const inlineTags = Array.from(content.matchAll(/#([a-zA-Z0-9]+)/g)).map(
    (m) => m[1],
  );
  const tags = Array.from(
    new Set([...inputTags, ...inlineTags].map(normalizeTag).filter(Boolean)),
  ).slice(0, 10);

  const imageUrls = (parsed.data.imageUrls ?? []).slice(0, 4);
  for (const u of imageUrls) {
    if (!isValidStorageUrl(u)) {
      res.status(400).json({ error: "Invalid imageUrl" });
      return;
    }
  }
  const imageAltsInput = parsed.data.imageAlts ?? [];
  const imageAlts = imageUrls.map((_, i) =>
    typeof imageAltsInput[i] === "string"
      ? imageAltsInput[i]!.trim().slice(0, 1000)
      : "",
  );

  let scheduledFor: Date | null = null;
  let status: "published" | "scheduled" = "published";
  if (parsed.data.scheduledFor) {
    const dt =
      parsed.data.scheduledFor instanceof Date
        ? parsed.data.scheduledFor
        : new Date(parsed.data.scheduledFor);
    if (Number.isNaN(dt.getTime())) {
      res.status(400).json({ error: "Invalid scheduledFor" });
      return;
    }
    if (dt.getTime() <= Date.now() + 30_000) {
      res.status(400).json({ error: "scheduledFor must be in the future" });
      return;
    }
    scheduledFor = dt;
    status = "scheduled";
  }

  let quotedPostId: number | null = null;
  if (parsed.data.quotedPostId != null) {
    const qid = Number(parsed.data.quotedPostId);
    if (Number.isNaN(qid)) {
      res.status(400).json({ error: "Invalid quotedPostId" });
      return;
    }
    const [qp] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, qid))
      .limit(1);
    if (!qp || qp.deletedAt || qp.status !== "published") {
      res.status(400).json({ error: "Quoted post not found" });
      return;
    }
    if (await isBlockedEitherWay(me, qp.authorId)) {
      res.status(403).json({ error: "Cannot quote this post" });
      return;
    }
    quotedPostId = qid;
  }

  const [created] = await db
    .insert(postsTable)
    .values({ authorId: me, content, status, scheduledFor, quotedPostId })
    .returning();

  if (tags.length > 0) {
    await db
      .insert(hashtagsTable)
      .values(tags.map((tag) => ({ tag })))
      .onConflictDoNothing();
    await db
      .insert(postHashtagsTable)
      .values(tags.map((tag) => ({ postId: created.id, tag })))
      .onConflictDoNothing();
  }
  if (imageUrls.length > 0) {
    await db.insert(postMediaTable).values(
      imageUrls.map((imageUrl, position) => ({
        postId: created.id,
        imageUrl,
        imageAlt: imageAlts[position] || null,
        position,
      })),
    );
  }

  if (status === "published") {
    const resolved = await resolveMentions(content);
    const recorded = await recordMentions({
      mentionerId: me,
      targetType: "post",
      targetId: created.id,
      resolved,
    });
    for (const u of recorded) {
      await createNotification({
        recipientId: u.id,
        actorId: me,
        kind: "mention",
        targetType: "post",
        targetId: created.id,
        snippet: content.slice(0, 200),
      });
    }
  }

  if (parsed.data.fromDraftId != null) {
    await db
      .delete(postDraftsTable)
      .where(
        and(
          eq(postDraftsTable.id, Number(parsed.data.fromDraftId)),
          eq(postDraftsTable.userId, me),
        ),
      );
  }

  const [built] = await buildPosts([created], me);
  res.status(201).json(built);
});

router.delete("/posts/:id", requireAuth, async (req, res): Promise<void> => {
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
  if (!post) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (post.authorId !== me) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(postsTable).where(eq(postsTable.id, id));
  res.status(204).end();
});

router.patch("/posts/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  const newContent = parsed.data.content.trim();
  if (!newContent) {
    res.status(400).json({ error: "Content is required" });
    return;
  }

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
  if (post.status !== "published") {
    res.status(400).json({ error: "Only published posts can be edited" });
    return;
  }
  if (Date.now() - post.createdAt.getTime() > EDIT_WINDOW_MS) {
    res.status(403).json({ error: "Edit window has passed" });
    return;
  }
  if (post.content === newContent) {
    const [built] = await buildPosts([post], me);
    res.json(built);
    return;
  }

  await db.insert(postEditsTable).values({
    postId: id,
    previousContent: post.content,
  });

  const editedAt = new Date();
  const [updated] = await db
    .update(postsTable)
    .set({ content: newContent, editedAt })
    .where(eq(postsTable.id, id))
    .returning();

  const [built] = await buildPosts([updated], me);
  res.json(built);
});

router.get(
  "/posts/:id/edits",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const rows = await db
      .select({
        previousContent: postEditsTable.previousContent,
        editedAt: postEditsTable.editedAt,
      })
      .from(postEditsTable)
      .where(eq(postEditsTable.postId, id))
      .orderBy(desc(postEditsTable.editedAt));
    res.json(
      rows.map((r) => ({
        previousContent: r.previousContent,
        editedAt: r.editedAt.toISOString(),
      })),
    );
  },
);

router.get("/me/feed/posts", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);

  const rawBefore = Array.isArray(req.query.before)
    ? req.query.before[0]
    : req.query.before;
  let before: Date | null = null;
  if (typeof rawBefore === "string" && rawBefore.length > 0) {
    const parsed = new Date(rawBefore);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: "Invalid 'before' timestamp" });
      return;
    }
    before = parsed;
  }

  const rawLimit = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  let limit = 30;
  if (typeof rawLimit === "string" && rawLimit.length > 0) {
    const parsed = parseInt(rawLimit, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      res.status(400).json({ error: "Invalid 'limit'" });
      return;
    }
    limit = Math.min(parsed, 100);
  }

  const conditions = [
    eq(userFollowedHashtagsTable.userId, me),
    sql`${postsTable.deletedAt} IS NULL`,
    eq(postsTable.status, "published"),
  ];
  if (before) {
    conditions.push(lt(postsTable.createdAt, before));
  }

  const rows = await db
    .selectDistinct({
      id: postsTable.id,
      authorId: postsTable.authorId,
      content: postsTable.content,
      status: postsTable.status,
      scheduledFor: postsTable.scheduledFor,
      editedAt: postsTable.editedAt,
      quotedPostId: postsTable.quotedPostId,
      deletedAt: postsTable.deletedAt,
      createdAt: postsTable.createdAt,
    })
    .from(postsTable)
    .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
    .innerJoin(
      userFollowedHashtagsTable,
      eq(userFollowedHashtagsTable.tag, postHashtagsTable.tag),
    )
    .where(and(...conditions))
    .orderBy(desc(postsTable.createdAt))
    .limit(limit);
  res.json(await buildPosts(rows, me));
});

function parsePagination(
  req: Request,
): { before: Date | null; limit: number } | { error: string } {
  const rawBefore = Array.isArray(req.query.before)
    ? req.query.before[0]
    : req.query.before;
  let before: Date | null = null;
  if (typeof rawBefore === "string" && rawBefore.length > 0) {
    const parsed = new Date(rawBefore);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Invalid 'before' timestamp" };
    }
    before = parsed;
  }
  const rawLimit = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  let limit = 30;
  if (typeof rawLimit === "string" && rawLimit.length > 0) {
    const parsed = parseInt(rawLimit, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return { error: "Invalid 'limit'" };
    }
    limit = Math.min(parsed, 100);
  }
  return { before, limit };
}

router.get(
  "/hashtags/:tag/posts",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.tag)
      ? req.params.tag[0]
      : req.params.tag;
    const tag = normalizeTag(raw);
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const pag = parsePagination(req);
    if ("error" in pag) {
      res.status(400).json({ error: pag.error });
      return;
    }
    const conditions = [
      eq(postHashtagsTable.tag, tag),
      sql`${postsTable.deletedAt} IS NULL`,
      eq(postsTable.status, "published"),
    ];
    if (pag.before) {
      conditions.push(lt(postsTable.createdAt, pag.before));
    }
    const rows = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        content: postsTable.content,
        status: postsTable.status,
        scheduledFor: postsTable.scheduledFor,
        editedAt: postsTable.editedAt,
        quotedPostId: postsTable.quotedPostId,
        deletedAt: postsTable.deletedAt,
        createdAt: postsTable.createdAt,
      })
      .from(postsTable)
      .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
      .where(and(...conditions))
      .orderBy(desc(postsTable.createdAt))
      .limit(pag.limit);
    res.json(await buildPosts(rows, me));
  },
);

router.get("/users/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const pag = parsePagination(req);
  if ("error" in pag) {
    res.status(400).json({ error: pag.error });
    return;
  }
  const conditions = [
    eq(postsTable.authorId, raw),
    sql`${postsTable.deletedAt} IS NULL`,
    eq(postsTable.status, "published"),
  ];
  if (pag.before) {
    conditions.push(lt(postsTable.createdAt, pag.before));
  }
  const rows = await db
    .select()
    .from(postsTable)
    .where(and(...conditions))
    .orderBy(desc(postsTable.createdAt))
    .limit(pag.limit);
  res.json(await buildPosts(rows, me));
});

router.post(
  "/posts/:id/reactions",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = AddMessageReactionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [post] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (!post || post.deletedAt || post.status !== "published") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .insert(postReactionsTable)
      .values({ postId: id, userId: me, emoji: parsed.data.emoji })
      .onConflictDoNothing();
    if (post.authorId !== me) {
      await createNotification({
        recipientId: post.authorId,
        actorId: me,
        kind: "reaction",
        targetType: "post",
        targetId: id,
        snippet: `${parsed.data.emoji} ${post.content.slice(0, 80)}`,
      });
    }
    res.status(204).end();
  },
);

router.delete(
  "/posts/:id/reactions",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    const emoji = String(req.query.emoji ?? "");
    if (Number.isNaN(id) || !emoji) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    await db
      .delete(postReactionsTable)
      .where(
        and(
          eq(postReactionsTable.postId, id),
          eq(postReactionsTable.userId, getUserId(req)),
          eq(postReactionsTable.emoji, emoji),
        ),
      );
    res.status(204).end();
  },
);

// =================== Drafts ===================

async function buildDrafts(
  rows: (typeof postDraftsTable.$inferSelect)[],
  myId: string,
) {
  if (rows.length === 0) return [];
  const quotedIds = Array.from(
    new Set(rows.map((r) => r.quotedPostId).filter((v): v is number => v != null)),
  );
  const quotedMap = await loadQuotedPosts(quotedIds, myId);
  return rows.map((r) => {
    let hashtags: string[] = [];
    let imageUrls: string[] = [];
    let imageAlts: string[] = [];
    try {
      hashtags = JSON.parse(r.hashtags);
    } catch {}
    try {
      imageUrls = JSON.parse(r.imageUrls);
    } catch {}
    try {
      const parsed = JSON.parse(r.imageAlts);
      if (Array.isArray(parsed)) {
        imageAlts = parsed.map((v) => (typeof v === "string" ? v : ""));
      }
    } catch {}
    return {
      id: r.id,
      content: r.content,
      hashtags,
      imageUrls,
      imageAlts: imageUrls.map((_, i) => imageAlts[i] ?? ""),
      quotedPost:
        r.quotedPostId != null ? quotedMap.get(r.quotedPostId) ?? null : null,
      updatedAt: r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

function validateDraftBody(body: unknown):
  | {
      content: string;
      hashtags: string[];
      imageUrls: string[];
      imageAlts: string[];
      quotedPostId: number | null;
    }
  | { error: string } {
  const parsed = CreateDraftBody.safeParse(body);
  if (!parsed.success) return { error: parsed.error.message };
  const content = parsed.data.content;
  const hashtags = (parsed.data.hashtags ?? [])
    .map(normalizeTag)
    .filter(Boolean)
    .slice(0, 10);
  const imageUrls = (parsed.data.imageUrls ?? []).slice(0, 4);
  for (const u of imageUrls) {
    if (!isValidStorageUrl(u)) return { error: "Invalid imageUrl" };
  }
  const altsInput = parsed.data.imageAlts ?? [];
  const imageAlts = imageUrls.map((_, i) =>
    typeof altsInput[i] === "string" ? altsInput[i]!.slice(0, 1000) : "",
  );
  const quotedPostId =
    parsed.data.quotedPostId != null ? Number(parsed.data.quotedPostId) : null;
  return { content, hashtags, imageUrls, imageAlts, quotedPostId };
}

router.get("/me/drafts", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(postDraftsTable)
    .where(eq(postDraftsTable.userId, me))
    .orderBy(desc(postDraftsTable.updatedAt))
    .limit(50);
  res.json(await buildDrafts(rows, me));
});

router.post("/me/drafts", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const v = validateDraftBody(req.body);
  if ("error" in v) {
    res.status(400).json({ error: v.error });
    return;
  }
  const [created] = await db
    .insert(postDraftsTable)
    .values({
      userId: me,
      content: v.content,
      hashtags: JSON.stringify(v.hashtags),
      imageUrls: JSON.stringify(v.imageUrls),
      imageAlts: JSON.stringify(v.imageAlts),
      quotedPostId: v.quotedPostId,
    })
    .returning();
  const [built] = await buildDrafts([created], me);
  res.status(201).json(built);
});

router.patch(
  "/me/drafts/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const v = validateDraftBody(req.body);
    if ("error" in v) {
      res.status(400).json({ error: v.error });
      return;
    }
    const [existing] = await db
      .select()
      .from(postDraftsTable)
      .where(and(eq(postDraftsTable.id, id), eq(postDraftsTable.userId, me)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [updated] = await db
      .update(postDraftsTable)
      .set({
        content: v.content,
        hashtags: JSON.stringify(v.hashtags),
        imageUrls: JSON.stringify(v.imageUrls),
        imageAlts: JSON.stringify(v.imageAlts),
        quotedPostId: v.quotedPostId,
        updatedAt: new Date(),
      })
      .where(eq(postDraftsTable.id, id))
      .returning();
    const [built] = await buildDrafts([updated], me);
    res.json(built);
  },
);

router.delete(
  "/me/drafts/:id",
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
      .delete(postDraftsTable)
      .where(and(eq(postDraftsTable.id, id), eq(postDraftsTable.userId, me)));
    res.status(204).end();
  },
);

router.get(
  "/me/scheduled-posts",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const rows = await db
      .select()
      .from(postsTable)
      .where(
        and(
          eq(postsTable.authorId, me),
          eq(postsTable.status, "scheduled"),
          isNull(postsTable.deletedAt),
        ),
      )
      .orderBy(postsTable.scheduledFor)
      .limit(100);
    res.json(await buildPosts(rows, me));
  },
);

// =================== Scheduler ===================

export async function publishDueScheduledPosts(): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(postsTable)
    .where(
      and(
        eq(postsTable.status, "scheduled"),
        isNull(postsTable.deletedAt),
        lt(postsTable.scheduledFor, now),
      ),
    )
    .limit(50);
  if (due.length === 0) return 0;

  for (const p of due) {
    await db
      .update(postsTable)
      .set({
        status: "published",
        scheduledFor: null,
        createdAt: now,
      })
      .where(eq(postsTable.id, p.id));

    const resolved = await resolveMentions(p.content);
    const recorded = await recordMentions({
      mentionerId: p.authorId,
      targetType: "post",
      targetId: p.id,
      resolved,
    });
    for (const u of recorded) {
      await createNotification({
        recipientId: u.id,
        actorId: p.authorId,
        kind: "mention",
        targetType: "post",
        targetId: p.id,
        snippet: p.content.slice(0, 200),
      });
    }

    // Notify the author that their scheduled post is now live.
    await createNotification({
      recipientId: p.authorId,
      actorId: null,
      kind: "scheduled_post_published",
      targetType: "post",
      targetId: p.id,
      snippet: p.content.slice(0, 200),
    });
  }
  return due.length;
}

export default router;
