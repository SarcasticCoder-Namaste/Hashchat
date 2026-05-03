import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyScheduledMessages,
  useCancelScheduledMessage,
  getGetMyScheduledMessagesQueryKey,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, Clock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId?: number;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ScheduledDmsSheet({ open, onOpenChange, conversationId }: Props) {
  const qc = useQueryClient();
  const q = useGetMyScheduledMessages({
    query: {
      queryKey: getGetMyScheduledMessagesQueryKey(),
      enabled: open,
      refetchInterval: open ? 15_000 : false,
    },
  });
  const cancel = useCancelScheduledMessage({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetMyScheduledMessagesQueryKey() }),
    },
  });

  const items =
    q.data?.filter((m) =>
      conversationId == null ? true : m.conversationId === conversationId,
    ) ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> Scheduled messages
          </SheetTitle>
          <SheetDescription>
            {conversationId
              ? "Scheduled DMs for this conversation."
              : "Your upcoming scheduled DMs."}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 flex flex-col gap-2">
          {q.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No scheduled DMs.
            </p>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className="rounded-md border border-border bg-card p-3"
                data-testid={`scheduled-${m.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatWhen(m.scheduledFor)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => cancel.mutate({ id: m.id })}
                    aria-label="Cancel scheduled message"
                    data-testid={`button-cancel-scheduled-${m.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm">
                  {m.content}
                </p>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
