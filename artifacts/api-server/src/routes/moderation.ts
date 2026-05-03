import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  postsTable,
  postHashtagsTable,
  postMediaTable,
  postReactionsTable,
  pinnedPostsTable,
  messagesTable,
  hashtagsTable,
  usersTable,
  roomVisibilityTable,
  roomModeratorsTable,
  communitiesTable,
  communityMembersTable,
  communityHashtagsTable,
  reportsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import {
  SetRoomSlowModeBody as SetSlowModeBody,
  AddRoomModeratorBody as AddModeratorBody,
  LockPostBody as ModerationScopeBody,
  CreateReportBody,
  ResolveReportBody,
} from "@workspace/api-zod";
import {
  getRoomModerationAccess,
  getCommunityModerationAccess,
  isAllowedSlowMode,
} from "../lib/moderation";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

const MAX_PINS_PER_SCOPE = 3;
const MAX_MODS = 3;

type MatchUserShape = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: string;
  featuredHashtag: string | null;
  discriminator: string | null;
  role: string;
  mvpPlan: boolean;
  verified: boolean;
  lastSeenAt: string;
  hashtags: string[];
  sharedHashtags: string[];
  matchScore: number;
};

async function loadUsersAsMatchUsers(ids: string[]): Promise<MatchUserShape[]> {
  if (ids.length === 0) return [];
  const rows = await db.select().from(usersTable).where(inArray(usersTable.id, ids));
  return rows.map((u) => ({
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
    verified: u.verified,
    lastSeenAt: (u.lastSeenAt ?? new Date(0)).toISOString(),
    hashtags: [],
    sharedHashtags: [],
    matchScore: 0,
  }));
}

function intParam(req: Request, key: string): number | null {
  const raw = Array.isArray(req.params[key])
    ? req.params[key][0]
    : req.params[key];
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? null : n;
}

// ---------- Slow mode ----------

router.put(
  "/rooms/:tag/slow-mode",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const parsed = SetSlowModeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!isAllowedSlowMode(parsed.data.seconds)) {
      res.status(400).json({ error: "Invalid slow-mode value" });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomModerationAccess(tag, me);
    if (!access.canManage) {
      res.status(403).json({ error: "Only the room owner can change slow mode" });
      return;
    }
    await db
      .update(roomVisibilityTable)
      .set({ slowModeSeconds: parsed.data.seconds, updatedAt: new Date() })
      .where(eq(roomVisibilityTable.tag, tag));
    const [vis] = await db
      .select()
      .from(roomVisibilityTable)
      .where(eq(roomVisibilityTable.tag, tag))
      .limit(1);
    res.json({
      tag,
      isPrivate: !!vis?.isPrivate,
      ownerId: vis?.ownerId ?? null,
      canManage: true,
      canModerate: true,
      isMember: true,
      slowModeSeconds: vis?.slowModeSeconds ?? 0,
    });
  },
);

router.put(
  "/communities/:slug/slow-mode",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const parsed = SetSlowModeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!isAllowedSlowMode(parsed.data.seconds)) {
      res.status(400).json({ error: "Invalid slow-mode value" });
      return;
    }
    const me = getUserId(req);
    const access = await getCommunityModerationAccess(slug, me);
    if (!access.canManage || access.communityId == null) {
      res.status(403).json({ error: "Only the community owner can change slow mode" });
      return;
    }
    await db
      .update(communitiesTable)
      .set({ slowModeSeconds: parsed.data.seconds })
      .where(eq(communitiesTable.id, access.communityId));
    // Apply to every room owned/contained by this community for consistency.
    const rooms = await db
      .select({ tag: communityHashtagsTable.tag })
      .from(communityHashtagsTable)
      .where(eq(communityHashtagsTable.communityId, access.communityId));
    if (rooms.length > 0) {
      for (const r of rooms) {
        await db
          .update(roomVisibilityTable)
          .set({ slowModeSeconds: parsed.data.seconds, updatedAt: new Date() })
          .where(eq(roomVisibilityTable.tag, r.tag));
      }
    }
    res.json({ ok: true });
  },
);

// ---------- Moderators ----------

async function listRoomMods(tag: string): Promise<MatchUserShape[]> {
  const direct = await db
    .select({ userId: roomModeratorsTable.userId })
    .from(roomModeratorsTable)
    .where(eq(roomModeratorsTable.tag, tag));
  const ids = direct.map((r) => r.userId);
  return loadUsersAsMatchUsers(ids);
}

router.get(
  "/rooms/:tag/moderators",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    res.json(await listRoomMods(tag));
  },
);

router.post(
  "/rooms/:tag/moderators",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const parsed = AddModeratorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomModerationAccess(tag, me);
    if (!access.canManage) {
      res.status(403).json({ error: "Only the room owner can add moderators" });
      return;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(roomModeratorsTable)
      .where(eq(roomModeratorsTable.tag, tag));
    if ((count ?? 0) >= MAX_MODS) {
      res.status(409).json({ error: `At most ${MAX_MODS} moderators per room.` });
      return;
    }
    await db
      .insert(roomModeratorsTable)
      .values({ tag, userId: parsed.data.userId, addedBy: me })
      .onConflictDoNothing();
    await createNotification({
      recipientId: parsed.data.userId,
      actorId: me,
      kind: "mod_promoted",
      targetType: "room",
      targetTextId: tag,
      snippet: `You are now a moderator of #${tag}.`,
    });
    res.json(await listRoomMods(tag));
  },
);

router.delete(
  "/rooms/:tag/moderators/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const userId = String(req.params.userId);
    const me = getUserId(req);
    const access = await getRoomModerationAccess(tag, me);
    if (!access.canManage) {
      res.status(403).json({ error: "Only the room owner can remove moderators" });
      return;
    }
    await db
      .delete(roomModeratorsTable)
      .where(and(eq(roomModeratorsTable.tag, tag), eq(roomModeratorsTable.userId, userId)));
    res.json({ ok: true });
  },
);

async function listCommunityMods(communityId: number): Promise<MatchUserShape[]> {
  const rows = await db
    .select({ userId: communityMembersTable.userId })
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.communityId, communityId),
        inArray(communityMembersTable.role, ["owner", "moderator"]),
      ),
    );
  return loadUsersAsMatchUsers(rows.map((r) => r.userId));
}

router.get(
  "/communities/:slug/moderators",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const access = await getCommunityModerationAccess(slug, getUserId(req));
    if (access.communityId == null) {
      res.status(404).json({ error: "Community not found" });
      return;
    }
    res.json(await listCommunityMods(access.communityId));
  },
);

router.post(
  "/communities/:slug/moderators",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const parsed = AddModeratorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const access = await getCommunityModerationAccess(slug, me);
    if (!access.canManage || access.communityId == null) {
      res.status(403).json({ error: "Only the community owner can add moderators" });
      return;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(communityMembersTable)
      .where(
        and(
          eq(communityMembersTable.communityId, access.communityId),
          eq(communityMembersTable.role, "moderator"),
        ),
      );
    if ((count ?? 0) >= MAX_MODS) {
      res.status(409).json({ error: `At most ${MAX_MODS} moderators per community.` });
      return;
    }
    await db
      .insert(communityMembersTable)
      .values({
        communityId: access.communityId,
        userId: parsed.data.userId,
        role: "moderator",
      })
      .onConflictDoUpdate({
        target: [communityMembersTable.communityId, communityMembersTable.userId],
        set: { role: "moderator" },
      });
    await createNotification({
      recipientId: parsed.data.userId,
      actorId: me,
      kind: "mod_promoted",
      targetType: "community",
      targetTextId: slug,
      snippet: `You are now a moderator of ${slug}.`,
    });
    res.json(await listCommunityMods(access.communityId));
  },
);

router.delete(
  "/communities/:slug/moderators/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const userId = String(req.params.userId);
    const me = getUserId(req);
    const access = await getCommunityModerationAccess(slug, me);
    if (!access.canManage || access.communityId == null) {
      res.status(403).json({ error: "Only the community owner can remove moderators" });
      return;
    }
    await db
      .update(communityMembersTable)
      .set({ role: "member" })
      .where(
        and(
          eq(communityMembersTable.communityId, access.communityId),
          eq(communityMembersTable.userId, userId),
          eq(communityMembersTable.role, "moderator"),
        ),
      );
    res.json({ ok: true });
  },
);

// ---------- Pinned posts ----------

async function buildPinnedPosts(
  myUserId: string,
  scopeType: "room" | "community",
  scopeKey: string,
): Promise<unknown[]> {
  const pins = await db
    .select()
    .from(pinnedPostsTable)
    .where(
      and(
        eq(pinnedPostsTable.scopeType, scopeType),
        eq(pinnedPostsTable.scopeKey, scopeKey),
      ),
    )
    .orderBy(desc(pinnedPostsTable.createdAt));
  if (pins.length === 0) return [];
  const ids = pins.map((p) => p.postId);
  const posts = await db
    .select()
    .from(postsTable)
    .where(
      and(
        inArray(postsTable.id, ids),
        sql`${postsTable.deletedAt} IS NULL`,
      ),
    );
  // Reuse the same projection shape as buildPosts in posts.ts
  if (posts.length === 0) return [];
  const authorIds = Array.from(new Set(posts.map((p) => p.authorId)));
  const authors = await db.select().from(usersTable).where(inArray(usersTable.id, authorIds));
  const am = new Map(authors.map((a) => [a.id, a]));
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
    const e = list.find((x) => x.emoji === r.emoji);
    if (e) {
      e.count += 1;
      if (r.userId === myUserId) e.reactedByMe = true;
    } else {
      list.push({ emoji: r.emoji, count: 1, reactedByMe: r.userId === myUserId });
    }
    reactionsByPost.set(r.postId, list);
  }
  // Preserve pin order
  const orderIndex = new Map(pins.map((p, i) => [p.postId, i]));
  const sorted = posts
    .slice()
    .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
  return sorted.map((p) => {
    const a = am.get(p.authorId);
    const removed = p.removedAt != null;
    return {
      id: p.id,
      author: {
        id: a?.id ?? p.authorId,
        username: a?.username ?? "unknown",
        displayName: a?.displayName ?? "Unknown",
        avatarUrl: a?.avatarUrl ?? null,
        discriminator: a?.discriminator ?? null,
        role: a?.role ?? "user",
        mvpPlan: a?.mvpPlan ?? false,
        verified: a?.verified ?? false,
      },
      content: removed ? "" : p.content,
      hashtags: tagsByPost.get(p.id) ?? [],
      imageUrls: removed ? [] : (mediaByPost.get(p.id) ?? []),
      reactions: removed ? [] : (reactionsByPost.get(p.id) ?? []),
      mentions: [],
      lockedAt: p.lockedAt ? p.lockedAt.toISOString() : null,
      removedAt: p.removedAt ? p.removedAt.toISOString() : null,
      pinnedInScopes: [{ scopeType, scopeKey }],
      createdAt: p.createdAt.toISOString(),
    };
  });
}

router.get(
  "/rooms/:tag/pinned",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    res.json(await buildPinnedPosts(getUserId(req), "room", tag));
  },
);

router.get(
  "/communities/:slug/pinned",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    res.json(await buildPinnedPosts(getUserId(req), "community", slug));
  },
);

async function pinPostToScope(
  res: Response,
  scopeType: "room" | "community",
  scopeKey: string,
  postId: number,
  pinnedBy: string,
): Promise<void> {
  const [post] = await db
    .select()
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1);
  if (!post || post.deletedAt) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  // Validate post belongs to scope: room → post must include the tag;
  // community → post must include any tag in the community.
  const tagRows = await db
    .select({ tag: postHashtagsTable.tag })
    .from(postHashtagsTable)
    .where(eq(postHashtagsTable.postId, postId));
  const postTags = new Set(tagRows.map((r) => r.tag));
  if (scopeType === "room") {
    if (!postTags.has(scopeKey)) {
      res.status(400).json({ error: "Post does not belong to this room." });
      return;
    }
  } else {
    const communityTags = await db
      .select({ tag: communityHashtagsTable.tag })
      .from(communityHashtagsTable)
      .innerJoin(communitiesTable, eq(communitiesTable.id, communityHashtagsTable.communityId))
      .where(eq(communitiesTable.slug, scopeKey));
    if (!communityTags.some((t) => postTags.has(t.tag))) {
      res.status(400).json({ error: "Post does not belong to this community." });
      return;
    }
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pinnedPostsTable)
    .where(
      and(
        eq(pinnedPostsTable.scopeType, scopeType),
        eq(pinnedPostsTable.scopeKey, scopeKey),
      ),
    );
  if ((count ?? 0) >= MAX_PINS_PER_SCOPE) {
    res.status(409).json({ error: `At most ${MAX_PINS_PER_SCOPE} pinned posts per scope.` });
    return;
  }
  await db
    .insert(pinnedPostsTable)
    .values({ scopeType, scopeKey, postId, pinnedBy })
    .onConflictDoNothing();
  if (post.authorId !== pinnedBy) {
    await createNotification({
      recipientId: post.authorId,
      actorId: pinnedBy,
      kind: "post_pinned",
      targetType: "post",
      targetId: postId,
      snippet: post.content.slice(0, 200),
    });
  }
  res.json({ ok: true });
}

router.post(
  "/rooms/:tag/posts/:id/pin",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    const id = intParam(req, "id");
    if (!tag || id === null) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomModerationAccess(tag, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await pinPostToScope(res, "room", tag, id, me);
  },
);

router.delete(
  "/rooms/:tag/posts/:id/pin",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    const id = intParam(req, "id");
    if (!tag || id === null) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomModerationAccess(tag, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(pinnedPostsTable)
      .where(
        and(
          eq(pinnedPostsTable.scopeType, "room"),
          eq(pinnedPostsTable.scopeKey, tag),
          eq(pinnedPostsTable.postId, id),
        ),
      );
    res.json({ ok: true });
  },
);

router.post(
  "/communities/:slug/posts/:id/pin",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const me = getUserId(req);
    const access = await getCommunityModerationAccess(slug, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await pinPostToScope(res, "community", slug, id, me);
  },
);

router.delete(
  "/communities/:slug/posts/:id/pin",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const me = getUserId(req);
    const access = await getCommunityModerationAccess(slug, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await db
      .delete(pinnedPostsTable)
      .where(
        and(
          eq(pinnedPostsTable.scopeType, "community"),
          eq(pinnedPostsTable.scopeKey, slug),
          eq(pinnedPostsTable.postId, id),
        ),
      );
    res.json({ ok: true });
  },
);

// ---------- Lock / Remove ----------

async function checkScopeAccess(
  res: Response,
  me: string,
  scopeType: "room" | "community",
  scopeKey: string,
): Promise<boolean> {
  if (scopeType === "room") {
    const access = await getRoomModerationAccess(scopeKey, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }
    return true;
  }
  const access = await getCommunityModerationAccess(scopeKey, me);
  if (!access.canModerate) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

async function notifyAuthorModerationAction(
  authorId: string,
  actorId: string,
  action: string,
  targetType: "post" | "message",
  targetId: number,
  snippet: string,
): Promise<void> {
  if (authorId === actorId) return;
  await createNotification({
    recipientId: authorId,
    actorId,
    kind: "moderation_action",
    targetType,
    targetId,
    snippet: `${action}: ${snippet.slice(0, 160)}`,
  });
}

router.post(
  "/moderation/posts/:id/lock",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ModerationScopeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    if (
      !(await checkScopeAccess(res, me, parsed.data.scopeType, parsed.data.scopeKey))
    )
      return;
    const [post] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    await db
      .update(postsTable)
      .set({ lockedAt: new Date() })
      .where(eq(postsTable.id, id));
    await notifyAuthorModerationAction(
      post.authorId,
      me,
      "Locked",
      "post",
      id,
      post.content,
    );
    res.json({ ok: true });
  },
);

router.delete(
  "/moderation/posts/:id/lock",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ModerationScopeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    if (
      !(await checkScopeAccess(res, me, parsed.data.scopeType, parsed.data.scopeKey))
    )
      return;
    await db
      .update(postsTable)
      .set({ lockedAt: null })
      .where(eq(postsTable.id, id));
    res.json({ ok: true });
  },
);

router.post(
  "/moderation/messages/:id/lock",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);
    if (!msg || !msg.roomTag) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    if (!(await checkScopeAccess(res, me, "room", msg.roomTag))) return;
    await db
      .update(messagesTable)
      .set({ lockedAt: new Date() })
      .where(eq(messagesTable.id, id));
    await notifyAuthorModerationAction(
      msg.senderId,
      me,
      "Locked",
      "message",
      id,
      msg.content,
    );
    res.json({ ok: true });
  },
);

router.delete(
  "/moderation/messages/:id/lock",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);
    if (!msg || !msg.roomTag) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    if (!(await checkScopeAccess(res, me, "room", msg.roomTag))) return;
    await db
      .update(messagesTable)
      .set({ lockedAt: null })
      .where(eq(messagesTable.id, id));
    res.json({ ok: true });
  },
);

router.post(
  "/moderation/posts/:id/remove",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ModerationScopeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    if (
      !(await checkScopeAccess(res, me, parsed.data.scopeType, parsed.data.scopeKey))
    )
      return;
    const [post] = await db
      .select()
      .from(postsTable)
      .where(eq(postsTable.id, id))
      .limit(1);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    await db
      .update(postsTable)
      .set({ removedAt: new Date(), removedBy: me })
      .where(eq(postsTable.id, id));
    await notifyAuthorModerationAction(
      post.authorId,
      me,
      "Removed",
      "post",
      id,
      post.content,
    );
    res.json({ ok: true });
  },
);

router.post(
  "/moderation/messages/:id/remove",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [msg] = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, id))
      .limit(1);
    if (!msg || !msg.roomTag) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
    if (!(await checkScopeAccess(res, me, "room", msg.roomTag))) return;
    await db
      .update(messagesTable)
      .set({ removedAt: new Date(), removedBy: me })
      .where(eq(messagesTable.id, id));
    await notifyAuthorModerationAction(
      msg.senderId,
      me,
      "Removed",
      "message",
      id,
      msg.content,
    );
    res.json({ ok: true });
  },
);

// ---------- Reports ----------

router.post(
  "/reports",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = CreateReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    await db.insert(hashtagsTable).values({ tag: parsed.data.scopeKey }).onConflictDoNothing();
    // Validate target exists
    if (parsed.data.targetType === "post") {
      const [p] = await db
        .select({ id: postsTable.id })
        .from(postsTable)
        .where(eq(postsTable.id, parsed.data.targetId))
        .limit(1);
      if (!p) {
        res.status(404).json({ error: "Target post not found" });
        return;
      }
    } else {
      const [m] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(eq(messagesTable.id, parsed.data.targetId))
        .limit(1);
      if (!m) {
        res.status(404).json({ error: "Target message not found" });
        return;
      }
    }
    await db.insert(reportsTable).values({
      reporterId: me,
      scopeType: parsed.data.scopeType,
      scopeKey: parsed.data.scopeKey,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      reason: parsed.data.reason,
    });
    res.json({ ok: true });
  },
);

async function buildReportRows(rows: typeof reportsTable.$inferSelect[]) {
  if (rows.length === 0) return [];
  const reporterIds = Array.from(new Set(rows.map((r) => r.reporterId)));
  const reporters = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, reporterIds));
  const reporterMap = new Map(reporters.map((r) => [r.id, r]));

  const postIds = rows.filter((r) => r.targetType === "post").map((r) => r.targetId);
  const msgIds = rows.filter((r) => r.targetType === "message").map((r) => r.targetId);
  const postMap = new Map<number, { content: string; authorId: string }>();
  const msgMap = new Map<number, { content: string; senderId: string }>();
  if (postIds.length > 0) {
    const ps = await db
      .select({
        id: postsTable.id,
        content: postsTable.content,
        authorId: postsTable.authorId,
      })
      .from(postsTable)
      .where(inArray(postsTable.id, postIds));
    for (const p of ps) postMap.set(p.id, { content: p.content, authorId: p.authorId });
  }
  if (msgIds.length > 0) {
    const ms = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        senderId: messagesTable.senderId,
      })
      .from(messagesTable)
      .where(inArray(messagesTable.id, msgIds));
    for (const m of ms) msgMap.set(m.id, { content: m.content, senderId: m.senderId });
  }
  const authorIds = Array.from(
    new Set([
      ...Array.from(postMap.values()).map((p) => p.authorId),
      ...Array.from(msgMap.values()).map((m) => m.senderId),
    ]),
  );
  const authors =
    authorIds.length > 0
      ? await db
          .select({ id: usersTable.id, displayName: usersTable.displayName })
          .from(usersTable)
          .where(inArray(usersTable.id, authorIds))
      : [];
  const authorMap = new Map(authors.map((a) => [a.id, a]));

  return rows.map((r) => {
    const reporter = reporterMap.get(r.reporterId) ?? null;
    let snippet: string | null = null;
    let authorName: string | null = null;
    if (r.targetType === "post") {
      const p = postMap.get(r.targetId);
      snippet = p?.content.slice(0, 200) ?? null;
      authorName = p ? (authorMap.get(p.authorId)?.displayName ?? null) : null;
    } else {
      const m = msgMap.get(r.targetId);
      snippet = m?.content.slice(0, 200) ?? null;
      authorName = m ? (authorMap.get(m.senderId)?.displayName ?? null) : null;
    }
    return {
      id: r.id,
      scopeType: r.scopeType,
      scopeKey: r.scopeKey,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      reporter: reporter
        ? {
            id: reporter.id,
            username: reporter.username,
            displayName: reporter.displayName,
            avatarUrl: reporter.avatarUrl,
          }
        : null,
      targetSnippet: snippet,
      targetAuthorName: authorName,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolution: r.resolution,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

router.get(
  "/rooms/:tag/reports",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(
      Array.isArray(req.params.tag) ? req.params.tag[0] : req.params.tag,
    );
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const me = getUserId(req);
    const access = await getRoomModerationAccess(tag, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select()
      .from(reportsTable)
      .where(
        and(
          eq(reportsTable.scopeType, "room"),
          eq(reportsTable.scopeKey, tag),
        ),
      )
      .orderBy(desc(reportsTable.createdAt))
      .limit(100);
    res.json(await buildReportRows(rows));
  },
);

router.get(
  "/communities/:slug/reports",
  requireAuth,
  async (req, res): Promise<void> => {
    const slug = String(req.params.slug);
    const me = getUserId(req);
    const access = await getCommunityModerationAccess(slug, me);
    if (!access.canModerate) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const rows = await db
      .select()
      .from(reportsTable)
      .where(
        and(
          eq(reportsTable.scopeType, "community"),
          eq(reportsTable.scopeKey, slug),
        ),
      )
      .orderBy(desc(reportsTable.createdAt))
      .limit(100);
    res.json(await buildReportRows(rows));
  },
);

router.post(
  "/reports/:id/resolve",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = intParam(req, "id");
    if (id === null) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = ResolveReportBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [report] = await db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.id, id))
      .limit(1);
    if (!report) {
      res.status(404).json({ error: "Report not found" });
      return;
    }
    if (report.status !== "open") {
      res.status(409).json({ error: "Report already resolved" });
      return;
    }
    const scopeType = report.scopeType as "room" | "community";
    if (!(await checkScopeAccess(res, me, scopeType, report.scopeKey))) return;
    const action = parsed.data.action;
    const now = new Date();
    if (action === "remove") {
      if (report.targetType === "post") {
        await db
          .update(postsTable)
          .set({ removedAt: now, removedBy: me })
          .where(eq(postsTable.id, report.targetId));
      } else {
        await db
          .update(messagesTable)
          .set({ removedAt: now, removedBy: me })
          .where(eq(messagesTable.id, report.targetId));
      }
    } else if (action === "lock") {
      if (report.targetType === "post") {
        await db
          .update(postsTable)
          .set({ lockedAt: now })
          .where(eq(postsTable.id, report.targetId));
      } else {
        await db
          .update(messagesTable)
          .set({ lockedAt: now })
          .where(eq(messagesTable.id, report.targetId));
      }
    }
    const status = action === "dismiss" ? "dismissed" : "resolved";
    await db
      .update(reportsTable)
      .set({
        status,
        resolvedBy: me,
        resolvedAt: now,
        resolution: parsed.data.note ?? action,
      })
      .where(eq(reportsTable.id, id));
    await createNotification({
      recipientId: report.reporterId,
      actorId: me,
      kind: "report_resolved",
      targetType: "report",
      targetId: id,
      targetTextId: `${report.scopeType}:${report.scopeKey}`,
      snippet: `Your report was ${status} (${action}).`,
    });
    res.json({ ok: true });
  },
);

export default router;
