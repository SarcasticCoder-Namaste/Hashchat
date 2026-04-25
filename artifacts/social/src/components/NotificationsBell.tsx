import { useState } from "react";
import {
  useGetUnreadNotificationCount,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationsSheet } from "./NotificationsSheet";

export function NotificationsBell({
  enabled,
  testIdSuffix,
}: {
  enabled: boolean;
  testIdSuffix?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useGetUnreadNotificationCount({
    query: {
      queryKey: getGetUnreadNotificationCountQueryKey(),
      enabled,
      refetchInterval: 10000,
    },
  });
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
