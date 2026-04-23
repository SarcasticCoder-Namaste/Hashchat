import { Link } from "wouter";
import { useGetConversations, getGetConversationsQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { PresenceAvatar } from "@/components/UserBadge";
import { ListItemSkeleton } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { MessageCircle, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function Conversations() {
  const { data: convs, isLoading } = useGetConversations({
    query: { queryKey: getGetConversationsQueryKey(), refetchInterval: 5000 },
  });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!convs) return [];
    const q = search.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter(
      (c) =>
        c.otherUser.displayName.toLowerCase().includes(q) ||
        c.otherUser.username.toLowerCase().includes(q) ||
        (c.lastMessage?.content ?? "").toLowerCase().includes(q),
    );
  }, [convs, search]);

  const totalUnread = (convs ?? []).reduce((n, c) => n + c.unreadCount, 0);

  return (
    <div className="relative mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Messages</h1>
          <p className="mt-1 text-muted-foreground">
            Direct conversations with your matches.
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

      <div className="relative mt-5">
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

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <ListItemSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <ul className="divide-y divide-border">
            {filtered.map((c, idx) => (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx, 8) * 0.025, duration: 0.2 }}
              >
                <Link
                  href={`/app/messages/${c.id}`}
                  className="group flex items-center gap-3 p-4 transition-colors hover:bg-accent/40"
                  data-testid={`conversation-${c.id}`}
                >
                  <PresenceAvatar
                    displayName={c.otherUser.displayName}
                    avatarUrl={c.otherUser.avatarUrl}
                    lastSeenAt={c.otherUser.lastSeenAt}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-1.5 truncate">
                        <p
                          className={[
                            "truncate text-sm font-semibold",
                            c.unreadCount > 0 ? "text-foreground" : "text-foreground/90",
                          ].join(" ")}
                        >
                          {c.otherUser.displayName}
                        </p>
                        {c.otherUser.discriminator && (
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
                      {c.lastMessage?.content ?? "Start the conversation"}
                    </p>
                  </div>
                  {c.unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0.6 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 18 }}
                      className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-pink-500 px-1.5 text-xs font-semibold text-white shadow"
                    >
                      {c.unreadCount}
                    </motion.span>
                  )}
                </Link>
              </motion.li>
            ))}
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

      {/* Floating action: jump to discover */}
      <Link
        href="/app/discover"
        data-testid="fab-new-chat"
        className="fab fixed bottom-20 right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-pink-500 text-white md:bottom-8"
        aria-label="Start a new chat"
        title="Find someone to chat with"
      >
        <Plus className="h-6 w-6" />
      </Link>
    </div>
  );
}
