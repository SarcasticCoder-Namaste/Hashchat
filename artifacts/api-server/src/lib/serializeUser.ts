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
  tier: string;
  animatedAvatarUrl: string | null;
  bannerGifUrl: string | null;
  lastSeenAt: string;
};

export function publicUser(u: User): UserPublicFields {
  // Pro-only customizations are only surfaced while the user is on Pro.
  const isPro = u.tier === "pro";
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
    tier: u.tier,
    animatedAvatarUrl: isPro ? u.animatedAvatarUrl : null,
    bannerGifUrl: isPro ? u.bannerGifUrl : null,
    lastSeenAt: u.lastSeenAt.toISOString(),
  };
}
