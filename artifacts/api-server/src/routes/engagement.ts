import { Router, type IRouter } from "express";
import {
  db,
  userStreaksTable,
  questProgressTable,
  sparksTable,
  sparkHashtagsTable,
  inviteTokensTable,
  inviteRedemptionsTable,
  usersTable,
  postsTable,
  reactionsTable,
  postReactionsTable,
  messagesTable,
  postHashtagsTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { isValidStorageUrl } from "../lib/storageUrls";
import {
  DAILY_QUESTS,
  generateInviteToken,
  grantInviteCreditIfDue,
  recordActivity,
  startOfWeekUtc,
  INVITE_CREDIT_THRESHOLD,
  INVITE_CREDIT_DAYS,
} from "../lib/engagement";

const router: IRouter = Router();

const SPARK_TTL_MS = 24 * 60 * 60 * 1000;
const SPARK_MAX_LEN = 280;

// =================== Streak ===================

router.get("/me/streak", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const [row] = await db
    .select()
    .from(userStreaksTable)
    .where(eq(userStreaksTable.userId, me))
    .limit(1);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const lastDate = row?.lastActivityDate ?? null;
  const isActiveToday = lastDate === today;
  // If the user missed a day, the persisted current streak is stale; show 0
  // until they post again to keep the UI honest.
  const currentStreak =
    !lastDate || lastDate === today || lastDate === yesterday
      ? row?.currentStreak ?? 0
      : 0;
  res.json({
    currentStreak,
    longestStreak: row?.longestStreak ?? 0,
    lastActivityDate: lastDate,
    activeToday: isActiveToday,
  });
});

// =================== Quests ===================

router.get("/me/quests", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const day = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(questProgressTable)
    .where(
      and(
        eq(questProgressTable.userId, me),
        eq(questProgressTable.day, day),
      ),
    );
  const byCode = new Map(rows.map((r) => [r.questCode, r]));
  const quests = DAILY_QUESTS.map((q) => {
    const r = byCode.get(q.code);
    const progress = r?.progress ?? 0;
    return {
      code: q.code,
      title: q.title,
      description: q.description,
      target: q.target,
      progress: Math.min(progress, q.target),
      completed: !!r?.completedAt,
    };
  });
  res.json({ day, quests });
});

// =================== Leaderboard ===================

router.get(
  "/hashtags/:tag/leaderboard",
  requireAuth,
  async (req, res): Promise<void> => {
    const tag = normalizeTag(String(req.params.tag ?? ""));
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const since = startOfWeekUtc();

    // Posts in this hashtag this week, by author.
    const postCounts = await db
      .select({
        userId: postsTable.authorId,
        posts: sql<number>`count(*)::int`,
      })
      .from(postsTable)
      .innerJoin(
        postHashtagsTable,
        eq(postHashtagsTable.postId, postsTable.id),
      )
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          gt(postsTable.createdAt, since),
          eq(postsTable.status, "published"),
        ),
      )
      .groupBy(postsTable.authorId);

    // Reactions on posts in this hashtag this week, by reacting user.
    const reactionCounts = await db
      .select({
        userId: postReactionsTable.userId,
        reactions: sql<number>`count(*)::int`,
      })
      .from(postReactionsTable)
      .innerJoin(postsTable, eq(postsTable.id, postReactionsTable.postId))
      .innerJoin(
        postHashtagsTable,
        eq(postHashtagsTable.postId, postsTable.id),
      )
      .where(
        and(
          eq(postHashtagsTable.tag, tag),
          gt(postReactionsTable.createdAt, since),
        ),
      )
      .groupBy(postReactionsTable.userId);

    // Room messages in this hashtag this week, by sender.
    const messageCounts = await db
      .select({
        userId: messagesTable.senderId,
        messages: sql<number>`count(*)::int`,
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.roomTag, tag),
          gt(messagesTable.createdAt, since),
        ),
      )
      .groupBy(messagesTable.senderId);

    const totals = new Map<
      string,
      { posts: number; reactions: number; messages: number }
    >();
    for (const r of postCounts) {
      const t = totals.get(r.userId) ?? { posts: 0, reactions: 0, messages: 0 };
      t.posts += r.posts;
      totals.set(r.userId, t);
    }
    for (const r of reactionCounts) {
      const t = totals.get(r.userId) ?? { posts: 0, reactions: 0, messages: 0 };
      t.reactions += r.reactions;
      totals.set(r.userId, t);
    }
    for (const r of messageCounts) {
      const t = totals.get(r.userId) ?? { posts: 0, reactions: 0, messages: 0 };
      t.messages += r.messages;
      totals.set(r.userId, t);
    }

    if (totals.size === 0) {
      res.json({ tag, weekStart: since.toISOString(), entries: [] });
      return;
    }

    const userIds = Array.from(totals.keys());
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        animatedAvatarUrl: usersTable.animatedAvatarUrl,
        mvpPlan: usersTable.mvpPlan,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));

    const entries = users
      .map((u) => {
        const t = totals.get(u.id)!;
        // Posts weigh more than reactions; messages slot between.
        const score = t.posts * 5 + t.messages * 2 + t.reactions;
        return {
          user: {
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            animatedAvatarUrl: u.animatedAvatarUrl,
            mvpPlan: u.mvpPlan,
          },
          posts: t.posts,
          reactions: t.reactions,
          messages: t.messages,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.json({ tag, weekStart: since.toISOString(), entries });
  },
);

// =================== Sparks ===================

async function deleteExpiredSparks(): Promise<void> {
  await db.delete(sparksTable).where(lt(sparksTable.expiresAt, new Date()));
}

async function buildSparks(rows: (typeof sparksTable.$inferSelect)[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const tags = await db
    .select()
    .from(sparkHashtagsTable)
    .where(inArray(sparkHashtagsTable.sparkId, ids));
  const tagsBySpark = new Map<number, string[]>();
  for (const t of tags) {
    const list = tagsBySpark.get(t.sparkId) ?? [];
    list.push(t.tag);
    tagsBySpark.set(t.sparkId, list);
  }
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      animatedAvatarUrl: usersTable.animatedAvatarUrl,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const userMap = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = userMap.get(r.userId);
    return {
      id: r.id,
      content: r.content,
      imageUrl: r.imageUrl,
      hashtags: tagsBySpark.get(r.id) ?? [],
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      author: u
        ? {
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            animatedAvatarUrl: u.animatedAvatarUrl,
          }
        : null,
    };
  });
}

router.post("/sparks", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const body = (req.body ?? {}) as {
    content?: unknown;
    imageUrl?: unknown;
    hashtags?: unknown;
  };
  const content = String(body.content ?? "").trim().slice(0, SPARK_MAX_LEN);
  const imageUrl =
    typeof body.imageUrl === "string" && body.imageUrl.trim().length > 0
      ? body.imageUrl.trim()
      : null;
  if (imageUrl && !isValidStorageUrl(imageUrl)) {
    res.status(400).json({ error: "Invalid imageUrl" });
    return;
  }
  if (!content && !imageUrl) {
    res.status(400).json({ error: "Content or image required" });
    return;
  }
  const inputTags = Array.isArray(body.hashtags) ? body.hashtags : [];
  const inlineTags = Array.from(content.matchAll(/#([a-zA-Z0-9]+)/g)).map(
    (m) => m[1] ?? "",
  );
  const tags = Array.from(
    new Set(
      [...inputTags, ...inlineTags]
        .map((t) => (typeof t === "string" ? normalizeTag(t) : ""))
        .filter(Boolean),
    ),
  ).slice(0, 5) as string[];

  const expiresAt = new Date(Date.now() + SPARK_TTL_MS);
  const [row] = await db
    .insert(sparksTable)
    .values({ userId: me, content, imageUrl, expiresAt })
    .returning();
  if (tags.length > 0) {
    await db
      .insert(sparkHashtagsTable)
      .values(tags.map((tag) => ({ sparkId: row.id, tag })))
      .onConflictDoNothing();
  }
  void recordActivity(me, "spark");
  const [serialized] = await buildSparks([row]);
  res.status(201).json(serialized);
});

router.delete("/sparks/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const me = getUserId(req);
  const [row] = await db
    .select()
    .from(sparksTable)
    .where(eq(sparksTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.userId !== me) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(sparksTable).where(eq(sparksTable.id, id));
  res.status(204).end();
});

router.get(
  "/users/:username/sparks",
  requireAuth,
  async (req, res): Promise<void> => {
    void deleteExpiredSparks();
    const username = String(req.params.username ?? "").toLowerCase();
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);
    if (!user) {
      res.json([]);
      return;
    }
    const rows = await db
      .select()
      .from(sparksTable)
      .where(
        and(
          eq(sparksTable.userId, user.id),
          gt(sparksTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sparksTable.createdAt))
      .limit(20);
    res.json(await buildSparks(rows));
  },
);

router.get(
  "/hashtags/:tag/sparks",
  requireAuth,
  async (req, res): Promise<void> => {
    void deleteExpiredSparks();
    const tag = normalizeTag(String(req.params.tag ?? ""));
    if (!tag) {
      res.status(400).json({ error: "Invalid tag" });
      return;
    }
    const rows = await db
      .select({
        id: sparksTable.id,
        userId: sparksTable.userId,
        content: sparksTable.content,
        imageUrl: sparksTable.imageUrl,
        expiresAt: sparksTable.expiresAt,
        createdAt: sparksTable.createdAt,
      })
      .from(sparksTable)
      .innerJoin(
        sparkHashtagsTable,
        eq(sparkHashtagsTable.sparkId, sparksTable.id),
      )
      .where(
        and(
          eq(sparkHashtagsTable.tag, tag),
          gt(sparksTable.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sparksTable.createdAt))
      .limit(40);
    res.json(await buildSparks(rows));
  },
);

router.get("/sparks/me", requireAuth, async (req, res): Promise<void> => {
  void deleteExpiredSparks();
  const me = getUserId(req);
  const rows = await db
    .select()
    .from(sparksTable)
    .where(
      and(eq(sparksTable.userId, me), gt(sparksTable.expiresAt, new Date())),
    )
    .orderBy(desc(sparksTable.createdAt));
  res.json(await buildSparks(rows));
});

// =================== Invites ===================

async function getOrCreateInviteToken(userId: string): Promise<string> {
  const [existing] = await db
    .select()
    .from(inviteTokensTable)
    .where(eq(inviteTokensTable.inviterId, userId))
    .limit(1);
  if (existing) return existing.token;
  for (let i = 0; i < 5; i++) {
    const token = generateInviteToken();
    try {
      await db.insert(inviteTokensTable).values({ token, inviterId: userId });
      return token;
    } catch {
      // collision, retry
    }
  }
  throw new Error("Could not generate invite token");
}

async function buildInviteResponse(userId: string) {
  const token = await getOrCreateInviteToken(userId);
  const redemptions = await db
    .select()
    .from(inviteRedemptionsTable)
    .where(eq(inviteRedemptionsTable.inviterId, userId));
  const credited = redemptions.filter((r) => r.creditedAt !== null).length;
  const total = redemptions.length;
  const towardNext = total % INVITE_CREDIT_THRESHOLD;
  return {
    token,
    totalRedemptions: total,
    creditedRedemptions: credited,
    threshold: INVITE_CREDIT_THRESHOLD,
    rewardDays: INVITE_CREDIT_DAYS,
    progressTowardNext: towardNext,
  };
}

router.get("/me/invite", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  res.json(await buildInviteResponse(me));
});

router.post(
  "/me/invite/regenerate",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    await db
      .delete(inviteTokensTable)
      .where(eq(inviteTokensTable.inviterId, me));
    res.json(await buildInviteResponse(me));
  },
);

router.post(
  "/invites/:token/redeem",
  requireAuth,
  async (req, res): Promise<void> => {
    const token = String(req.params.token ?? "").trim().toLowerCase();
    if (!token) {
      res.status(400).json({ error: "Invalid token" });
      return;
    }
    const me = getUserId(req);
    const [invite] = await db
      .select()
      .from(inviteTokensTable)
      .where(eq(inviteTokensTable.token, token))
      .limit(1);
    if (!invite) {
      res.status(404).json({ error: "Invalid invite" });
      return;
    }
    if (invite.inviterId === me) {
      res.status(400).json({ error: "Cannot redeem your own invite" });
      return;
    }
    const [existing] = await db
      .select()
      .from(inviteRedemptionsTable)
      .where(eq(inviteRedemptionsTable.inviteeId, me))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "Already redeemed an invite" });
      return;
    }
    await db.insert(inviteRedemptionsTable).values({
      inviteeId: me,
      inviterId: invite.inviterId,
      token,
    });
    await grantInviteCreditIfDue(invite.inviterId);
    res.json({ ok: true, inviterId: invite.inviterId });
  },
);

export default router;
