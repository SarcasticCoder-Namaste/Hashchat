import { db, roomVisibilityTable, roomMembersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";

export type RoomAccess = {
  isPrivate: boolean;
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
    ownerId,
    isMember,
    canManage: ownerId === userId,
    slowModeSeconds,
  };
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
