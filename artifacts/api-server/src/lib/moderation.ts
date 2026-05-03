import {
  db,
  roomVisibilityTable,
  roomModeratorsTable,
  communitiesTable,
  communityMembersTable,
  communityHashtagsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export type ModerationScopeType = "room" | "community";

export interface RoomModerationAccess {
  ownerId: string | null;
  isOwner: boolean;
  isModerator: boolean;
  canModerate: boolean;
  canManage: boolean;
}

/**
 * Resolve who can moderate a given room (#tag). A user can moderate if:
 *   - they are the room owner (canManage = true), OR
 *   - they were added to roomModeratorsTable for that tag, OR
 *   - they are the owner / moderator of any community whose hashtag set
 *     contains this tag.
 * Settings (slow-mode, mods, visibility) require canManage = true.
 */
export async function getRoomModerationAccess(
  tag: string,
  userId: string,
): Promise<RoomModerationAccess> {
  const [vis] = await db
    .select()
    .from(roomVisibilityTable)
    .where(eq(roomVisibilityTable.tag, tag))
    .limit(1);
  const ownerId = vis?.ownerId ?? null;
  const isOwner = ownerId !== null && ownerId === userId;

  let isModerator = false;
  const [direct] = await db
    .select()
    .from(roomModeratorsTable)
    .where(
      and(
        eq(roomModeratorsTable.tag, tag),
        eq(roomModeratorsTable.userId, userId),
      ),
    )
    .limit(1);
  if (direct) isModerator = true;

  if (!isOwner && !isModerator) {
    // Check community moderation: any community containing this tag
    // where the user is owner or moderator.
    const communityRows = await db
      .select({ communityId: communityHashtagsTable.communityId })
      .from(communityHashtagsTable)
      .where(eq(communityHashtagsTable.tag, tag));
    const cIds = communityRows.map((r) => r.communityId);
    if (cIds.length > 0) {
      const memberships = await db
        .select({
          role: communityMembersTable.role,
        })
        .from(communityMembersTable)
        .where(
          and(
            eq(communityMembersTable.userId, userId),
            inArray(communityMembersTable.communityId, cIds),
          ),
        );
      if (memberships.some((m) => m.role === "owner" || m.role === "moderator")) {
        isModerator = true;
      }
    }
  }

  return {
    ownerId,
    isOwner,
    isModerator,
    canModerate: isOwner || isModerator,
    canManage: isOwner,
  };
}

export interface CommunityModerationAccess {
  communityId: number | null;
  ownerId: string | null;
  myRole: "owner" | "moderator" | "member" | null;
  isOwner: boolean;
  isModerator: boolean;
  canModerate: boolean;
  canManage: boolean;
}

export async function getCommunityModerationAccess(
  slug: string,
  userId: string,
): Promise<CommunityModerationAccess> {
  const [c] = await db
    .select()
    .from(communitiesTable)
    .where(eq(communitiesTable.slug, slug))
    .limit(1);
  if (!c) {
    return {
      communityId: null,
      ownerId: null,
      myRole: null,
      isOwner: false,
      isModerator: false,
      canModerate: false,
      canManage: false,
    };
  }
  const [member] = await db
    .select({ role: communityMembersTable.role })
    .from(communityMembersTable)
    .where(
      and(
        eq(communityMembersTable.communityId, c.id),
        eq(communityMembersTable.userId, userId),
      ),
    )
    .limit(1);
  const myRole =
    (member?.role as "owner" | "moderator" | "member" | undefined) ?? null;
  const isOwner = c.creatorId === userId;
  const isModerator = myRole === "moderator" || isOwner;
  return {
    communityId: c.id,
    ownerId: c.creatorId,
    myRole,
    isOwner,
    isModerator,
    canModerate: isOwner || isModerator,
    canManage: isOwner,
  };
}

/**
 * Returns the most-recent moderator-action time for `userId` in the
 * given room. Used by slow-mode enforcement to bypass moderators and
 * compute time-until-next-message for regular users.
 */
export const ALLOWED_SLOW_MODE_SECONDS = [0, 10, 30, 60, 300] as const;

export type SlowModeSeconds = (typeof ALLOWED_SLOW_MODE_SECONDS)[number];

export function isAllowedSlowMode(n: number): n is SlowModeSeconds {
  return (ALLOWED_SLOW_MODE_SECONDS as readonly number[]).includes(n);
}
