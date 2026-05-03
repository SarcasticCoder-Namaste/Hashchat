import {
  db,
  notificationsTable,
  notificationMutesTable,
  usersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";

export type NotificationKind =
  | "mention"
  | "reply"
  | "reaction"
  | "follow"
  | "dm"
  | "event_starting"
  | "scheduled_post_published"
  | "poll_closing";

export type NotificationTargetType =
  | "message"
  | "post"
  | "conversation"
  | "user"
  | "event"
  | "poll";

export interface CreateNotificationInput {
  recipientId: string;
  actorId?: string | null;
  kind: NotificationKind;
  targetType?: NotificationTargetType | null;
  targetId?: number | null;
  targetTextId?: string | null;
  snippet?: string | null;
  extra?: string | null;
}

/**
 * Returns the room hashtag implied by a notification target, if any.
 * Notifications that originate inside a room store a `room:<tag>` hint in
 * `targetTextId`; we use that to apply per-room mutes.
 */
function roomTagFromTarget(targetTextId: string | null | undefined): string | null {
  if (!targetTextId) return null;
  if (targetTextId.startsWith("room:")) return targetTextId.slice(5);
  return null;
}

async function isNotificationMuted(input: CreateNotificationInput): Promise<boolean> {
  const checks: Array<Promise<{ sourceType: string }[]>> = [];
  if (input.actorId) {
    checks.push(
      db
        .select({ sourceType: notificationMutesTable.sourceType })
        .from(notificationMutesTable)
        .where(
          and(
            eq(notificationMutesTable.userId, input.recipientId),
            eq(notificationMutesTable.sourceType, "user"),
            eq(notificationMutesTable.sourceKey, input.actorId),
          ),
        )
        .limit(1),
    );
  }
  const roomTag = roomTagFromTarget(input.targetTextId);
  if (roomTag) {
    checks.push(
      db
        .select({ sourceType: notificationMutesTable.sourceType })
        .from(notificationMutesTable)
        .where(
          and(
            eq(notificationMutesTable.userId, input.recipientId),
            eq(notificationMutesTable.sourceType, "hashtag"),
            eq(notificationMutesTable.sourceKey, roomTag),
          ),
        )
        .limit(1),
    );
  }
  if (checks.length === 0) return false;
  const results = await Promise.all(checks);
  return results.some((rows) => rows.length > 0);
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  if (input.actorId && input.actorId === input.recipientId) return;
  try {
    if (await isNotificationMuted(input)) return;
  } catch {
    // If the mute check fails, fall through and create the notification
    // rather than silently dropping it.
  }
  let inserted: { id: number } | undefined;
  try {
    const [row] = await db
      .insert(notificationsTable)
      .values({
        recipientId: input.recipientId,
        actorId: input.actorId ?? null,
        kind: input.kind,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        targetTextId: input.targetTextId ?? null,
        snippet: input.snippet?.slice(0, 240) ?? null,
        extra: input.extra ?? null,
      })
      .returning({ id: notificationsTable.id });
    inserted = row;
  } catch {
    // Best-effort; never block the request if notifications fail.
    return;
  }
  if (!inserted) return;

  // Fan-out to email/push, deferred so we never block the request.
  // We deliberately don't await this; the dispatcher logs delivery rows itself.
  setImmediate(() => {
    void (async () => {
      try {
        let actorName: string | null = null;
        if (input.actorId) {
          const [actor] = await db
            .select({ displayName: usersTable.displayName })
            .from(usersTable)
            .where(eq(usersTable.id, input.actorId))
            .limit(1);
          actorName = actor?.displayName ?? null;
        }
        const { dispatchNotification } = await import(
          "./notificationDispatcher"
        );
        await dispatchNotification({
          notificationId: inserted!.id,
          recipientId: input.recipientId,
          kind: input.kind,
          actorName,
          snippet: input.snippet ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          targetTextId: input.targetTextId ?? null,
        });
      } catch {
        // swallow
      }
    })();
  });
}

/**
 * Create many notifications. Each entry is processed independently.
 */
export async function createNotifications(
  inputs: CreateNotificationInput[],
): Promise<void> {
  for (const i of inputs) {
    await createNotification(i);
  }
}

/**
 * Build an href that the client can use to route the user to the right place.
 */
export function buildHref(
  targetType: string | null,
  targetId: number | null,
  targetTextId: string | null,
): string | null {
  if (targetType === "conversation" && targetId !== null) {
    return `/app/messages/${targetId}`;
  }
  if (targetType === "user" && targetTextId) {
    return `/app/u/${targetTextId}`;
  }
  if (targetType === "post" && targetId !== null) {
    return `/app/post/${targetId}`;
  }
  if (targetType === "message" && targetTextId) {
    // We store the routing hint as targetTextId for messages, e.g. "room:dogs" or "conv:42"
    if (targetTextId.startsWith("room:")) return `/app/rooms/${targetTextId.slice(5)}`;
    if (targetTextId.startsWith("conv:")) return `/app/messages/${targetTextId.slice(5)}`;
  }
  if (targetType === "event" && targetTextId) {
    // targetTextId is the room tag for event notifications.
    return `/app/rooms/${targetTextId}`;
  }
  if (targetType === "poll" && targetTextId) {
    // targetTextId is the room tag for poll notifications.
    return `/app/rooms/${targetTextId}`;
  }
  return null;
}
