import { db, roomVisibilityTable, roomMembersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { isUserPremium } from "./premiumHelpers";

export type RoomAccess = {
  isPrivate: boolean;
  isPremium: boolean;
  ownerId: string | null;
  isMember: boolean;
  canManage: boolean;
  slowModeSeconds: number;
};

export async function getRoomAccess(tag: string, userId: string): Promise<RoomAccess> {
  const [vis] = await db
    .select()
    .from(roomVisibilityTable)
    .where(eq(roomVisibilityTable.tag, tag))
    .limit(1);
  const isPrivate = !!vis?.isPrivate;
  const isPremium = !!vis?.isPremium;
  const ownerId = vis?.ownerId ?? null;
  const slowModeSeconds = vis?.slowModeSeconds ?? 0;
  let isMember = !isPrivate;
  if (isPrivate) {
    const [member] = await db
      .select()
      .from(roomMembersTable)
      .where(and(eq(roomMembersTable.tag, tag), eq(roomMembersTable.userId, userId)))
      .limit(1);
    isMember = !!member || ownerId === userId;
  }
  return {
    isPrivate,
    isPremium,
    ownerId,
    isMember,
    canManage: ownerId === userId,
    slowModeSeconds,
  };
}

/**
 * Returns true when the room is gated as premium-only and the user does not
 * have an active premium tier (and is not the owner). Owners always have
 * access to their own premium rooms.
 */
export async function isRoomPremiumLocked(
  access: RoomAccess,
  userId: string,
): Promise<boolean> {
  if (!access.isPremium) return false;
  if (access.ownerId === userId) return false;
  const ok = await isUserPremium(userId);
  return !ok;
}

export async function loadPrivateTags(tags: string[]): Promise<Set<string>> {
  if (tags.length === 0) return new Set();
  const rows = await db
    .select({ tag: roomVisibilityTable.tag })
    .from(roomVisibilityTable)
    .where(and(inArray(roomVisibilityTable.tag, tags), eq(roomVisibilityTable.isPrivate, true)));
  return new Set(rows.map((r) => r.tag));
}

export async function loadMyRoomMemberships(
  userId: string,
  tags: string[],
): Promise<Set<string>> {
  if (tags.length === 0) return new Set();
  const rows = await db
    .select({ tag: roomMembersTable.tag })
    .from(roomMembersTable)
    .where(and(eq(roomMembersTable.userId, userId), inArray(roomMembersTable.tag, tags)));
  return new Set(rows.map((r) => r.tag));
}
