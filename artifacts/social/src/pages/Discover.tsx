import { Link, useLocation } from "wouter";
import {
  useDiscoverPeople,
  useGetTrendingHashtags,
  useGetMe,
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
} from "lucide-react";

export default function Discover() {
  const { data: me } = useGetMe();
  const { data: matches, isLoading } = useDiscoverPeople({ limit: 12 });
  const { data: trending } = useGetTrendingHashtags({ limit: 10 });

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Welcome back{me ? `, ${me.displayName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          Fresh matches and trending hashtags based on what you love.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-foreground">Smart matches</h2>
        </div>
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-card" />
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
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
            No matches yet. Add more hashtags from your profile to find people.
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-pink-600" />
            <h2 className="text-lg font-semibold text-foreground">Trending now</h2>
          </div>
          <Link href="/app/trending" className="text-sm font-medium text-primary hover:underline" data-testid="link-all-trending">
              See all
            </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {trending?.map((t) => (
            <Link key={t.tag} href={`/app/rooms/${encodeURIComponent(t.tag)}`} data-testid={`discover-trend-${t.tag}`} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-primary">
                <Hash className="h-3.5 w-3.5" />
                {t.tag}
                <span className="ml-1 text-xs text-muted-foreground/70">
                  {t.recentMessages}↑
                </span>
              </Link>
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
      className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
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
