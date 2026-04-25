import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import {
  useGetMessageReplies,
  useSendConversationMessage,
  useSendRoomMessage,
  getGetMessageRepliesQueryKey,
  getGetConversationMessagesQueryKey,
  getGetRoomMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MentionTextarea } from "./MentionTextarea";
import { Loader2, Send } from "lucide-react";
import { renderRichContent } from "@/lib/mentions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentId: number | null;
  scope: { type: "conversation"; id: number } | { type: "room"; tag: string };
}

export function ThreadDrawer({ open, onOpenChange, parentId, scope }: Props) {
  const qc = useQueryClient();
  const { user: clerkUser } = useUser();
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const enabled = open && parentId !== null;
  const { data, isLoading, refetch } = useGetMessageReplies(parentId ?? 0, {
    query: {
      queryKey: getGetMessageRepliesQueryKey(parentId ?? 0),
      enabled,
      refetchInterval: enabled ? 3000 : false,
    },
  });

  useEffect(() => {
    setDraft("");
  }, [parentId]);

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
    });
  }, [data?.replies?.length]);

  function invalidate() {
    if (parentId !== null) {
      qc.invalidateQueries({
        queryKey: getGetMessageRepliesQueryKey(parentId),
      });
    }
    if (scope.type === "conversation") {
      qc.invalidateQueries({
        queryKey: getGetConversationMessagesQueryKey(scope.id),
      });
    } else {
      qc.invalidateQueries({
        queryKey: getGetRoomMessagesQueryKey(scope.tag),
      });
    }
  }

  const sendDm = useSendConversationMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        invalidate();
      },
    },
  });
  const sendRoom = useSendRoomMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        invalidate();
      },
    },
  });

  function submit() {
    const content = draft.trim();
    if (!content || parentId === null) return;
    if (scope.type === "conversation") {
      sendDm.mutate({
        id: scope.id,
        data: { content, replyToId: parentId },
      });
    } else {
      sendRoom.mutate({
        tag: scope.tag,
        data: { content, replyToId: parentId },
      });
    }
  }

  const isSending = sendDm.isPending || sendRoom.isPending;
  const parent = data?.parent;
  const replies = data?.replies ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col p-0"
        data-testid="thread-drawer"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Thread</SheetTitle>
          <SheetDescription className="sr-only">
            Replies to a message
          </SheetDescription>
        </SheetHeader>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : parent ? (
            <div className="flex flex-col gap-3">
              <ThreadMessage message={parent} isParent />
              {replies.length > 0 && (
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {replies.length} {replies.length === 1 ? "reply" : "replies"}
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}
              {replies.map((m) => (
                <ThreadMessage key={m.id} message={m} />
              ))}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Thread not found.
            </div>
          )}
        </div>

        <div className="flex items-end gap-2 border-t border-border bg-card p-2">
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            placeholder="Reply in thread…"
            variant="input"
            onSubmit={submit}
            testId="input-thread-reply"
            disabled={parentId === null}
          />
          <Button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || isSending || parentId === null}
            data-testid="button-send-thread"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );

  function ThreadMessage({
    message,
    isParent,
  }: {
    message: NonNullable<typeof data>["parent"];
    isParent?: boolean;
  }) {
    const mine = message.senderId === clerkUser?.id;
    const time = new Date(message.createdAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return (
      <div
        className={[
          "flex gap-2",
          isParent ? "rounded-lg border border-border bg-muted/30 p-2" : "",
        ].join(" ")}
        data-testid={`thread-msg-${message.id}`}
      >
        <Avatar className="h-8 w-8 shrink-0">
          {message.senderAvatarUrl ? (
            <AvatarImage
              src={message.senderAvatarUrl}
              alt={message.senderName}
            />
          ) : null}
          <AvatarFallback className="bg-primary/15 text-primary text-xs">
            {message.senderName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-semibold text-foreground">
              {mine ? "You" : message.senderName}
            </p>
            <span className="text-[10px] text-muted-foreground/70">{time}</span>
          </div>
          {message.content && (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
              {renderRichContent(message.content, message.mentions)}
            </p>
          )}
          {message.imageUrl && (
            <a
              href={message.imageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block"
            >
              <img
                src={message.imageUrl}
                alt=""
                className="max-h-48 max-w-full rounded-md object-cover"
              />
            </a>
          )}
        </div>
      </div>
    );
  }
}
