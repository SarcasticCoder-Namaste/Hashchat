import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import {
  useGetConversationMessages,
  useSendConversationMessage,
  useGetConversations,
  useSetConversationBackground,
  useClearConversationBackground,
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { ImageUploadButton } from "@/components/ImageUploadButton";
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
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function ConversationChat({ id }: { id: number }) {
  const qc = useQueryClient();
  const { user: clerkUser } = useUser();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setBg.mutate({ id, data: { backgroundUrl: `${basePath}${r.objectPath}` } }),
  });

  function sendImage(imageUrl: string) {
    send.mutate({
      id,
      data: { content: "", imageUrl, replyToId: replyTo?.id ?? null },
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

  const initials =
    conv?.otherUser.displayName
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "?";

  return (
    <div className="flex h-[calc(100dvh-58px)] flex-col md:h-[100dvh]">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Link
          href="/app/messages"
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-messages"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {conv ? (
          <>
            <Avatar className="h-10 w-10">
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
              <div className="flex items-center gap-2">
                <p className="truncate text-base font-semibold text-foreground">
                  {conv.otherUser.displayName}
                </p>
                {conv.otherUser.featuredHashtag && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                    <Hash className="h-2.5 w-2.5" />
                    {conv.otherUser.featuredHashtag}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                @{conv.otherUser.username}
              </p>
            </div>
            {conv.otherUser.sharedHashtags.length > 0 && (
              <div className="hidden items-center gap-1 sm:flex">
                {conv.otherUser.sharedHashtags.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-0.5 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground"
                  >
                    <Hash className="h-3 w-3" />
                    {t}
                  </span>
                ))}
              </div>
            )}
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
        className="relative flex-1 overflow-y-auto bg-background px-4 py-6"
        data-testid="conv-message-list"
        style={
          conv?.backgroundUrl
            ? {
                backgroundImage: `url(${conv.backgroundUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {conv?.backgroundUrl && (
          <div className="pointer-events-none absolute inset-0 bg-background/70 backdrop-blur-sm" />
        )}
        <div className="relative">
        {msgs.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : msgs.data && msgs.data.length > 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
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
        className="flex flex-col gap-2 border-t border-border bg-card p-3"
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
          <ImageUploadButton onUploaded={sendImage} testId="button-upload-dm-image" />
          <Input
            ref={inputRef}
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            data-testid="input-dm-message"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            data-testid="button-send-dm"
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
