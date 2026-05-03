import { useGetMyStreak } from "@workspace/api-client-react";
import { Flame } from "lucide-react";

export function StreakBadge({ testId = "streak-badge" }: { testId?: string }) {
  const { data } = useGetMyStreak();
  if (!data) return null;
  const count = data.currentStreak;
  if (count <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"
        data-testid={testId}
        title="Post or react today to start a streak"
      >
        <Flame className="h-3 w-3" />0
      </span>
    );
  }
  const hot = count >= 7;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        hot
          ? "bg-gradient-to-r from-orange-500/20 to-rose-500/20 text-orange-600 dark:text-orange-300"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-300",
      ].join(" ")}
      data-testid={testId}
      title={`${count}-day streak (longest: ${data.longestStreak})`}
    >
      <Flame className={["h-3 w-3", hot ? "animate-pulse" : ""].join(" ")} />
      {count}
    </span>
  );
}
