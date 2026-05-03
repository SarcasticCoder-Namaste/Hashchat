import { useState } from "react";
import { Link } from "wouter";
import { useGetMyAnalytics, type TopPost } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Eye,
  FileText,
  Heart,
  Loader2,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";

const WINDOWS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 365, label: "365 days" },
] as const;

const shortDay = (d: string) => {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Analytics() {
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const q = useGetMyAnalytics({ days });
  const data = q.data;

  return (
    <div
      className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:py-8"
      data-testid="creator-analytics-page"
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
          Creator analytics
        </h1>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 md:p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg">
              <BarChart3 className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                <span className="brand-gradient-text">Your reach</span>
              </h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Track how your posts perform and how your audience grows.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full border border-border bg-card p-1">
              {WINDOWS.map((w) => (
                <Button
                  key={w.value}
                  size="sm"
                  variant={days === w.value ? "default" : "ghost"}
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={() => setDays(w.value)}
                  data-testid={`window-${w.value}`}
                >
                  {w.label}
                </Button>
              ))}
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs"
              data-testid="button-export-csv"
            >
              <a
                href={`/api/me/analytics.csv?days=${days}`}
                download={`creator-analytics-${days}d.csv`}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
              </a>
            </Button>
          </div>
        </div>
      </div>

      {q.isLoading || !data ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/70" />
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Followers"
              value={data.totalFollowers}
              delta={data.followerDelta}
              icon={Star}
              accent="from-amber-500 to-orange-500"
            />
            <StatCard
              label="Posts"
              value={data.totalPosts}
              icon={FileText}
              accent="from-pink-500 to-rose-500"
            />
            <StatCard
              label="Impressions"
              value={data.totalImpressions}
              icon={Eye}
              accent="from-violet-500 to-fuchsia-500"
            />
            <StatCard
              label="Likes"
              value={data.totalLikes}
              icon={Heart}
              accent="from-rose-500 to-pink-500"
            />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
            <header className="mb-3 flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold">Followers over time</h3>
            </header>
            <div className="h-56 w-full" data-testid="chart-followers">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.timeline}
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
                    dataKey="followers"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Total followers"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              icon={FileText}
              accent="text-pink-500"
              title="Posts per day"
              testId="chart-posts"
            >
              <BarChart
                data={data.timeline}
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
                  dataKey="posts"
                  fill="#ec4899"
                  name="Posts"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartCard>
            <ChartCard
              icon={TrendingUp}
              accent="text-violet-600"
              title="Impressions per day"
              testId="chart-impressions"
            >
              <AreaChart
                data={data.timeline}
                margin={{ left: -16, right: 8, top: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="me-imps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
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
                  dataKey="impressions"
                  stroke="#a855f7"
                  fill="url(#me-imps)"
                  name="Impressions"
                />
              </AreaChart>
            </ChartCard>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
            <header className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-violet-600" />
              <h3 className="text-base font-semibold">Top posts</h3>
            </header>
            <TopPostsList posts={data.topPosts} />
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  delta?: number;
  icon: typeof Star;
  accent: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-testid={`stat-${label.toLowerCase()}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white shadow-sm`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {label}
            {typeof delta === "number" && delta > 0 ? (
              <span className="ml-1 text-emerald-500">+{delta}</span>
            ) : null}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ChartCard({
  icon: Icon,
  accent,
  title,
  testId,
  children,
}: {
  icon: typeof Star;
  accent: string;
  title: string;
  testId: string;
  children: React.ReactElement;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-6">
      <header className="mb-3 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${accent}`} />
        <h3 className="text-base font-semibold">{title}</h3>
      </header>
      <div className="h-48 w-full" data-testid={testId}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TopPostsList({ posts }: { posts: TopPost[] }) {
  if (posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Not enough impression data yet — share a post to see it here.
      </p>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {posts.map((tp) => (
        <Link
          key={tp.post.id}
          href={`/app/u/${tp.post.author.username}`}
          className="lift block rounded-xl border border-border bg-background p-3 transition hover:bg-accent"
          data-testid={`top-post-${tp.post.id}`}
        >
          <p className="line-clamp-2 text-sm text-foreground">
            {tp.post.content || "(no text)"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3 w-3" /> {tp.impressions}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {tp.uniqueViewers}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> {tp.likes}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
