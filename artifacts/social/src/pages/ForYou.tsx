import { useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  getForYouFeed,
  getGetForYouFeedQueryKey,
  type ForYouFeed,
  type ForYouItem,
  type Post as ApiPost,
  type Room as ApiRoom,
  type MatchUser,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CardSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PresenceAvatar } from "@/components/UserBadge";
import {
  Compass,
  Sparkles,
  Hash,
  Flame,
  UserPlus,
  Loader2,
  Heart,
  MessageCircle,
  DoorOpen,
  Users,
} from "lucide-react";

const PAGE_SIZE = 20;

export default function ForYou() {
  const queryKey = getGetForYouFeedQueryKey({ limit: PAGE_SIZE });

  const q = useInfiniteQuery({
    queryKey,
    initialPageParam: 0 as number,
    queryFn: ({ pageParam, signal }) =>
      getForYouFeed(
        { limit: PAGE_SIZE, offset: pageParam },
        { signal },
      ),
    getNextPageParam: (lastPage: ForYouFeed) => lastPage.nextOffset ?? undefined,
    refetchOnWindowFocus: false,
  });

  const pages = q.data?.pages ?? [];
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: ForYouItem[] = [];
    for (const page of pages) {
      for (const it of page.items) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        out.push(it);
      }
    }
    return out;
  }, [pages]);

  const signals = pages[0]?.signals;
  const hasAnySignal = signals
    ? signals.ownHashtags +
        signals.followedHashtags +
        signals.following +
        signals.recentReactions +
        signals.recentReplies +
        signals.recentRoomVisits >
      0
    : false;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!q.hasNextPage || q.isFetchingNextPage) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) q.fetchNextPage();
      },
      { rootMargin: "400px 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [q]);

  return (
    <div
      className="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-8 md:py-10"
      data-testid="page-foryou"
    >
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-sm font-medium text-muted-foreground">
            Personalized for you
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
            <span className="brand-gradient-text">For you</span>
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            A mix of posts, rooms, and people picked from the hashtags you
            follow, the people you engage with, and the rooms you visit.
          </p>
        </motion.div>
        {signals && hasAnySignal && (
          <div
            className="mt-5 flex flex-wrap gap-2 text-xs"
            data-testid="foryou-signals"
          >
            <SignalChip
              icon={Hash}
              label={`${signals.ownHashtags + signals.followedHashtags} hashtags`}
            />
            <SignalChip icon={Users} label={`${signals.following} following`} />
            <SignalChip
              icon={Heart}
              label={`${signals.recentReactions} reactions`}
            />
            <SignalChip
              icon={MessageCircle}
              label={`${signals.recentReplies} replies`}
            />
            <SignalChip
              icon={DoorOpen}
              label={`${signals.recentRoomVisits} rooms visited`}
            />
          </div>
        )}
      </div>

      {q.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing personalized yet"
          description={
            hasAnySignal
              ? "We're warming up — try reacting to a few posts or joining an active room."
              : "Add some hashtags to your profile and follow a few people. We'll learn what you like and fill this with picks made for you."
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/app/settings">Add hashtags →</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/app/discover/people">Find people to follow</Link>
              </Button>
            </div>
          }
          data-testid="foryou-empty"
        />
      ) : (
        <div className="space-y-3" data-testid="foryou-list">
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx, 8) * 0.02, duration: 0.2 }}
            >
              <ForYouRow item={item} />
            </motion.div>
          ))}
          <div ref={sentinelRef} className="h-px" />
          {q.isFetchingNextPage && (
            <div
              className="flex items-center justify-center py-6 text-sm text-muted-foreground"
              data-testid="foryou-loading-more"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading more…
            </div>
          )}
          {!q.hasNextPage && items.length >= PAGE_SIZE && (
            <p
              className="py-6 text-center text-xs text-muted-foreground"
              data-testid="foryou-end"
            >
              You're all caught up.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SignalChip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card/70 px-2 py-1 text-foreground">
      <Icon className="h-3 w-3 text-violet-500" />
      {label}
    </span>
  );
}

function ForYouRow({ item }: { item: ForYouItem }) {
  if (item.kind === "post" && item.post) {
    return <PostRow post={item.post} reason={item.reason} />;
  }
  if (item.kind === "room" && item.room) {
    return <RoomRow room={item.room} reason={item.reason} />;
  }
  if (item.kind === "person" && item.person) {
    return <PersonRow person={item.person} reason={item.reason} />;
  }
  return null;
}

function PostRow({ post, reason }: { post: ApiPost; reason: string }) {
  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`foryou-post-${post.id}`}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3 text-violet-500" /> {reason}
      </div>
      <div className="flex gap-3">
        <Link href={`/app/u/${post.author.username}`}>
          <PresenceAvatar
            displayName={post.author.displayName}
            avatarUrl={post.author.avatarUrl ?? null}
            size="md"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <Link
              href={`/app/u/${post.author.username}`}
              className="font-semibold text-foreground hover:underline"
            >
              {post.author.displayName}
            </Link>
            <span className="text-xs text-muted-foreground">
              @{post.author.username}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {new Date(post.createdAt).toLocaleString()}
            </span>
          </div>
          {post.content && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
              {post.content}
            </p>
          )}
          {post.imageUrls && post.imageUrls.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {post.imageUrls.slice(0, 4).map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-32 w-full rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}
          {post.hashtags && post.hashtags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {post.hashtags.map((t) => (
                <Link
                  key={t}
                  href={`/app/tag/${encodeURIComponent(t)}`}
                  className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground hover:text-primary"
                >
                  <Hash className="h-3 w-3" />
                  {t}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function RoomRow({ room, reason }: { room: ApiRoom; reason: string }) {
  return (
    <Link
      href={`/app/rooms/${encodeURIComponent(room.tag)}`}
      className="lift block rounded-xl border border-border bg-gradient-to-br from-violet-500/5 via-card to-pink-500/5 p-4 shadow-sm"
      data-testid={`foryou-room-${room.tag}`}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Flame className="h-3 w-3 text-orange-500" /> {reason}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold text-white shadow">
          #
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            <Hash className="inline h-4 w-4" />
            {room.tag}
          </p>
          <p className="text-xs text-muted-foreground">
            {room.memberCount} members · {room.recentMessages} recent messages
          </p>
        </div>
        <Button size="sm" variant="outline">
          Open room
        </Button>
      </div>
    </Link>
  );
}

function PersonRow({
  person,
  reason,
}: {
  person: MatchUser;
  reason: string;
}) {
  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`foryou-person-${person.username}`}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <UserPlus className="h-3 w-3 text-pink-500" /> {reason}
      </div>
      <div className="flex items-center gap-3">
        <Link href={`/app/u/${person.username}`}>
          <PresenceAvatar
            displayName={person.displayName}
            avatarUrl={person.avatarUrl ?? null}
            size="md"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/app/u/${person.username}`}
            className="block truncate font-semibold text-foreground hover:underline"
          >
            {person.displayName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            @{person.username}
          </p>
          {person.sharedHashtags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {person.sharedHashtags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/u/${person.username}`}>
            <Compass className="mr-1 h-3.5 w-3.5" /> View
          </Link>
        </Button>
      </div>
    </article>
  );
}
