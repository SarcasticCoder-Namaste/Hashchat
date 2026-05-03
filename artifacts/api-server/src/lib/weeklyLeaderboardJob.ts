import {
  db,
  notificationsTable,
  postsTable,
  postReactionsTable,
  postHashtagsTable,
  messagesTable,
  usersTable,
  userFollowedHashtagsTable,
} from "@workspace/db";
import { and, eq, gt, gte, inArray, lt, sql } from "drizzle-orm";
import { logger } from "./logger";
import { createNotification } from "./notifications";
import { startOfWeekUtc } from "./engagement";

const TOP_N_NOTIFY = 10;
const TOP_N_SUMMARY = 3;
const POLL_INTERVAL_MS = 60 * 60 * 1000; // hourly check; idempotent

interface LeaderboardEntry {
  userId: string;
  score: number;
  posts: number;
  reactions: number;
  messages: number;
}

function startOfPreviousWeekUtc(now: Date = new Date()): Date {
  const thisWeek = startOfWeekUtc(now);
  return new Date(thisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
}

async function computeLeaderboard(
  tag: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<LeaderboardEntry[]> {
  const postCounts = await db
    .select({
      userId: postsTable.authorId,
      posts: sql<number>`count(*)::int`,
    })
    .from(postsTable)
    .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
    .where(
      and(
        eq(postHashtagsTable.tag, tag),
        gte(postsTable.createdAt, weekStart),
        lt(postsTable.createdAt, weekEnd),
        eq(postsTable.status, "published"),
      ),
    )
    .groupBy(postsTable.authorId);

  const reactionCounts = await db
    .select({
      userId: postReactionsTable.userId,
      reactions: sql<number>`count(*)::int`,
    })
    .from(postReactionsTable)
    .innerJoin(postsTable, eq(postsTable.id, postReactionsTable.postId))
    .innerJoin(postHashtagsTable, eq(postHashtagsTable.postId, postsTable.id))
    .where(
      and(
        eq(postHashtagsTable.tag, tag),
        gte(postReactionsTable.createdAt, weekStart),
        lt(postReactionsTable.createdAt, weekEnd),
      ),
    )
    .groupBy(postReactionsTable.userId);

  const messageCounts = await db
    .select({
      userId: messagesTable.senderId,
      messages: sql<number>`count(*)::int`,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.roomTag, tag),
        gte(messagesTable.createdAt, weekStart),
        lt(messagesTable.createdAt, weekEnd),
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

  return Array.from(totals.entries())
    .map(([userId, t]) => ({
      userId,
      posts: t.posts,
      reactions: t.reactions,
      messages: t.messages,
      score: t.posts * 5 + t.messages * 2 + t.reactions,
    }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function notifyForTag(
  tag: string,
  weekStart: Date,
  weekEnd: Date,
): Promise<number> {
  const entries = await computeLeaderboard(tag, weekStart, weekEnd);
  if (entries.length === 0) return 0;
  const topToNotify = entries.slice(0, TOP_N_NOTIFY);
  const topUserIds = Array.from(
    new Set(
      [
        ...topToNotify.map((e) => e.userId),
        ...entries.slice(0, TOP_N_SUMMARY).map((e) => e.userId),
      ],
    ),
  );

  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, topUserIds));
  const userMap = new Map(users.map((u) => [u.id, u]));

  const top3Names = entries.slice(0, TOP_N_SUMMARY).map((e) => {
    const u = userMap.get(e.userId);
    return u?.displayName || u?.username || "someone";
  });

  let notified = 0;
  for (let i = 0; i < topToNotify.length; i += 1) {
    const entry = topToNotify[i];
    const rank = i + 1;

    // Idempotency: only one weekly_rank notification per (recipient, tag, week).
    const existing = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.recipientId, entry.userId),
          eq(notificationsTable.kind, "weekly_rank"),
          eq(notificationsTable.targetType, "hashtag"),
          eq(notificationsTable.targetTextId, tag),
          gt(notificationsTable.createdAt, weekEnd),
        ),
      )
      .limit(1);
    if (existing.length > 0) continue;

    const podium = top3Names.length
      ? ` Top this week: ${top3Names
          .map((n, idx) => `${idx + 1}. ${n}`)
          .join(", ")}.`
      : "";
    const snippet = `You're #${rank} in #${tag} this week!${podium}`;

    await createNotification({
      recipientId: entry.userId,
      actorId: null,
      kind: "weekly_rank",
      targetType: "hashtag",
      targetTextId: tag,
      snippet,
      extra: JSON.stringify({
        tag,
        rank,
        score: entry.score,
        posts: entry.posts,
        reactions: entry.reactions,
        messages: entry.messages,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        top: entries.slice(0, TOP_N_SUMMARY).map((e, idx) => ({
          rank: idx + 1,
          userId: e.userId,
          displayName:
            userMap.get(e.userId)?.displayName ??
            userMap.get(e.userId)?.username ??
            null,
          score: e.score,
        })),
      }),
    });
    notified += 1;
  }
  return notified;
}

/**
 * Sends weekly hashtag rank recap notifications for the most recently
 * completed week. Safe to call repeatedly: per (recipient, tag, week)
 * notifications are deduped against the notifications table.
 *
 * Only runs when `now` is on a Monday (UTC), so background polling on other
 * days is a no-op. Pass `force=true` to override (used by tests).
 */
export async function runWeeklyLeaderboardTick(
  now: Date = new Date(),
  force = false,
): Promise<{ tags: number; notifications: number; skipped: boolean }> {
  if (!force && now.getUTCDay() !== 1) {
    return { tags: 0, notifications: 0, skipped: true };
  }
  const weekEnd = startOfWeekUtc(now); // start of the current (just-started) week
  const weekStart = startOfPreviousWeekUtc(now);

  // Tags that have at least one follower — those are the leaderboards anyone
  // cares about.
  const followedTags = await db
    .selectDistinct({ tag: userFollowedHashtagsTable.tag })
    .from(userFollowedHashtagsTable);

  let totalNotifications = 0;
  for (const { tag } of followedTags) {
    try {
      totalNotifications += await notifyForTag(tag, weekStart, weekEnd);
    } catch (err) {
      logger.warn(
        { err, tag },
        "weekly leaderboard notification failed for tag",
      );
    }
  }
  return {
    tags: followedTags.length,
    notifications: totalNotifications,
    skipped: false,
  };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const start = Date.now();
    const r = await runWeeklyLeaderboardTick();
    if (!r.skipped) {
      logger.info(
        { ms: Date.now() - start, ...r },
        "weekly leaderboard tick complete",
      );
    }
  } catch (err) {
    logger.error({ err }, "weekly leaderboard tick failed");
  } finally {
    running = false;
  }
}

export function startWeeklyLeaderboardScheduler(): void {
  if (timer) return;
  // First run shortly after boot so a Monday restart still delivers recaps.
  setTimeout(() => void tick(), 60_000);
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  logger.info(
    { intervalMs: POLL_INTERVAL_MS },
    "weekly leaderboard scheduler started",
  );
}

export function stopWeeklyLeaderboardScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
