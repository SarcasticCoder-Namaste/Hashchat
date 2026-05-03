import { Router, type IRouter } from "express";
import { db, usersTable, userHashtagsTable, userFollowedHashtagsTable, hashtagsTable } from "@workspace/db";
import { eq, sql, inArray, and } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { UpdateMeBody } from "@workspace/api-zod";
import { normalizeTag } from "../lib/hashtags";
import { isBlockedEitherWay } from "../lib/relationships";
import { publicLastSeenAt } from "../lib/presence";

const router: IRouter = Router();

async function loadUser(userId: string, viewerId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return null;
  const tags = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, userId));
  const followed = await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.userId, userId));
  const isSelf = viewerId === userId;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    pronouns: user.pronouns,
    location: user.location,
    website: user.website,
    statusEmoji: user.statusEmoji,
    statusText: user.statusText,
    status: user.status,
    featuredHashtag: user.featuredHashtag,
    discriminator: user.discriminator,
    friendCode: user.friendCode,
    role: user.role,
    mvpPlan: user.mvpPlan,
    verified: user.verified,
    tier: user.tier,
    billingPeriod: user.billingPeriod,
    animatedAvatarUrl: user.animatedAvatarUrl,
    bannerGifUrl: user.bannerGifUrl,
    premiumUntil: user.premiumUntil ? user.premiumUntil.toISOString() : null,
    lastSeenAt: isSelf
      ? user.lastSeenAt.toISOString()
      : publicLastSeenAt(user.lastSeenAt, user.hidePresence),
    hidePresence: user.hidePresence,
    hashtags: tags.map((t) => t.tag),
    followedHashtags: followed.map((t) => t.tag),
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const meId = getUserId(req);
  const me = await loadUser(meId, meId);
  if (!me) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(me);
});

router.patch("/me", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ALLOWED_PRESENCE = new Set(["online", "away", "busy", "invisible", "offline"]);
  const trimNullable = (v: string | null | undefined, max: number): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim().slice(0, max);
    return t.length === 0 ? null : t;
  };
  const sanitizeUrl = (v: string | null | undefined): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = v.trim();
    if (t.length === 0) return null;
    const candidate = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    try {
      const u = new URL(candidate);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString().slice(0, 200);
    } catch {
      return null;
    }
  };

  const updates: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) {
    const dn = parsed.data.displayName.trim().slice(0, 50);
    if (dn.length > 0) updates.displayName = dn;
  }
  const bio = trimNullable(parsed.data.bio, 300);
  if (bio !== undefined) updates.bio = bio;
  if (parsed.data.avatarUrl !== undefined) updates.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.bannerUrl !== undefined) updates.bannerUrl = parsed.data.bannerUrl;
  const pronouns = trimNullable(parsed.data.pronouns, 32);
  if (pronouns !== undefined) updates.pronouns = pronouns;
  const location = trimNullable(parsed.data.location, 64);
  if (location !== undefined) updates.location = location;
  const website = sanitizeUrl(parsed.data.website);
  if (website !== undefined) updates.website = website;
  const statusEmoji = trimNullable(parsed.data.statusEmoji, 8);
  if (statusEmoji !== undefined) updates.statusEmoji = statusEmoji;
  const statusText = trimNullable(parsed.data.statusText, 80);
  if (statusText !== undefined) updates.statusText = statusText;
  if (parsed.data.status !== undefined && ALLOWED_PRESENCE.has(parsed.data.status)) {
    updates.status = parsed.data.status;
  }
  if (parsed.data.featuredHashtag !== undefined)
    updates.featuredHashtag = parsed.data.featuredHashtag;
  if (typeof parsed.data.hidePresence === "boolean") {
    updates.hidePresence = parsed.data.hidePresence;
  }

  const meId = getUserId(req);
  // Pro-tier-only customizations: animated avatar and banner GIF.
  // Setting requires tier === "pro" and is silently ignored otherwise so
  // downgraded users keep their stored values without the client erroring.
  const [{ tier: currentTier } = { tier: "free" }] = await db
    .select({ tier: usersTable.tier })
    .from(usersTable)
    .where(eq(usersTable.id, meId))
    .limit(1);
  if (parsed.data.animatedAvatarUrl !== undefined && currentTier === "pro") {
    updates.animatedAvatarUrl = parsed.data.animatedAvatarUrl;
  }
  if (parsed.data.bannerGifUrl !== undefined && currentTier === "pro") {
    updates.bannerGifUrl = parsed.data.bannerGifUrl;
  }
  if (Object.keys(updates).length > 0) {
    await db.update(usersTable).set(updates).where(eq(usersTable.id, meId));
  }
  const me = await loadUser(meId, meId);
  res.json(me);
});

async function hashtagStats(tags: string[]) {
  if (tags.length === 0) return [];
  const memberCounts = await db
    .select({
      tag: userHashtagsTable.tag,
      count: sql<number>`count(*)::int`,
    })
    .from(userHashtagsTable)
    .where(inArray(userHashtagsTable.tag, tags))
    .groupBy(userHashtagsTable.tag);
  const followerCounts = await db
    .select({
      tag: userFollowedHashtagsTable.tag,
      count: sql<number>`count(*)::int`,
    })
    .from(userFollowedHashtagsTable)
    .where(inArray(userFollowedHashtagsTable.tag, tags))
    .groupBy(userFollowedHashtagsTable.tag);
  const messageCounts = await db.execute(
    sql`SELECT room_tag AS tag, COUNT(*)::int AS count FROM messages WHERE room_tag IN (${sql.join(tags.map((t) => sql`${t}`), sql`, `)}) GROUP BY room_tag`,
  );
  const memberMap = new Map(memberCounts.map((r) => [r.tag, r.count]));
  const followerMap = new Map(followerCounts.map((r) => [r.tag, r.count]));
  const messageMap = new Map(
    (messageCounts.rows as { tag: string; count: number }[]).map((r) => [r.tag, r.count]),
  );
  return tags.map((tag) => ({
    tag,
    memberCount: memberMap.get(tag) ?? 0,
    messageCount: messageMap.get(tag) ?? 0,
    followerCount: followerMap.get(tag) ?? 0,
  }));
}

router.get("/me/hashtags", requireAuth, async (req, res): Promise<void> => {
  const tags = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, getUserId(req)));
  res.json(await hashtagStats(tags.map((t) => t.tag)));
});

router.put("/me/hashtags", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as { hashtags?: unknown };
  if (!Array.isArray(body.hashtags)) {
    res.status(400).json({ error: "hashtags must be an array" });
    return;
  }
  const tags = Array.from(
    new Set(
      body.hashtags
        .filter((t): t is string => typeof t === "string")
        .map(normalizeTag)
        .filter(Boolean),
    ),
  );
  if (tags.length > 0) {
    await db
      .insert(hashtagsTable)
      .values(tags.map((tag) => ({ tag })))
      .onConflictDoNothing();
  }
  await db.delete(userHashtagsTable).where(eq(userHashtagsTable.userId, getUserId(req)));
  if (tags.length > 0) {
    await db
      .insert(userHashtagsTable)
      .values(tags.map((tag) => ({ userId: getUserId(req), tag })));
  }
  res.json(await hashtagStats(tags));
});

router.get("/me/followed-hashtags", requireAuth, async (req, res): Promise<void> => {
  const tags = await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(eq(userFollowedHashtagsTable.userId, getUserId(req)));
  res.json(await hashtagStats(tags.map((t) => t.tag)));
});

router.get(
  "/users/mention-suggestions",
  requireAuth,
  async (req, res): Promise<void> => {
    const me = getUserId(req);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const limit = 10;

    let rows: {
      id: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      discriminator: string | null;
    }[];

    if (q.length === 0) {
      rows = await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          discriminator: usersTable.discriminator,
        })
        .from(usersTable)
        .where(sql`${usersTable.id} <> ${me}`)
        .orderBy(usersTable.username)
        .limit(limit);
    } else {
      const like = `${q}%`;
      rows = await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
          discriminator: usersTable.discriminator,
        })
        .from(usersTable)
        .where(
          and(
            sql`${usersTable.id} <> ${me}`,
            sql`(lower(${usersTable.username}) like ${like} or lower(${usersTable.displayName}) like ${like})`,
          ),
        )
        .orderBy(usersTable.username)
        .limit(limit);
    }
    res.json(rows);
  },
);

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const myId = getUserId(req);
  if (raw !== myId && (await isBlockedEitherWay(myId, raw))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const user = await loadUser(raw, myId);
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(user);
});

export default router;
