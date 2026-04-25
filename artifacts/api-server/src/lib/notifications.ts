import { db, notificationsTable } from "@workspace/db";

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
  try {
    await db.insert(notificationsTable).values({
      recipientId: input.recipientId,
      actorId: input.actorId ?? null,
      kind: input.kind,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetTextId: input.targetTextId ?? null,
      snippet: input.snippet?.slice(0, 240) ?? null,
      extra: input.extra ?? null,
    });
  } catch {
    // Best-effort; never block the request if notifications fail.
  }
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
