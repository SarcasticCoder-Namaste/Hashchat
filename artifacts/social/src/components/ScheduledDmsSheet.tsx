import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Clock, AlertCircle, Copy, RotateCcw } from "lucide-react";
import { ScheduleDmDialog } from "@/components/ScheduleDmDialog";

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
  const { toast } = useToast();
  const [retry, setRetry] = useState<{
    id: number;
    conversationId: number;
    content: string;
    replyToId: number | null;
  } | null>(null);

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

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" });
    }
  }

  return (
    <>
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
              items.map((m) => {
                const failed = m.status === "failed";
                return (
                  <div
                    key={m.id}
                    className={`rounded-md border p-3 ${
                      failed
                        ? "border-destructive/40 bg-destructive/5"
                        : "border-border bg-card"
                    }`}
                    data-testid={`scheduled-${m.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {formatWhen(m.scheduledFor)}
                        </p>
                        {failed && (
                          <Badge
                            variant="destructive"
                            className="h-5 gap-1 px-1.5 text-[10px]"
                            data-testid={`badge-failed-${m.id}`}
                          >
                            <AlertCircle className="h-3 w-3" /> Failed
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => cancel.mutate({ id: m.id })}
                        aria-label={
                          failed
                            ? "Dismiss failed message"
                            : "Cancel scheduled message"
                        }
                        data-testid={`button-cancel-scheduled-${m.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm">
                      {m.content}
                    </p>
                    {failed && (
                      <>
                        <p className="mt-1 text-xs text-destructive/80">
                          We couldn't deliver this message. You can try again or
                          copy the text into a new draft.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs"
                            onClick={() =>
                              setRetry({
                                id: m.id,
                                conversationId: m.conversationId,
                                content: m.content,
                                replyToId: m.replyToId ?? null,
                              })
                            }
                            data-testid={`button-reschedule-${m.id}`}
                          >
                            <RotateCcw className="h-3 w-3" /> Reschedule
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-xs"
                            onClick={() => copyToClipboard(m.content)}
                            data-testid={`button-copy-failed-${m.id}`}
                          >
                            <Copy className="h-3 w-3" /> Copy text
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
      {retry && (
        <ScheduleDmDialog
          open={true}
          onOpenChange={(v) => {
            if (!v) setRetry(null);
          }}
          conversationId={retry.conversationId}
          content={retry.content}
          replyToId={retry.replyToId}
          rescheduleId={retry.id}
          onScheduled={() => {
            setRetry(null);
            toast({ title: "Message rescheduled" });
          }}
        />
      )}
    </>
  );
}
