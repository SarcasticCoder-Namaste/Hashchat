import { db, eventsTable, eventRsvpsTable } from "@workspace/db";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { createNotifications } from "./notifications";
import { logger } from "./logger";

const REMINDER_LEAD_MS = 10 * 60 * 1000; // 10 minutes
const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runEventReminderTick(now: Date = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    const cutoff = new Date(now.getTime() + REMINDER_LEAD_MS);
    const due = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          isNull(eventsTable.canceledAt),
          isNull(eventsTable.reminderSentAt),
          lte(eventsTable.startsAt, cutoff),
          gt(eventsTable.startsAt, now),
        ),
      );

    for (const evt of due) {
      const rsvps = await db
        .select({ userId: eventRsvpsTable.userId })
        .from(eventRsvpsTable)
        .where(eq(eventRsvpsTable.eventId, evt.id));

      const minutesAway = Math.max(
        1,
        Math.round((evt.startsAt.getTime() - now.getTime()) / 60000),
      );
      const snippet = `"${evt.title}" in #${evt.roomTag} starts in about ${minutesAway} minute${minutesAway === 1 ? "" : "s"}.`;

      await createNotifications(
        rsvps.map((r) => ({
          recipientId: r.userId,
          actorId: evt.creatorId,
          kind: "event_starting" as const,
          targetType: "event" as const,
          targetId: evt.id,
          targetTextId: evt.roomTag,
          snippet,
        })),
      );

      // Atomically mark sent so concurrent ticks don't double-send.
      const updated = await db
        .update(eventsTable)
        .set({ reminderSentAt: now })
        .where(
          and(eq(eventsTable.id, evt.id), isNull(eventsTable.reminderSentAt)),
        )
        .returning({ id: eventsTable.id });
      if (updated.length === 0) {
        // Lost race; nothing else to do.
      }
    }
  } catch (err) {
    logger.error({ err }, "event reminder tick failed");
  } finally {
    running = false;
  }
}

export function startEventReminderScheduler(): void {
  if (timer) return;
  // Kick off shortly after boot, then on a steady cadence.
  setTimeout(() => {
    void runEventReminderTick();
  }, 5_000);
  timer = setInterval(() => {
    void runEventReminderTick();
  }, POLL_INTERVAL_MS);
  // Don't keep the process alive solely for this timer.
  if (typeof timer.unref === "function") timer.unref();
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "event reminder scheduler started");
}

export function stopEventReminderScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

