import { Router, type IRouter } from "express";
import {
  db,
  usersTable,
  hashtagsTable,
  userHashtagsTable,
  userFollowedHashtagsTable,
  postsTable,
  messagesTable,
  conversationsTable,
  roomMembersTable,
  roomVisibilityTable,
  userBlocksTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { normalizeTag } from "../lib/hashtags";

const router: IRouter = Router();

function makeSnippet(content: string, q: string): string {
  if (!content) return "";
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return content.slice(0, 160);
  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + q.length + 100);
  let snip = content.slice(start, end);
  if (start > 0) snip = "…" + snip;
  if (end < content.length) snip = snip + "…";
  return snip;
}

router.get("/search", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const qRaw = String(req.query.q ?? "").trim();
  const kind = String(req.query.kind ?? "all");
  const limitRaw = parseInt(String(req.query.limit ?? "10"), 10);
  const limit = Math.min(Math.max(Number.isNaN(limitRaw) ? 10 : limitRaw, 1), 25);

  if (qRaw.length < 1) {
    res.json({ q: qRaw, users: [], hashtags: [], rooms: [], posts: [], messages: [] });
    return;
  }
  const q = qRaw.slice(0, 200);
  const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
  const tagQuery = normalizeTag(q.replace(/^#/, ""));

  const want = (k: string) => kind === "all" || kind === k;

  // Fetch blocks (both directions) so we never surface them
  const blockRows = await db
    .select()
    .from(userBlocksTable)
    .where(
      or(
        eq(userBlocksTable.blockerId, me),
        eq(userBlocksTable.blockedId, me),
      ),
    );
  const hiddenIds = new Set<string>();
  for (const b of blockRows) {
    if (b.blockerId === me) hiddenIds.add(b.blockedId);
    if (b.blockedId === me) hiddenIds.add(b.blockerId);
  }
  const hiddenList = Array.from(hiddenIds);

  // Helper for "not in hidden"
  const notHidden = hiddenList.length
    ? sql`${usersTable.id} NOT IN (${sql.join(hiddenList.map((id) => sql`${id}`), sql`, `)})`
    : sql`TRUE`;

  // ---- USERS ----
  let users: any[] = [];
  if (want("users")) {
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
        bio: usersTable.bio,
        discriminator: usersTable.discriminator,
        verified: usersTable.verified,
        mvpPlan: usersTable.mvpPlan,
      })
      .from(usersTable)
      .where(
        and(
          sql`${usersTable.bannedAt} IS NULL`,
          notHidden,
          or(
            ilike(usersTable.username, like),
            ilike(usersTable.displayName, like),
          ),
        ),
      )
      .orderBy(desc(usersTable.verified), desc(usersTable.mvpPlan))
      .limit(limit);
    users = rows;
  }

  // ---- HASHTAGS ----
  let hashtags: any[] = [];
  if (want("hashtags")) {
    const rows = await db
      .select({
        tag: hashtagsTable.tag,
        memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${userHashtagsTable} WHERE ${userHashtagsTable.tag} = ${hashtagsTable.tag})`,
        messageCount: sql<number>`(SELECT COUNT(*)::int FROM ${messagesTable} WHERE ${messagesTable.roomTag} = ${hashtagsTable.tag})`,
        followerCount: sql<number>`(SELECT COUNT(*)::int FROM ${userFollowedHashtagsTable} WHERE ${userFollowedHashtagsTable.tag} = ${hashtagsTable.tag})`,
      })
      .from(hashtagsTable)
      .where(ilike(hashtagsTable.tag, `%${tagQuery || q}%`))
      .limit(limit);
    hashtags = rows;
  }

  // ---- ROOMS (hashtags with messages or members; respect privacy) ----
  let rooms: any[] = [];
  if (want("rooms")) {
    const memberRows = await db
      .select({ tag: roomMembersTable.tag })
      .from(roomMembersTable)
      .where(eq(roomMembersTable.userId, me));
    const myMemberTags = new Set(memberRows.map((r) => r.tag));

    const visibilityRows = await db
      .select({
        tag: roomVisibilityTable.tag,
        isPrivate: roomVisibilityTable.isPrivate,
      })
      .from(roomVisibilityTable);
    const privacyMap = new Map(visibilityRows.map((v) => [v.tag, v.isPrivate]));

    const candidate = await db
      .select({
        tag: hashtagsTable.tag,
        messageCount: sql<number>`(SELECT COUNT(*)::int FROM ${messagesTable} WHERE ${messagesTable.roomTag} = ${hashtagsTable.tag})`,
        memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${userHashtagsTable} WHERE ${userHashtagsTable.tag} = ${hashtagsTable.tag})`,
        followerCount: sql<number>`(SELECT COUNT(*)::int FROM ${userFollowedHashtagsTable} WHERE ${userFollowedHashtagsTable.tag} = ${hashtagsTable.tag})`,
        recentMessages: sql<number>`(SELECT COUNT(*)::int FROM ${messagesTable} WHERE ${messagesTable.roomTag} = ${hashtagsTable.tag} AND ${messagesTable.createdAt} > NOW() - INTERVAL '7 days')`,
      })
      .from(hashtagsTable)
      .where(ilike(hashtagsTable.tag, `%${tagQuery || q}%`))
      .limit(limit * 3);

    rooms = candidate
      .map((r) => {
        const isPrivate = !!privacyMap.get(r.tag);
        const isMember = myMemberTags.has(r.tag);
        return { ...r, isPrivate, isMember };
      })
      .filter((r) => !r.isPrivate || r.isMember)
      .slice(0, limit);
  }

  // ---- POSTS ----
  let posts: any[] = [];
  if (want("posts")) {
    const rows = await db
      .select({
        id: postsTable.id,
        content: postsTable.content,
        createdAt: postsTable.createdAt,
        authorId: postsTable.authorId,
      })
      .from(postsTable)
      .where(
        and(
          ilike(postsTable.content, like),
          hiddenList.length
            ? sql`${postsTable.authorId} NOT IN (${sql.join(hiddenList.map((id) => sql`${id}`), sql`, `)})`
            : sql`TRUE`,
        ),
      )
      .orderBy(desc(postsTable.createdAt))
      .limit(limit);
    if (rows.length > 0) {
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
      posts = rows.map((r) => ({
        id: r.id,
        author: authorMap.get(r.authorId) ?? {
          id: r.authorId,
          username: "unknown",
          displayName: "Unknown",
          role: "user",
          mvpPlan: false,
          verified: false,
        },
        content: r.content,
        snippet: makeSnippet(r.content, q),
        createdAt: r.createdAt.toISOString(),
      }));
    }
  }

  // ---- MESSAGES (only those I can see: rooms I'm in or DMs I'm in) ----
  let messages: any[] = [];
  if (want("messages")) {
    // Rooms I am a member of
    const roomRows = await db
      .select({ tag: roomMembersTable.tag })
      .from(roomMembersTable)
      .where(eq(roomMembersTable.userId, me));
    const myRoomTags = roomRows.map((r) => r.tag);

    // DM conversations I'm in
    const convRows = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        or(
          eq(conversationsTable.userAId, me),
          eq(conversationsTable.userBId, me),
        ),
      );
    const myConvIds = convRows.map((c) => c.id);

    const visibility = and(
      sql`${messagesTable.deletedAt} IS NULL`,
      hiddenList.length
        ? sql`${messagesTable.senderId} NOT IN (${sql.join(hiddenList.map((id) => sql`${id}`), sql`, `)})`
        : sql`TRUE`,
      or(
        myRoomTags.length
          ? inArray(messagesTable.roomTag, myRoomTags)
          : sql`FALSE`,
        myConvIds.length
          ? inArray(messagesTable.conversationId, myConvIds)
          : sql`FALSE`,
      ),
      ilike(messagesTable.content, like),
    );

    const rows = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        createdAt: messagesTable.createdAt,
        senderId: messagesTable.senderId,
        roomTag: messagesTable.roomTag,
        conversationId: messagesTable.conversationId,
      })
      .from(messagesTable)
      .where(visibility)
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);

    if (rows.length > 0) {
      const senderIds = Array.from(new Set(rows.map((r) => r.senderId)));
      const senders = await db
        .select({
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, senderIds));
      const sm = new Map(senders.map((s) => [s.id, s]));
      messages = rows.map((r) => {
        const s = sm.get(r.senderId);
        const href =
          r.roomTag != null
            ? `/app/rooms/${r.roomTag}`
            : r.conversationId != null
              ? `/app/messages/${r.conversationId}`
              : null;
        return {
          id: r.id,
          senderName: s?.displayName ?? "Unknown",
          senderUsername: s?.username ?? "unknown",
          senderAvatarUrl: s?.avatarUrl ?? null,
          content: r.content,
          snippet: makeSnippet(r.content, q),
          roomTag: r.roomTag,
          conversationId: r.conversationId,
          href,
          createdAt: r.createdAt.toISOString(),
        };
      });
    }
  }

  res.json({ q, users, hashtags, rooms, posts, messages });
});

export default router;
