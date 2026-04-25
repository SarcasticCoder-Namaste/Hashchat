import { useState } from "react";
import { Link } from "wouter";
import { Bell, Loader2, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  useGetMyNotifications,
  useGetMyUnreadNotificationCount,
  useMarkMyNotificationsRead,
  getGetMyNotificationsQueryKey,
  getGetMyUnreadNotificationCountQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PresenceAvatar, UserNameLine } from "@/components/UserBadge";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(iso).toLocaleDateString();
}

function describeKind(kind: string): string {
  switch (kind) {
    case "follow":
      return "started following you";
    default:
      return kind;
  }
}

export function NotificationsBell({
  enabled = true,
}: {
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const unread = useGetMyUnreadNotificationCount({
    query: {
      queryKey: getGetMyUnreadNotificationCountQueryKey(),
      enabled,
      refetchInterval: 30_000,
    },
  });
  const unreadCount = unread.data?.count ?? 0;

  const list = useGetMyNotifications(
    { limit: 30 },
    {
      query: {
        queryKey: getGetMyNotificationsQueryKey({ limit: 30 }),
        enabled: enabled && open,
      },
    },
  );

  const markRead = useMarkMyNotificationsRead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({
          queryKey: getGetMyUnreadNotificationCountQueryKey(),
        });
        qc.invalidateQueries({
          queryKey: getGetMyNotificationsQueryKey({ limit: 30 }),
        });
      },
    },
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && unreadCount > 0 && !markRead.isPending) {
      markRead.mutate();
    }
  }

  const items: Notification[] = list.data ?? [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifications"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-primary px-1 text-[10px] font-semibold leading-[1.1rem] text-primary-foreground shadow-sm"
              data-testid="badge-notifications-unread"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Recent
          </span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Bell className="mx-auto mb-2 h-6 w-6 opacity-50" />
              You're all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const isUnread = !n.readAt;
                const profileHref = `/app/u/${n.actor.username}`;
                return (
                  <li
                    key={n.id}
                    className={[
                      "px-3 py-2.5 transition-colors",
                      isUnread ? "bg-primary/5" : "",
                    ].join(" ")}
                    data-testid={`notification-item-${n.id}`}
                  >
                    <Link
                      href={profileHref}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3"
                    >
                      <PresenceAvatar
                        displayName={n.actor.displayName}
                        avatarUrl={n.actor.avatarUrl}
                        lastSeenAt={n.actor.lastSeenAt}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <UserNameLine
                          displayName={n.actor.displayName}
                          username={n.actor.username}
                          discriminator={n.actor.discriminator}
                          role={n.actor.role}
                          mvpPlan={n.actor.mvpPlan}
                          className="text-sm"
                        />
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          {n.kind === "follow" && (
                            <UserPlus className="h-3 w-3" />
                          )}
                          <span>{describeKind(n.kind)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{relativeTime(n.createdAt)}</span>
                        </p>
                      </div>
                      {isUnread && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                          aria-label="Unread"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
