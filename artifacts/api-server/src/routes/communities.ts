import { Router, type IRouter } from "express";
import {
  db,
  communitiesTable,
  communityHashtagsTable,
  communityMembersTable,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  usersTable,
  messagesTable,
} from "@workspace/db";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";
import { loadPrivateTags, loadMyRoomMemberships } from "../lib/roomVisibility";

const router: IRouter = Router();

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function isUserPremium(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ verified: usersTable.verified, premiumUntil: usersTable.premiumUntil })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return false;
  if (u.premiumUntil && u.premiumUntil > new Date()) return true;
  return u.verified;
}

async function buildCommunitySummaries(myId: string, ids: number[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(communitiesTable)
    .where(inArray(communitiesTable.id, ids));
  const tagRows = await db
    .select()
    .from(communityHashtagsTable)
    .where(inArray(communityHashtagsTable.communityId, ids));
  const tagsMap = new Map<number, string[]>();
  for (const r of tagRows) {
    if (!tagsMap.has(r.communityId)) tagsMap.set(r.communityId, []);
    tagsMap.get(r.communityId)!.push(r.tag);
  }
  const memberCounts = await db
    .select({
      communityId: communityMembersTable.communityId,
      count: sql<number>`count(*)::int`,
    })
    .from(communityMembersTable)
    .where(inArray(communityMembersTable.communityId, ids))
    .groupBy(communityMembersTable.communityId);
  const memberCountMap = new Map(memberCounts.map((r) => [r.communityId, r.count]));
  const myMemberships = await db
    .select({ communityId: communityMembersTable.communityId })
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.userId, myId),
        inArray(communityMembersTable.communityId, ids),
      ),
    );
  const mySet = new Set(myMemberships.map((r) => r.communityId));
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    bannerUrl: c.bannerUrl,
    creatorId: c.creatorId,
    memberCount: memberCountMap.get(c.id) ?? 0,
    hashtags: tagsMap.get(c.id) ?? [],
    isMember: mySet.has(c.id),
    createdAt: c.createdAt.toISOString(),
  }));
}

router.get("/communities", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const mineOnly = String(req.query.mine ?? "") === "true";
  if (mineOnly) {
    const memberships = await db
      .select({ communityId: communityMembersTable.communityId })
      .from(communityMembersTable)
      .where(eq(communityMembersTable.userId, me));
    const ids = memberships.map((r) => r.communityId);
    const summaries = await buildCommunitySummaries(me, ids);
    summaries.sort((a, b) => b.memberCount - a.memberCount);
    res.json(summaries);
    return;
  }
  const all = await db.select({ id: communitiesTable.id }).from(communitiesTable).limit(100);
  const summaries = await buildCommunitySummaries(me, all.map((r) => r.id));
  summaries.sort((a, b) => b.memberCount - a.memberCount);
  res.json(summaries);
});

router.post("/communities", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const body = (req.body ?? {}) as {
    name?: string;
    description?: string | null;
    bannerUrl?: string | null;
    hashtags?: string[];
  };
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (name.length < 2) {
    res.status(400).json({ error: "Name must be at least 2 characters" });
    return;
  }
  const tags = Array.from(
    new Set((body.hashtags ?? []).map(normalizeTag).filter(Boolean)),
  );
  if (tags.length === 0) {
    res.status(400).json({ error: "At least one hashtag is required" });
    return;
  }
  if (tags.length > 12) {
    res.status(400).json({ error: "At most 12 hashtags allowed" });
    return;
  }

  // Limit free users to 1 community
  const [{ count: ownedCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communitiesTable)
    .where(eq(communitiesTable.creatorId, me));
  if ((ownedCount ?? 0) >= 1) {
    const isPremium = await isUserPremium(me);
    if (!isPremium) {
      res
        .status(402)
        .json({ error: "Free tier supports 1 community. Upgrade to Premium for unlimited." });
      return;
    }
  }

  // Generate unique slug
  const baseSlug = slugify(name) || "community";
  let slug = baseSlug;
  for (let i = 0; i < 10; i++) {
    const [exists] = await db
      .select({ id: communitiesTable.id })
      .from(communitiesTable)
      .where(eq(communitiesTable.slug, slug))
      .limit(1);
    if (!exists) break;
    slug = `${baseSlug}-${Math.floor(Math.random() * 9999)}`;
  }

  const desc = body.description ? String(body.description).trim().slice(0, 500) : null;
  const banner = body.bannerUrl ? String(body.bannerUrl).trim().slice(0, 500) : null;

  const [created] = await db
    .insert(communitiesTable)
    .values({
      slug,
      name,
      description: desc,
      bannerUrl: banner,
      creatorId: me,
    })
    .returning();

  for (const tag of tags) {
    await db.insert(hashtagsTable).values({ tag }).onConflictDoNothing();
  }
  if (tags.length > 0) {
    await db
      .insert(communityHashtagsTable)
      .values(tags.map((tag) => ({ communityId: created.id, tag })))
      .onConflictDoNothing();
  }
  await db
    .insert(communityMembersTable)
    .values({ communityId: created.id, userId: me, role: "owner" })
    .onConflictDoNothing();
  // Auto-follow community tags
  for (const tag of tags) {
    await db
      .insert(userFollowedHashtagsTable)
      .values({ userId: me, tag })
      .onConflictDoNothing();
  }

  const [summary] = await buildCommunitySummaries(me, [created.id]);
  res.status(201).json(summary);
});

async function buildCommunityDetail(
  myId: string,
  communityId: number,
): Promise<unknown | null> {
  const [c] = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.id, communityId))
    .limit(1);
  if (!c) return null;
  const tagRows = await db
    .select({ tag: communityHashtagsTable.tag })
    .from(communityHashtagsTable)
    .where(eq(communityHashtagsTable.communityId, communityId));
  const tags = tagRows.map((r) => r.tag);
  const memberRows = await db
    .select({
      userId: communityMembersTable.userId,
      role: communityMembersTable.role,
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      bio: usersTable.bio,
      avatarUrl: usersTable.avatarUrl,
      status: usersTable.status,
      featuredHashtag: usersTable.featuredHashtag,
      discriminator: usersTable.discriminator,
      role_user: usersTable.role,
      mvpPlan: usersTable.mvpPlan,
      verified: usersTable.verified,
      lastSeenAt: usersTable.lastSeenAt,
    })
    .from(communityMembersTable)
    .leftJoin(usersTable, eq(usersTable.id, communityMembersTable.userId))
    .where(eq(communityMembersTable.communityId, communityId))
    .limit(50);

  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, myId));
  const myTagSet = new Set(myTagsRows.map((r) => r.tag));

  const members = memberRows
    .filter((r) => r.id)
    .map((r) => ({
      id: r.id!,
      username: r.username!,
      displayName: r.displayName!,
      bio: r.bio,
      avatarUrl: r.avatarUrl,
      status: r.status!,
      featuredHashtag: r.featuredHashtag,
      discriminator: r.discriminator,
      role: r.role_user!,
      mvpPlan: r.mvpPlan!,
      verified: r.verified!,
      lastSeenAt: (r.lastSeenAt ?? new Date(0)).toISOString(),
      hashtags: [],
      sharedHashtags: tags.filter((t) => myTagSet.has(t)),
      matchScore: 0,
    }));
  const creator = members.find((m) => m.id === c.creatorId) ?? null;
  const isMember = members.some((m) => m.id === myId);
  const canEdit = c.creatorId === myId;

  // Build rooms
  const privateTags = await loadPrivateTags(tags);
  const myMemberTags = await loadMyRoomMemberships(myId, Array.from(privateTags));
  const memberCounts = tags.length === 0 ? [] : await db
    .select({ tag: userHashtagsTable.tag, count: sql<number>`count(*)::int` })
    .from(userHashtagsTable)
    .where(inArray(userHashtagsTable.tag, tags))
    .groupBy(userHashtagsTable.tag);
  const followerCounts = tags.length === 0 ? [] : await db
    .select({ tag: userFollowedHashtagsTable.tag, count: sql<number>`count(*)::int` })
    .from(userFollowedHashtagsTable)
    .where(inArray(userFollowedHashtagsTable.tag, tags))
    .groupBy(userFollowedHashtagsTable.tag);
  const messageCounts = tags.length === 0 ? [] : await db
    .select({ tag: messagesTable.roomTag, count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(inArray(messagesTable.roomTag, tags))
    .groupBy(messagesTable.roomTag);
  const myFollowed = tags.length === 0 ? [] : await db
    .select({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable)
    .where(
      and(
        eq(userFollowedHashtagsTable.userId, myId),
        inArray(userFollowedHashtagsTable.tag, tags),
      ),
    );
  const memberMap = new Map(memberCounts.map((r) => [r.tag, r.count]));
  const followerMap = new Map(followerCounts.map((r) => [r.tag, r.count]));
  const messageMap = new Map(
    messageCounts.filter((r) => r.tag).map((r) => [r.tag!, r.count]),
  );
  const followedSet = new Set(myFollowed.map((r) => r.tag));
  const rooms = tags.map((tag) => ({
    tag,
    memberCount: memberMap.get(tag) ?? 0,
    messageCount: messageMap.get(tag) ?? 0,
    followerCount: followerMap.get(tag) ?? 0,
    recentMessages: 0,
    lastMessage: null,
    isFollowed: followedSet.has(tag),
    isPrivate: privateTags.has(tag),
    isMember: !privateTags.has(tag) || myMemberTags.has(tag),
  }));

  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    bannerUrl: c.bannerUrl,
    creatorId: c.creatorId,
    creator,
    memberCount: members.length,
    members,
    hashtags: tags,
    rooms,
    isMember,
    canEdit,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/communities/:slug", requireAuth, async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [c] = await db
    .select({ id: communitiesTable.id })
    .from(communitiesTable)
    .where(eq(communitiesTable.slug, slug))
    .limit(1);
  if (!c) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  const detail = await buildCommunityDetail(getUserId(req), c.id);
  res.json(detail);
});

router.post("/communities/:slug/join", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const slug = String(req.params.slug);
  const [c] = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.slug, slug))
    .limit(1);
  if (!c) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  await db
    .insert(communityMembersTable)
    .values({ communityId: c.id, userId: me, role: "member" })
    .onConflictDoNothing();
  // Auto-follow all community tags
  const tags = await db
    .select({ tag: communityHashtagsTable.tag })
    .from(communityHashtagsTable)
    .where(eq(communityHashtagsTable.communityId, c.id));
  for (const t of tags) {
    await db
      .insert(userFollowedHashtagsTable)
      .values({ userId: me, tag: t.tag })
      .onConflictDoNothing();
  }
  const detail = await buildCommunityDetail(me, c.id);
  res.json(detail);
});

router.post("/communities/:slug/leave", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const slug = String(req.params.slug);
  const [c] = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.slug, slug))
    .limit(1);
  if (!c) {
    res.status(404).json({ error: "Community not found" });
    return;
  }
  if (c.creatorId === me) {
    res.status(400).json({ error: "Owner cannot leave the community" });
    return;
  }
  await db
    .delete(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.communityId, c.id),
        eq(communityMembersTable.userId, me),
      ),
    );
  const detail = await buildCommunityDetail(me, c.id);
  res.json(detail);
});

void desc;

export default router;
