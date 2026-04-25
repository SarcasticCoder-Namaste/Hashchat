import type { User } from "@workspace/db";

export type UserPublicFields = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: string;
  featuredHashtag: string | null;
  discriminator: string | null;
  role: string;
  mvpPlan: boolean;
  verified: boolean;
  lastSeenAt: string;
};

export function publicUser(u: User): UserPublicFields {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    status: u.status,
    featuredHashtag: u.featuredHashtag,
    discriminator: u.discriminator,
    role: u.role,
    mvpPlan: u.mvpPlan,
    verified: u.verified,
    lastSeenAt: u.lastSeenAt.toISOString(),
  };
}
