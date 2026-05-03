import {
  db,
  userBlocksTable,
  userMutesTable,
  userFollowsTable,
  hashtagMutesTable,
  roomUserMutesTable,
} from "@workspace/db";
import { eq, or, and, inArray, isNull, gt, sql } from "drizzle-orm";

/** SQL fragment matching mute rows that are still active (no expiry, or expiry > now). */
const NOT_EXPIRED_USER_MUTE = or(
  isNull(userMutesTable.expiresAt),
  gt(userMutesTable.expiresAt, sql`now()`),
);
const NOT_EXPIRED_HASHTAG_MUTE = or(
  isNull(hashtagMutesTable.expiresAt),
  gt(hashtagMutesTable.expiresAt, sql`now()`),
);
const NOT_EXPIRED_ROOM_USER_MUTE = or(
  isNull(roomUserMutesTable.expiresAt),
  gt(roomUserMutesTable.expiresAt, sql`now()`),
);

/**
 * Returns the set of user ids that the given user is "isolated" from in either
 * direction: ids the user has blocked OR ids that have blocked the user.
 * Used to filter out users from feeds, conversation lists, etc.
 */
export async function loadBlockWall(myId: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(userBlocksTable)
    .where(
      or(
        eq(userBlocksTable.blockerId, myId),
        eq(userBlocksTable.blockedId, myId),
      ),
    );
  const out = new Set<string>();
  for (const r of rows) {
    if (r.blockerId === myId) out.add(r.blockedId);
    else out.add(r.blockerId);
  }
  return out;
}

export async function loadMyBlocks(myId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: userBlocksTable.blockedId })
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockerId, myId));
  return new Set(rows.map((r) => r.id));
}

export async function loadBlockersOfMe(myId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: userBlocksTable.blockerId })
    .from(userBlocksTable)
    .where(eq(userBlocksTable.blockedId, myId));
  return new Set(rows.map((r) => r.id));
}

export async function loadMyMutes(myId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: userMutesTable.mutedId })
    .from(userMutesTable)
    .where(and(eq(userMutesTable.muterId, myId), NOT_EXPIRED_USER_MUTE));
  return new Set(rows.map((r) => r.id));
}

/** Per-room user mutes that are still active. */
export async function loadRoomUserMutes(
  myId: string,
  roomTag: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ id: roomUserMutesTable.mutedId })
    .from(roomUserMutesTable)
    .where(
      and(
        eq(roomUserMutesTable.muterId, myId),
        eq(roomUserMutesTable.roomTag, roomTag),
        NOT_EXPIRED_ROOM_USER_MUTE,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

export async function loadMyFollowing(myId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: userFollowsTable.followeeId })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followerId, myId));
  return new Set(rows.map((r) => r.id));
}

export async function loadMyFollowers(myId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: userFollowsTable.followerId })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followeeId, myId));
  return new Set(rows.map((r) => r.id));
}

export async function loadMutedHashtags(myId: string): Promise<Set<string>> {
  const rows = await db
    .select({ tag: hashtagMutesTable.tag })
    .from(hashtagMutesTable)
    .where(and(eq(hashtagMutesTable.userId, myId), NOT_EXPIRED_HASHTAG_MUTE));
  return new Set(rows.map((r) => r.tag));
}

export async function isBlockedEitherWay(
  a: string,
  b: string,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(userBlocksTable)
    .where(
      or(
        and(
          eq(userBlocksTable.blockerId, a),
          eq(userBlocksTable.blockedId, b),
        ),
        and(
          eq(userBlocksTable.blockerId, b),
          eq(userBlocksTable.blockedId, a),
        ),
      ),
    )
    .limit(1);
  return !!row;
}

export type SocialFlags = {
  isFollowing: boolean;
  followsMe: boolean;
  isMuted: boolean;
  isBlocked: boolean;
};

export async function loadSocialFlagsMap(
  myId: string,
  otherIds: string[],
): Promise<Map<string, SocialFlags>> {
  const out = new Map<string, SocialFlags>();
  if (otherIds.length === 0) return out;
  const [follows, blocks, mutes, followedBy] = await Promise.all([
    db
      .select({ id: userFollowsTable.followeeId })
      .from(userFollowsTable)
      .where(
        and(
          eq(userFollowsTable.followerId, myId),
          inArray(userFollowsTable.followeeId, otherIds),
        ),
      ),
    db
      .select({ id: userBlocksTable.blockedId })
      .from(userBlocksTable)
      .where(
        and(
          eq(userBlocksTable.blockerId, myId),
          inArray(userBlocksTable.blockedId, otherIds),
        ),
      ),
    db
      .select({ id: userMutesTable.mutedId })
      .from(userMutesTable)
      .where(
        and(
          eq(userMutesTable.muterId, myId),
          inArray(userMutesTable.mutedId, otherIds),
        ),
      ),
    db
      .select({ id: userFollowsTable.followerId })
      .from(userFollowsTable)
      .where(
        and(
          eq(userFollowsTable.followeeId, myId),
          inArray(userFollowsTable.followerId, otherIds),
        ),
      ),
  ]);
  const followingSet = new Set(follows.map((r) => r.id));
  const blocksSet = new Set(blocks.map((r) => r.id));
  const mutesSet = new Set(mutes.map((r) => r.id));
  const followedBySet = new Set(followedBy.map((r) => r.id));
  for (const id of otherIds) {
    out.set(id, {
      isFollowing: followingSet.has(id),
      followsMe: followedBySet.has(id),
      isMuted: mutesSet.has(id),
      isBlocked: blocksSet.has(id),
    });
  }
  return out;
}
