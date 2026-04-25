import { Router, type IRouter } from "express";
import {
  db,
  postsTable,
  postHashtagsTable,
  postMediaTable,
  hashtagsTable,
  usersTable,
  userFollowedHashtagsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { isValidStorageUrl } from "../lib/storageUrls";
import { normalizeTag } from "../lib/hashtags";
import { CreatePostBody } from "@workspace/api-zod";

const router: IRouter = Router();

type PostRow = typeof postsTable.$inferSelect;

async function buildPosts(rows: PostRow[]) {
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
  for (const m of mediaRows) {
    if (!mediaByPost.has(m.postId)) mediaByPost.set(m.postId, []);
    mediaByPost.get(m.postId)!.push(m.imageUrl);
  }

  return rows.map((r) => {
    const a = authorMap.get(r.authorId);
    return {
      id: r.id,
      author: {
        id: a?.id ?? r.authorId,
        username: a?.username ?? "unknown",
        displayName: a?.displayName ?? "Unknown",
        avatarUrl: a?.avatarUrl ?? null,
        discriminator: a?.discriminator ?? null,
        role: a?.role ?? "user",
        mvpPlan: a?.mvpPlan ?? false,
        verified: a?.verified ?? false,
      },
      content: r.content,
      hashtags: tagsByPost.get(r.id) ?? [],
      imageUrls: mediaByPost.get(r.id) ?? [],
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

  const [created] = await db
    .insert(postsTable)
    .values({ authorId: me, content })
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
        position,
      })),
    );
  }

  const [built] = await buildPosts([created]);
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
  ];
  if (before) {
    conditions.push(lt(postsTable.createdAt, before));
  }

  const rows = await db
    .selectDistinct({
      id: postsTable.id,
      authorId: postsTable.authorId,
      content: postsTable.content,
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
  res.json(await buildPosts(rows));
});

router.get(
  "/hashtags/:tag/posts",
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
    const rows = await db
      .select({
        id: postsTable.id,
        authorId: postsTable.authorId,
        content: postsTable.content,
        deletedAt: postsTable.deletedAt,
        createdAt: postsTable.createdAt,
      })
      .from(postsTable)
      .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          sql`${postsTable.deletedAt} IS NULL`,
        ),
      )
      .orderBy(desc(postsTable.createdAt))
      .limit(100);
    res.json(await buildPosts(rows));
  },
);

router.get("/users/:id/posts", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rows = await db
    .select()
    .from(postsTable)
    .where(
      and(eq(postsTable.authorId, raw), sql`${postsTable.deletedAt} IS NULL`),
    )
    .orderBy(desc(postsTable.createdAt))
    .limit(100);
  res.json(await buildPosts(rows));
});

export default router;
