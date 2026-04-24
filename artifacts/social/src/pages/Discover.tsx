import { Link, useLocation } from "wouter";
import {
  useDiscoverPeople,
  useGetTrendingHashtags,
  useGetMe,
  useGetMyFriends,
  useOpenConversation,
  useSendFriendRequest,
  useCancelFriendRequest,
  useAcceptFriendRequest,
  getDiscoverPeopleQueryKey,
  getGetMyFriendsQueryKey,
  getGetFriendRequestsQueryKey,
  type MatchUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { PresenceAvatar } from "@/components/UserBadge";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { FriendCodeSearch } from "@/components/FriendCodeSearch";
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

      {/* Smart matches */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-foreground">Smart matches</h2>
        </div>
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
      </section>

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
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getDiscoverPeopleQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyFriendsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFriendRequestsQueryKey() });
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
        <PresenceAvatar
          displayName={m.displayName}
          avatarUrl={m.avatarUrl}
          lastSeenAt={m.lastSeenAt}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold text-foreground">
              {m.displayName}
            </p>
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
        <FriendButton />
      </div>
    </div>
  );
}
