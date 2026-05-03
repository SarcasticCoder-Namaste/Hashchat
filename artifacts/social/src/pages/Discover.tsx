import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  useGetExplore,
  useGetMe,
  useGetMyFriends,
  useOpenConversation,
  useSendFriendRequest,
  useCancelFriendRequest,
  useAcceptFriendRequest,
  useFollowUser,
  useUnfollowUser,
  useBlockUser,
  useMuteUser,
  useRsvpEvent,
  useCancelRsvpEvent,
  getGetExploreQueryKey,
  getGetMyFriendsQueryKey,
  getGetFriendRequestsQueryKey,
  getGetMyRelationshipsQueryKey,
  getGetFollowingFeedQueryKey,
  getGetFollowSuggestionsQueryKey,
  type MatchUser,
  type TrendingHashtag,
  type Event as ApiEvent,
  type Room as ApiRoom,
  type HotPost,
  type ForYouItem,
  type Post as ApiPost,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  Calendar,
  Radio,
  Bell,
  BellOff,
  DoorOpen,
  Heart,
  Compass,
} from "lucide-react";

function greeting(name?: string) {
  const h = new Date().getHours();
  const tod = h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${tod}, ${name}` : tod;
}

function formatRelative(iso: string) {
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return diff > 0 ? "Now" : "Just now";
  if (min < 60) return diff > 0 ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return diff > 0 ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return diff > 0 ? `in ${day}d` : `${day}d ago`;
}

export default function Discover() {
  const { data: me } = useGetMe();
  const { data: friends } = useGetMyFriends();
  const { data: explore, isLoading } = useGetExplore({
    query: {
      queryKey: getGetExploreQueryKey(),
      refetchOnWindowFocus: false,
    },
  });
  const search = useSearch();
  const initialFriendCode = useMemo(() => {
    const params = new URLSearchParams(search ?? "");
    const raw = params.get("friendCode") ?? params.get("code");
    if (!raw) return undefined;
    const norm = raw
      .toUpperCase()
      .replace(/^#/, "")
      .replace(/[^A-Z0-9]/g, "");
    return norm || undefined;
  }, [search]);

  const firstName = me?.displayName.split(" ")[0];

  const stats = useMemo(
    () => [
      {
        label: "Hashtags",
        value: me?.hashtags.length ?? 0,
        icon: Hash,
        accent: "from-violet-500 to-fuchsia-500",
      },
      {
        label: "Friends",
        value: friends?.length ?? 0,
        icon: Users,
        accent: "from-pink-500 to-rose-500",
      },
      {
        label: "Trending",
        value: explore?.trendingHashtags.length ?? 0,
        icon: Flame,
        accent: "from-orange-500 to-amber-500",
      },
    ],
    [me?.hashtags.length, friends?.length, explore?.trendingHashtags.length],
  );

  const followsAnyHashtag = (explore?.followedHashtags.length ?? 0) > 0;

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
            <span className="brand-gradient-text">Explore</span> what's hot.
          </h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Trending hashtags, live events, and people who share your interests.
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

      <FriendCodeSearch
        variant="block"
        initialCode={initialFriendCode}
        autoLookup={Boolean(initialFriendCode)}
      />

      <TrendingHashtagsSection
        hashtags={explore?.trendingHashtags ?? []}
        isLoading={isLoading}
      />

      <TrendingEventsSection
        events={explore?.trendingEvents ?? []}
        isLoading={isLoading}
      />

      <SuggestedRoomsSection
        rooms={explore?.suggestedRooms ?? []}
        isLoading={isLoading}
        followsAnyHashtag={followsAnyHashtag}
      />

      <PeopleToFollowSection
        people={explore?.peopleToFollow ?? []}
        isLoading={isLoading}
        hasOwnHashtags={(me?.hashtags.length ?? 0) > 0}
      />

      <HotInYourHashtagsSection
        items={explore?.hotInYourHashtags ?? []}
        isLoading={isLoading}
        followsAnyHashtag={followsAnyHashtag}
      />

      <ForYouPreviewSection
        items={explore?.forYouPreview ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}

// --------------------------- Section primitives ---------------------------

function SectionHeader({
  icon: Icon,
  iconClass,
  title,
  href,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  title: string;
  href?: string;
  testId?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={iconClass} />
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {href && (
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline"
          data-testid={testId}
        >
          See all →
        </Link>
      )}
    </div>
  );
}

function HRail({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

// --------------------------- Trending hashtags ---------------------------

function TrendingHashtagsSection({
  hashtags,
  isLoading,
}: {
  hashtags: TrendingHashtag[];
  isLoading: boolean;
}) {
  return (
    <section data-testid="explore-section-trending">
      <SectionHeader
        icon={TrendingUp}
        iconClass="h-5 w-5 text-pink-600"
        title="Trending hashtags"
        href="/app/trending"
        testId="link-all-trending"
      />
      {isLoading && hashtags.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-24 animate-pulse rounded-full bg-accent"
            />
          ))}
        </div>
      ) : hashtags.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="No trends yet"
          description="Once people start chatting, hot hashtags will appear here."
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {hashtags.map((t, idx) => (
            <motion.div
              key={t.tag}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: idx * 0.025,
                type: "spring",
                stiffness: 320,
                damping: 22,
              }}
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
      )}
    </section>
  );
}

// --------------------------- Trending events ---------------------------

function TrendingEventsSection({
  events,
  isLoading,
}: {
  events: ApiEvent[];
  isLoading: boolean;
}) {
  return (
    <section data-testid="explore-section-events">
      <SectionHeader
        icon={Calendar}
        iconClass="h-5 w-5 text-violet-600"
        title="Trending events"
      />
      {isLoading && events.length === 0 ? (
        <HRail>
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </HRail>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No upcoming events"
          description="Follow more hashtags to see events from rooms you care about."
          action={
            <Button asChild>
              <Link href="/app/trending">Browse rooms →</Link>
            </Button>
          }
        />
      ) : (
        <HRail testId="trending-events-rail">
          {events.map((e, idx) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.2 }}
              className="min-w-[260px] max-w-[320px] flex-shrink-0 md:min-w-0 md:max-w-none"
            >
              <EventCard e={e} />
            </motion.div>
          ))}
        </HRail>
      )}
    </section>
  );
}

function EventCard({ e }: { e: ApiEvent }) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getGetExploreQueryKey() });
  const rsvp = useRsvpEvent({ mutation: { onSuccess: invalidate } });
  const unRsvp = useCancelRsvpEvent({ mutation: { onSuccess: invalidate } });
  return (
    <div
      className="rounded-xl border border-border bg-card p-3 shadow-sm"
      data-testid={`event-card-${e.id}`}
    >
      <div className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
        {e.isLive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400">
            <Radio className="h-3 w-3 animate-pulse" /> Live now
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <Calendar className="h-3 w-3" /> {formatRelative(e.startsAt)}
          </span>
        )}
        <Link
          href={`/app/rooms/${encodeURIComponent(e.roomTag)}`}
          className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          <Hash className="h-3 w-3" />
          {e.roomTag}
        </Link>
      </div>
      <p className="line-clamp-2 text-sm font-semibold text-foreground">
        {e.title}
      </p>
      {e.description && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {e.description}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{e.rsvpCount} going</span>
        {e.rsvpedByMe ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => unRsvp.mutate({ id: e.id })}
            disabled={unRsvp.isPending}
            data-testid={`event-unrsvp-${e.id}`}
          >
            <BellOff className="mr-1 h-3.5 w-3.5" /> Going
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => rsvp.mutate({ id: e.id })}
            disabled={rsvp.isPending}
            data-testid={`event-rsvp-${e.id}`}
          >
            <Bell className="mr-1 h-3.5 w-3.5" /> RSVP
          </Button>
        )}
      </div>
    </div>
  );
}

// --------------------------- Suggested rooms ---------------------------

function SuggestedRoomsSection({
  rooms,
  isLoading,
  followsAnyHashtag,
}: {
  rooms: ApiRoom[];
  isLoading: boolean;
  followsAnyHashtag: boolean;
}) {
  return (
    <section data-testid="explore-section-rooms">
      <SectionHeader
        icon={DoorOpen}
        iconClass="h-5 w-5 text-orange-500"
        title="Suggested rooms"
        href="/app/rooms"
        testId="link-all-rooms"
      />
      {isLoading && rooms.length === 0 ? (
        <HRail>
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </HRail>
      ) : rooms.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No room suggestions yet"
          description={
            followsAnyHashtag
              ? "Things are quiet — check back when more rooms get active."
              : "Follow a few hashtags so we can suggest rooms tailored to you."
          }
          action={
            !followsAnyHashtag ? (
              <Button asChild>
                <Link href="/app/settings">Follow more hashtags →</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <HRail testId="suggested-rooms-rail">
          {rooms.map((r, idx) => (
            <motion.div
              key={r.tag}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.2 }}
              className="min-w-[260px] max-w-[320px] flex-shrink-0 md:min-w-0 md:max-w-none"
            >
              <RoomCard r={r} />
            </motion.div>
          ))}
        </HRail>
      )}
    </section>
  );
}

function RoomCard({ r }: { r: ApiRoom }) {
  return (
    <Link
      href={`/app/rooms/${encodeURIComponent(r.tag)}`}
      className="lift block rounded-xl border border-border bg-gradient-to-br from-violet-500/5 via-card to-pink-500/5 p-4 shadow-sm"
      data-testid={`room-card-${r.tag}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold text-white shadow">
          #
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            <Hash className="inline h-4 w-4" />
            {r.tag}
          </p>
          <p className="text-xs text-muted-foreground">
            {r.memberCount} members · {r.recentMessages} recent
          </p>
        </div>
      </div>
    </Link>
  );
}

// --------------------------- People to follow ---------------------------

function PeopleToFollowSection({
  people,
  isLoading,
  hasOwnHashtags,
}: {
  people: MatchUser[];
  isLoading: boolean;
  hasOwnHashtags: boolean;
}) {
  return (
    <section data-testid="explore-section-people">
      <SectionHeader
        icon={Users}
        iconClass="h-5 w-5 text-pink-600"
        title="People to follow"
        href="/app/discover/people"
        testId="link-all-people"
      />
      {isLoading && people.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one to suggest yet"
          description={
            hasOwnHashtags
              ? "We'll surface more people as they join."
              : "Add a few hashtags to your profile and we'll match you with people who share them."
          }
          action={
            !hasOwnHashtags ? (
              <Button asChild>
                <Link href="/app/settings">Add hashtags →</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((m, idx) => (
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
      )}
    </section>
  );
}

// --------------------------- Hot in your hashtags ---------------------------

function HotInYourHashtagsSection({
  items,
  isLoading,
  followsAnyHashtag,
}: {
  items: HotPost[];
  isLoading: boolean;
  followsAnyHashtag: boolean;
}) {
  return (
    <section data-testid="explore-section-hot">
      <SectionHeader
        icon={Flame}
        iconClass="h-5 w-5 text-orange-500"
        title="What's hot in your hashtags"
      />
      {isLoading && items.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Flame}
          title={
            followsAnyHashtag
              ? "No hot posts in your hashtags yet"
              : "Follow hashtags to see hot posts"
          }
          description={
            followsAnyHashtag
              ? "Check back soon — we surface the top posts of the last 24 hours."
              : "Once you follow a few hashtags, the top engaging posts will appear here."
          }
          action={
            !followsAnyHashtag ? (
              <Button asChild>
                <Link href="/app/settings">Follow more hashtags →</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3" data-testid="hot-posts-list">
          {items.map((h, idx) => (
            <motion.div
              key={h.post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx, 6) * 0.03, duration: 0.2 }}
            >
              <HotPostCard h={h} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

function HotPostCard({ h }: { h: HotPost }) {
  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`hot-post-${h.post.id}`}
    >
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Flame className="h-3 w-3 text-orange-500" />
        {h.matchedHashtag ? (
          <>
            Hot in{" "}
            <Link
              href={`/app/tag/${encodeURIComponent(h.matchedHashtag)}`}
              className="text-primary hover:underline"
            >
              #{h.matchedHashtag}
            </Link>
          </>
        ) : (
          <>Trending now</>
        )}
        <span className="ml-auto inline-flex items-center gap-1 normal-case text-foreground">
          <Heart className="h-3 w-3 text-pink-500" /> {h.engagement}
        </span>
      </div>
      <PostBody p={h.post} />
    </article>
  );
}

function PostBody({ p }: { p: ApiPost }) {
  return (
    <div className="flex gap-3">
      <Link href={`/app/u/${p.author.username}`}>
        <PresenceAvatar
          displayName={p.author.displayName}
          avatarUrl={p.author.avatarUrl ?? null}
          size="md"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <Link
            href={`/app/u/${p.author.username}`}
            className="font-semibold text-foreground hover:underline"
          >
            {p.author.displayName}
          </Link>
          <span className="text-xs text-muted-foreground">
            @{p.author.username}
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {new Date(p.createdAt).toLocaleString()}
          </span>
        </div>
        {p.content && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
            {p.content}
          </p>
        )}
        {p.imageUrls.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {p.imageUrls.slice(0, 4).map((u, i) => (
              <img
                key={i}
                src={u}
                alt=""
                className="max-h-48 w-full rounded-lg border border-border object-cover"
              />
            ))}
          </div>
        )}
        {p.hashtags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {p.hashtags.slice(0, 4).map((t) => (
              <Link
                key={t}
                href={`/app/tag/${encodeURIComponent(t)}`}
                className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground hover:bg-primary/10 hover:text-primary"
              >
                <Hash className="h-3 w-3" />
                {t}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------- For You preview ---------------------------

function ForYouPreviewSection({
  items,
  isLoading,
}: {
  items: ForYouItem[];
  isLoading: boolean;
}) {
  return (
    <section data-testid="explore-section-foryou">
      <SectionHeader
        icon={Compass}
        iconClass="h-5 w-5 text-violet-600"
        title="For you"
        href="/app/foryou"
        testId="link-all-foryou"
      />
      {isLoading && items.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing personalized yet"
          description="Add hashtags or follow people and we'll fill this with picks made for you."
          action={
            <Button asChild>
              <Link href="/app/settings">Add hashtags →</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3" data-testid="foryou-preview">
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx, 6) * 0.03, duration: 0.2 }}
            >
              <ForYouRow item={item} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

function ForYouRow({ item }: { item: ForYouItem }) {
  if (item.kind === "post" && item.post) {
    const p = item.post;
    return (
      <article
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
        data-testid={`foryou-post-${p.id}`}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-3 w-3 text-violet-500" /> {item.reason}
        </div>
        <PostBody p={p} />
      </article>
    );
  }
  if (item.kind === "room" && item.room) {
    const r = item.room;
    return (
      <Link
        href={`/app/rooms/${encodeURIComponent(r.tag)}`}
        className="lift block rounded-xl border border-border bg-gradient-to-br from-violet-500/5 via-card to-pink-500/5 p-4 shadow-sm"
        data-testid={`foryou-room-${r.tag}`}
      >
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Flame className="h-3 w-3 text-orange-500" /> {item.reason}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-xl font-bold text-white shadow">
            #
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-foreground">
              <Hash className="inline h-4 w-4" />
              {r.tag}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.memberCount} members · {r.recentMessages} recent messages
            </p>
          </div>
          <Button size="sm" variant="outline">
            Open room
          </Button>
        </div>
      </Link>
    );
  }
  if (item.kind === "person" && item.person) {
    return (
      <div data-testid={`foryou-person-${item.person.username}`}>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <UserPlus className="h-3 w-3 text-pink-500" /> {item.reason}
        </div>
        <MatchCard m={item.person} />
      </div>
    );
  }
  return null;
}

// --------------------------- Match card (reused) ---------------------------

function MatchCard({ m }: { m: MatchUser }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetExploreQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyFriendsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFriendRequestsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMyRelationshipsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFollowingFeedQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFollowSuggestionsQueryKey() });
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
