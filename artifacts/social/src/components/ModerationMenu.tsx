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
  useMuteUserInRoom,
  getGetRoomPinnedPostsQueryKey,
  getGetCommunityPinnedPostsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MoreHorizontal, Pin, PinOff, Lock, Unlock, Trash2, Flag, VolumeX, ChevronRight } from "lucide-react";
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
  authorId?: string;
  authorName?: string;
  isMine?: boolean;
}

const MUTE_DURATIONS: { label: string; hours: number | null }[] = [
  { label: "1 hour", hours: 1 },
  { label: "8 hours", hours: 8 },
  { label: "24 hours", hours: 24 },
  { label: "Forever", hours: null },
];

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
  authorId,
  authorName,
  isMine,
}: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
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

  const muteUserInRoom = useMuteUserInRoom({
    mutation: {
      onSuccess: (_data, variables) => {
        const found = MUTE_DURATIONS.find(
          (d) => (d.hours ?? null) === (variables.data?.durationHours ?? null),
        );
        toast({
          title: `Muted ${authorName ? `@${authorName}` : "user"} in this room`,
          description: found
            ? found.hours === null
              ? "Until you unmute them."
              : `For ${found.label.toLowerCase()}.`
            : undefined,
        });
        setMuteOpen(false);
        setOpen(false);
      },
      onError: (err: unknown) => {
        const e = err as { data?: { message?: string } };
        toast({
          title: e?.data?.message ?? "Could not mute user",
          variant: "destructive",
        });
      },
    },
  });

  function doMuteInRoom(hours: number | null) {
    if (!scope || scope.type !== "room" || !authorId) return;
    muteUserInRoom.mutate({
      tag: scope.key,
      id: authorId,
      data: { durationHours: hours },
    });
  }

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
  const showMuteInRoom =
    kind === "message" &&
    scope.type === "room" &&
    !!authorId &&
    !isMine;

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
        {showMuteInRoom && (
          <div className="relative">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => setMuteOpen((v) => !v)}
              data-testid={`menu-mute-in-room-${suffix}`}
              aria-haspopup="menu"
              aria-expanded={muteOpen}
            >
              <span className="flex items-center gap-2">
                <VolumeX className="h-3.5 w-3.5" />
                Mute in this room
              </span>
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            </button>
            {muteOpen && (
              <div
                className="mt-1 flex flex-col rounded-md border bg-popover p-1 shadow-sm"
                data-testid={`menu-mute-in-room-options-${suffix}`}
              >
                {MUTE_DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-60"
                    disabled={muteUserInRoom.isPending}
                    onClick={() => doMuteInRoom(d.hours)}
                    data-testid={`menu-mute-in-room-${d.hours ?? "forever"}-${suffix}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
