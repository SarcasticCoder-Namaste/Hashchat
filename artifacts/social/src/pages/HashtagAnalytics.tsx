import { Link } from "wouter";
import {
  useGetHashtagAnalytics,
  useFollowHashtag,
  useUnfollowHashtag,
  getGetHashtagAnalyticsQueryKey,
  getGetHashtagQueryKey,
  getGetMyFollowedHashtagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PresenceAvatar } from "@/components/UserBadge";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Hash,
  ArrowLeft,
  Users,
  MessageCircle,
  Star,
  TrendingUp,
  FileText,
  Sparkles,
  Loader2,
  Radio,
} from "lucide-react";

function shortDay(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function HashtagAnalytics({ tag }: { tag: string }) {
  const cleanTag = decodeURIComponent(tag).toLowerCase().replace(/^#/, "");
  const qc = useQueryClient();
  const { data, isLoading } = useGetHashtagAnalytics(
    cleanTag,
    { days: 14 },
    {
      query: {
        queryKey: getGetHashtagAnalyticsQueryKey(cleanTag, { days: 14 }),
        refetchOnWindowFocus: false,
      },
    },
  );
  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: getGetHashtagAnalyticsQueryKey(cleanTag, { days: 14 }),
    });
    qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(cleanTag) });
    qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
  };
  const follow = useFollowHashtag({ mutation: { onSuccess: invalidate } });
  const unfollow = useUnfollowHashtag({ mutation: { onSuccess: invalidate } });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center text-muted-foreground">
        Hashtag not found.
      </div>
    );
  }

  const timeline = data.timeline;
  const stats = [
    {
      label: "Members",
      value: data.memberCount,
      icon: Users,
      accent: "from-violet-500 to-fuchsia-500",
    },
    {
      label: "Followers",
      value: data.followerCount,
      icon: Star,
      accent: "from-amber-500 to-orange-500",
    },
    {
      label: "Messages",
      value: data.messageCount,
      icon: MessageCircle,
      accent: "from-emerald-500 to-teal-500",
    },
    {
      label: "Posts",
      value: data.postCount,
      icon: FileText,
      accent: "from-pink-500 to-rose-500",
    },
  ];

  return (
    <div
      className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-10"
      data-testid="hashtag-analytics-page"
    >
      <div className="flex items-center gap-2">
        <Link
          href="/app/discover"
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-sm font-medium text-muted-foreground">
          Hashtag analytics
        </h1>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 md:p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-2xl font-bold text-white shadow-lg">
                #
              </span>
              <h2
                className="text-3xl font-bold tracking-tight md:text-4xl"
                data-testid="analytics-tag"
              >
                <span className="brand-gradient-text">#{data.tag}</span>
              </h2>
            </div>
            <p className="mt-2 max-w-md text-muted-foreground">
              The pulse of #{data.tag} over the last {data.days} days.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" data-testid="button-go-room">
              <Link href={`/app/rooms/${encodeURIComponent(data.tag)}`}>
                <Hash className="mr-1 h-4 w-4" /> Open room
              </Link>
            </Button>
            <Button
              variant={data.isFollowed ? "secondary" : "default"}
              onClick={() =>
                data.isFollowed
                  ? unfollow.mutate({ tag: data.tag })
                  : follow.mutate({ tag: data.tag })
              }
              data-testid="button-analytics-follow"
            >
              <Star
                className={[
                  "mr-1 h-4 w-4",
                  data.isFollowed ? "fill-yellow-400 text-yellow-500" : "",
                ].join(" ")}
              />
              {data.isFollowed ? "Following" : "Follow"}
            </Button>
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.25 }}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
            data-testid={`stat-${s.label.toLowerCase()}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-white shadow-sm`}
              >
                <s.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {s.label}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <header className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-violet-600" />
          <h3 className="text-base font-semibold text-foreground">
            Activity over time
          </h3>
        </header>
        <div className="h-64 w-full" data-testid="chart-activity">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeline} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="messages" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="posts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip
                labelFormatter={(d) => shortDay(String(d))}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="messages"
                stroke="#a855f7"
                fill="url(#messages)"
                name="Messages"
              />
              <Area
                type="monotone"
                dataKey="posts"
                stroke="#ec4899"
                fill="url(#posts)"
                name="Posts"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
          <header className="mb-3 flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            <h3 className="text-base font-semibold text-foreground">
              Followers growth
            </h3>
          </header>
          <div className="h-48 w-full" data-testid="chart-followers">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={timeline}
                margin={{ left: -16, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
                <Tooltip
                  labelFormatter={(d) => shortDay(String(d))}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeFollowers"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name="Total followers"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
          <header className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-500" />
            <h3 className="text-base font-semibold text-foreground">
              New members per day
            </h3>
          </header>
          <div className="h-48 w-full" data-testid="chart-new-members">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={timeline}
                margin={{ left: -16, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 11 }}
                  stroke="currentColor"
                />
                <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
                <Tooltip
                  labelFormatter={(d) => shortDay(String(d))}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="newMembers"
                  fill="#10b981"
                  name="New members"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
        <header className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-violet-600" />
          <h3 className="text-base font-semibold text-foreground">
            Top contributors
          </h3>
        </header>
        {data.topContributors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active contributors yet.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.topContributors.map((c) => (
              <Link
                key={c.user.id}
                href={`/app/u/${c.user.username}`}
                className="lift flex items-center gap-3 rounded-xl border border-border p-3 transition hover:bg-accent"
                data-testid={`contributor-${c.user.username}`}
              >
                <PresenceAvatar
                  displayName={c.user.displayName}
                  avatarUrl={c.user.avatarUrl ?? null}
                  animatedAvatarUrl={c.user.animatedAvatarUrl}
                  lastSeenAt={c.user.lastSeenAt}
                  presenceState={c.user.presenceState}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">
                    {c.user.displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{c.user.username}
                  </p>
                  {c.user.currentRoomTag && (
                    <p className="truncate text-[11px] font-medium text-primary">
                      <Radio className="mr-1 inline h-3 w-3" />
                      Active in #{c.user.currentRoomTag}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold text-foreground">
                    {c.messageCount}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    msgs
                  </p>
                </div>
                {c.postCount > 0 && (
                  <div className="text-right text-xs">
                    <p className="font-semibold text-foreground">
                      {c.postCount}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      posts
                    </p>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {data.relatedHashtags.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
          <header className="mb-3 flex items-center gap-2">
            <Hash className="h-5 w-5 text-pink-500" />
            <h3 className="text-base font-semibold text-foreground">
              Related hashtags
            </h3>
          </header>
          <div className="flex flex-wrap gap-2">
            {data.relatedHashtags.map((t) => (
              <Link
                key={t}
                href={`/app/tag/${encodeURIComponent(t)}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent hover:text-primary"
                data-testid={`related-${t}`}
              >
                <Hash className="h-3.5 w-3.5" />
                {t}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
