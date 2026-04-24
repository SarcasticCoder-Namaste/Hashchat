import { Link, useLocation } from "wouter";
import {
  useDiscoverPeople,
  useGetTrendingHashtags,
  useGetMe,
  useGetMyFriends,
  useGetFollowingFeed,
  useOpenConversation,
  useSendFriendRequest,
  useCancelFriendRequest,
  useAcceptFriendRequest,
  useFollowUser,
  useUnfollowUser,
  useBlockUser,
  useMuteUser,
  getDiscoverPeopleQueryKey,
  getGetMyFriendsQueryKey,
  getGetFriendRequestsQueryKey,
  getGetFollowingFeedQueryKey,
  getGetMyRelationshipsQueryKey,
  type MatchUser,
  type FollowingFeedItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";
import { PresenceAvatar } from "@/components/UserBadge";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { FriendCodeSearch } from "@/components/FriendCodeSearch";
import { useToast } from "@/hooks/use-toast";
import {
  Hash,
  Sparkles,
  MessageCircle,
  TrendingUp,
  Loader2,
  UserPlus,
  UserCheck,
  Check,
  Star,
  Crown,
  Users,
  Flame,
  MoreHorizontal,
  Ban,
  EyeOff,
  Rss,
} from "lucide-react";

function greeting(name?: string) {
  const h = new Date().getHours();
  const tod = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${tod}, ${name}` : tod;
}

export default function Discover() {
  const { data: me } = useGetMe();
  const { data: matches, isLoading } = useDiscoverPeople({ limit: 12 });
  const { data: trending } = useGetTrendingHashtags({ limit: 10 });
  const { data: friends } = useGetMyFriends();

  const firstName = me?.displayName.split(" ")[0];

  const stats = [
    { label: "Hashtags", value: me?.hashtags.length ?? 0, icon: Hash, accent: "from-violet-500 to-fuchsia-500" },
    { label: "Friends", value: friends?.length ?? 0, icon: Users, accent: "from-pink-500 to-rose-500" },
    { label: "Trending", value: trending?.length ?? 0, icon: Flame, accent: "from-orange-500 to-amber-500" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-6 md:px-8 md:py-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 md:p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative"
        >
          <p className="text-sm font-medium text-muted-foreground">
            {greeting(firstName)} 👋
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            Find your <span className="brand-gradient-text">people</span>.
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Fresh matches and hashtags hand-picked from what you love.
          </p>
        </motion.div>

        <div className="relative mt-6 grid grid-cols-3 gap-3">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.05, duration: 0.3 }}
              className="rounded-xl border border-border bg-card/70 p-3 backdrop-blur lift"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-white shadow-sm`}
                >
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-lg font-bold leading-none text-foreground">{s.value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <FriendCodeSearch variant="block" />

      {/* Tabs: For you / Following */}
      <Tabs defaultValue="foryou" className="w-full">
        <TabsList data-testid="discover-tabs">
          <TabsTrigger value="foryou" data-testid="tab-foryou">
            <Sparkles className="mr-1 h-4 w-4" /> For you
          </TabsTrigger>
          <TabsTrigger value="following" data-testid="tab-following">
            <Rss className="mr-1 h-4 w-4" /> Following
          </TabsTrigger>
        </TabsList>
        <TabsContent value="foryou" className="mt-4">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : matches && matches.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matches.map((m, idx) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.25 }}
                >
                  <MatchCard m={m} />
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No matches yet"
              description="Add a few more hashtags from your profile and we'll surface people who share them."
              action={
                <Button asChild>
                  <Link href="/app/settings">Add hashtags →</Link>
                </Button>
              }
            />
          )}
        </TabsContent>
        <TabsContent value="following" className="mt-4">
          <FollowingFeed />
        </TabsContent>
      </Tabs>

      {/* Trending */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-pink-600" />
            <h2 className="text-lg font-semibold text-foreground">Trending now</h2>
          </div>
          <Link
            href="/app/trending"
            className="text-sm font-medium text-primary hover:underline"
            data-testid="link-all-trending"
          >
            See all →
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {trending?.map((t, idx) => (
            <motion.div
              key={t.tag}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.025, type: "spring", stiffness: 320, damping: 22 }}
            >
              <Link
                href={`/app/rooms/${encodeURIComponent(t.tag)}`}
                data-testid={`discover-trend-${t.tag}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:text-primary hover:shadow-md"
              >
                <Hash className="h-3.5 w-3.5" />
                {t.tag}
                <span className="ml-1 text-xs text-muted-foreground/70">
                  {t.recentMessages}↑
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MatchCard({ m }: { m: MatchUser }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getDiscoverPeopleQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyFriendsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFriendRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyRelationshipsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFollowingFeedQueryKey() });
  };
  const open = useOpenConversation({
    mutation: {
      onSuccess: (conv) => setLocation(`/app/messages/${conv.id}`),
    },
  });
  const sendReq = useSendFriendRequest({ mutation: { onSuccess: invalidate } });
  const cancelReq = useCancelFriendRequest({
    mutation: { onSuccess: invalidate },
  });
  const acceptReq = useAcceptFriendRequest({
    mutation: { onSuccess: invalidate },
  });
  const follow = useFollowUser({ mutation: { onSuccess: invalidate } });
  const unfollow = useUnfollowUser({ mutation: { onSuccess: invalidate } });
  const mute = useMuteUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Muted", description: `Hidden ${m.displayName} from feeds.` });
      },
    },
  });
  const block = useBlockUser({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Blocked", description: `You won't see ${m.displayName} anymore.` });
      },
    },
  });

  const status = m.friendStatus ?? "none";
  const friendBusy =
    sendReq.isPending || cancelReq.isPending || acceptReq.isPending;

  function FriendButton() {
    if (status === "friends") {
      return (
        <Button
          size="sm"
          variant="secondary"
          disabled
          data-testid={`friend-status-${m.username}`}
        >
          <UserCheck className="mr-1 h-3.5 w-3.5" /> Friends
        </Button>
      );
    }
    if (status === "request_sent") {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={() => cancelReq.mutate({ id: m.id })}
          disabled={friendBusy}
          data-testid={`friend-status-${m.username}`}
        >
          Requested
        </Button>
      );
    }
    if (status === "request_received") {
      return (
        <Button
          size="sm"
          onClick={() => acceptReq.mutate({ id: m.id })}
          disabled={friendBusy}
          data-testid={`friend-status-${m.username}`}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Accept
        </Button>
      );
    }
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => sendReq.mutate({ id: m.id })}
        disabled={friendBusy}
        data-testid={`friend-status-${m.username}`}
      >
        <UserPlus className="mr-1 h-3.5 w-3.5" /> Add friend
      </Button>
    );
  }

  return (
    <div
      className="lift flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`match-${m.username}`}
    >
      <div className="flex items-center gap-3">
        <Link href={`/app/u/${m.username}`}>
          <PresenceAvatar
            displayName={m.displayName}
            avatarUrl={m.avatarUrl}
            lastSeenAt={m.lastSeenAt}
            size="lg"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={`/app/u/${m.username}`}
              className="truncate font-semibold text-foreground hover:underline"
              data-testid={`link-profile-${m.username}`}
            >
              {m.displayName}
            </Link>
            {m.role === "admin" && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                <Crown className="h-2.5 w-2.5" /> Admin
              </span>
            )}
            {m.mvpPlan && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/30 to-pink-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                <Sparkles className="h-2.5 w-2.5" /> MVP
              </span>
            )}
            {m.featuredHashtag && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                data-testid={`featured-${m.username}`}
              >
                <Star className="h-2.5 w-2.5" />
                {m.featuredHashtag}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            @{m.username}
            {m.discriminator && (
              <span className="ml-1 text-muted-foreground/70">
                #{m.discriminator}
              </span>
            )}
          </p>
        </div>
        <span
          className="rounded-full bg-gradient-to-r from-violet-500/20 to-pink-500/20 px-2 py-0.5 text-xs font-semibold text-foreground"
          data-testid={`match-score-${m.username}`}
        >
          {m.matchScore}↑
        </span>
      </div>
      {m.bio && (
        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {m.bio}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-1">
        {m.sharedHashtags.slice(0, 4).map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
          >
            <Hash className="h-3 w-3" />
            {t}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          onClick={() => open.mutate({ data: { userId: m.id } })}
          disabled={open.isPending}
          data-testid={`button-message-${m.username}`}
        >
          {open.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-2 h-4 w-4" />
          )}
          Say hi
        </Button>
        {m.isFollowing ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => unfollow.mutate({ id: m.id })}
            disabled={unfollow.isPending}
            data-testid={`button-unfollow-${m.username}`}
          >
            <UserCheck className="mr-1 h-3.5 w-3.5" /> Following
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => follow.mutate({ id: m.id })}
            disabled={follow.isPending}
            data-testid={`button-follow-${m.username}`}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Follow
          </Button>
        )}
        <FriendButton />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="More actions"
              data-testid={`button-more-${m.username}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => mute.mutate({ id: m.id })}
              data-testid={`menu-mute-${m.username}`}
            >
              <EyeOff className="mr-2 h-4 w-4" /> Mute
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => block.mutate({ id: m.id })}
              data-testid={`menu-block-${m.username}`}
            >
              <Ban className="mr-2 h-4 w-4" /> Block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function FollowingFeed() {
  const { data, isLoading } = useGetFollowingFeed(
    { limit: 30 },
    {
      query: {
        queryKey: getGetFollowingFeedQueryKey({ limit: 30 }),
        refetchOnWindowFocus: false,
      },
    },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Rss}
        title="Quiet here so far"
        description="Follow people from Smart matches to see their latest posts and rooms here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item) => (
        <FollowingFeedRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function FollowingFeedRow({ item }: { item: FollowingFeedItem }) {
  const u = item.user;
  return (
    <article
      className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`feed-item-${item.id}`}
    >
      <Link href={`/app/u/${u.username}`}>
        <PresenceAvatar
          displayName={u.displayName}
          avatarUrl={u.avatarUrl}
          lastSeenAt={u.lastSeenAt}
          size="md"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <Link href={`/app/u/${u.username}`} className="font-semibold text-foreground hover:underline">
            {u.displayName}
          </Link>
          <span className="text-xs text-muted-foreground">@{u.username}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {new Date(item.createdAt).toLocaleString()}
          </span>
        </div>
        {item.kind === "room_join" ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Joined{" "}
            <Link
              href={`/app/rooms/${encodeURIComponent(item.roomTag ?? "")}`}
              className="font-medium text-primary hover:underline"
            >
              <Hash className="inline h-3.5 w-3.5" />
              {item.roomTag}
            </Link>
          </p>
        ) : (
          <>
            {item.roomTag && (
              <Link
                href={`/app/rooms/${encodeURIComponent(item.roomTag)}`}
                className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
              >
                <Hash className="h-3 w-3" />
                {item.roomTag}
              </Link>
            )}
            {item.content && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {item.content}
              </p>
            )}
            {item.imageUrl && (
              <img
                src={item.imageUrl}
                alt=""
                className="mt-2 max-h-72 rounded-lg border border-border"
              />
            )}
          </>
        )}
      </div>
    </article>
  );
}
