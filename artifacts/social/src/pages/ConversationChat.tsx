import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
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
  useGetMyFriends,
  useRenameConversation,
  useAddConversationMembers,
  useRemoveConversationMember,
  useLeaveConversation,
  useMuteConversation,
  useUnmuteConversation,
  getGetConversationMessagesQueryKey,
  getGetConversationsQueryKey,
  getGetMyRelationshipsQueryKey,
  getGetConversationTypingQueryKey,
  getGetUnreadNotificationCountQueryKey,
  getGetMyFriendsQueryKey,
  type Message,
  type Conversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/MessageBubble";
import { MentionTextarea, type MentionFieldHandle } from "@/components/MentionTextarea";
import { ThreadDrawer } from "@/components/ThreadDrawer";
import { ImageUploadButton } from "@/components/ImageUploadButton";
import { GifPickerButton } from "@/components/GifPickerButton";
import { VoiceMessageButton } from "@/components/VoiceMessageButton";
import { CallButton } from "@/components/CallButton";
import { ScheduleDmDialog } from "@/components/ScheduleDmDialog";
import { ScheduledDmsSheet } from "@/components/ScheduledDmsSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Send,
  Loader2,
  Clock,
  CalendarClock,
  Hash,
  X,
  Reply,
  MoreVertical,
  Image as ImageLucide,
  Trash2,
  Ban,
  EyeOff,
  UserMinus,
  Users,
  UserPlus,
  Pencil,
  LogOut,
  Bell,
  BellOff,
  SlidersHorizontal,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function groupTitle(c: Conversation): string {
  if (c.title?.trim()) return c.title.trim();
  const names = c.members.map((m) => m.displayName);
  const head = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${head} +${names.length - 3}` : head;
}

function GroupMembersPanel({
  open,
  onOpenChange,
  conv,
  meId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conv: Conversation;
  meId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isCreator = conv.creatorId === meId;
  const [renameOpen, setRenameOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(conv.title ?? "");

  const friends = useGetMyFriends({
    query: { queryKey: getGetMyFriendsQueryKey(), enabled: addOpen },
  });
  const memberIds = useMemo(
    () => new Set(conv.members.map((m) => m.id)),
    [conv.members],
  );
  const candidateFriends = useMemo(
    () => (friends.data ?? []).filter((f) => !memberIds.has(f.id)),
    [friends.data, memberIds],
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function refreshAll() {
    qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    qc.invalidateQueries({
      queryKey: getGetConversationMessagesQueryKey(conv.id),
    });
  }

  const rename = useRenameConversation({
    mutation: {
      onSuccess: () => {
        refreshAll();
        setRenameOpen(false);
        toast({ title: "Group renamed" });
      },
      onError: (e: unknown) =>
        toast({
          title: "Rename failed",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
    },
  });
  const addMembers = useAddConversationMembers({
    mutation: {
      onSuccess: () => {
        refreshAll();
        setAddOpen(false);
        setPicked(new Set());
        toast({ title: "Members added" });
      },
      onError: (e: unknown) =>
        toast({
          title: "Add failed",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
    },
  });
  const removeMember = useRemoveConversationMember({
    mutation: {
      onSuccess: () => {
        refreshAll();
        toast({ title: "Member removed" });
      },
      onError: (e: unknown) =>
        toast({
          title: "Remove failed",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
    },
  });
  const mute = useMuteConversation({
    mutation: {
      onSuccess: () => {
        refreshAll();
        toast({ title: "Group muted" });
      },
      onError: (e: unknown) =>
        toast({
          title: "Couldn't mute",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
    },
  });
  const unmute = useUnmuteConversation({
    mutation: {
      onSuccess: () => {
        refreshAll();
        toast({ title: "Group unmuted" });
      },
      onError: (e: unknown) =>
        toast({
          title: "Couldn't unmute",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
    },
  });
  const leave = useLeaveConversation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
        toast({ title: "Left group" });
        navigate("/app/messages");
      },
      onError: (e: unknown) =>
        toast({
          title: "Couldn't leave",
          description: e instanceof Error ? e.message : "",
          variant: "destructive",
        }),
    },
  });

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (conv.members.length + next.size < 10) next.add(id);
      return next;
    });
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{groupTitle(conv)}</SheetTitle>
            <SheetDescription>
              {conv.members.length} members · {isCreator ? "you created" : "group chat"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setAddOpen(true)}
              disabled={conv.members.length >= 10}
              data-testid="button-open-add-members"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add members ({conv.members.length}/10)
            </Button>
            {isCreator && (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setTitleDraft(conv.title ?? "");
                  setRenameOpen(true);
                }}
                data-testid="button-open-rename"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename group
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                conv.isMuted
                  ? unmute.mutate({ id: conv.id })
                  : mute.mutate({ id: conv.id })
              }
              disabled={mute.isPending || unmute.isPending}
              data-testid="button-toggle-mute"
            >
              {conv.isMuted ? (
                <>
                  <Bell className="mr-2 h-4 w-4" />
                  Unmute group
                </>
              ) : (
                <>
                  <BellOff className="mr-2 h-4 w-4" />
                  Mute group
                </>
              )}
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => leave.mutate({ id: conv.id })}
              disabled={leave.isPending}
              data-testid="button-leave-group"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Leave group
            </Button>
          </div>
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
              Members
            </h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {conv.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2"
                  data-testid={`member-row-${m.id}`}
                >
                  <Avatar className="h-8 w-8">
                    {m.avatarUrl ? (
                      <AvatarImage src={m.avatarUrl} alt={m.displayName} />
                    ) : null}
                    <AvatarFallback>
                      {m.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.displayName}
                      {m.id === conv.creatorId && (
                        <span className="ml-1 rounded bg-accent px-1 text-[10px] text-accent-foreground">
                          owner
                        </span>
                      )}
                      {m.id === meId && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{m.username}
                    </p>
                  </div>
                  {isCreator && m.id !== meId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        removeMember.mutate({ id: conv.id, userId: m.id })
                      }
                      disabled={removeMember.isPending}
                      data-testid={`button-remove-${m.id}`}
                      className="text-destructive hover:text-destructive"
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename group</DialogTitle>
            <DialogDescription>
              Pick a name everyone in the group will see.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            maxLength={80}
            placeholder="Group name"
            data-testid="input-rename-group"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                rename.mutate({
                  id: conv.id,
                  data: { title: titleDraft.trim() || null },
                })
              }
              disabled={rename.isPending}
              data-testid="button-confirm-rename"
            >
              {rename.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              Pick friends to add. Group capacity is 10 members.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {friends.isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading friends…
              </div>
            ) : candidateFriends.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No friends to add.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {candidateFriends.map((f) => {
                  const isPicked = picked.has(f.id);
                  const disabled =
                    !isPicked && conv.members.length + picked.size >= 10;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => togglePick(f.id)}
                        className={[
                          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                          isPicked
                            ? "bg-primary/10"
                            : disabled
                              ? "opacity-50"
                              : "hover:bg-accent/40",
                        ].join(" ")}
                        data-testid={`add-member-pick-${f.id}`}
                      >
                        <Avatar className="h-8 w-8">
                          {f.avatarUrl ? (
                            <AvatarImage src={f.avatarUrl} alt={f.displayName} />
                          ) : null}
                          <AvatarFallback>
                            {f.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {f.displayName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            @{f.username}
                          </p>
                        </div>
                        <div
                          className={[
                            "h-4 w-4 rounded border",
                            isPicked
                              ? "border-primary bg-primary"
                              : "border-border",
                          ].join(" ")}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                addMembers.mutate({
                  id: conv.id,
                  data: { userIds: Array.from(picked) },
                })
              }
              disabled={picked.size === 0 || addMembers.isPending}
              data-testid="button-confirm-add-members"
            >
              {addMembers.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add {picked.size > 0 ? `(${picked.size})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ConversationChat({ id }: { id: number }) {
  const qc = useQueryClient();
  const { user: clerkUser } = useUser();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDmsOpen, setScheduleDmsOpen] = useState(false);
  const [threadParent, setThreadParent] = useState<Message | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MentionFieldHandle>(null);
  const lastTypingPing = useRef(0);

  const convs = useGetConversations();
  const conv = convs.data?.find((c) => c.id === id);
  const isGroup = conv?.kind === "group";
  const meId = clerkUser?.id ?? "";

  const msgs = useGetConversationMessages(id, {
    query: {
      queryKey: getGetConversationMessagesQueryKey(id),
      // Long-interval fallback only; real-time updates arrive via SSE below.
      refetchInterval: 60_000,
    },
  });

  // Subscribe to real-time conversation events (new messages, system events,
  // membership/rename changes) instead of short-interval polling.
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const url = `${basePath}/api/conversations/${id}/stream`;
    const es = new EventSource(url, { withCredentials: true });
    const onEvent = () => {
      qc.invalidateQueries({ queryKey: getGetConversationMessagesQueryKey(id) });
      qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    };
    es.addEventListener("conv-event", onEvent);
    return () => {
      es.removeEventListener("conv-event", onEvent);
      es.close();
    };
  }, [id, qc]);

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
        qc.invalidateQueries({
          queryKey: getGetUnreadNotificationCountQueryKey(),
        });
      },
    },
  });

  function pingTyping() {
    const now = Date.now();
    if (now - lastTypingPing.current < 1500) return;
    lastTypingPing.current = now;
    typingPing.mutate({ id });
  }

  const lastMsgId =
    msgs.data && msgs.data.length > 0 ? msgs.data[msgs.data.length - 1].id : null;
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
  const otherUserId = conv?.otherUser?.id;
  const otherDisplayName = conv?.otherUser?.displayName ?? "this user";
  const onRelationshipChange = () => {
    qc.invalidateQueries({ queryKey: getGetMyRelationshipsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
  };
  const block = useBlockUser({
    mutation: {
      onSuccess: () => {
        onRelationshipChange();
        toast({
          title: "Blocked",
          description: `You won't see ${otherDisplayName} anymore.`,
        });
      },
    },
  });
  const mute = useMuteUser({
    mutation: {
      onSuccess: () => {
        onRelationshipChange();
        toast({
          title: "Muted",
          description: `Hidden ${otherDisplayName} from feeds.`,
        });
      },
    },
  });
  const unfollow = useUnfollowUser({
    mutation: { onSuccess: onRelationshipChange },
  });

  const setBg = useSetConversationBackground({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
    },
  });
  const clearBg = useClearConversationBackground({
    mutation: {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() }),
    },
  });
  const bgInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile: uploadBg, isUploading: bgUploading } = useUpload({
    basePath: `${basePath}/api/storage`,
    onSuccess: (r) =>
      setBg.mutate({
        id,
        data: { backgroundUrl: `${basePath}/api/storage${r.objectPath}` },
      }),
  });

  function sendImage(imageUrl: string, suggestedAlt?: string) {
    send.mutate({
      id,
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

  const headerTitle =
    conv && isGroup
      ? groupTitle(conv)
      : conv?.otherUser?.displayName ?? "";
  const headerInitials = headerTitle
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const hasBg = !!conv?.backgroundUrl;
  const bgStorageKey = `chat-bg:${id}`;
  const [bgOpacity, setBgOpacity] = useState<number>(55);
  const [bgBlur, setBgBlur] = useState<number>(12);
  const [bgSettingsOpen, setBgSettingsOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(bgStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { opacity?: number; blur?: number };
        if (typeof parsed.opacity === "number") setBgOpacity(parsed.opacity);
        if (typeof parsed.blur === "number") setBgBlur(parsed.blur);
      } else {
        setBgOpacity(55);
        setBgBlur(12);
      }
    } catch {
      // ignore
    }
  }, [bgStorageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(
        bgStorageKey,
        JSON.stringify({ opacity: bgOpacity, blur: bgBlur }),
      );
    } catch {
      // ignore
    }
  }, [bgStorageKey, bgOpacity, bgBlur]);

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
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: `hsl(var(--background) / ${bgOpacity / 100})`,
            backdropFilter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
            WebkitBackdropFilter: bgBlur > 0 ? `blur(${bgBlur}px)` : undefined,
          }}
        />
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
            {isGroup ? (
              <button
                type="button"
                onClick={() => setMembersOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                data-testid="button-open-group-info"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/15 text-primary">
                    <Users className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {headerTitle}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {conv.members.length} members · tap for details
                  </p>
                </div>
              </button>
            ) : (
              <>
                <Avatar className="h-9 w-9">
                  {conv.otherUser?.avatarUrl ? (
                    <AvatarImage
                      src={conv.otherUser.avatarUrl}
                      alt={conv.otherUser.displayName}
                    />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-primary">
                    {headerInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/app/u/${conv.otherUser?.username ?? ""}`}
                      className="truncate text-sm font-semibold text-foreground hover:underline"
                      data-testid="link-conv-profile"
                    >
                      {conv.otherUser?.displayName}
                    </Link>
                    {conv.otherUser?.featuredHashtag && (
                      <span className="hidden items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground sm:inline-flex">
                        <Hash className="h-2.5 w-2.5" />
                        {conv.otherUser.featuredHashtag}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    @{conv.otherUser?.username}
                  </p>
                </div>
              </>
            )}
            <CallButton
              conversationId={id}
              kind="voice"
              testId="button-conv-call-voice"
            />
            <CallButton
              conversationId={id}
              kind="video"
              testId="button-conv-call-video"
            />
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
                {isGroup && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => setMembersOpen(true)}
                      data-testid="menu-open-members"
                    >
                      <Users className="mr-2 h-4 w-4" /> Group info
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onSelect={() => bgInputRef.current?.click()}
                  data-testid="menu-set-background"
                >
                  <ImageLucide className="mr-2 h-4 w-4" /> Set background
                </DropdownMenuItem>
                {conv.backgroundUrl && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => setBgSettingsOpen(true)}
                      data-testid="menu-adjust-background"
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" /> Adjust background
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => clearBg.mutate({ id })}
                      data-testid="menu-clear-background"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Clear background
                    </DropdownMenuItem>
                  </>
                )}
                {!isGroup && otherUserId && (
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
            <Dialog open={bgSettingsOpen} onOpenChange={setBgSettingsOpen}>
              <DialogContent className="sm:max-w-sm" data-testid="dialog-bg-settings">
                <DialogHeader>
                  <DialogTitle>Adjust background</DialogTitle>
                  <DialogDescription>
                    Tweak how visible and how blurry the chat background looks.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-5 py-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bg-opacity">Overlay opacity</Label>
                      <span className="text-xs text-muted-foreground">
                        {bgOpacity}%
                      </span>
                    </div>
                    <Slider
                      id="bg-opacity"
                      min={0}
                      max={100}
                      step={1}
                      value={[bgOpacity]}
                      onValueChange={(v) => setBgOpacity(v[0] ?? 55)}
                      data-testid="slider-bg-opacity"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Lower = background image shows through more.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="bg-blur">Background blur</Label>
                      <span className="text-xs text-muted-foreground">
                        {bgBlur}px
                      </span>
                    </div>
                    <Slider
                      id="bg-blur"
                      min={0}
                      max={32}
                      step={1}
                      value={[bgBlur]}
                      onValueChange={(v) => setBgBlur(v[0] ?? 12)}
                      data-testid="slider-bg-blur"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Set to 0 for a sharp, un-blurred background.
                    </p>
                  </div>
                </div>
                <DialogFooter className="gap-2 sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setBgOpacity(55);
                      setBgBlur(12);
                    }}
                    data-testid="button-bg-reset"
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setBgSettingsOpen(false)}
                    data-testid="button-bg-done"
                  >
                    Done
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                    variant={isGroup ? "room" : "dm"}
                    isMine={mine}
                    onReply={startReply}
                    onInvalidate={invalidateMessages}
                    onOpenThread={openThread}
                    showReadReceipt={!isGroup}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              {isGroup
                ? "Say hi to the group 👋"
                : "Say hi to start the conversation 👋"}
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
              <span
                className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
                style={{ animationDelay: "240ms" }}
              />
            </span>
            <span>
              {typingUsers.map((u) => u.displayName).join(", ")}{" "}
              {typingUsers.length === 1 ? "is" : "are"} typing…
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <ImageUploadButton
            onUploaded={sendImage}
            testId="button-upload-dm-image"
          />
          <GifPickerButton
            onPick={(g) => sendGif(g.url)}
            testId="button-pick-dm-gif"
          />
          <VoiceMessageButton
            onUploaded={sendAudio}
            testId="button-record-dm-voice"
          />
          <MentionTextarea
            ref={inputRef}
            placeholder="Type a message…"
            value={draft}
            onChange={setDraft}
            onSubmit={() => {
              if (draft.trim() && !send.isPending) {
                send.mutate({
                  id,
                  data: {
                    content: draft.trim(),
                    replyToId: replyTo?.id ?? null,
                  },
                });
              }
            }}
            onUserActivity={pingTyping}
            ariaLabel="Type a message"
            testId="input-dm-message"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setScheduleDmsOpen(true)}
            aria-label="View scheduled messages"
            data-testid="button-open-scheduled-dms"
            title="Scheduled messages"
          >
            <CalendarClock className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setScheduleOpen(true)}
            disabled={!draft.trim()}
            aria-label="Schedule message"
            data-testid="button-schedule-dm"
            title="Schedule for later"
          >
            <Clock className="h-4 w-4" />
          </Button>
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
      <ScheduleDmDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        conversationId={id}
        content={draft}
        replyToId={replyTo?.id ?? null}
        onScheduled={() => {
          setDraft("");
          setReplyTo(null);
          setScheduleDmsOpen(true);
          toast({ title: "Message scheduled" });
        }}
      />
      <ScheduledDmsSheet
        open={scheduleDmsOpen}
        onOpenChange={setScheduleDmsOpen}
        conversationId={id}
      />
      <ThreadDrawer
        open={threadParent !== null}
        onOpenChange={(o) => {
          if (!o) setThreadParent(null);
        }}
        parentId={threadParent?.id ?? null}
        scope={{ type: "conversation", id }}
      />
      {conv && isGroup && (
        <GroupMembersPanel
          open={membersOpen}
          onOpenChange={setMembersOpen}
          conv={conv}
          meId={meId}
        />
      )}
    </div>
  );
}
