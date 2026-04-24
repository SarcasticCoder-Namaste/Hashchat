import {
  useVotePoll,
  type Poll,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { BarChart3, Check, Clock, Loader2 } from "lucide-react";

interface PollCardProps {
  poll: Poll;
  onVoted?: () => void;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "ended";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h left`;
  const d = Math.floor(h / 24);
  return `${d}d left`;
}

export function PollCard({ poll, onVoted }: PollCardProps) {
  const vote = useVotePoll({ mutation: { onSuccess: () => onVoted?.() } });

  const hasVoted = poll.myVoteOptionId !== null;
  const closed = poll.isExpired;
  const showResults = hasVoted || closed;

  return (
    <article
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
      data-testid={`poll-${poll.id}`}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BarChart3 className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Poll by {poll.creatorName}
          </p>
          <p className="break-words text-sm font-semibold text-foreground">
            {poll.question}
          </p>
        </div>
        {poll.expiresAt && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {timeUntil(poll.expiresAt)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {poll.options.map((o) => {
          const pct =
            poll.totalVotes > 0
              ? Math.round((o.votes / poll.totalVotes) * 100)
              : 0;
          if (showResults) {
            return (
              <div
                key={o.id}
                className="relative overflow-hidden rounded-md border border-border"
                data-testid={`poll-option-${o.id}`}
              >
                <div
                  className={[
                    "absolute inset-y-0 left-0 transition-all",
                    o.votedByMe ? "bg-primary/25" : "bg-muted",
                  ].join(" ")}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {o.votedByMe && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span className="truncate">{o.text}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {pct}% · {o.votes}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <Button
              key={o.id}
              type="button"
              variant="outline"
              size="sm"
              className="justify-start"
              disabled={vote.isPending}
              onClick={() =>
                vote.mutate({ id: poll.id, data: { optionId: o.id } })
              }
              data-testid={`button-vote-${o.id}`}
            >
              {vote.isPending && vote.variables?.data.optionId === o.id ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              {o.text}
            </Button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        {closed ? " · closed" : ""}
      </p>
    </article>
  );
}
