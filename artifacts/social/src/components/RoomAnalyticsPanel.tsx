import { useState } from "react";
import {
  useGetRoomAnalytics,
  getGetRoomAnalyticsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { Download, Eye, FileText, Loader2, MessageSquare, Users } from "lucide-react";
import { TopPostsList } from "@/pages/Analytics";

const WINDOWS = [
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
  { value: 365, label: "1y" },
] as const;

const shortDay = (d: string) => {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function RoomAnalyticsPanel({
  tag,
  canManage,
}: {
  tag: string;
  canManage: boolean;
}) {
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const q = useGetRoomAnalytics(
    tag,
    { days },
    {
      query: {
        queryKey: getGetRoomAnalyticsQueryKey(tag, { days }),
        enabled: canManage,
      },
    },
  );
  const data = q.data;

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        Only the room owner or moderators can view analytics.
      </p>
    );
  }
  if (q.isLoading || !data) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }

  const cards = [
    { label: "Posts", value: data.postCount, icon: FileText },
    { label: "Members", value: data.memberCount, icon: Users },
    { label: "Messages", value: data.messageCount, icon: MessageSquare },
    { label: "Impressions", value: data.totalImpressions, icon: Eye },
  ];

  return (
    <div className="space-y-4" data-testid={`room-analytics-${tag}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          How people are engaging with #{tag}.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full border border-border p-1">
            {WINDOWS.map((w) => (
              <Button
                key={w.value}
                size="sm"
                variant={days === w.value ? "default" : "ghost"}
                className="h-6 rounded-full px-2 text-[11px]"
                onClick={() => setDays(w.value)}
                data-testid={`room-window-${w.value}`}
              >
                {w.label}
              </Button>
            ))}
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 rounded-full px-2.5 text-[11px]"
            data-testid={`room-export-csv-${tag}`}
          >
            <a
              href={`/api/rooms/${encodeURIComponent(tag)}/analytics.csv?days=${days}`}
              download={`room-${tag}-analytics-${days}d.csv`}
            >
              <Download className="mr-1 h-3 w-3" />
              CSV
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card p-2.5"
            data-testid={`room-stat-${c.label.toLowerCase()}`}
          >
            <div className="flex items-center gap-2">
              <c.icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-base font-bold leading-tight">{c.value}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.label}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity over time
        </p>
        <div className="h-44 w-full" data-testid="room-chart-timeline">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data.timeline}
              margin={{ left: -16, right: 8, top: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="ra-imps" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ra-posts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.5} />
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
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="impressions"
                stroke="#a855f7"
                fill="url(#ra-imps)"
                name="Impressions"
              />
              <Area
                type="monotone"
                dataKey="posts"
                stroke="#ec4899"
                fill="url(#ra-posts)"
                name="Posts"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Top posts
        </p>
        <TopPostsList posts={data.topPosts} />
      </div>
    </div>
  );
}
