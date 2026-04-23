import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetRoomMessages,
  useSendRoomMessage,
  useGetHashtag,
  useFollowHashtag,
  useUnfollowHashtag,
  getGetRoomMessagesQueryKey,
  getGetHashtagQueryKey,
  getGetMyFollowedHashtagsQueryKey,
  getGetRoomsQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageBubble } from "@/components/MessageBubble";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { VoiceMessageButton } from "@/components/VoiceMessageButton";
import { CallButton } from "@/components/CallButton";
import {
  ArrowLeft,
  Hash,
  Send,
  Star,
  Users,
  Loader2,
  X,
  Reply,
} from "lucide-react";

export default function RoomChat({ tag }: { tag: string }) {
  const cleanTag = decodeURIComponent(tag).toLowerCase().replace(/^#/, "");
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const messagesQ = useGetRoomMessages(cleanTag, {
    query: {
      queryKey: getGetRoomMessagesQueryKey(cleanTag),
      refetchInterval: 3000,
    },
  });
  const hashtagQ = useGetHashtag(cleanTag);

  function invalidateMessages() {
    qc.invalidateQueries({ queryKey: getGetRoomMessagesQueryKey(cleanTag) });
  }

  const send = useSendRoomMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        setReplyTo(null);
        invalidateMessages();
      },
    },
  });
  const follow = useFollowHashtag({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(cleanTag) });
        qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
      },
    },
  });
  const unfollow = useUnfollowHashtag({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(cleanTag) });
        qc.invalidateQueries({ queryKey: getGetMyFollowedHashtagsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
      },
    },
  });

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messagesQ.data?.length]);

  useEffect(() => {
    setReplyTo(null);
    setDraft("");
  }, [cleanTag]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate({
      tag: cleanTag,
      data: { content, replyToId: replyTo?.id ?? null },
    });
  }

  function sendImage(imageUrl: string) {
    send.mutate({
      tag: cleanTag,
      data: { content: "", imageUrl, replyToId: replyTo?.id ?? null },
    });
  }

  function sendAudio(audioUrl: string) {
    send.mutate({
      tag: cleanTag,
      data: { content: "", audioUrl, replyToId: replyTo?.id ?? null },
    });
  }

  function startReply(m: Message) {
    setReplyTo(m);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const detail = hashtagQ.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Link
          href="/app/rooms"
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-rooms"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white">
          <Hash className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">
            #{cleanTag}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {detail?.memberCount ?? 0} members
            {detail && detail.recentMessages > 0 && (
              <span className="rounded-full bg-pink-500/15 px-1.5 py-0.5 text-pink-500">
                {detail.recentMessages} new
              </span>
            )}
          </p>
        </div>
        <CallButton roomTag={cleanTag} kind="voice" testId="button-room-call-voice" />
        <CallButton roomTag={cleanTag} kind="video" testId="button-room-call-video" />
        {detail && (
          <Button
            size="sm"
            variant={detail.isFollowed ? "secondary" : "outline"}
            onClick={() =>
              detail.isFollowed
                ? unfollow.mutate({ tag: cleanTag })
                : follow.mutate({ tag: cleanTag })
            }
            data-testid="button-room-follow"
          >
            <Star
              className={[
                "mr-1 h-3.5 w-3.5",
                detail.isFollowed ? "fill-yellow-400 text-yellow-500" : "",
              ].join(" ")}
            />
            {detail.isFollowed ? "Following" : "Follow"}
          </Button>
        )}
      </header>

      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-6"
        data-testid="room-message-list"
      >
        {messagesQ.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : messagesQ.data && messagesQ.data.length > 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-4" data-msg-list>
            {messagesQ.data.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                variant="room"
                isMine={false}
                onReply={startReply}
                onInvalidate={invalidateMessages}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Be the first to say something in #{cleanTag}!
          </div>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex shrink-0 flex-col gap-2 border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {replyTo && (
          <div
            className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-muted px-3 py-2 text-xs"
            data-testid="reply-preview"
          >
            <Reply className="mt-0.5 h-3.5 w-3.5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">
                Replying to {replyTo.senderName}
              </p>
              <p className="line-clamp-1 text-muted-foreground">
                {replyTo.content}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-cancel-reply"
              aria-label="Cancel reply"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <ImageUploadButton onUploaded={sendImage} testId="button-upload-room-image" />
          <VoiceMessageButton onUploaded={sendAudio} testId="button-record-room-voice" />
          <Input
            ref={inputRef}
            placeholder={`Message #${cleanTag}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            data-testid="input-room-message"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            data-testid="button-send-room"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
