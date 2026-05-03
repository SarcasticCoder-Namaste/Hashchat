import {
  db,
  userStreaksTable,
  questProgressTable,
  inviteRedemptionsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { logger } from "./logger";

export type ActivityKind = "post" | "reaction" | "reply" | "spark";

export type QuestCode = "post_in_tag" | "react_5" | "reply_to_someone_new";

export interface QuestDefinition {
  code: QuestCode;
  title: string;
  description: string;
  target: number;
  activity: ActivityKind;
}

// Static daily quest catalog. The set is small and deterministic per day so
// progress accumulates naturally as users use the app.
export const DAILY_QUESTS: QuestDefinition[] = [
  {
    code: "post_in_tag",
    title: "Post in a hashtag",
    description: "Share a post tagged with a hashtag.",
    target: 1,
    activity: "post",
  },
  {
    code: "react_5",
    title: "React 5 times",
    description: "React to posts or messages 5 times today.",
    target: 5,
    activity: "reaction",
  },
  {
    code: "reply_to_someone_new",
    title: "Reply to someone new",
    description: "Reply in a conversation or thread once today.",
    target: 1,
    activity: "reply",
  },
];

// Number of credited invites needed to grant 7 days of MVP.
export const INVITE_CREDIT_THRESHOLD = 3;
export const INVITE_CREDIT_DAYS = 7;

function todayUtcKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function yesterdayKey(d: Date = new Date()): string {
  const y = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  return y.toISOString().slice(0, 10);
}

/**
 * Update the user's daily streak based on activity. Idempotent for a single
 * day. If the previous activity was yesterday, the streak increments. If it
 * was earlier, the streak resets to 1. If it's today, no change.
 */
export async function bumpStreak(userId: string): Promise<void> {
  const today = todayUtcKey();
  try {
    const [existing] = await db
      .select()
      .from(userStreaksTable)
      .where(eq(userStreaksTable.userId, userId))
      .limit(1);
    if (!existing) {
      await db
        .insert(userStreaksTable)
        .values({
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: today,
        })
        .onConflictDoNothing();
      return;
    }
    if (existing.lastActivityDate === today) return;
    const yesterday = yesterdayKey();
    const next =
      existing.lastActivityDate === yesterday ? existing.currentStreak + 1 : 1;
    const longest = Math.max(existing.longestStreak, next);
    await db
      .update(userStreaksTable)
      .set({
        currentStreak: next,
        longestStreak: longest,
        lastActivityDate: today,
        updatedAt: new Date(),
      })
      .where(eq(userStreaksTable.userId, userId));
  } catch (err) {
    logger.warn({ err, userId }, "bumpStreak failed");
  }
}

/**
 * Increment progress on every quest matching the activity kind. Caps progress
 * at the quest target and stamps completedAt the first time it reaches target.
 */
export async function bumpQuests(
  userId: string,
  activity: ActivityKind,
): Promise<void> {
  const day = todayUtcKey();
  const matching = DAILY_QUESTS.filter((q) => q.activity === activity);
  if (matching.length === 0) return;
  for (const quest of matching) {
    try {
      await db
        .insert(questProgressTable)
        .values({
          userId,
          day,
          questCode: quest.code,
          progress: 1,
          completedAt: quest.target <= 1 ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: [
            questProgressTable.userId,
            questProgressTable.day,
            questProgressTable.questCode,
          ],
          set: {
            progress: sql`LEAST(${questProgressTable.progress} + 1, ${quest.target})`,
            completedAt: sql`CASE WHEN ${questProgressTable.completedAt} IS NULL AND ${questProgressTable.progress} + 1 >= ${quest.target} THEN now() ELSE ${questProgressTable.completedAt} END`,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      logger.warn({ err, userId, quest: quest.code }, "bumpQuests failed");
    }
  }
}

/**
 * Convenience wrapper for the most common case: tracking activity bumps both
 * streak and any matching quests. Errors are swallowed so this never blocks
 * the calling request.
 */
export async function recordActivity(
  userId: string,
  activity: ActivityKind,
): Promise<void> {
  await Promise.all([bumpStreak(userId), bumpQuests(userId, activity)]);
}

export function generateInviteToken(): string {
  // 12-char, friendly alphabet (no ambiguous chars).
  const alpha = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) {
    s += alpha[Math.floor(Math.random() * alpha.length)];
  }
  return s;
}

/**
 * Recomputes invite credit for an inviter and grants MVP if the threshold is
 * crossed. Granted invites are marked with `creditedAt` and counted toward
 * future grants (so the next 3 invites grant another 7 days).
 */
export async function grantInviteCreditIfDue(inviterId: string): Promise<void> {
  try {
    const uncredited = await db
      .select()
      .from(inviteRedemptionsTable)
      .where(
        and(
          eq(inviteRedemptionsTable.inviterId, inviterId),
          isNull(inviteRedemptionsTable.creditedAt),
        ),
      );
    if (uncredited.length < INVITE_CREDIT_THRESHOLD) return;

    const grants = Math.floor(uncredited.length / INVITE_CREDIT_THRESHOLD);
    const toCredit = uncredited
      .slice(0, grants * INVITE_CREDIT_THRESHOLD)
      .map((r) => r.inviteeId);

    const [user] = await db
      .select({ premiumUntil: usersTable.premiumUntil })
      .from(usersTable)
      .where(eq(usersTable.id, inviterId))
      .limit(1);
    const base =
      user?.premiumUntil && user.premiumUntil.getTime() > Date.now()
        ? user.premiumUntil
        : new Date();
    const extended = new Date(
      base.getTime() + grants * INVITE_CREDIT_DAYS * 24 * 60 * 60 * 1000,
    );
    await db
      .update(usersTable)
      .set({ mvpPlan: true, premiumUntil: extended })
      .where(eq(usersTable.id, inviterId));
    if (toCredit.length > 0) {
      await db
        .update(inviteRedemptionsTable)
        .set({ creditedAt: new Date() })
        .where(
          and(
            eq(inviteRedemptionsTable.inviterId, inviterId),
            isNull(inviteRedemptionsTable.creditedAt),
          ),
        );
    }
  } catch (err) {
    logger.warn({ err, inviterId }, "grantInviteCreditIfDue failed");
  }
}

/** Monday-aligned start-of-week UTC. */
export function startOfWeekUtc(now: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // ISO week: Monday = 1, Sunday = 7. Drizzle/JS Sunday = 0.
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}
