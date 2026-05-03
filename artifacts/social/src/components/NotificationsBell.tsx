import { useEffect, useRef, useState } from "react";
import {
  useGetNotifications,
  useGetUnreadNotificationCount,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  NotificationKind,
} from "@workspace/api-client-react";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { NotificationsSheet } from "./NotificationsSheet";

const SCHEDULED_DM_KINDS: ReadonlySet<string> = new Set<string>([
  NotificationKind.scheduled_dm_delivered,
  NotificationKind.scheduled_dm_failed,
]);

export function NotificationsBell({
  enabled,
  testIdSuffix,
}: {
  enabled: boolean;
  testIdSuffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled,
      refetchInterval: 10000,
    },
  });
  const { data: notifData } = useGetNotifications(undefined, {
    query: {
      queryKey: getGetNotificationsQueryKey(),
      enabled,
      refetchInterval: 10000,
    },
  });

  const seenIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (!notifData?.items) return;
    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(notifData.items.map((n) => n.id));
      return;
    }
    const seen = seenIdsRef.current;
    for (const n of notifData.items) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (!SCHEDULED_DM_KINDS.has(n.kind)) continue;
      const isFail = n.kind === NotificationKind.scheduled_dm_failed;
      const href = n.href ?? null;
      toast({
        title: isFail
          ? "Scheduled DM couldn't be delivered"
          : "Scheduled DM delivered",
        description: n.snippet ?? undefined,
        variant: isFail ? "destructive" : "default",
        action: href ? (
          <ToastAction
            altText="View conversation"
            onClick={() => setLocation(href)}
            data-testid="toast-scheduled-dm-view"
          >
            View
          </ToastAction>
        ) : undefined,
      });
    }
  }, [notifData, toast, setLocation]);

  const count = data?.notifications ?? 0;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="relative"
        data-testid={`button-notifications${testIdSuffix ? `-${testIdSuffix}` : ""}`}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground"
            data-testid="notif-badge"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>
      <NotificationsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
