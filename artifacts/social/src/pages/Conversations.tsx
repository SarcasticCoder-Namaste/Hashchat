import { Link } from "wouter";
import { useGetConversations, getGetConversationsQueryKey } from "@workspace/api-client-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, MessageCircle } from "lucide-react";

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="text-3xl font-bold text-foreground">Messages</h1>
      <p className="mt-1 text-muted-foreground">
        Direct conversations with your matches.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/70" />
          </div>
        ) : convs && convs.length > 0 ? (
          <ul className="divide-y divide-border">
            {convs.map((c) => {
              const initials = c.otherUser.displayName
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              return (
                <li key={c.id}>
                  <Link href={`/app/messages/${c.id}`} className="flex items-center gap-3 p-4 hover:bg-background" data-testid={`conversation-${c.id}`}>
                      <Avatar className="h-11 w-11">
                        {c.otherUser.avatarUrl ? (
                          <AvatarImage
                            src={c.otherUser.avatarUrl}
                            alt={c.otherUser.displayName}
                          />
                        ) : null}
                        <AvatarFallback className="bg-primary/25 text-primary">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {c.otherUser.displayName}
                          </p>
                          <span className="shrink-0 text-xs text-muted-foreground/70">
                            {timeAgo(c.updatedAt)}
                          </span>
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {c.lastMessage?.content ?? "Start the conversation"}
                        </p>
                      </div>
                      {c.unreadCount > 0 && (
                        <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
            <MessageCircle className="h-8 w-8 text-muted-foreground/40" />
            <p>No conversations yet.</p>
            <Link href="/app/discover" className="text-sm font-medium text-primary hover:underline" data-testid="link-go-discover">
                Find people to chat with →
              </Link>
          </div>
        )}
      </div>
    </div>
  );
}
