import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useGetRoomMessages,
  useSendRoomMessage,
  useGetHashtag,
  useFollowHashtag,
  useUnfollowHashtag,
  useGetMe,
  useGetPremiumStatus,
  useRequestRoomJoin,
  useGetRoomTyping,
  usePingRoomTyping,
  useGetRoomVisibility,
  useGetRoomPinnedPosts,
  useGetRoomActiveUsers,
  useGetRoomSummary,
  getGetRoomSummaryQueryKey,
  getGetRoomMessagesQueryKey,
  getGetRoomTypingQueryKey,
  getGetRoomActiveUsersQueryKey,
  getGetHashtagQueryKey,
  getGetMyFollowedHashtagsQueryKey,
  getGetRoomsQueryKey,
  getGetHashtagPostsQueryKey,
  getGetRoomPinnedPostsQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageBubble } from "@/components/MessageBubble";
import { MentionTextarea, type MentionFieldHandle } from "@/components/MentionTextarea";
import { ThreadDrawer } from "@/components/ThreadDrawer";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { GifPickerButton } from "@/components/GifPickerButton";
import { VoiceMessageButton } from "@/components/VoiceMessageButton";
import { CallButton } from "@/components/CallButton";
import { PostComposer } from "@/components/PostComposer";
import { PostFeed } from "@/components/PostFeed";
import { PollsPanel } from "@/components/PollsPanel";
import { EventsPanel, LiveEventBanner } from "@/components/EventsPanel";
import { RoomSettingsDialog } from "@/components/RoomSettingsDialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Hash,
  Send,
  Star,
  Users,
  Loader2,
  X,
  Reply,
  BarChart3,
  Settings as SettingsIcon,
  Lock,
  Pin,
  Timer,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PostCard } from "@/components/PostCard";

export default function RoomChat({ tag }: { tag: string }) {
  const cleanTag = decodeURIComponent(tag).toLowerCase().replace(/^#/, "");
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryHours, setSummaryHours] = useState(24);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MentionFieldHandle>(null);
  const lastTypingPing = useRef(0);
  const { toast } = useToast();

  const hashtagQ = useGetHashtag(cleanTag);
  const detail = hashtagQ.data;
  const isPrivate = detail?.isPrivate ?? false;
  const isMember = detail?.isMember ?? false;
  const isPremiumRoom = detail?.isPremium ?? false;
  const isLocked = isPrivate && !isMember;

  const visibilityQ = useGetRoomVisibility(cleanTag, {
    query: {
      queryKey: ["roomVisibility", cleanTag] as const,
      enabled: !isLocked,
    },
  });
  const canModerate = visibilityQ.data?.canModerate ?? false;
  const slowModeSeconds = visibilityQ.data?.slowModeSeconds ?? 0;
  const [slowCooldown, setSlowCooldown] = useState(0);
  useEffect(() => {
    if (slowCooldown <= 0) return;
    const t = setInterval(() => setSlowCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [slowCooldown]);

  const activeUsersQ = useGetRoomActiveUsers(
    cleanTag,
    { limit: 24 },
    {
      query: {
        queryKey: getGetRoomActiveUsersQueryKey(cleanTag, { limit: 24 }),
        refetchInterval: 15000,
        enabled: !isLocked,
      },
    },
  );
  const activeUsers = activeUsersQ.data ?? [];

  const pinnedQ = useGetRoomPinnedPosts(cleanTag, {
    query: {
      queryKey: getGetRoomPinnedPostsQueryKey(cleanTag),
      enabled: !isLocked,
    },
  });

  const messagesQ = useGetRoomMessages(cleanTag, {
    query: {
      queryKey: getGetRoomMessagesQueryKey(cleanTag),
      refetchInterval: 3000,
      enabled: !isLocked,
    },
  });

  const premium = useGetPremiumStatus();
  const myIsPremium = (premium.data?.tier ?? "free") !== "free";
  const requestJoin = useRequestRoomJoin({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(cleanTag) });
        toast({ title: "Request sent", description: "Owner will review it soon." });
      },
      onError: () =>
        toast({ title: "Could not request access", variant: "destructive" }),
    },
  });

  function invalidateMessages() {
    qc.invalidateQueries({ queryKey: getGetRoomMessagesQueryKey(cleanTag) });
  }

  const send = useSendRoomMessage({
    mutation: {
      onSuccess: () => {
        setDraft("");
        setReplyTo(null);
        invalidateMessages();
        if (slowModeSeconds > 0 && !canModerate) {
          setSlowCooldown(slowModeSeconds);
        }
      },
      onError: (err: unknown) => {
        const e = err as {
          status?: number;
          data?: { message?: string; retryAfterSeconds?: number };
        };
        if (e?.status === 429) {
          const wait = e.data?.retryAfterSeconds ?? slowModeSeconds;
          setSlowCooldown(wait);
          toast({
            title: "Slow mode",
            description: `Please wait ${wait}s before sending another message.`,
            variant: "destructive",
          });
        } else if (e?.status === 403 && e.data?.message?.toLowerCase().includes("lock")) {
          toast({ title: "This thread is locked", variant: "destructive" });
        } else {
          toast({ title: e?.data?.message ?? "Could not send", variant: "destructive" });
        }
      },
    },
  });

  const typingQuery = useGetRoomTyping(cleanTag, {
    query: {
      queryKey: getGetRoomTypingQueryKey(cleanTag),
      refetchInterval: 2000,
      enabled: !isLocked,
    },
  });
  const typingPing = usePingRoomTyping();
  function pingTyping() {
    if (isLocked) return;
    const now = Date.now();
    if (now - lastTypingPing.current < 1500) return;
    lastTypingPing.current = now;
    typingPing.mutate({ tag: cleanTag });
  }
  const typingUsers = typingQuery.data?.users ?? [];
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

  const sendDisabled = slowCooldown > 0 && !canModerate;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || send.isPending || sendDisabled) return;
    send.mutate({
      tag: cleanTag,
      data: { content, replyToId: replyTo?.id ?? null },
    });
  }

  function sendImage(imageUrl: string, suggestedAlt?: string) {
    send.mutate({
      tag: cleanTag,
      data: {
        content: "",
        imageUrl,
        imageAlt: suggestedAlt?.trim() || null,
        replyToId: replyTo?.id ?? null,
      },
    });
  }

  function sendAudio(audioUrl: string, peaks: number[] | null) {
    send.mutate({
      tag: cleanTag,
      data: { content: "", audioUrl, audioWaveform: peaks, replyToId: replyTo?.id ?? null },
    });
  }

  function sendGif(gifUrl: string) {
    send.mutate({
      tag: cleanTag,
      data: { content: "", gifUrl, replyToId: replyTo?.id ?? null },
    });
  }

  function startReply(m: Message) {
    setReplyTo(m);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function openThread(m: Message) {
    setThreadParent(m);
  }

  const meQ = useGetMe();
  const meId = meQ.data?.id ?? null;
  const ownerId = visibilityQ.data?.ownerId ?? null;
  const isPremiumLocked =
    isPremiumRoom && !myIsPremium && meId !== ownerId;
  const [tab, setTab] = useState<"chat" | "posts" | "polls" | "events">(
    "chat",
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Link
          href="/app/rooms"
          className="text-muted-foreground hover:text-foreground"
          data-testid="link-back-rooms"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 text-white">
          <Hash className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
            #{cleanTag}
            {isPrivate && (
              <span title="Private room" className="text-violet-500" data-testid="badge-private-room">
                <Lock className="h-3 w-3" />
              </span>
            )}
            {isPremiumRoom && (
              <span
                title="Premium-only room"
                className="ml-1 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400"
                data-testid="badge-premium-room"
              >
                Premium
              </span>
            )}
          </p>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Users className="h-3 w-3" />
            {detail?.memberCount ?? 0} members
            {detail && detail.recentMessages > 0 && (
              <span className="rounded-full bg-pink-500/15 px-1.5 py-0.5 text-pink-500">
                {detail.recentMessages} new
              </span>
            )}
            {slowModeSeconds > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-600 dark:text-amber-400"
                data-testid="slow-mode-badge"
                title={`Slow mode: ${slowModeSeconds}s between messages`}
              >
                <Timer className="h-3 w-3" /> {slowModeSeconds}s
              </span>
            )}
          </p>
        </div>
        {!isLocked && (
          <>
            <CallButton roomTag={cleanTag} kind="voice" testId="button-room-call-voice" />
            <CallButton roomTag={cleanTag} kind="video" testId="button-room-call-video" />
          </>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setSummaryOpen(true)}
          data-testid="button-room-catchup"
          aria-label="Catch me up on this room"
          title="Catch me up"
        >
          <Sparkles className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          asChild
          aria-label="View hashtag analytics"
          data-testid="button-room-analytics"
        >
          <Link href={`/app/tag/${encodeURIComponent(cleanTag)}`}>
            <BarChart3 className="h-4 w-4" />
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setSettingsOpen(true)}
          data-testid="button-room-settings"
          aria-label="Room settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
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

      <LiveEventBanner tag={cleanTag} />

      {!isLocked && activeUsers.length > 0 && (
        <div
          className="relative z-10 flex shrink-0 items-center gap-2 border-b border-border bg-card/60 px-3 py-2"
          data-testid="active-now-strip"
        >
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Active now · {activeUsers.length}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            {activeUsers.map((u) => (
              <Link
                key={u.id}
                href={`/app/profile/${u.username}`}
                className="group relative shrink-0"
                title={`${u.displayName} (@${u.username})`}
                data-testid={`active-user-${u.id}`}
              >
                {u.avatarUrl ? (
                  <img
                    src={u.animatedAvatarUrl ?? u.avatarUrl}
                    alt={u.displayName}
                    className="h-8 w-8 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-xs font-semibold text-white">
                    {u.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span
                  className={[
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                    u.presenceState === "online"
                      ? "bg-green-500"
                      : "bg-amber-400",
                  ].join(" ")}
                  aria-label={u.presenceState}
                />
              </Link>
            ))}
          </div>
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) =>
          setTab(v as "chat" | "posts" | "polls" | "events")
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-3 mt-2 grid w-auto grid-cols-4">
          <TabsTrigger value="chat" data-testid="tab-chat">Chat</TabsTrigger>
          <TabsTrigger value="posts" data-testid="tab-posts">Posts</TabsTrigger>
          <TabsTrigger value="polls" data-testid="tab-polls">Polls</TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">Events</TabsTrigger>
        </TabsList>
        <TabsContent
          value="chat"
          className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          forceMount
        >
      {isPremiumLocked ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 py-10">
          <div
            className="max-w-sm rounded-2xl border border-violet-500/40 bg-card p-6 text-center shadow-sm"
            data-testid="premium-room-gate"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 text-violet-500">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-foreground">
              #{cleanTag} is for Premium members
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upgrade to Premium to read and post in this room.
            </p>
            <Link href="/app/premium">
              <Button
                className="brand-gradient-bg mt-4 text-white"
                data-testid="button-upgrade-premium-room"
              >
                Go Premium
              </Button>
            </Link>
          </div>
        </div>
      ) : isLocked ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 py-10">
          <div
            className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
            data-testid="private-room-gate"
          >
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/15 text-violet-500">
              <Lock className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-foreground">
              #{cleanTag} is private
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You need an invite or owner approval to view messages and posts.
            </p>
            <Button
              className="brand-gradient-bg mt-4 text-white"
              onClick={() => requestJoin.mutate({ tag: cleanTag })}
              disabled={requestJoin.isPending}
              data-testid="button-request-room-access"
            >
              {requestJoin.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Request access
            </Button>
          </div>
        </div>
      ) : (<>
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
                isMine={m.senderId === meId}
                onReply={startReply}
                onInvalidate={invalidateMessages}
                onOpenThread={openThread}
                scope={{ type: "room", key: cleanTag }}
                canModerate={canModerate}
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
        className="relative z-10 flex shrink-0 flex-col gap-2 border-t border-border bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
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
          <ImageUploadButton onUploaded={sendImage} testId="button-upload-room-image" />
          <GifPickerButton
            onPick={(g) => sendGif(g.url)}
            testId="button-pick-room-gif"
          />
          <VoiceMessageButton onUploaded={sendAudio} testId="button-record-room-voice" />
          <MentionTextarea
            ref={inputRef}
            placeholder={`Message #${cleanTag}…`}
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              if (draft.trim() && !send.isPending) {
                send.mutate({
                  tag: cleanTag,
                  data: { content: draft.trim(), replyToId: replyTo?.id ?? null },
                });
              }
            }}
            onUserActivity={pingTyping}
            ariaLabel={`Message room ${cleanTag}`}
            testId="input-room-message"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || send.isPending || sendDisabled}
            data-testid="button-send-room"
            aria-label="Send message"
            title={sendDisabled ? `Slow mode: wait ${slowCooldown}s` : undefined}
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : sendDisabled ? (
              <span className="flex items-center gap-1 text-xs">
                <Timer className="h-3.5 w-3.5" />
                {slowCooldown}s
              </span>
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
        scope={{ type: "room", tag: cleanTag }}
      />
      </>)}
        </TabsContent>
        <TabsContent
          value="posts"
          className="m-0 flex min-h-0 flex-1 flex-col"
        >
          {isLocked ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 py-10 text-sm text-muted-foreground">
              Posts are private to members.
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4">
              <div className="mx-auto flex max-w-2xl flex-col gap-3">
                <PostComposer
                  defaultHashtag={cleanTag}
                  onPosted={() =>
                    qc.invalidateQueries({
                      queryKey: getGetHashtagPostsQueryKey(cleanTag),
                    })
                  }
                />
                {pinnedQ.data && pinnedQ.data.length > 0 && (
                  <div className="space-y-2" data-testid="pinned-posts-strip">
                    <p className="flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                      <Pin className="h-3 w-3" /> Pinned
                    </p>
                    {pinnedQ.data.map((p) => (
                      <PostCard
                        key={`pinned-${p.id}`}
                        post={p}
                        meId={meId}
                        scope={{ type: "room", key: cleanTag }}
                        canModerate={canModerate}
                        onChanged={() => {
                          qc.invalidateQueries({ queryKey: getGetRoomPinnedPostsQueryKey(cleanTag) });
                          qc.invalidateQueries({ queryKey: getGetHashtagPostsQueryKey(cleanTag) });
                        }}
                      />
                    ))}
                  </div>
                )}
                <PostFeed
                  scope={{ kind: "hashtag", tag: cleanTag }}
                  meId={meId}
                  emptyMessage={`No posts in #${cleanTag} yet — be the first!`}
                  canModerate={canModerate}
                />
              </div>
            </div>
          )}
        </TabsContent>
        <TabsContent
          value="polls"
          className="m-0 flex min-h-0 flex-1 flex-col"
        >
          {isLocked ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 py-10 text-sm text-muted-foreground">
              Polls are private to members.
            </div>
          ) : (
            <PollsPanel tag={cleanTag} />
          )}
        </TabsContent>
        <TabsContent
          value="events"
          className="m-0 flex min-h-0 flex-1 flex-col"
        >
          <EventsPanel tag={cleanTag} />
        </TabsContent>
      </Tabs>
      <RoomSettingsDialog
        tag={cleanTag}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        isPremium={premium.data?.verified ?? false}
      />
      <CatchMeUpDialog
        tag={cleanTag}
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        hours={summaryHours}
        onHoursChange={setSummaryHours}
      />
    </div>
  );
}

function CatchMeUpDialog({
  tag,
  open,
  onOpenChange,
  hours,
  onHoursChange,
}: {
  tag: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hours: number;
  onHoursChange: (v: number) => void;
}) {
  const qc = useQueryClient();
  const summary = useGetRoomSummary(
    tag,
    { hours },
    { query: { enabled: open, staleTime: 60_000 } },
  );
  const HOUR_OPTIONS = [1, 6, 24, 72];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-catch-me-up">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Catch me up on #{tag}
          </DialogTitle>
          <DialogDescription>
            AI recap of activity in the last {hours} hour{hours === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1">
          {HOUR_OPTIONS.map((h) => (
            <Button
              key={h}
              size="sm"
              variant={h === hours ? "default" : "ghost"}
              onClick={() => onHoursChange(h)}
              data-testid={`button-summary-hours-${h}`}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </Button>
          ))}
          <div className="ml-auto">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                qc.invalidateQueries({
                  queryKey: getGetRoomSummaryQueryKey(tag, { hours }),
                })
              }
              disabled={summary.isFetching}
              data-testid="button-summary-refresh"
              aria-label="Refresh summary"
            >
              <RefreshCw
                className={[
                  "h-3.5 w-3.5",
                  summary.isFetching ? "animate-spin" : "",
                ].join(" ")}
              />
            </Button>
          </div>
        </div>
        <div className="min-h-[120px] rounded-md border border-border bg-muted/30 p-3 text-sm">
          {summary.isLoading || summary.isFetching ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating recap…
            </div>
          ) : summary.data ? (
            <div className="space-y-2">
              <p
                className="whitespace-pre-wrap text-foreground"
                data-testid="text-summary-body"
              >
                {summary.data.summary}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {summary.data.messageCount} message
                {summary.data.messageCount === 1 ? "" : "s"} ·{" "}
                {summary.data.cached ? "cached" : "fresh"} ·{" "}
                {new Date(summary.data.generatedAt).toLocaleTimeString()}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">No summary available.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
