import { Link } from "wouter";
import { useGetHashtagLeaderboard } from "@workspace/api-client-react";
import { Trophy, Sparkles } from "lucide-react";

export function LeaderboardPanel({ tag }: { tag: string }) {
  const { data, isLoading } = useGetHashtagLeaderboard(tag);
  if (isLoading) return null;
  const entries = data?.entries ?? [];
  const start = data ? new Date(data.weekStart) : null;
  return (
    <div
      className="rounded-xl border border-border bg-card p-3"
      data-testid="leaderboard-panel"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <Trophy className="h-3 w-3" />
        </span>
        <p className="flex-1 text-xs font-semibold text-foreground">
          Top contributors this week
        </p>
        {start && (
          <span className="text-[10px] text-muted-foreground">
            since {start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-muted-foreground">
          No activity yet this week. Be the first to post!
        </p>
      ) : (
        <ol className="space-y-1.5">
          {entries.map((e, i) => (
            <li key={e.user.id} className="flex items-center gap-2" data-testid={`leaderboard-entry-${e.user.id}`}>
              <span
                className={[
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  i === 0
                    ? "bg-amber-400 text-white"
                    : i === 1
                      ? "bg-zinc-400 text-white"
                      : i === 2
                        ? "bg-orange-700/70 text-white"
                        : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {i + 1}
              </span>
              <Link
                href={`/app/u/${e.user.username}`}
                className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
              >
                {e.user.avatarUrl ? (
                  <img
                    src={e.user.animatedAvatarUrl ?? e.user.avatarUrl}
                    alt={e.user.displayName}
                    className="h-6 w-6 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-[10px] font-semibold text-white">
                    {e.user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                  {e.user.displayName}
                  {e.user.mvpPlan && (
                    <Sparkles className="ml-1 inline h-2.5 w-2.5 text-violet-500" />
                  )}
                </span>
              </Link>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {e.posts}p · {e.messages}m
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
