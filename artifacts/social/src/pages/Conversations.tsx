import { Link } from "wouter";
import {
  useGetConversations,
  useGetMyFriends,
  useCreateGroupConversation,
  getGetConversationsQueryKey,
  getGetMyFriendsQueryKey,
  type Conversation,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PresenceAvatar } from "@/components/UserBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ListItemSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { MessageCircle, Plus, Search, Users, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function conversationDisplay(c: Conversation): {
  title: string;
  searchable: string;
  subtitle?: string;
} {
  if (c.kind === "group") {
    const memberNames = c.members.map((m) => m.displayName);
    const title =
      c.title?.trim() ||
      memberNames.slice(0, 3).join(", ") +
        (memberNames.length > 3 ? ` +${memberNames.length - 3}` : "");
    return {
      title,
      searchable: [title, ...memberNames].join(" ").toLowerCase(),
      subtitle: `${c.members.length} members`,
    };
  }
  const other = c.otherUser;
  return {
    title: other?.displayName ?? "Unknown",
    searchable: [other?.displayName ?? "", other?.username ?? ""]
      .join(" ")
      .toLowerCase(),
  };
}

function GroupAvatars({ c }: { c: Conversation }) {
  const others = c.members.slice(0, 3);
  return (
    <div className="relative h-10 w-10 shrink-0">
      {others.map((m, i) => (
        <Avatar
          key={m.id}
          className="absolute h-7 w-7 border-2 border-card"
          style={{
            left: i === 0 ? 0 : i === 1 ? 12 : 6,
            top: i === 0 ? 0 : i === 1 ? 0 : 12,
            zIndex: i,
          }}
        >
          {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt={m.displayName} /> : null}
          <AvatarFallback className="bg-primary/15 text-[10px] text-primary">
            {m.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

function GroupCreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const friends = useGetMyFriends({
    query: { queryKey: getGetMyFriendsQueryKey(), enabled: open },
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("");
  const create = useCreateGroupConversation({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
        onOpenChange(false);
        setSelected(new Set());
        setTitle("");
        setFilter("");
        toast({ title: "Group created" });
      },
      onError: (e: unknown) => {
        toast({
          title: "Couldn't create group",
          description: e instanceof Error ? e.message : "Try again.",
          variant: "destructive",
        });
      },
    },
  });

  const filteredFriends = useMemo(() => {
    const list = friends.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        f.displayName.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q),
    );
  }, [friends.data, filter]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 9) next.add(id);
      return next;
    });
  }

  const canCreate = selected.size >= 2 && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create group chat</DialogTitle>
          <DialogDescription>
            Choose 2–9 friends to start a group conversation (10 max including you).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Group name (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            data-testid="input-group-title"
          />
          <Input
            placeholder="Search friends…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="input-group-search-friends"
          />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
            {friends.isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading friends…
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No friends found.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filteredFriends.map((f) => {
                  const isSelected = selected.has(f.id);
                  const disabled = !isSelected && selected.size >= 9;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(f.id)}
                        className={[
                          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "bg-primary/10"
                            : disabled
                              ? "opacity-50"
                              : "hover:bg-accent/40",
                        ].join(" ")}
                        data-testid={`friend-pick-${f.id}`}
                      >
                        <PresenceAvatar
                          displayName={f.displayName}
                          avatarUrl={f.avatarUrl}
                          lastSeenAt={f.lastSeenAt}
                        />
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
                            isSelected
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
          <p className="text-xs text-muted-foreground">
            {selected.size}/9 selected
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            disabled={!canCreate}
            onClick={() =>
              create.mutate({
                data: {
                  userIds: Array.from(selected),
                  title: title.trim() || null,
                },
              })
            }
            data-testid="button-create-group"
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Users className="mr-2 h-4 w-4" />
            )}
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Conversations() {
  const { data: convs, isLoading } = useGetConversations({
    query: { queryKey: getGetConversationsQueryKey(), refetchInterval: 5000 },
  });
  const [search, setSearch] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!convs) return [];
    const q = search.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) => {
      const d = conversationDisplay(c);
      return (
        d.searchable.includes(q) ||
        (c.lastMessage?.content ?? "").toLowerCase().includes(q)
      );
    });
  }, [convs, search]);

  const totalUnread = (convs ?? []).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Messages</h1>
          <p className="mt-1 text-muted-foreground">
            Direct conversations and group chats with your matches.
          </p>
        </div>
        {totalUnread > 0 && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-3 py-1 text-xs font-semibold text-white shadow"
            data-testid="unread-total"
          >
            {totalUnread} unread
          </motion.span>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none ring-0 transition focus:border-primary/50 focus:bg-background"
            data-testid="input-search-messages"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setGroupOpen(true)}
          data-testid="button-new-group"
        >
          <Users className="mr-2 h-4 w-4" />
          New group
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <ListItemSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <ul className="divide-y divide-border">
            {filtered.map((c, idx) => {
              const display = conversationDisplay(c);
              const isGroup = c.kind === "group";
              return (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(idx, 8) * 0.025,
                    duration: 0.2,
                  }}
                >
                  <Link
                    href={`/app/messages/${c.id}`}
                    className="group flex items-center gap-3 p-4 transition-colors hover:bg-accent/40"
                    data-testid={`conversation-${c.id}`}
                  >
                    {isGroup ? (
                      <GroupAvatars c={c} />
                    ) : c.otherUser ? (
                      <PresenceAvatar
                        displayName={c.otherUser.displayName}
                        avatarUrl={c.otherUser.avatarUrl}
                        animatedAvatarUrl={c.otherUser.animatedAvatarUrl}
                        lastSeenAt={c.otherUser.lastSeenAt}
                        presenceState={c.otherUser.presenceState}
                      />
                    ) : (
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>?</AvatarFallback>
                      </Avatar>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-baseline gap-1.5 truncate">
                          <p
                            className={[
                              "truncate text-sm font-semibold",
                              c.unreadCount > 0
                                ? "text-foreground"
                                : "text-foreground/90",
                            ].join(" ")}
                          >
                            {display.title}
                          </p>
                          {isGroup && (
                            <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                              group
                            </span>
                          )}
                          {!isGroup && c.otherUser?.discriminator && (
                            <span className="shrink-0 text-[10px] text-muted-foreground/70">
                              #{c.otherUser.discriminator}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground/70">
                          {timeAgo(c.updatedAt)}
                        </span>
                      </div>
                      <p
                        className={[
                          "truncate text-sm",
                          c.unreadCount > 0
                            ? "font-medium text-foreground"
                            : "text-muted-foreground",
                        ].join(" ")}
                      >
                        {c.lastMessage
                          ? c.lastMessage.kind === "system"
                            ? `${c.lastMessage.senderName} ${c.lastMessage.content}`
                            : isGroup
                              ? `${c.lastMessage.senderName}: ${c.lastMessage.content || "[media]"}`
                              : c.lastMessage.content || "[media]"
                          : isGroup
                            ? display.subtitle
                            : "Start the conversation"}
                      </p>
                      {!isGroup &&
                        c.otherUser &&
                        (c.otherUser.presenceState === "online" ||
                          c.otherUser.currentRoomTag) && (
                          <p
                            className="truncate text-[11px] text-muted-foreground/80"
                            data-testid={`conversation-presence-${c.id}`}
                          >
                            {c.otherUser.presenceState === "online"
                              ? "Active now"
                              : null}
                            {c.otherUser.currentRoomTag ? (
                              <span className="text-primary">
                                {c.otherUser.presenceState === "online"
                                  ? " · "
                                  : ""}
                                in #{c.otherUser.currentRoomTag}
                              </span>
                            ) : null}
                          </p>
                        )}
                    </div>
                    {c.unreadCount > 0 && (
                      <motion.span
                        initial={{ scale: 0.6 }}
                        animate={{ scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 18,
                        }}
                        className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-1.5 text-xs font-semibold text-white shadow"
                      >
                        {c.unreadCount}
                      </motion.span>
                    )}
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        ) : search ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No conversations match “{search}”.
          </div>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={MessageCircle}
              title="No conversations yet"
              description="Find someone interesting on Discover and say hi — your chats will appear here."
              action={
                <Button asChild>
                  <Link href="/app/discover" data-testid="link-go-discover">
                    Find people →
                  </Link>
                </Button>
              }
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setGroupOpen(true)}
        data-testid="fab-new-chat"
        className="fab fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white md:bottom-8"
        aria-label="Start a new group chat"
        title="Start a new group chat"
      >
        <Plus className="h-6 w-6" />
      </button>

      <GroupCreateDialog open={groupOpen} onOpenChange={setGroupOpen} />
    </div>
  );
}
