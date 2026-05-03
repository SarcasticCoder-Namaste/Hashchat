import { useEffect } from "react";
import { Link } from "wouter";
import {
  useGetNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useGetNotificationMutes,
  useMuteNotificationsFromUser,
  useMuteNotificationsFromHashtag,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  getGetNotificationMutesQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AtSign,
  BellOff,
  CheckCheck,
  Hash,
  Heart,
  MessageSquare,
  MoreHorizontal,
  UserPlus,
  Loader2,
  CalendarClock,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function kindIcon(kind: string) {
  switch (kind) {
    case "mention":
      return <AtSign className="h-3.5 w-3.5" />;
    case "reply":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "reaction":
      return <Heart className="h-3.5 w-3.5" />;
    case "follow":
      return <UserPlus className="h-3.5 w-3.5" />;
    case "dm":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "event_starting":
      return <CalendarClock className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

function kindLabel(n: Notification): string {
  const who = n.actor?.displayName ?? "Someone";
  switch (n.kind) {
    case "mention":
      return `${who} mentioned you`;
    case "reply":
      return `${who} replied to you`;
    case "reaction":
      return `${who} reacted to your message`;
    case "follow":
      return `${who} started following you`;
    case "dm":
      return `${who} sent you a message`;
    case "event_starting":
      return `Event starting soon`;
    default:
      return who;
  }
}

function roomTagFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const m = href.match(/^\/app\/rooms\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function NotificationsSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, refetch } = useGetNotifications(undefined, {
    query: {
      queryKey: getGetNotificationsQueryKey(),
      enabled: open,
    },
  });
  const { data: mutes } = useGetNotificationMutes({
    query: {
      queryKey: getGetNotificationMutesQueryKey(),
      enabled: open,
    },
  });
  const mutedUserIds = new Set(mutes?.users ?? []);
  const mutedHashtags = new Set(mutes?.hashtags ?? []);

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const muteUser = useMuteNotificationsFromUser({
    mutation: {
      onSuccess: (_d, vars) => {
        qc.invalidateQueries({ queryKey: getGetNotificationMutesQueryKey() });
        toast({
          title: "Muted",
          description: `You won't get notifications from this person anymore.`,
        });
      },
    },
  });
  const muteHashtag = useMuteNotificationsFromHashtag({
    mutation: {
      onSuccess: (_d, vars) => {
        qc.invalidateQueries({ queryKey: getGetNotificationMutesQueryKey() });
        toast({
          title: "Muted",
          description: `You won't get notifications from #${vars.tag} anymore.`,
        });
      },
    },
  });

  const readAll = useMarkAllNotificationsRead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
        qc.invalidateQueries({
          queryKey: getGetUnreadNotificationCountQueryKey(),
        });
      },
    },
  });
  const markOne = useMarkNotificationRead({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
        qc.invalidateQueries({
          queryKey: getGetUnreadNotificationCountQueryKey(),
        });
      },
    },
  });

  const items = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-sm flex-col p-0"
        data-testid="notifications-sheet"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription className="sr-only">
            Mentions, replies, reactions, and follows
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <span>{data?.unreadCount ?? 0} unread</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={readAll.isPending || (data?.unreadCount ?? 0) === 0}
            onClick={() => readAll.mutate()}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            Mark all read
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul>
              <AnimatePresence initial={false}>
                {items.map((n) => {
                const isUnread = !n.readAt;
                const actorId = n.actor?.id ?? null;
                const roomTag = roomTagFromHref(n.href);
                const actorMuted = actorId
                  ? mutedUserIds.has(actorId)
                  : false;
                const roomMuted = roomTag
                  ? mutedHashtags.has(roomTag)
                  : false;
                const canMuteAnything = !!actorId || !!roomTag;
                const inner = (
                  <motion.div
                    initial={false}
                    animate={{
                      backgroundColor: isUnread
                        ? "hsl(var(--primary) / 0.05)"
                        : "hsl(var(--primary) / 0)",
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="flex items-start gap-3 border-b border-border/60 px-4 py-3"
                  >
                    <Avatar className="h-9 w-9 shrink-0">
                      {n.actor?.avatarUrl ? (
                        <AvatarImage
                          src={n.actor.avatarUrl}
                          alt={n.actor.displayName}
                        />
                      ) : null}
                      <AvatarFallback className="bg-primary/15 text-primary">
                        {n.actor?.displayName.slice(0, 2).toUpperCase() ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground">
                          {kindIcon(n.kind)}
                        </span>
                        <span className="truncate font-medium text-foreground">
                          {kindLabel(n)}
                        </span>
                      </div>
                      {n.snippet && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {n.snippet}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                    <AnimatePresence initial={false}>
                      {isUnread && (
                        <motion.span
                          key="unread-dot"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
                const onClick = () => {
                  if (isUnread) markOne.mutate({ id: n.id });
                  onOpenChange(false);
                };
                const muteMenu = canMuteAnything ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        aria-label="Notification options"
                        data-testid={`notif-${n.id}-options`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {actorId && (
                        <DropdownMenuItem
                          disabled={actorMuted || muteUser.isPending}
                          onSelect={(e) => {
                            e.preventDefault();
                            if (!actorMuted && actorId) {
                              muteUser.mutate({ id: actorId });
                            }
                          }}
                          data-testid={`notif-${n.id}-mute-user`}
                        >
                          <BellOff className="mr-2 h-4 w-4" />
                          {actorMuted
                            ? `Muted ${n.actor?.displayName ?? "this user"}`
                            : `Mute ${n.actor?.displayName ?? "this user"}`}
                        </DropdownMenuItem>
                      )}
                      {roomTag && (
                        <DropdownMenuItem
                          disabled={roomMuted || muteHashtag.isPending}
                          onSelect={(e) => {
                            e.preventDefault();
                            if (!roomMuted && roomTag) {
                              muteHashtag.mutate({ tag: roomTag });
                            }
                          }}
                          data-testid={`notif-${n.id}-mute-room`}
                        >
                          <Hash className="mr-2 h-4 w-4" />
                          {roomMuted
                            ? `Muted #${roomTag}`
                            : `Mute #${roomTag}`}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null;
                return (
                  <motion.li
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    data-testid={`notif-${n.id}`}
                    className="relative"
                  >
                    {n.href ? (
                      <Link
                        href={n.href}
                        onClick={onClick}
                        className="block hover:bg-accent/40"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="block w-full text-left hover:bg-accent/40"
                        onClick={onClick}
                      >
                        {inner}
                      </button>
                    )}
                    {muteMenu && (
                      <div className="absolute right-2 top-2">{muteMenu}</div>
                    )}
                  </motion.li>
                );
              })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
