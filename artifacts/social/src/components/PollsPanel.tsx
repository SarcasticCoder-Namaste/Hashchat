import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  useGetRoomPolls,
  useGetConversationPolls,
  getGetRoomPollsQueryKey,
  getGetConversationPollsQueryKey,
} from "@workspace/api-client-react";
import { PollCard } from "./PollCard";
import { PollCreatorDialog, type PollScope } from "./PollCreatorDialog";
import { Loader2 } from "lucide-react";

interface PollsPanelProps {
  scope: PollScope;
}

export function PollsPanel({ scope }: PollsPanelProps) {
  const qc = useQueryClient();
  const isRoom = scope.kind === "room";

  const queryKey: QueryKey = isRoom
    ? getGetRoomPollsQueryKey(scope.tag)
    : getGetConversationPollsQueryKey(scope.conversationId);

  const roomQuery = useGetRoomPolls(isRoom ? scope.tag : "", {
    query: {
      queryKey,
      refetchInterval: 8000,
      enabled: isRoom,
    },
  });
  const convQuery = useGetConversationPolls(
    isRoom ? 0 : scope.conversationId,
    {
      query: {
        queryKey,
        refetchInterval: 8000,
        enabled: !isRoom,
      },
    },
  );
  const q = isRoom ? roomQuery : convQuery;

  function invalidate() {
    qc.invalidateQueries({ queryKey });
  }

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const url = isRoom
      ? `/api/rooms/${encodeURIComponent(scope.tag)}/polls/stream`
      : `/api/conversations/${scope.conversationId}/polls/stream`;
    const es = new EventSource(url, { withCredentials: true });
    const onUpdate = () => qc.invalidateQueries({ queryKey });
    es.addEventListener("poll-update", onUpdate);
    return () => {
      es.removeEventListener("poll-update", onUpdate);
      es.close();
    };
  }, [isRoom, scope, qc, queryKey]);

  const heading = isRoom
    ? `Polls in #${scope.tag}`
    : "Polls in this conversation";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <p className="text-sm font-semibold">{heading}</p>
        <PollCreatorDialog scope={scope} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {q.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : !q.data || q.data.length === 0 ? (
          <div className="flex justify-center py-8 text-sm text-muted-foreground">
            {isRoom
              ? "No polls yet. Be the first to ask the room!"
              : "No polls yet. Start one to get the chat decided."}
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
