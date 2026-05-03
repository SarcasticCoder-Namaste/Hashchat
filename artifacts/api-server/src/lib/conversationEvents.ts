import { EventEmitter } from "node:events";
import { db, conversationMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function convChannel(conversationId: number): string {
  return `conv:${conversationId}`;
}

function userChannel(userId: string): string {
  return `user:${userId}`;
}

export type ConversationEventKind =
  | "message"
  | "system"
  | "members"
  | "rename"
  | "deleted";

export interface ConversationEvent {
  conversationId: number;
  kind: ConversationEventKind;
  at: number;
}

export interface UserConversationEvent {
  conversationId: number;
  kind: ConversationEventKind;
  at: number;
}

export function publishConversationEvent(
  conversationId: number,
  kind: ConversationEventKind,
): void {
  const at = Date.now();
  emitter.emit(convChannel(conversationId), { conversationId, kind, at });
}

export function publishUserConversationUpdate(
  userId: string,
  conversationId: number,
  kind: ConversationEventKind,
): void {
  const at = Date.now();
  emitter.emit(userChannel(userId), { conversationId, kind, at });
}

export function subscribeConversation(
  conversationId: number,
  listener: (event: ConversationEvent) => void,
): () => void {
  const ch = convChannel(conversationId);
  emitter.on(ch, listener);
  return () => emitter.off(ch, listener);
}

export function subscribeUserConversations(
  userId: string,
  listener: (event: UserConversationEvent) => void,
): () => void {
  const ch = userChannel(userId);
  emitter.on(ch, listener);
  return () => emitter.off(ch, listener);
}

/**
 * Broadcast a conversation event to:
 *  - the conversation channel (for in-chat subscribers)
 *  - every member's user channel (for the conversations list)
 *
 * Optionally include extra user ids that should also receive the user-channel
 * event even if no longer a member (e.g. someone who was just removed/left so
 * their list refreshes and removes the entry).
 */
export async function broadcastConversationChange(
  conversationId: number,
  kind: ConversationEventKind,
  extraUserIds: string[] = [],
): Promise<void> {
  publishConversationEvent(conversationId, kind);
  const members = await db
    .select({ userId: conversationMembersTable.userId })
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));
  const seen = new Set<string>();
  for (const m of members) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    publishUserConversationUpdate(m.userId, conversationId, kind);
  }
  for (const uid of extraUserIds) {
    if (seen.has(uid)) continue;
    seen.add(uid);
    publishUserConversationUpdate(uid, conversationId, kind);
  }
}
