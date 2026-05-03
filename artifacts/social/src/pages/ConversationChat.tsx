import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetConversationMessages,
  useSendConversationMessage,
  useGetConversations,
  useSetConversationBackground,
  useClearConversationBackground,
  useBlockUser,
  useMuteUser,
  useUnfollowUser,
  useGetConversationTyping,
  usePingConversationTyping,
  useMarkConversationRead,
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
  getGetMyRelationshipsQueryKey,
  getGetConversationTypingQueryKey,
  getGetUnreadNotificationCountQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { MentionTextarea, type MentionFieldHandle } from "@/components/MentionTextarea";
import { ThreadDrawer } from "@/components/ThreadDrawer";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { GifPickerButton } from "@/components/GifPickerButton";
import { VoiceMessageButton } from "@/components/VoiceMessageButton";
import { CallButton } from "@/components/CallButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Send,
  Loader2,
  Hash,
  X,
  Reply,
  MoreVertical,
  Image as ImageLucide,
  Trash2,
  Ban,
  EyeOff,
  UserMinus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ConversationChat({ id }: { id: number }) {
  const qc = useQueryClient();
  const { user: clerkUser } = useUser();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MentionFieldHandle>(null);
  const lastTypingPing = useRef(0);

  const convs = useGetConversations();
  const conv = convs.data?.find((c) => c.id === id);

  const msgs = useGetConversationMessages(id, {
    query: {
      queryKey: getGetConversationMessagesQueryKey(id),
      refetchInterval: 2500,
    },
  });

  function invalidateMessages() {
    qc.invalidateQueries({ queryKey: getGetConversationMessagesQueryKey(id) });
  }

  const send = useSendConversationMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        setReplyTo(null);
        invalidateMessages();
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
      },
    },
  });

  const typingQuery = useGetConversationTyping(id, {
    query: {
      queryKey: getGetConversationTypingQueryKey(id),
      refetchInterval: 2000,
    },
  });
  const typingPing = usePingConversationTyping();
  const markRead = useMarkConversationRead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      },
    },
  });

  function pingTyping() {
    const now = Date.now();
    if (now - lastTypingPing.current < 1500) return;
    lastTypingPing.current = now;
    typingPing.mutate({ id });
  }

  // Mark conversation read whenever new messages arrive (or on mount).
  const lastMsgId = msgs.data && msgs.data.length > 0 ? msgs.data[msgs.data.length - 1].id : null;
  useEffect(() => {
    if (lastMsgId !== null) {
      markRead.mutate({ id, data: { messageId: lastMsgId } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lastMsgId]);

  useEffect(() => {
    function onFocus() {
      if (lastMsgId !== null) {
        markRead.mutate({ id, data: { messageId: lastMsgId } });
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lastMsgId]);

  const { toast } = useToast();
  const otherUserId = conv?.otherUser.id;
  const otherDisplayName = conv?.otherUser.displayName ?? "this user";
  const onRelationshipChange = () => {
    qc.invalidateQueries({ queryKey: getGetMyRelationshipsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  };
  const block = useBlockUser({
    mutation: {
      onSuccess: () => {
        onRelationshipChange();
        toast({ title: "Blocked", description: `You won't see ${otherDisplayName} anymore.` });
      },
    },
  });
  const mute = useMuteUser({
    mutation: {
      onSuccess: () => {
        onRelationshipChange();
        toast({ title: "Muted", description: `Hidden ${otherDisplayName} from feeds.` });
      },
    },
  });
  const unfollow = useUnfollowUser({
    mutation: { onSuccess: onRelationshipChange },
  });

  const setBg = useSetConversationBackground({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
    },
  });
  const clearBg = useClearConversationBackground({
    mutation: {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
    },
  });
  const bgInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile: uploadBg, isUploading: bgUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) =>
      setBg.mutate({ id, data: { backgroundUrl: `${basePath}/api/storage${r.objectPath}` } }),
  });

  function sendImage(imageUrl: string) {
    send.mutate({
      id,
      data: { content: "", imageUrl, replyToId: replyTo?.id ?? null },
    });
  }

  function sendAudio(audioUrl: string, peaks: number[] | null) {
    send.mutate({
      id,
      data: { content: "", audioUrl, audioWaveform: peaks, replyToId: replyTo?.id ?? null },
    });
  }

  function sendGif(gifUrl: string) {
    send.mutate({
      id,
      data: { content: "", gifUrl, replyToId: replyTo?.id ?? null },
    });
  }

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs.data?.length]);

  useEffect(() => {
    setReplyTo(null);
    setDraft("");
  }, [id]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate({
      id,
      data: { content, replyToId: replyTo?.id ?? null },
    });
  }

  function startReply(m: Message) {
    setReplyTo(m);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function openThread(m: Message) {
    setThreadParent(m);
  }

  const typingUsers = typingQuery.data?.users ?? [];

  const initials =
    conv?.otherUser.displayName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?";

  const hasBg = !!conv?.backgroundUrl;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      style={
        hasBg
          ? {
              backgroundImage: `url(${conv?.backgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      {hasBg && (
        <div className="pointer-events-none absolute inset-0 bg-background/55 backdrop-blur-md" />
      )}
      <header
        className={[
          "relative z-10 flex shrink-0 items-center gap-2 px-3 py-2",
          hasBg
            ? "border-b border-border/40 bg-card/60 backdrop-blur-md"
            : "border-b border-border bg-card",
        ].join(" ")}
      >
        <Link
          href="/app/messages"
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-messages"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {conv ? (
          <>
            <Avatar className="h-9 w-9">
              {conv.otherUser.avatarUrl ? (
                <AvatarImage
                  src={conv.otherUser.avatarUrl}
                  alt={conv.otherUser.displayName}
                />
              ) : null}
              <AvatarFallback className="bg-primary/15 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/app/u/${conv.otherUser.username}`}
                  className="truncate text-sm font-semibold text-foreground hover:underline"
                  data-testid="link-conv-profile"
                >
                  {conv.otherUser.displayName}
                </Link>
                {conv.otherUser.featuredHashtag && (
                  <span className="hidden items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground sm:inline-flex">
                    <Hash className="h-2.5 w-2.5" />
                    {conv.otherUser.featuredHashtag}
                  </span>
                )}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                @{conv.otherUser.username}
              </p>
            </div>
            <CallButton conversationId={id} kind="voice" testId="button-conv-call-voice" />
            <CallButton conversationId={id} kind="video" testId="button-conv-call-video" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="button-conv-menu"
                  aria-label="Conversation menu"
                >
                  {bgUploading || setBg.isPending || clearBg.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreVertical className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => bgInputRef.current?.click()}
                  data-testid="menu-set-background"
                >
                  <ImageLucide className="mr-2 h-4 w-4" /> Set background
                </DropdownMenuItem>
                {conv.backgroundUrl && (
                  <DropdownMenuItem
                    onSelect={() => clearBg.mutate({ id })}
                    data-testid="menu-clear-background"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Clear background
                  </DropdownMenuItem>
                )}
                {otherUserId && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => unfollow.mutate({ id: otherUserId })}
                      data-testid="menu-unfollow"
                    >
                      <UserMinus className="mr-2 h-4 w-4" /> Unfollow
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => mute.mutate({ id: otherUserId })}
                      data-testid="menu-mute-user"
                    >
                      <EyeOff className="mr-2 h-4 w-4" /> Mute
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => block.mutate({ id: otherUserId })}
                      data-testid="menu-block-user"
                    >
                      <Ban className="mr-2 h-4 w-4" /> Block
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadBg(f);
                if (bgInputRef.current) bgInputRef.current.value = "";
              }}
              data-testid="input-set-background"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
      </header>

      <div
        ref={scrollerRef}
        className={[
          "relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-6",
          hasBg ? "bg-transparent" : "bg-background",
        ].join(" ")}
        data-testid="conv-message-list"
      >
        <div className="relative">
        {msgs.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : msgs.data && msgs.data.length > 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-3" data-msg-list>
            {msgs.data.map((m) => {
              const mine = m.senderId === clerkUser?.id;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  variant="dm"
                  isMine={mine}
                  onReply={startReply}
                  onInvalidate={invalidateMessages}
                  onOpenThread={openThread}
                  showReadReceipt
                />
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Say hi to start the conversation 👋
          </div>
        )}
        </div>
      </div>

      <form
        onSubmit={submit}
        className={[
          "relative z-10 flex shrink-0 flex-col gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          hasBg
            ? "border-t border-border/40 bg-card/60 backdrop-blur-md"
            : "border-t border-border bg-card",
        ].join(" ")}
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
        {typingUsers.length > 0 && (
          <div
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
            data-testid="typing-indicator"
          >
            <span className="inline-flex items-center gap-0.5">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "0ms" }} />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "120ms" }} />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "240ms" }} />
            </span>
            <span>{typingUsers.map((u) => u.displayName).join(", ")} is typing…</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <ImageUploadButton onUploaded={sendImage} testId="button-upload-dm-image" />
          <GifPickerButton
            onPick={(g) => sendGif(g.url)}
            testId="button-pick-dm-gif"
          />
          <VoiceMessageButton onUploaded={sendAudio} testId="button-record-dm-voice" />
          <MentionTextarea
            ref={inputRef}
            placeholder="Type a message…"
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              if (draft.trim() && !send.isPending) {
                send.mutate({ id, data: { content: draft.trim(), replyToId: replyTo?.id ?? null } });
              }
            }}
            onUserActivity={pingTyping}
            ariaLabel="Type a message"
            testId="input-dm-message"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            data-testid="button-send-dm"
            aria-label="Send message"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
      <ThreadDrawer
        open={threadParent !== null}
        onOpenChange={(o) => {
          if (!o) setThreadParent(null);
        }}
        parentId={threadParent?.id ?? null}
        scope={{ type: "conversation", id }}
      />
    </div>
  );
}
