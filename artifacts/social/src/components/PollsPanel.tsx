import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRoomPolls,
  getGetRoomPollsQueryKey,
} from "@workspace/api-client-react";
import { PollCard } from "./PollCard";
import { PollCreatorDialog } from "./PollCreatorDialog";
import { Loader2 } from "lucide-react";

interface PollsPanelProps {
  tag: string;
}

export function PollsPanel({ tag }: PollsPanelProps) {
  const qc = useQueryClient();
  const q = useGetRoomPolls(tag, {
    query: {
      queryKey: getGetRoomPollsQueryKey(tag),
      refetchInterval: 8000,
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: getGetRoomPollsQueryKey(tag) });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <p className="text-sm font-semibold">Polls in #{tag}</p>
        <PollCreatorDialog tag={tag} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {q.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : !q.data || q.data.length === 0 ? (
          <div className="flex justify-center py-8 text-sm text-muted-foreground">
            No polls yet. Be the first to ask the room!
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {q.data.map((p) => (
              <PollCard key={p.id} poll={p} onVoted={invalidate} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
