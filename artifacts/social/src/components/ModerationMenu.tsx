import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePinRoomPost,
  useUnpinRoomPost,
  usePinCommunityPost,
  useUnpinCommunityPost,
  useLockPost,
  useUnlockPost,
  useRemovePost,
  useLockMessage,
  useUnlockMessage,
  useRemoveMessage,
  useCreateReport,
  getGetRoomPinnedPostsQueryKey,
  getGetCommunityPinnedPostsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MoreHorizontal, Pin, PinOff, Lock, Unlock, Trash2, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type ModerationScope =
  | { type: "room"; key: string }
  | { type: "community"; key: string };

interface Props {
  kind: "post" | "message";
  targetId: number | string;
  scope?: ModerationScope;
  canModerate?: boolean;
  isPinned?: boolean;
  isLocked?: boolean;
  isRemoved?: boolean;
  onChanged?: () => void;
  testIdSuffix?: string;
}

export function ModerationMenu({
  kind,
  targetId,
  scope,
  canModerate,
  isPinned,
  isLocked,
  isRemoved,
  onChanged,
  testIdSuffix,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const id = typeof targetId === "string" ? Number(targetId) : targetId;
  const suffix = testIdSuffix ?? `${kind}-${targetId}`;

  const opts = {
    mutation: {
      onSuccess: () => {
        if (scope?.type === "room") {
          qc.invalidateQueries({ queryKey: getGetRoomPinnedPostsQueryKey(scope.key) });
        } else if (scope?.type === "community") {
          qc.invalidateQueries({ queryKey: getGetCommunityPinnedPostsQueryKey(scope.key) });
        }
        onChanged?.();
        setOpen(false);
      },
      onError: (err: unknown) => {
        const e = err as { status?: number; data?: { message?: string } };
        toast({
          title: e?.data?.message ?? "Action failed",
          variant: "destructive",
        });
      },
    },
  };

  const pinRoom = usePinRoomPost(opts);
  const unpinRoom = useUnpinRoomPost(opts);
  const pinCommunity = usePinCommunityPost(opts);
  const unpinCommunity = useUnpinCommunityPost(opts);
  const lockPost = useLockPost(opts);
  const unlockPost = useUnlockPost(opts);
  const removePost = useRemovePost(opts);
  const lockMessage = useLockMessage(opts);
  const unlockMessage = useUnlockMessage(opts);
  const removeMessage = useRemoveMessage(opts);

  const report = useCreateReport({
    mutation: {
      onSuccess: () => {
        toast({ title: "Report submitted" });
        setOpen(false);
      },
      onError: () =>
        toast({ title: "Could not report", variant: "destructive" }),
    },
  });

  function doPin() {
    if (!scope) return;
    if (scope.type === "room") pinRoom.mutate({ tag: scope.key, id });
    else pinCommunity.mutate({ slug: scope.key, id });
  }
  function doUnpin() {
    if (!scope) return;
    if (scope.type === "room") unpinRoom.mutate({ tag: scope.key, id });
    else unpinCommunity.mutate({ slug: scope.key, id });
  }
  function doLock() {
    if (!scope) return;
    if (kind === "post") {
      lockPost.mutate({ id, data: { scopeType: scope.type, scopeKey: scope.key } });
    } else {
      lockMessage.mutate({ id });
    }
  }
  function doUnlock() {
    if (!scope) return;
    if (kind === "post") {
      unlockPost.mutate({ id, data: { scopeType: scope.type, scopeKey: scope.key } });
    } else {
      unlockMessage.mutate({ id });
    }
  }
  function doRemove() {
    if (!scope) return;
    if (!confirm("Remove this content for everyone?")) return;
    if (kind === "post") {
      removePost.mutate({ id, data: { scopeType: scope.type, scopeKey: scope.key } });
    } else {
      removeMessage.mutate({ id });
    }
  }
  function doReport() {
    if (!scope) return;
    const reason = prompt("Why are you reporting this?", "")?.trim();
    if (!reason) return;
    report.mutate({
      data: {
        targetType: kind,
        targetId: id,
        scopeType: scope.type,
        scopeKey: scope.key,
        reason,
      },
    });
  }

  if (!scope) return null;
  if (isRemoved && !canModerate) return null;
  const showReport = !canModerate;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          data-testid={`button-mod-menu-${suffix}`}
          aria-label="Moderation actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {canModerate && kind === "post" && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={isPinned ? doUnpin : doPin}
            data-testid={`menu-${isPinned ? "unpin" : "pin"}-${suffix}`}
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {isPinned ? "Unpin" : "Pin"}
          </button>
        )}
        {canModerate && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={isLocked ? doUnlock : doLock}
            data-testid={`menu-${isLocked ? "unlock" : "lock"}-${suffix}`}
          >
            {isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {isLocked ? "Unlock" : "Lock"}
          </button>
        )}
        {canModerate && !isRemoved && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
            onClick={doRemove}
            data-testid={`menu-remove-${suffix}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        )}
        {showReport && (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={doReport}
            data-testid={`menu-report-${suffix}`}
          >
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
