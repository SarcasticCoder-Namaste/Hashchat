import { useState } from "react";
import {
  useAddMessageReaction,
  useRemoveMessageReaction,
  type Message,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Reply, Smile, CornerDownRight, MessageSquare, Check, CheckCheck } from "lucide-react";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { PollCard } from "./PollCard";
import { WaveformPlayer } from "./WaveformPlayer";
import { BookmarkButton } from "./BookmarkButton";
import { renderRichContent } from "@/lib/mentions";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "🙌"];

interface MessageBubbleProps {
  message: Message;
  variant: "room" | "dm";
  isMine: boolean;
  onReply: (m: Message) => void;
  onInvalidate: () => void;
  onOpenThread?: (m: Message) => void;
  showReadReceipt?: boolean;
}

export function MessageBubble({
  message,
  variant,
  isMine,
  onReply,
  onInvalidate,
  onOpenThread,
  showReadReceipt,
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

  if (message.poll) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
        className={[
          "group flex",
          variant === "dm"
            ? isMine
              ? "justify-end"
              : "justify-start"
            : "gap-3",
        ].join(" ")}
        data-testid={`msg-${message.id}`}
      >
        {variant === "room" && (
          <Avatar className="h-9 w-9">
            {message.senderAvatarUrl ? (
              <AvatarImage src={message.senderAvatarUrl} alt={message.senderName} />
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
        )}
        <div className="min-w-0 max-w-[78%] flex-1">
          {variant === "room" && (
            <div className="mb-1 flex items-baseline gap-2">
              <p className="text-sm font-semibold text-foreground">
                {message.senderName}
              </p>
              <span className="text-xs text-muted-foreground/70">{time}</span>
            </div>
          )}
          <PollCard poll={message.poll} onVoted={onInvalidate} />
        </div>
      </motion.div>
    );
  }

  if (variant === "dm") {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 28 }}
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
              "overflow-hidden rounded-2xl text-sm shadow-sm",
              isMine
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-card text-foreground",
            ].join(" ")}
          >
            {message.imageUrl && (
              <a
                href={message.imageUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open image from ${message.senderName}`}
              >
                <img
                  src={message.imageUrl}
                  alt={`Image from ${message.senderName}`}
                  className="block max-h-80 w-full object-cover"
                  data-testid={`msg-image-${message.id}`}
                />
              </a>
            )}
            {message.audioUrl && (
              <WaveformPlayer
                src={message.audioUrl}
                peaks={message.audioWaveform ?? null}
                isMine={isMine}
                testId={`msg-audio-${message.id}`}
              />
            )}
            <div className="px-3.5 py-2" data-msg-pad>
            {message.content && (
              <p className="whitespace-pre-wrap break-words">
                {renderRichContent(message.content, message.mentions)}
              </p>
            )}
            <p
              className={[
                "mt-1 flex items-center gap-1 text-[10px]",
                isMine ? "justify-end" : "justify-start",
                isMine
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground/70",
              ].join(" ")}
            >
              <span>{time}</span>
              {showReadReceipt && isMine && (
                message.readByOther ? (
                  <CheckCheck
                    className="h-3 w-3"
                    data-testid={`receipt-seen-${message.id}`}
                    aria-label="Seen"
                  />
                ) : (
                  <Check
                    className="h-3 w-3"
                    data-testid={`receipt-delivered-${message.id}`}
                    aria-label="Delivered"
                  />
                )
              )}
            </p>
            </div>
          </div>
          {message.attachments?.map((a) =>
            a.kind === "link_preview" ? (
              <LinkPreviewCard
                key={a.id}
                url={a.url}
                title={a.title}
                description={a.description}
                thumbnailUrl={a.thumbnailUrl}
              />
            ) : null,
          )}
          {message.reactions.length > 0 && (
            <ReactionRow
              reactions={message.reactions}
              onToggle={toggleEmoji}
              align={isMine ? "end" : "start"}
            />
          )}
          {message.replyCount > 0 && onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message)}
              className={[
                "mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline",
                isMine ? "self-end" : "self-start",
              ].join(" ")}
              data-testid={`button-view-thread-${message.id}`}
            >
              <MessageSquare className="h-3 w-3" />
              {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
        <MessageActions
          messageId={message.id}
          pickerOpen={pickerOpen}
          setPickerOpen={setPickerOpen}
          onReply={() => onReply(message)}
          onPick={(e) => toggleEmoji(e, false)}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
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
        {message.imageUrl && (
          <a
            href={message.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block"
            aria-label={`Open image from ${message.senderName}`}
          >
            <img
              src={message.imageUrl}
              alt={`Image from ${message.senderName}`}
              className="max-h-80 max-w-full rounded-lg object-cover"
              data-testid={`msg-image-${message.id}`}
            />
          </a>
        )}
        {message.audioUrl && (
          <div className="mt-1 inline-block rounded-2xl bg-card shadow-sm">
            <WaveformPlayer
              src={message.audioUrl}
              peaks={message.audioWaveform ?? null}
              testId={`msg-audio-${message.id}`}
            />
          </div>
        )}
        {message.content && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
            {renderRichContent(message.content, message.mentions)}
          </p>
        )}
        {message.attachments?.map((a) =>
          a.kind === "link_preview" ? (
            <LinkPreviewCard
              key={a.id}
              url={a.url}
              title={a.title}
              description={a.description}
              thumbnailUrl={a.thumbnailUrl}
            />
          ) : null,
        )}
        {message.reactions.length > 0 && (
          <ReactionRow
            reactions={message.reactions}
            onToggle={toggleEmoji}
            align="start"
          />
        )}
        {message.replyCount > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            data-testid={`button-view-thread-${message.id}`}
          >
            <MessageSquare className="h-3 w-3" />
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>
      <MessageActions
        messageId={message.id}
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        onReply={() => onReply(message)}
        onPick={(e) => toggleEmoji(e, false)}
      />
    </motion.div>
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
  messageId,
  pickerOpen,
  setPickerOpen,
  onReply,
  onPick,
}: {
  messageId: number;
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
      <BookmarkButton kind="message" targetId={messageId} />
    </div>
  );
}
