import { useGetMyQuests } from "@workspace/api-client-react";
import { Check, Sparkles } from "lucide-react";

export function QuestsWidget() {
  const { data, isLoading } = useGetMyQuests();
  if (isLoading || !data) return null;
  const completed = data.quests.filter((q) => q.completed).length;
  return (
    <div
      className="rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-4"
      data-testid="quests-widget"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Daily quests
          </p>
          <p className="text-[11px] text-muted-foreground">
            {completed} of {data.quests.length} done today
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {data.quests.map((q) => {
          const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
          return (
            <li
              key={q.code}
              className={[
                "rounded-lg border border-border bg-card/70 p-2.5",
                q.completed ? "opacity-80" : "",
              ].join(" ")}
              data-testid={`quest-${q.code}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                    q.completed
                      ? "bg-emerald-500"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {q.completed ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span className="text-[10px] font-bold">
                      {q.progress}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      "text-xs font-semibold",
                      q.completed
                        ? "line-through text-muted-foreground"
                        : "text-foreground",
                    ].join(" ")}
                  >
                    {q.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {q.description}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                  {q.progress}/{q.target}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={[
                    "h-full transition-all",
                    q.completed
                      ? "bg-emerald-500"
                      : "bg-gradient-to-r from-violet-500 to-pink-500",
                  ].join(" ")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
