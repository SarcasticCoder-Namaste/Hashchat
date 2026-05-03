import {
  db,
  messagesTable,
  reactionsTable,
  usersTable,
  messageAttachmentsTable,
  pollsTable,
  pollOptionsTable,
  pollVotesTable,
  mentionsTable,
  conversationsTable,
  conversationReadsTable,
} from "@workspace/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { fetchLinkPreview, extractFirstUrl } from "./linkPreview";

type RawMessage = {
  id: number;
  conversationId: number | null;
  roomTag: string | null;
  senderId: string;
  content: string;
  imageUrl: string | null;
  audioUrl: string | null;
  audioWaveform: string | null;
  replyToId: number | null;
  createdAt: Date;
};

export async function buildMessages(rows: RawMessage[], myUserId: string) {
  if (rows.length === 0) return [];
  const senderIds = Array.from(new Set(rows.map((r) => r.senderId)));
  const senders = await db
    .select({
      id: usersTable.id,
      displayName: usersTable.displayName,
      username: usersTable.username,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, senderIds));
  const senderMap = new Map(senders.map((s) => [s.id, s]));

  const replyIds = rows
    .map((r) => r.replyToId)
    .filter((v): v is number => v !== null);
  const replyMap = new Map<number, { content: string; senderId: string }>();
  if (replyIds.length > 0) {
    const conversationIds = Array.from(
      new Set(
        rows.map((r) => r.conversationId).filter((v): v is number => v !== null),
      ),
    );
    const roomTags = Array.from(
      new Set(rows.map((r) => r.roomTag).filter((v): v is string => v !== null)),
    );
    const scopeFilters = [];
    if (conversationIds.length > 0)
      scopeFilters.push(inArray(messagesTable.conversationId, conversationIds));
    if (roomTags.length > 0)
      scopeFilters.push(inArray(messagesTable.roomTag, roomTags));
    if (scopeFilters.length > 0) {
      const replies = await db
        .select({
          id: messagesTable.id,
          content: messagesTable.content,
          senderId: messagesTable.senderId,
        })
        .from(messagesTable)
        .where(
          and(
            inArray(messagesTable.id, replyIds),
            or(...scopeFilters),
            sql`${messagesTable.deletedAt} IS NULL`,
          ),
        );
      for (const r of replies)
        replyMap.set(r.id, { content: r.content, senderId: r.senderId });
    }
  }

  // Reply count per message (count of children pointing at this message)
  const messageIdsForReplyCount = rows.map((r) => r.id);
  const replyCountMap = new Map<number, number>();
  if (messageIdsForReplyCount.length > 0) {
    const replyCounts = await db
      .select({
        parentId: messagesTable.replyToId,
        count: sql<number>`count(*)::int`,
      })
      .from(messagesTable)
      .where(
        and(
          inArray(messagesTable.replyToId, messageIdsForReplyCount),
          sql`${messagesTable.deletedAt} IS NULL`,
        ),
      )
      .groupBy(messagesTable.replyToId);
    for (const c of replyCounts) {
      if (c.parentId !== null) replyCountMap.set(c.parentId, c.count);
    }
  }

  // Collect extra sender ids referenced by replies so we can label them
  const extraSenderIds = Array.from(
    new Set(
      Array.from(replyMap.values())
        .map((v) => v.senderId)
        .filter((id) => !senderMap.has(id)),
    ),
  );
  if (extraSenderIds.length > 0) {
    const extra = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, extraSenderIds));
    for (const s of extra) senderMap.set(s.id, s);
  }

  const messageIds = rows.map((r) => r.id);
  const allReactions = await db
    .select()
    .from(reactionsTable)
    .where(inArray(reactionsTable.messageId, messageIds));
  const reactionMap = new Map<
    number,
    { emoji: string; count: number; reactedByMe: boolean }[]
  >();
  for (const r of allReactions) {
    const list = reactionMap.get(r.messageId) ?? [];
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
    reactionMap.set(r.messageId, list);
  }

  const attachments = await db
    .select()
    .from(messageAttachmentsTable)
    .where(inArray(messageAttachmentsTable.messageId, messageIds));
  const attachmentMap = new Map<
    number,
    {
      id: number;
      kind: string;
      url: string;
      title: string | null;
      description: string | null;
      thumbnailUrl: string | null;
    }[]
  >();
  const messagePollIds = new Map<number, number>();
  const staleLinkPreviews: { id: number; url: string }[] = [];
  for (const a of attachments) {
    if (!attachmentMap.has(a.messageId)) attachmentMap.set(a.messageId, []);
    attachmentMap.get(a.messageId)!.push({
      id: a.id,
      kind: a.kind,
      url: a.url,
      title: a.title,
      description: a.description,
      thumbnailUrl: a.thumbnailUrl,
    });
    if (a.kind === "poll") {
      const m = a.url.match(/^poll:(\d+)$/);
      if (m) messagePollIds.set(a.messageId, parseInt(m[1], 10));
    }
    if (
      a.kind === "link_preview" &&
      a.createdAt.getTime() < Date.now() - LINK_PREVIEW_REFRESH_AFTER_MS
    ) {
      staleLinkPreviews.push({ id: a.id, url: a.url });
    }
  }
  if (staleLinkPreviews.length > 0) {
    void refreshStaleLinkPreviews(staleLinkPreviews);
  }

  const pollIds = Array.from(new Set(messagePollIds.values()));
  const pollMap = new Map<number, ReturnType<typeof emptyPollShape>>();
  if (pollIds.length > 0) {
    const polls = await db
      .select()
      .from(pollsTable)
      .where(inArray(pollsTable.id, pollIds));
    const opts = await db
      .select()
      .from(pollOptionsTable)
      .where(inArray(pollOptionsTable.pollId, pollIds))
      .orderBy(pollOptionsTable.position);
    const optsByPoll = new Map<number, typeof opts>();
    for (const o of opts) {
      if (!optsByPoll.has(o.pollId)) optsByPoll.set(o.pollId, []);
      optsByPoll.get(o.pollId)!.push(o);
    }
    const counts = await db
      .select({
        pollId: pollVotesTable.pollId,
        optionId: pollVotesTable.optionId,
        count: sql<number>`count(*)::int`,
      })
      .from(pollVotesTable)
      .where(inArray(pollVotesTable.pollId, pollIds))
      .groupBy(pollVotesTable.pollId, pollVotesTable.optionId);
    const countMap = new Map<string, number>();
    for (const c of counts) countMap.set(`${c.pollId}:${c.optionId}`, c.count);
    const myVotes = await db
      .select()
      .from(pollVotesTable)
      .where(
        and(
          inArray(pollVotesTable.pollId, pollIds),
          eq(pollVotesTable.userId, myUserId),
        ),
      );
    const myVoteByPoll = new Map(myVotes.map((v) => [v.pollId, v.optionId]));
    const creatorIds = Array.from(new Set(polls.map((p) => p.creatorId)));
    const creators = await db
      .select({
        id: usersTable.id,
        displayName: usersTable.displayName,
        username: usersTable.username,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, creatorIds));
    const creatorMap = new Map(creators.map((c) => [c.id, c]));
    const now = Date.now();
    for (const p of polls) {
      const opts = optsByPoll.get(p.id) ?? [];
      let total = 0;
      const myOpt = myVoteByPoll.get(p.id) ?? null;
      const builtOpts = opts.map((o) => {
        const v = countMap.get(`${p.id}:${o.id}`) ?? 0;
        total += v;
        return { id: o.id, text: o.text, votes: v, votedByMe: myOpt === o.id };
      });
      const c = creatorMap.get(p.creatorId);
      pollMap.set(p.id, {
        id: p.id,
        roomTag: p.roomTag,
        creatorId: p.creatorId,
        creatorName: c?.displayName ?? c?.username ?? "Unknown",
        question: p.question,
        options: builtOpts,
        totalVotes: total,
        myVoteOptionId: myOpt,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        isExpired: p.expiresAt ? p.expiresAt.getTime() <= now : false,
        createdAt: p.createdAt.toISOString(),
      });
    }
  }

  // Mentions for these messages
  const mentionRows = messageIds.length
    ? await db
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
            eq(mentionsTable.targetType, "message"),
            inArray(mentionsTable.targetId, messageIds),
          ),
        )
    : [];
  const mentionMap = new Map<
    number,
    { id: string; username: string; displayName: string }[]
  >();
  for (const m of mentionRows) {
    const list = mentionMap.get(m.targetId) ?? [];
    list.push({
      id: m.userId,
      username: m.username,
      displayName: m.displayName,
    });
    mentionMap.set(m.targetId, list);
  }

  // Per-message read receipts: for DM messages I sent, did the other user read past it?
  const dmConvIds = Array.from(
    new Set(
      rows
        .filter((r) => r.conversationId !== null && r.senderId === myUserId)
        .map((r) => r.conversationId as number),
    ),
  );
  const otherReadByConv = new Map<
    number,
    { lastReadMessageId: number | null; lastReadAt: Date }
  >();
  if (dmConvIds.length > 0) {
    const convs = await db
      .select()
      .from(conversationsTable)
      .where(inArray(conversationsTable.id, dmConvIds));
    const otherIdByConv = new Map<number, string>();
    for (const c of convs) {
      const other = c.userAId === myUserId ? c.userBId : c.userAId;
      otherIdByConv.set(c.id, other);
    }
    const reads = await db
      .select()
      .from(conversationReadsTable)
      .where(inArray(conversationReadsTable.conversationId, dmConvIds));
    for (const r of reads) {
      const otherId = otherIdByConv.get(r.conversationId);
      if (!otherId) continue;
      if (r.userId !== otherId) continue;
      otherReadByConv.set(r.conversationId, {
        lastReadMessageId: r.lastReadMessageId,
        lastReadAt: r.lastReadAt,
      });
    }
  }

  return rows.map((r) => {
    const sender = senderMap.get(r.senderId);
    const pollId = messagePollIds.get(r.id);
    const poll = pollId !== undefined ? (pollMap.get(pollId) ?? null) : null;
    const replyMeta = r.replyToId ? replyMap.get(r.replyToId) : undefined;
    const replyToSender = replyMeta ? senderMap.get(replyMeta.senderId) : undefined;
    let readByOther: boolean | null = null;
    if (r.conversationId !== null && r.senderId === myUserId) {
      const meta = otherReadByConv.get(r.conversationId);
      if (meta) {
        if (meta.lastReadMessageId !== null) {
          readByOther = meta.lastReadMessageId >= r.id;
        } else {
          readByOther = meta.lastReadAt.getTime() >= r.createdAt.getTime();
        }
      } else {
        readByOther = false;
      }
    }
    return {
      id: r.id,
      conversationId: r.conversationId,
      roomTag: r.roomTag,
      senderId: r.senderId,
      senderName: sender?.displayName ?? sender?.username ?? "Unknown",
      senderAvatarUrl: sender?.avatarUrl ?? null,
      content: r.content,
      imageUrl: r.imageUrl,
      audioUrl: r.audioUrl,
      audioWaveform: parseWaveform(r.audioWaveform),
      replyToId: r.replyToId,
      replyToContent: replyMeta?.content ?? null,
      replyToSenderName:
        replyToSender?.displayName ?? replyToSender?.username ?? null,
      replyCount: replyCountMap.get(r.id) ?? 0,
      reactions: reactionMap.get(r.id) ?? [],
      attachments: attachmentMap.get(r.id) ?? [],
      mentions: mentionMap.get(r.id) ?? [],
      readByOther,
      poll,
      createdAt: r.createdAt.toISOString(),
    };
  });
}


function parseWaveform(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const peaks = parsed
      .map((v) => Math.max(0, Math.min(100, Math.round(Number(v)))))
      .filter((v) => Number.isFinite(v));
    return peaks.length > 0 ? peaks : null;
  } catch {
    return null;
  }
}

function emptyPollShape() {
  return {
    id: 0,
    roomTag: "",
    creatorId: "",
    creatorName: "",
    question: "",
    options: [] as { id: number; text: string; votes: number; votedByMe: boolean }[],
    totalVotes: 0,
    myVoteOptionId: null as number | null,
    expiresAt: null as string | null,
    isExpired: false,
    createdAt: "",
  };
}

/**
 * How long a stored link_preview row is trusted before we re-fetch the
 * destination page in the background. Refresh runs fire-and-forget on
 * read, throttled per-attachment via `refreshInflight`. The shared
 * `fetchLinkPreview` cache (also 24h) further dedupes network hits when
 * many messages share a URL.
 */
const LINK_PREVIEW_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const refreshInflight = new Set<number>();

async function refreshStaleLinkPreviews(
  items: { id: number; url: string }[],
): Promise<void> {
  for (const item of items) {
    if (refreshInflight.has(item.id)) continue;
    refreshInflight.add(item.id);
    try {
      const fresh = await fetchLinkPreview(item.url);
      // Only persist on a successful refresh. On null/error we leave the
      // row untouched so the next read retries (the fetchLinkPreview
      // cache still throttles network hits on broken pages to once every
      // few minutes per URL within a process).
      if (!fresh) continue;
      await db
        .update(messageAttachmentsTable)
        .set({
          url: fresh.url,
          title: fresh.title ?? null,
          description: fresh.description ?? null,
          thumbnailUrl: fresh.thumbnailUrl ?? null,
          createdAt: new Date(),
        })
        .where(eq(messageAttachmentsTable.id, item.id));
    } catch {
      // ignore — best-effort background refresh
    } finally {
      refreshInflight.delete(item.id);
    }
  }
}

/**
 * Detect a URL in the message content and (best-effort, fire-and-forget)
 * generate a link_preview attachment row. Errors are swallowed.
 */
export async function maybeAttachLinkPreview(
  messageId: number,
  content: string,
): Promise<void> {
  const url = extractFirstUrl(content);
  if (!url) return;
  const preview = await fetchLinkPreview(url);
  if (!preview) return;
  try {
    await db.insert(messageAttachmentsTable).values({
      messageId,
      kind: "link_preview",
      url: preview.url,
      title: preview.title ?? null,
      description: preview.description ?? null,
      thumbnailUrl: preview.thumbnailUrl ?? null,
    });
  } catch {
    // ignore
  }
}

/**
 * Mirror an inline image payload into the message_attachments table so
 * that all media on a message is discoverable through the attachments
 * pipeline. The legacy messages.imageUrl column is kept in sync for
 * backward compatibility with older clients.
 */
export async function attachImage(
  messageId: number,
  imageUrl: string,
  kind?: "image" | "gif",
): Promise<void> {
  const resolvedKind: "image" | "gif" =
    kind ?? (/\.gif(\?|#|$)/i.test(imageUrl) ? "gif" : "image");
  try {
    await db.insert(messageAttachmentsTable).values({
      messageId,
      kind: resolvedKind,
      url: imageUrl,
    });
  } catch {
    // ignore
  }
}
