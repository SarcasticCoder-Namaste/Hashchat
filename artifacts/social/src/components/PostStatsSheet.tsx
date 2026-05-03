import {
  useGetPostStats,
  getGetPostStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  BarChart3,
  Eye,
  Heart,
  Loader2,
  MousePointerClick,
  UserCircle2,
  Users,
} from "lucide-react";

const shortDay = (d: string) => {
  const dt = new Date(d + "T00:00:00Z");
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function PostStatsSheet({
  postId,
  open,
  onOpenChange,
}: {
  postId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const q = useGetPostStats(postId, {
    query: { queryKey: getGetPostStatsQueryKey(postId), enabled: open },
  });
  const data = q.data;

  const stats = data
    ? [
        {
          label: "Impressions",
          value: data.impressions,
          icon: Eye,
          accent: "from-violet-500 to-fuchsia-500",
        },
        {
          label: "Unique viewers",
          value: data.uniqueViewers,
          icon: Users,
          accent: "from-sky-500 to-cyan-500",
        },
        {
          label: "Likes",
          value: data.likes,
          icon: Heart,
          accent: "from-rose-500 to-pink-500",
        },
        {
          label: "Profile clicks",
          value: data.profileClicks,
          icon: UserCircle2,
          accent: "from-amber-500 to-orange-500",
        },
        {
          label: "Link clicks",
          value: data.linkClicks,
          icon: MousePointerClick,
          accent: "from-emerald-500 to-teal-500",
        },
      ]
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid={`post-stats-sheet-${postId}`}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-violet-600" /> Post stats
          </SheetTitle>
          <SheetDescription>
            Only you can see these numbers. They cover the lifetime of the post.
          </SheetDescription>
        </SheetHeader>

        {q.isLoading || !data ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : (
          <div className="space-y-5 pt-4">
            <div className="grid grid-cols-2 gap-2">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-border bg-card p-3"
                  data-testid={`post-stat-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${s.accent} text-white`}
                    >
                      <s.icon className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-lg font-bold leading-tight">
                        {s.value}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {s.label}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Daily impressions
              </p>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.timeline}
                    margin={{ left: -16, right: 8, top: 4, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="ps-views" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#ps-views)"
                      name="Impressions"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
