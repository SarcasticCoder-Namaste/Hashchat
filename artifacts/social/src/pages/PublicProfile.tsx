import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetUserByUsername,
  useGetFollowSuggestions,
  useFollowUser,
  useUnfollowUser,
  useBlockUser,
  useUnblockUser,
  useMuteUser,
  useUnmuteUser,
  useOpenConversation,
  useSendFriendRequest,
  useCancelFriendRequest,
  useAcceptFriendRequest,
  getGetUserByUsernameQueryKey,
  getDiscoverPeopleQueryKey,
  getGetMyRelationshipsQueryKey,
  getGetMyFriendsQueryKey,
  getGetFriendRequestsQueryKey,
  getGetFollowSuggestionsQueryKey,
  getGetFollowingFeedQueryKey,
  type MatchUser,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PresenceAvatar } from "@/components/UserBadge";
import { EmptyState } from "@/components/EmptyState";
import {
  Hash,
  MessageCircle,
  UserPlus,
  UserMinus,
  UserCheck,
  BadgeCheck,
  Crown,
  Sparkles,
  Star,
  ArrowLeft,
  MoreHorizontal,
  Ban,
  EyeOff,
  Eye,
  Check,
  Users,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PublicProfile({ username }: { username: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: user, isLoading, error } = useGetUserByUsername(username);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetUserByUsernameQueryKey(username) });
    qc.invalidateQueries({ queryKey: getGetMyRelationshipsQueryKey() });
    qc.invalidateQueries({ queryKey: getDiscoverPeopleQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyFriendsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFriendRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFollowSuggestionsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFollowingFeedQueryKey() });
  };

  const follow = useFollowUser({ mutation: { onSuccess: invalidate } });
  const unfollow = useUnfollowUser({ mutation: { onSuccess: invalidate } });
  const block = useBlockUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Blocked", description: `You won't see ${user?.displayName ?? "@" + username} anymore.` });
      },
    },
  });
  const unblock = useUnblockUser({
    mutation: { onSuccess: () => { invalidate(); toast({ title: "Unblocked" }); } },
  });
  const mute = useMuteUser({
    mutation: { onSuccess: () => { invalidate(); toast({ title: "Muted" }); } },
  });
  const unmute = useUnmuteUser({
    mutation: { onSuccess: () => { invalidate(); toast({ title: "Unmuted" }); } },
  });
  const open = useOpenConversation({
    mutation: { onSuccess: (conv) => setLocation(`/app/messages/${conv.id}`) },
  });
  const sendReq = useSendFriendRequest({ mutation: { onSuccess: invalidate } });
  const cancelReq = useCancelFriendRequest({ mutation: { onSuccess: invalidate } });
  const acceptReq = useAcceptFriendRequest({ mutation: { onSuccess: invalidate } });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          icon={Users}
          title="Profile not found"
          description="This account may not exist or is unavailable."
          action={
            <Button asChild variant="outline">
              <Link href="/app/discover">Back to discover</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const status = user.friendStatus ?? "none";
  const friendBusy = sendReq.isPending || cancelReq.isPending || acceptReq.isPending;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div
          className="h-32 w-full bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-pink-500/30 md:h-40"
          style={
            user.bannerGifUrl || user.bannerUrl
              ? {
                  backgroundImage: `url(${user.bannerGifUrl || user.bannerUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
          data-testid="profile-banner"
        />
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-end md:gap-6">
          <div className="-mt-16 md:-mt-20">
            <PresenceAvatar
              displayName={user.displayName}
              avatarUrl={user.avatarUrl}
              animatedAvatarUrl={user.animatedAvatarUrl}
              lastSeenAt={user.lastSeenAt}
              size="lg"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-bold text-foreground" data-testid="profile-display-name">
                {user.displayName}
              </h1>
              {user.verified && (
                <span title="Verified" className="inline-flex items-center text-sky-500 dark:text-sky-400" data-testid="badge-verified">
                  <BadgeCheck className="h-5 w-5 fill-sky-500/20" />
                </span>
              )}
              {user.role === "admin" && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  <Crown className="h-2.5 w-2.5" /> Admin
                </span>
              )}
              {user.mvpPlan && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/30 to-pink-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                  <Sparkles className="h-2.5 w-2.5" /> MVP
                </span>
              )}
              {user.featuredHashtag && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                  <Star className="h-2.5 w-2.5" />
                  {user.featuredHashtag}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              @{user.username}
              {user.discriminator && (
                <span className="ml-1 text-muted-foreground/70">#{user.discriminator}</span>
              )}
              {user.pronouns && <span className="ml-2">· {user.pronouns}</span>}
              {user.location && <span className="ml-2">· {user.location}</span>}
            </p>
            {user.bio && <p className="mt-2 text-sm text-foreground">{user.bio}</p>}
            <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
              <span data-testid="follower-count">
                <strong className="text-foreground">{user.followerCount}</strong> followers
              </span>
              <span data-testid="following-count">
                <strong className="text-foreground">{user.followingCount}</strong> following
              </span>
              {user.followsMe && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  Follows you
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user.isBlocked ? (
              <Button
                variant="outline"
                onClick={() => unblock.mutate({ id: user.id })}
                disabled={unblock.isPending}
                data-testid="button-unblock"
              >
                Unblock
              </Button>
            ) : (
              <>
                {user.isFollowing ? (
                  <Button
                    variant="secondary"
                    onClick={() => unfollow.mutate({ id: user.id })}
                    disabled={unfollow.isPending}
                    data-testid="button-unfollow"
                  >
                    <UserCheck className="mr-1 h-4 w-4" /> Following
                  </Button>
                ) : (
                  <Button
                    onClick={() => follow.mutate({ id: user.id })}
                    disabled={follow.isPending}
                    data-testid="button-follow"
                  >
                    <UserPlus className="mr-1 h-4 w-4" /> Follow
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => open.mutate({ data: { userId: user.id } })}
                  disabled={open.isPending}
                  data-testid="button-message"
                >
                  <MessageCircle className="mr-1 h-4 w-4" /> Message
                </Button>
                {status === "none" && (
                  <Button
                    variant="outline"
                    onClick={() => sendReq.mutate({ id: user.id })}
                    disabled={friendBusy}
                    data-testid="button-add-friend"
                  >
                    Add friend
                  </Button>
                )}
                {status === "request_sent" && (
                  <Button
                    variant="outline"
                    onClick={() => cancelReq.mutate({ id: user.id })}
                    disabled={friendBusy}
                    data-testid="button-cancel-request"
                  >
                    Requested
                  </Button>
                )}
                {status === "request_received" && (
                  <Button
                    onClick={() => acceptReq.mutate({ id: user.id })}
                    disabled={friendBusy}
                    data-testid="button-accept-request"
                  >
                    <Check className="mr-1 h-4 w-4" /> Accept
                  </Button>
                )}
                {status === "friends" && (
                  <Button variant="secondary" disabled data-testid="button-friends">
                    <UserCheck className="mr-1 h-4 w-4" /> Friends
                  </Button>
                )}
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions" data-testid="button-more">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {user.isMuted ? (
                  <DropdownMenuItem
                    onSelect={() => unmute.mutate({ id: user.id })}
                    data-testid="menu-unmute"
                  >
                    <Eye className="mr-2 h-4 w-4" /> Unmute
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => mute.mutate({ id: user.id })}
                    data-testid="menu-mute"
                  >
                    <EyeOff className="mr-2 h-4 w-4" /> Mute
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {user.isBlocked ? (
                  <DropdownMenuItem
                    onSelect={() => unblock.mutate({ id: user.id })}
                    data-testid="menu-unblock"
                  >
                    <UserMinus className="mr-2 h-4 w-4" /> Unblock
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => block.mutate({ id: user.id })}
                    data-testid="menu-block"
                  >
                    <Ban className="mr-2 h-4 w-4" /> Block
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Hashtags</h2>
        {user.hashtags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hashtags yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {user.hashtags.map((t) => {
              const mutual = user.mutualHashtags.includes(t);
              return (
                <Link
                  key={t}
                  href={`/app/rooms/${encodeURIComponent(t)}`}
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium transition",
                    mutual
                      ? "bg-gradient-to-r from-violet-500/20 to-pink-500/20 text-foreground"
                      : "bg-accent text-accent-foreground hover:bg-accent/80",
                  ].join(" ")}
                  data-testid={`profile-tag-${t}`}
                >
                  <Hash className="h-3.5 w-3.5" /> {t}
                  {mutual && <span className="ml-1 text-[10px]">(shared)</span>}
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <SimilarPeople username={user.username} onChanged={invalidate} />
    </div>
  );
}

function SimilarPeople({
  username,
  onChanged,
}: {
  username: string;
  onChanged: () => void;
}) {
  const { data, isLoading } = useGetFollowSuggestions(
    { username, limit: 6 },
    {
      query: {
        queryKey: getGetFollowSuggestionsQueryKey({ username, limit: 6 }),
        refetchOnWindowFocus: false,
      },
    },
  );

  if (isLoading) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Similar people
        </h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Finding people who share hashtags…
        </div>
      </section>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-card p-5"
      data-testid="similar-people"
    >
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        Similar people
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Based on shared hashtags with @{username}.
      </p>
      <ul className="space-y-3">
        {data.map((m) => (
          <SimilarPersonRow key={m.id} m={m} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function SimilarPersonRow({
  m,
  onChanged,
}: {
  m: MatchUser;
  onChanged: () => void;
}) {
  const follow = useFollowUser({ mutation: { onSuccess: onChanged } });
  const unfollow = useUnfollowUser({ mutation: { onSuccess: onChanged } });
  return (
    <li
      className="flex items-center gap-3"
      data-testid={`similar-person-${m.username}`}
    >
      <Link href={`/app/u/${m.username}`} className="shrink-0">
        <PresenceAvatar
          displayName={m.displayName}
          avatarUrl={m.avatarUrl}
          animatedAvatarUrl={m.animatedAvatarUrl}
          lastSeenAt={m.lastSeenAt}
          size="md"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/app/u/${m.username}`}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {m.displayName}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          @{m.username}
          {m.sharedHashtags.length > 0 && (
            <>
              {" · "}
              <span>
                {m.sharedHashtags.length} shared{" "}
                {m.sharedHashtags.length === 1 ? "hashtag" : "hashtags"}
              </span>
            </>
          )}
        </p>
      </div>
      {m.isFollowing ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => unfollow.mutate({ id: m.id })}
          disabled={unfollow.isPending}
          data-testid={`button-unfollow-similar-${m.username}`}
        >
          <UserCheck className="mr-1 h-3.5 w-3.5" /> Following
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => follow.mutate({ id: m.id })}
          disabled={follow.isPending}
          data-testid={`button-follow-similar-${m.username}`}
        >
          <UserPlus className="mr-1 h-3.5 w-3.5" /> Follow
        </Button>
      )}
    </li>
  );
}
