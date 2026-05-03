import { useEffect, useMemo, useState } from "react";
import {
  useVotePoll,
  type Poll,
  type PollOption,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  Loader2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

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

function ResultsChart({
  options,
  totalVotes,
  highlight,
}: {
  options: PollOption[];
  totalVotes: number;
  highlight: (o: PollOption) => boolean;
}) {
  const data = options.map((o) => ({
    name: o.text,
    votes: o.votes,
    pct: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0,
    id: o.id,
    highlight: highlight(o),
  }));
  const maxVotes = Math.max(1, ...data.map((d) => d.votes));
  return (
    <div className="w-full" style={{ height: Math.max(80, options.length * 36) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: 8 }}
        >
          <XAxis type="number" hide domain={[0, maxVotes]} />
          <YAxis
            type="category"
            dataKey="name"
            width={110}
            tick={{ fontSize: 11, fill: "currentColor" }}
            axisLine={false}
            tickLine={false}
          />
          <Bar
            dataKey="votes"
            radius={[4, 4, 4, 4]}
            label={{
              position: "right",
              fontSize: 11,
              fill: "currentColor",
              formatter: (value: number) => {
                const row = data.find((d) => d.votes === value);
                return row ? `${row.pct}% · ${value}` : `${value}`;
              },
            }}
          >
            {data.map((d) => (
              <Cell
                key={d.id}
                fill={
                  d.highlight
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted-foreground) / 0.45)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankedResults({
  poll,
  options,
}: {
  poll: Poll;
  options: PollOption[];
}) {
  const rounds = poll.rounds ?? [];
  const [idx, setIdx] = useState(rounds.length > 0 ? rounds.length - 1 : 0);
  useEffect(() => {
    if (rounds.length > 0 && idx >= rounds.length) setIdx(rounds.length - 1);
  }, [rounds.length, idx]);
  if (rounds.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No ballots yet.</p>
    );
  }
  const r = rounds[idx];
  const total = r.tallies.reduce((s, t) => s + t.votes, 0);
  const optMap = new Map(options.map((o) => [o.id, o]));
  const roundOpts: PollOption[] = r.tallies.map((t) => {
    const base = optMap.get(t.optionId);
    return {
      id: t.optionId,
      text: base?.text ?? `Option ${t.optionId}`,
      votes: t.votes,
      votedByMe: base?.votedByMe ?? false,
      myRank: base?.myRank ?? null,
    };
  });
  const eliminatedNames = r.eliminated
    .map((id) => optMap.get(id)?.text)
    .filter((s): s is string => !!s);
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center justify-between text-xs text-muted-foreground"
        data-testid={`poll-rounds-${poll.id}`}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={idx === 0}
          onClick={() => setIdx(Math.max(0, idx - 1))}
          aria-label="Previous round"
          data-testid={`button-poll-round-prev-${poll.id}`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span>
          Round {r.round} of {rounds.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={idx >= rounds.length - 1}
          onClick={() => setIdx(Math.min(rounds.length - 1, idx + 1))}
          aria-label="Next round"
          data-testid={`button-poll-round-next-${poll.id}`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ResultsChart
        options={roundOpts}
        totalVotes={total}
        highlight={(o) =>
          poll.winnerOptionId === o.id ||
          (poll.winnerOptionId == null && o.votedByMe)
        }
      />
      {eliminatedNames.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Eliminated this round: {eliminatedNames.join(", ")}
        </p>
      )}
    </div>
  );
}

export function PollCard({ poll, onVoted }: PollCardProps) {
  const vote = useVotePoll({ mutation: { onSuccess: () => onVoted?.() } });

  const hasVoted = (poll.myVoteOptionIds?.length ?? 0) > 0;
  const closed = poll.isExpired;
  const showResults = hasVoted || closed;
  const mode = poll.mode ?? "single";

  const [multiSel, setMultiSel] = useState<number[]>([]);
  const [rankOrder, setRankOrder] = useState<number[]>(() =>
    poll.options.map((o) => o.id),
  );
  useEffect(() => {
    setRankOrder((prev) => {
      const ids = poll.options.map((o) => o.id);
      const filtered = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !filtered.includes(id));
      return [...filtered, ...missing];
    });
  }, [poll.options]);

  const totalForBars = useMemo(() => {
    if (mode === "ranked") {
      const r = poll.rounds?.[0];
      return r ? r.tallies.reduce((s, t) => s + t.votes, 0) : 0;
    }
    return poll.totalVotes;
  }, [mode, poll.rounds, poll.totalVotes]);

  function submitMulti() {
    if (multiSel.length < 1) return;
    vote.mutate({ id: poll.id, data: { optionIds: multiSel } });
  }

  function submitRanked() {
    if (rankOrder.length < 1) return;
    vote.mutate({ id: poll.id, data: { rankedOptionIds: rankOrder } });
  }

  function moveRank(idx: number, dir: -1 | 1) {
    const next = [...rankOrder];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRankOrder(next);
  }

  const [dragIdx, setDragIdx] = useState<number | null>(null);

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
            {mode !== "single" && (
              <>
                {" · "}
                <span data-testid={`poll-mode-${poll.id}`}>
                  {mode === "multi"
                    ? `Multi-select (up to ${poll.maxSelections})`
                    : "Ranked choice"}
                </span>
              </>
            )}
          </p>
          <p className="break-words text-sm font-semibold text-foreground">
            {poll.question}
          </p>
        </div>
        {poll.expiresAt && (
          <span
            className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground"
            data-testid={`poll-countdown-${poll.id}`}
          >
            <Clock className="h-3 w-3" />
            {timeUntil(poll.expiresAt)}
          </span>
        )}
      </div>

      {showResults ? (
        mode === "ranked" ? (
          <RankedResults poll={poll} options={poll.options} />
        ) : (
          <ResultsChart
            options={poll.options}
            totalVotes={totalForBars}
            highlight={(o) => o.votedByMe}
          />
        )
      ) : mode === "single" ? (
        <div className="flex flex-col gap-1.5">
          {poll.options.map((o) => (
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
          ))}
        </div>
      ) : mode === "multi" ? (
        <div className="flex flex-col gap-2">
          {poll.options.map((o) => {
            const checked = multiSel.includes(o.id);
            return (
              <label
                key={o.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover-elevate"
                data-testid={`label-multi-option-${o.id}`}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v) {
                      if (multiSel.length >= poll.maxSelections) return;
                      setMultiSel([...multiSel, o.id]);
                    } else {
                      setMultiSel(multiSel.filter((id) => id !== o.id));
                    }
                  }}
                  data-testid={`checkbox-vote-${o.id}`}
                />
                <span className="truncate">{o.text}</span>
              </label>
            );
          })}
          <Button
            type="button"
            size="sm"
            disabled={vote.isPending || multiSel.length === 0}
            onClick={submitMulti}
            data-testid={`button-submit-multi-${poll.id}`}
          >
            {vote.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-2 h-3.5 w-3.5" />
            )}
            Submit ({multiSel.length}/{poll.maxSelections})
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground">
            Drag to rank — top is most preferred.
          </p>
          <ol className="flex flex-col gap-1.5">
            {rankOrder.map((id, idx) => {
              const o = poll.options.find((opt) => opt.id === id);
              if (!o) return null;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIdx === null || dragIdx === idx) return;
                    const next = [...rankOrder];
                    const [moved] = next.splice(dragIdx, 1);
                    next.splice(idx, 0, moved);
                    setRankOrder(next);
                    setDragIdx(null);
                  }}
                  onDragEnd={() => setDragIdx(null)}
                  className={[
                    "flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm",
                    dragIdx === idx ? "opacity-50" : "",
                  ].join(" ")}
                  data-testid={`rank-item-${o.id}`}
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="w-5 text-xs text-muted-foreground">
                    {idx + 1}.
                  </span>
                  <span className="flex-1 truncate">{o.text}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={idx === 0}
                    onClick={() => moveRank(idx, -1)}
                    aria-label="Move up"
                    data-testid={`button-rank-up-${o.id}`}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 rotate-90" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={idx === rankOrder.length - 1}
                    onClick={() => moveRank(idx, 1)}
                    aria-label="Move down"
                    data-testid={`button-rank-down-${o.id}`}
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                  </Button>
                </li>
              );
            })}
          </ol>
          <Button
            type="button"
            size="sm"
            disabled={vote.isPending}
            onClick={submitRanked}
            data-testid={`button-submit-ranked-${poll.id}`}
          >
            {vote.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="mr-2 h-3.5 w-3.5" />
            )}
            Submit ranking
          </Button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {poll.totalVotes} vote{poll.totalVotes === 1 ? "" : "s"}
        {closed ? " · Final results" : ""}
      </p>
    </article>
  );
}
