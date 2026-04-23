import { useState } from "react";
import {
  useAddMessageReaction,
  useRemoveMessageReaction,
  type Message,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Reply, Smile, CornerDownRight } from "lucide-react";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "🙌"];

interface MessageBubbleProps {
  message: Message;
  variant: "room" | "dm";
  isMine: boolean;
  onReply: (m: Message) => void;
  onInvalidate: () => void;
}

export function MessageBubble({
  message,
  variant,
  isMine,
  onReply,
  onInvalidate,
}: MessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const add = useAddMessageReaction({
    mutation: { onSuccess: onInvalidate },
  });
  const remove = useRemoveMessageReaction({
    mutation: { onSuccess: onInvalidate },
  });

  function toggleEmoji(emoji: string, mine: boolean) {
    if (mine) {
      remove.mutate({ id: message.id, params: { emoji } });
    } else {
      add.mutate({ id: message.id, data: { emoji } });
    }
    setPickerOpen(false);
  }

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (variant === "dm") {
    return (
      <div
        className={[
          "group flex items-end gap-1.5",
          isMine ? "flex-row-reverse" : "flex-row",
        ].join(" ")}
        data-testid={`msg-${message.id}`}
      >
        <div
          className={[
            "flex max-w-[78%] flex-col",
            isMine ? "items-end" : "items-start",
          ].join(" ")}
        >
          {message.replyToContent && (
            <div
              className={[
                "mb-1 max-w-full rounded-lg border-l-2 border-primary/60 bg-muted px-2 py-1 text-xs text-muted-foreground",
                isMine ? "self-end" : "self-start",
              ].join(" ")}
            >
              <span className="line-clamp-2">↪ {message.replyToContent}</span>
            </div>
          )}
          <div
            className={[
              "rounded-2xl px-3.5 py-2 text-sm shadow-sm",
              isMine
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-card text-foreground",
            ].join(" ")}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
            <p
              className={[
                "mt-1 text-[10px]",
                isMine
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground/70",
              ].join(" ")}
            >
              {time}
            </p>
          </div>
          {message.reactions.length > 0 && (
            <ReactionRow
              reactions={message.reactions}
              onToggle={toggleEmoji}
              align={isMine ? "end" : "start"}
            />
          )}
        </div>
        <MessageActions
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
          onReply={() => onReply(message)}
          onPick={(e) => toggleEmoji(e, false)}
        />
      </div>
    );
  }

  return (
    <div
      className="group flex gap-3"
      data-testid={`msg-${message.id}`}
    >
      <Avatar className="h-9 w-9">
        {message.senderAvatarUrl ? (
          <AvatarImage
            src={message.senderAvatarUrl}
            alt={message.senderName}
          />
        ) : null}
        <AvatarFallback className="bg-primary/15 text-primary">
          {message.senderName
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-semibold text-foreground">
            {message.senderName}
          </p>
          <span className="text-xs text-muted-foreground/70">{time}</span>
        </div>
        {message.replyToContent && (
          <div className="mt-1 flex items-start gap-1 rounded-md border-l-2 border-primary/60 bg-muted px-2 py-1 text-xs text-muted-foreground">
            <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-2">{message.replyToContent}</span>
          </div>
        )}
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
          {message.content}
        </p>
        {message.reactions.length > 0 && (
          <ReactionRow
            reactions={message.reactions}
            onToggle={toggleEmoji}
            align="start"
          />
        )}
      </div>
      <MessageActions
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        onReply={() => onReply(message)}
        onPick={(e) => toggleEmoji(e, false)}
      />
    </div>
  );
}

function ReactionRow({
  reactions,
  onToggle,
  align,
}: {
  reactions: Message["reactions"];
  onToggle: (emoji: string, mine: boolean) => void;
  align: "start" | "end";
}) {
  return (
    <div
      className={[
        "mt-1 flex flex-wrap gap-1",
        align === "end" ? "justify-end" : "",
      ].join(" ")}
    >
      {reactions.map((r) => (
        <button
          type="button"
          key={r.emoji}
          onClick={() => onToggle(r.emoji, r.reactedByMe)}
          data-testid={`reaction-${r.emoji}`}
          className={[
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
            r.reactedByMe
              ? "border-primary/60 bg-primary/15 text-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-accent",
          ].join(" ")}
        >
          <span>{r.emoji}</span>
          <span className="font-medium">{r.count}</span>
        </button>
      ))}
    </div>
  );
}

function MessageActions({
  pickerOpen,
  setPickerOpen,
  onReply,
  onPick,
}: {
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  onReply: () => void;
  onPick: (emoji: string) => void;
}) {
  return (
    <div className="flex items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            data-testid="button-react"
            aria-label="Add reaction"
          >
            <Smile className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          side="top"
          className="flex w-auto gap-1 p-1.5"
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              className="rounded-md p-1 text-lg hover:bg-accent"
              onClick={() => onPick(e)}
              data-testid={`pick-${e}`}
            >
              {e}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onReply}
        data-testid="button-reply"
        aria-label="Reply"
      >
        <Reply className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
