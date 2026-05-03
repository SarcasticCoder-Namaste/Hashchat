import { Router, type IRouter } from "express";
import {
  db,
  conversationsTable,
  conversationMembersTable,
  conversationReadsTable,
  conversationTypingTable,
  conversationBackgroundsTable,
  messagesTable,
  usersTable,
  userHashtagsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql, gt, ne } from "drizzle-orm";
import { requireAuth, getUserId } from "../middlewares/requireAuth";
import { isValidStorageUrl } from "../lib/storageUrls";
import { serializeWaveform } from "../lib/waveform";
import { transcribeMessageAudio } from "../lib/transcribeAudio";
import { loadBlockWall, isBlockedEitherWay } from "../lib/relationships";
import {
  presenceStateFor,
  publicCurrentRoom,
  publicLastSeenAt,
} from "../lib/presence";
import { isAllowedGifUrl } from "../lib/giphy";
import {
  buildMessages as sharedBuildMessages,
  maybeAttachLinkPreview,
  attachImage,
} from "../lib/buildMessages";
import {
  OpenConversationBody,
  SendConversationMessageBody,
  SetConversationBackgroundBody,
  MarkConversationReadBody,
  CreateGroupConversationBody,
  RenameConversationBody,
  AddConversationMembersBody,
} from "@workspace/api-zod";
import { resolveMentions, recordMentions } from "../lib/mentions";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

const MAX_GROUP_MEMBERS = 10;

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

type RawMessageRow = {
  id: number;
  conversationId: number | null;
  roomTag: string | null;
  senderId: string;
  content: string;
  kind: string;
  imageUrl: string | null;
  imageAlt: string | null;
  audioUrl: string | null;
  audioWaveform: string | null;
  audioTranscript: string | null;
  replyToId: number | null;
  createdAt: Date;
};

async function buildMessages(rows: RawMessageRow[], myUserId: string) {
  return sharedBuildMessages(rows, myUserId);
}

async function isMember(conversationId: number, userId: string): Promise<boolean> {
  const [m] = await db
    .select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, userId),
      ),
    )
    .limit(1);
  return !!m;
}

async function loadMembers(conversationId: number) {
  const rows = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      discriminator: usersTable.discriminator,
      lastSeenAt: usersTable.lastSeenAt,
      joinedAt: conversationMembersTable.joinedAt,
    })
    .from(conversationMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, conversationMembersTable.userId))
    .where(eq(conversationMembersTable.conversationId, conversationId))
    .orderBy(conversationMembersTable.joinedAt);
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: r.avatarUrl,
    discriminator: r.discriminator,
    lastSeenAt: r.lastSeenAt.toISOString(),
    joinedAt: r.joinedAt.toISOString(),
  }));
}

async function buildOtherUserShape(otherId: string, me: string) {
  const [other] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, otherId))
    .limit(1);
  if (!other) return null;
  const otherTags = (
    await db
      .select({ tag: userHashtagsTable.tag })
      .from(userHashtagsTable)
      .where(eq(userHashtagsTable.userId, otherId))
  ).map((r) => r.tag);
  const myTagsRows = await db
    .select({ tag: userHashtagsTable.tag })
    .from(userHashtagsTable)
    .where(eq(userHashtagsTable.userId, me));
  const myTagSet = new Set(myTagsRows.map((r) => r.tag));
  const shared = otherTags.filter((t) => myTagSet.has(t));
  return {
    id: other.id,
    username: other.username,
    displayName: other.displayName,
    bio: other.bio,
    avatarUrl: other.avatarUrl,
    status: other.status,
    featuredHashtag: other.featuredHashtag,
    discriminator: other.discriminator,
    role: other.role,
    mvpPlan: other.mvpPlan,
    verified: other.verified,
    lastSeenAt: other.lastSeenAt.toISOString(),
    hashtags: otherTags,
    sharedHashtags: shared,
    matchScore: shared.length,
  };
}

async function buildConversationView(conversationId: number, me: string) {
  const [convo] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!convo) return null;
  const members = await loadMembers(conversationId);
  const [myMembership] = await db
    .select({ mutedAt: conversationMembersTable.mutedAt })
    .from(conversationMembersTable)
    .where(
      and(
        eq(conversationMembersTable.conversationId, conversationId),
        eq(conversationMembersTable.userId, me),
      ),
    )
    .limit(1);
  const isMuted = !!myMembership?.mutedAt;

  const lastMessages = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        sql`${messagesTable.deletedAt} IS NULL`,
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);
  const built = await buildMessages(lastMessages, me);

  const [readRow] = await db
    .select()
    .from(conversationReadsTable)
    .where(
      and(
        eq(conversationReadsTable.conversationId, conversationId),
        eq(conversationReadsTable.userId, me),
      ),
    )
    .limit(1);
  const lastReadAt = readRow?.lastReadAt ?? new Date(0);
  const [unread] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        ne(messagesTable.senderId, me),
        gt(messagesTable.createdAt, lastReadAt),
      ),
    );

  const [bgRow] = await db
    .select()
    .from(conversationBackgroundsTable)
    .where(
      and(
        eq(conversationBackgroundsTable.conversationId, conversationId),
        eq(conversationBackgroundsTable.userId, me),
      ),
    )
    .limit(1);

  let otherUser: Awaited<ReturnType<typeof buildOtherUserShape>> | null = null;
  if (convo.kind === "direct") {
    const otherMember = members.find((m) => m.id !== me);
    if (otherMember) {
      otherUser = await buildOtherUserShape(otherMember.id, me);
    }
  }

  return {
    id: convo.id,
    kind: convo.kind,
    title: convo.title,
    creatorId: convo.creatorId,
    otherUser,
    members,
    lastMessage: built[0] ?? null,
    unreadCount: unread?.count ?? 0,
    isMuted,
    backgroundUrl: bgRow?.backgroundUrl ?? convo.backgroundUrl ?? null,
    updatedAt: convo.updatedAt.toISOString(),
  };
}

async function insertSystemMessage(
  conversationId: number,
  actorId: string,
  text: string,
) {
  await db.insert(messagesTable).values({
    conversationId,
    senderId: actorId,
    content: text,
    kind: "system",
  });
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));
}

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const me = getUserId(req);
  const myMemberships = await db
    .select({ conversationId: conversationMembersTable.conversationId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, me));
  if (myMemberships.length === 0) {
    res.json([]);
    return;
  }
  const ids = myMemberships.map((m) => m.conversationId);
  const convos = await db
    .select()
    .from(conversationsTable)
    .where(inArray(conversationsTable.id, ids))
    .orderBy(desc(conversationsTable.updatedAt));

  const blockWall = await loadBlockWall(me);
  const visibleIds: number[] = [];
  for (const c of convos) {
    if (c.kind === "direct") {
      const otherId = c.userAId === me ? c.userBId : c.userAId;
      if (otherId && blockWall.has(otherId)) continue;
    }
    visibleIds.push(c.id);
  }

  const result = [];
  for (const id of visibleIds) {
    const view = await buildConversationView(id, me);
    if (view) result.push(view);
  }
  res.json(result);
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const parsed = OpenConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const me = getUserId(req);
  const otherId = parsed.data.userId;
  if (otherId === me) {
    res.status(400).json({ error: "Cannot open conversation with yourself" });
    return;
  }
  if (await isBlockedEitherWay(me, otherId)) {
    res.status(403).json({ error: "Blocked" });
    return;
  }
  const [other] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, otherId))
    .limit(1);
  if (!other) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [a, b] = pair(me, otherId);
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.kind, "direct"),
        eq(conversationsTable.userAId, a),
        eq(conversationsTable.userBId, b),
      ),
    )
    .limit(1);
  let convoId: number;
  if (existing) {
    convoId = existing.id;
  } else {
    const [created] = await db
      .insert(conversationsTable)
      .values({ kind: "direct", userAId: a, userBId: b, creatorId: me })
      .returning();
    convoId = created.id;
    await db
      .insert(conversationMembersTable)
      .values([
        { conversationId: convoId, userId: a },
        { conversationId: convoId, userId: b },
      ])
      .onConflictDoNothing();
  }

  // Membership backfill safeguard for legacy direct rows.
  await db
    .insert(conversationMembersTable)
    .values([
      { conversationId: convoId, userId: a },
      { conversationId: convoId, userId: b },
    ])
    .onConflictDoNothing();

  const view = await buildConversationView(convoId, me);
  res.json(view);
});

router.post(
  "/conversations/group",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = CreateGroupConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const requestedIds = Array.from(
      new Set(parsed.data.userIds.filter((u) => u && u !== me)),
    );
    if (requestedIds.length < 2) {
      res
        .status(400)
        .json({ error: "Group needs at least 2 other members (3 total)" });
      return;
    }
    const totalMembers = requestedIds.length + 1;
    if (totalMembers > MAX_GROUP_MEMBERS) {
      res
        .status(400)
        .json({ error: `Group cannot exceed ${MAX_GROUP_MEMBERS} members` });
      return;
    }
    const existingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.id, requestedIds));
    if (existingUsers.length !== requestedIds.length) {
      res.status(400).json({ error: "One or more users not found" });
      return;
    }
    for (const uid of requestedIds) {
      if (await isBlockedEitherWay(me, uid)) {
        res
          .status(403)
          .json({ error: "Cannot include a user you've blocked or who blocked you" });
        return;
      }
    }
    const title = parsed.data.title?.trim() || null;
    if (title && title.length > 80) {
      res.status(400).json({ error: "Title too long" });
      return;
    }
    const [created] = await db
      .insert(conversationsTable)
      .values({ kind: "group", title, creatorId: me })
      .returning();
    const memberRows = [me, ...requestedIds].map((userId) => ({
      conversationId: created.id,
      userId,
    }));
    await db.insert(conversationMembersTable).values(memberRows);
    await insertSystemMessage(created.id, me, "created the group");
    const groupLabel = title ? `“${title}”` : "a group chat";
    // Notify other members they were added.
    for (const uid of requestedIds) {
      await createNotification({
        recipientId: uid,
        actorId: me,
        kind: "dm",
        targetType: "conversation",
        targetId: created.id,
        snippet: `added you to ${groupLabel}`,
      });
    }
    // Notify the creator that the group was created (no actor → not self-skipped).
    await createNotification({
      recipientId: me,
      actorId: null,
      kind: "dm",
      targetType: "conversation",
      targetId: created.id,
      snippet: `You created ${groupLabel}`,
    });
    const view = await buildConversationView(created.id, me);
    res.status(201).json(view);
  },
);

router.patch(
  "/conversations/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = RenameConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || !(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (convo.kind !== "group") {
      res.status(400).json({ error: "Only group conversations can be renamed" });
      return;
    }
    if (convo.creatorId !== me) {
      res.status(403).json({ error: "Only the creator can rename" });
      return;
    }
    const title = parsed.data.title?.trim() || null;
    if (title && title.length > 80) {
      res.status(400).json({ error: "Title too long" });
      return;
    }
    await db
      .update(conversationsTable)
      .set({ title, updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));
    await insertSystemMessage(
      id,
      me,
      title ? `renamed the group to “${title}”` : "cleared the group name",
    );
    // Notify other members of the rename.
    const otherMembers = await db
      .select({ userId: conversationMembersTable.userId })
      .from(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          ne(conversationMembersTable.userId, me),
        ),
      );
    const renameSnippet = title
      ? `renamed the group to “${title}”`
      : "cleared the group name";
    for (const m of otherMembers) {
      await createNotification({
        recipientId: m.userId,
        actorId: me,
        kind: "dm",
        targetType: "conversation",
        targetId: id,
        snippet: renameSnippet,
      });
    }
    const view = await buildConversationView(id, me);
    res.json(view);
  },
);

router.post(
  "/conversations/:id/members",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = AddConversationMembersBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || !(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (convo.kind !== "group") {
      res
        .status(400)
        .json({ error: "Cannot add members to a direct conversation" });
      return;
    }
    const requestedIds = Array.from(
      new Set(parsed.data.userIds.filter((u) => u && u !== me)),
    );
    if (requestedIds.length === 0) {
      res.status(400).json({ error: "No users to add" });
      return;
    }
    const existingMembers = await db
      .select({ userId: conversationMembersTable.userId })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.conversationId, id));
    const memberSet = new Set(existingMembers.map((r) => r.userId));
    const toAdd = requestedIds.filter((u) => !memberSet.has(u));
    if (toAdd.length === 0) {
      const view = await buildConversationView(id, me);
      res.json(view);
      return;
    }
    if (memberSet.size + toAdd.length > MAX_GROUP_MEMBERS) {
      res
        .status(400)
        .json({ error: `Group cannot exceed ${MAX_GROUP_MEMBERS} members` });
      return;
    }
    const existingUsers = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, toAdd));
    if (existingUsers.length !== toAdd.length) {
      res.status(400).json({ error: "One or more users not found" });
      return;
    }
    for (const uid of toAdd) {
      if (await isBlockedEitherWay(me, uid)) {
        res
          .status(403)
          .json({ error: "Cannot add a user you've blocked or who blocked you" });
        return;
      }
    }
    await db
      .insert(conversationMembersTable)
      .values(toAdd.map((userId) => ({ conversationId: id, userId })));
    const nameMap = new Map(
      existingUsers.map((u) => [u.id, u.displayName || u.username]),
    );
    const names = toAdd.map((u) => nameMap.get(u) ?? "someone").join(", ");
    await insertSystemMessage(id, me, `added ${names}`);
    const groupLabel = convo.title ? `“${convo.title}”` : "a group chat";
    for (const uid of toAdd) {
      await createNotification({
        recipientId: uid,
        actorId: me,
        kind: "dm",
        targetType: "conversation",
        targetId: id,
        snippet: `added you to ${groupLabel}`,
      });
    }
    const view = await buildConversationView(id, me);
    res.json(view);
  },
);

router.delete(
  "/conversations/:id/members/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(rawId, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const targetId = String(
      Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId,
    );
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || !(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (convo.kind !== "group") {
      res.status(400).json({ error: "Only group members can be removed" });
      return;
    }
    if (convo.creatorId !== me) {
      res.status(403).json({ error: "Only the creator can remove members" });
      return;
    }
    if (targetId === me) {
      res
        .status(400)
        .json({ error: "Use the leave endpoint to remove yourself" });
      return;
    }
    if (!(await isMember(id, targetId))) {
      res.status(404).json({ error: "Not a member" });
      return;
    }
    const [target] = await db
      .select({
        displayName: usersTable.displayName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .limit(1);
    await db
      .delete(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          eq(conversationMembersTable.userId, targetId),
        ),
      );
    await insertSystemMessage(
      id,
      me,
      `removed ${target?.displayName ?? target?.username ?? "a member"}`,
    );
    // Notify the removed user.
    const removedLabel = convo.title ? `“${convo.title}”` : "a group chat";
    await createNotification({
      recipientId: targetId,
      actorId: me,
      kind: "dm",
      targetType: "conversation",
      targetId: id,
      snippet: `removed you from ${removedLabel}`,
    });
    res.status(204).end();
  },
);

router.post(
  "/conversations/:id/leave",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || !(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (convo.kind !== "group") {
      res
        .status(400)
        .json({ error: "Cannot leave a direct conversation" });
      return;
    }
    const [meRow] = await db
      .select({
        displayName: usersTable.displayName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(eq(usersTable.id, me))
      .limit(1);
    await db
      .delete(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          eq(conversationMembersTable.userId, me),
        ),
      );
    await insertSystemMessage(
      id,
      me,
      `${meRow?.displayName ?? meRow?.username ?? "Someone"} left the group`,
    );
    // If the creator leaves, transfer ownership to the next-joined member.
    if (convo.creatorId === me) {
      const [next] = await db
        .select({ userId: conversationMembersTable.userId })
        .from(conversationMembersTable)
        .where(eq(conversationMembersTable.conversationId, id))
        .orderBy(conversationMembersTable.joinedAt)
        .limit(1);
      await db
        .update(conversationsTable)
        .set({ creatorId: next?.userId ?? null })
        .where(eq(conversationsTable.id, id));
    }
    res.status(204).end();
  },
);

router.post(
  "/conversations/:id/mute",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(conversationMembersTable)
      .set({ mutedAt: new Date() })
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          eq(conversationMembersTable.userId, me),
        ),
      );
    const view = await buildConversationView(id, me);
    res.json(view);
  },
);

router.delete(
  "/conversations/:id/mute",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(conversationMembersTable)
      .set({ mutedAt: null })
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          eq(conversationMembersTable.userId, me),
        ),
      );
    const view = await buildConversationView(id, me);
    res.json(view);
  },
);

router.get(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.conversationId, id),
          sql`${messagesTable.deletedAt} IS NULL`,
        ),
      )
      .orderBy(messagesTable.createdAt)
      .limit(200);

    const lastMsgId = rows.length > 0 ? rows[rows.length - 1].id : null;
    await db
      .insert(conversationReadsTable)
      .values({
        conversationId: id,
        userId: me,
        lastReadAt: new Date(),
        lastReadMessageId: lastMsgId,
      })
      .onConflictDoUpdate({
        target: [
          conversationReadsTable.conversationId,
          conversationReadsTable.userId,
        ],
        set: { lastReadAt: new Date(), lastReadMessageId: lastMsgId },
      });

    res.json(await buildMessages(rows, me));
  },
);

router.post(
  "/conversations/:id/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SendConversationMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const me = getUserId(req);
    const [convo] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!convo || !(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Block check: for direct, with the other member; for group, ensure no
    // recipient is in a block relationship with me.
    const memberRows = await db
      .select({ userId: conversationMembersTable.userId })
      .from(conversationMembersTable)
      .where(
        and(
          eq(conversationMembersTable.conversationId, id),
          ne(conversationMembersTable.userId, me),
        ),
      );
    const otherMemberIds = memberRows.map((r) => r.userId);
    if (convo.kind === "direct") {
      const otherId = otherMemberIds[0];
      if (otherId && (await isBlockedEitherWay(me, otherId))) {
        res.status(403).json({ error: "Blocked" });
        return;
      }
    }
    if (parsed.data.imageUrl != null && !isValidStorageUrl(parsed.data.imageUrl)) {
      res
        .status(400)
        .json({ error: "imageUrl must reference an uploaded object" });
      return;
    }
    if (parsed.data.audioUrl != null && !isValidStorageUrl(parsed.data.audioUrl)) {
      res
        .status(400)
        .json({ error: "audioUrl must reference an uploaded object" });
      return;
    }
    if (parsed.data.audioWaveform != null && parsed.data.audioUrl == null) {
      res.status(400).json({ error: "audioWaveform requires audioUrl" });
      return;
    }
    const waveformJson = serializeWaveform(parsed.data.audioWaveform ?? null);
    if (parsed.data.gifUrl != null && !isAllowedGifUrl(parsed.data.gifUrl)) {
      res
        .status(400)
        .json({ error: "gifUrl must come from the configured GIF provider" });
      return;
    }
    const replyToId = parsed.data.replyToId ?? null;
    if (replyToId !== null) {
      const [refMsg] = await db
        .select({
          id: messagesTable.id,
          conversationId: messagesTable.conversationId,
        })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.id, replyToId),
            sql`${messagesTable.deletedAt} IS NULL`,
          ),
        )
        .limit(1);
      if (!refMsg || refMsg.conversationId !== id) {
        res.status(400).json({ error: "Invalid replyToId" });
        return;
      }
    }
    const [created] = await db
      .insert(messagesTable)
      .values({
        conversationId: id,
        senderId: me,
        content: parsed.data.content,
        kind: "user",
        imageUrl: parsed.data.imageUrl ?? parsed.data.gifUrl ?? null,
        imageAlt:
          (parsed.data.imageUrl ?? parsed.data.gifUrl) != null
            ? (parsed.data.imageAlt ?? null)
            : null,
        audioUrl: parsed.data.audioUrl ?? null,
        audioWaveform: waveformJson,
        replyToId,
      })
      .returning();
    if (parsed.data.imageUrl) {
      await attachImage(created.id, parsed.data.imageUrl, "image");
    }
    if (parsed.data.gifUrl) {
      await attachImage(created.id, parsed.data.gifUrl, "gif");
    }
    if (parsed.data.content) {
      void maybeAttachLinkPreview(created.id, parsed.data.content);
    }
    if (parsed.data.audioUrl) {
      // Fire-and-forget transcription; updates message row when ready.
      transcribeMessageAudio(created.id, parsed.data.audioUrl);
    }
    await db
      .update(conversationsTable)
      .set({ updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));

    await db
      .delete(conversationTypingTable)
      .where(
        and(
          eq(conversationTypingTable.conversationId, id),
          eq(conversationTypingTable.userId, me),
        ),
      );

    const resolved = await resolveMentions(parsed.data.content);
    const recorded = await recordMentions({
      mentionerId: me,
      targetType: "message",
      targetId: created.id,
      resolved,
    });
    const mentionedSet = new Set(recorded.map((u) => u.id));
    for (const u of recorded) {
      if (u.id === me) continue;
      await createNotification({
        recipientId: u.id,
        actorId: me,
        kind: "mention",
        targetType: "conversation",
        targetId: id,
        snippet: parsed.data.content.slice(0, 200),
      });
    }

    if (replyToId !== null) {
      const [parent] = await db
        .select({ senderId: messagesTable.senderId })
        .from(messagesTable)
        .where(eq(messagesTable.id, replyToId))
        .limit(1);
      if (parent && parent.senderId !== me && !mentionedSet.has(parent.senderId)) {
        await createNotification({
          recipientId: parent.senderId,
          actorId: me,
          kind: "reply",
          targetType: "conversation",
          targetId: id,
          snippet: parsed.data.content.slice(0, 200),
        });
      }
    }

    const [built] = await buildMessages([created], me);
    res.status(201).json(built);
  },
);

router.post(
  "/conversations/:id/typing",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .insert(conversationTypingTable)
      .values({ conversationId: id, userId: me, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          conversationTypingTable.conversationId,
          conversationTypingTable.userId,
        ],
        set: { updatedAt: new Date() },
      });
    res.status(204).end();
  },
);

router.get(
  "/conversations/:id/typing",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const cutoff = new Date(Date.now() - 4000);
    const rows = await db
      .select({
        id: conversationTypingTable.userId,
        displayName: usersTable.displayName,
      })
      .from(conversationTypingTable)
      .innerJoin(usersTable, eq(usersTable.id, conversationTypingTable.userId))
      .where(
        and(
          eq(conversationTypingTable.conversationId, id),
          gt(conversationTypingTable.updatedAt, cutoff),
          ne(conversationTypingTable.userId, me),
        ),
      );
    res.json({ users: rows });
  },
);

router.post(
  "/conversations/:id/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let messageId: number | null = null;
    if (req.body && Object.keys(req.body).length > 0) {
      const parsed = MarkConversationReadBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.message });
        return;
      }
      messageId = parsed.data.messageId ?? null;
    }
    if (messageId === null) {
      const [latest] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, id),
            sql`${messagesTable.deletedAt} IS NULL`,
          ),
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);
      messageId = latest?.id ?? null;
    }
    await db
      .insert(conversationReadsTable)
      .values({
        conversationId: id,
        userId: me,
        lastReadAt: new Date(),
        lastReadMessageId: messageId,
      })
      .onConflictDoUpdate({
        target: [
          conversationReadsTable.conversationId,
          conversationReadsTable.userId,
        ],
        set: { lastReadAt: new Date(), lastReadMessageId: messageId },
      });
    res.status(204).end();
  },
);

router.patch(
  "/conversations/:id/background",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = SetConversationBackgroundBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!isValidStorageUrl(parsed.data.backgroundUrl)) {
      res
        .status(400)
        .json({ error: "backgroundUrl must reference an uploaded object" });
      return;
    }
    const me = getUserId(req);
    if (!(await isMember(id, me))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .insert(conversationBackgroundsTable)
      .values({
        conversationId: id,
        userId: me,
        backgroundUrl: parsed.data.backgroundUrl,
      })
      .onConflictDoUpdate({
        target: [
          conversationBackgroundsTable.conversationId,
          conversationBackgroundsTable.userId,
        ],
        set: {
          backgroundUrl: parsed.data.backgroundUrl,
          updatedAt: new Date(),
        },
      });
    res.json({ ok: true });
  },
);

router.delete(
  "/conversations/:id/background",
  requireAuth,
  async (req, res): Promise<void> => {
    const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const me = getUserId(req);
    await db
      .delete(conversationBackgroundsTable)
      .where(
        and(
          eq(conversationBackgroundsTable.conversationId, id),
          eq(conversationBackgroundsTable.userId, me),
        ),
      );
    res.status(204).end();
  },
);

export default router;
