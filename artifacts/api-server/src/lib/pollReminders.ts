import {
  db,
  pollsTable,
  pollVotesTable,
  userFollowedHashtagsTable,
} from "@workspace/db";
import { and, eq, gt, isNull, lte, inArray } from "drizzle-orm";
import { createNotifications } from "./notifications";
import { logger } from "./logger";

const REMINDER_LEAD_MS = 60 * 60 * 1000; // 1 hour
const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runPollReminderTick(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cutoff = new Date(now.getTime() + REMINDER_LEAD_MS);
    const due = await db
      .select()
      .from(pollsTable)
      .where(
        and(
          isNull(pollsTable.reminderSentAt),
          lte(pollsTable.expiresAt, cutoff),
          gt(pollsTable.expiresAt, now),
        ),
      );

    for (const poll of due) {
      // Atomically claim the reminder so concurrent ticks don't double-send.
      const claimed = await db
        .update(pollsTable)
        .set({ reminderSentAt: now })
        .where(
          and(eq(pollsTable.id, poll.id), isNull(pollsTable.reminderSentAt)),
        )
        .returning({ id: pollsTable.id });
      if (claimed.length === 0) continue;

      const followers = await db
        .select({ userId: userFollowedHashtagsTable.userId })
        .from(userFollowedHashtagsTable)
        .where(eq(userFollowedHashtagsTable.tag, poll.roomTag));
      if (followers.length === 0) continue;

      const followerIds = followers.map((f) => f.userId);
      const voted = await db
        .select({ userId: pollVotesTable.userId })
        .from(pollVotesTable)
        .where(
          and(
            eq(pollVotesTable.pollId, poll.id),
            inArray(pollVotesTable.userId, followerIds),
          ),
        );
      const votedSet = new Set(voted.map((v) => v.userId));

      const recipients = followerIds.filter(
        (uid) => !votedSet.has(uid) && uid !== poll.creatorId,
      );
      if (recipients.length === 0) continue;

      const expiresAtMs = poll.expiresAt?.getTime() ?? now.getTime();
      const minutesLeft = Math.max(
        1,
        Math.round((expiresAtMs - now.getTime()) / 60000),
      );
      const snippet = `Poll "${poll.question}" in #${poll.roomTag} closes in about ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}. Cast your vote!`;

      await createNotifications(
        recipients.map((uid) => ({
          recipientId: uid,
          actorId: poll.creatorId,
          kind: "poll_closing" as const,
          targetType: "poll" as const,
          targetId: poll.id,
          targetTextId: poll.roomTag,
          snippet,
        })),
      );
    }
  } catch (err) {
    logger.error({ err }, "poll reminder tick failed");
  } finally {
    running = false;
  }
}

export function startPollReminderScheduler(): void {
  if (timer) return;
  setTimeout(() => {
    void runPollReminderTick();
  }, 7_000);
  timer = setInterval(() => {
    void runPollReminderTick();
  }, POLL_INTERVAL_MS);
  if (typeof timer.unref === "function") timer.unref();
  logger.info(
    { intervalMs: POLL_INTERVAL_MS },
    "poll reminder scheduler started",
  );
}

export function stopPollReminderScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
