import { db, notificationsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type NotificationKind =
  | "mention"
  | "reply"
  | "reaction"
  | "follow"
  | "dm";

export type NotificationTargetType =
  | "message"
  | "post"
  | "conversation"
  | "user";

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

export async function createNotification(
  input: CreateNotificationInput,
): Promise<void> {
  if (input.actorId && input.actorId === input.recipientId) return;
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
  return null;
}
