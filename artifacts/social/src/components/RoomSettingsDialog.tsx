import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetRoomVisibility,
  useSetRoomVisibility,
  useListRoomInvites,
  useCreateRoomInvite,
  useListRoomJoinRequests,
  useDecideRoomJoinRequest,
  getGetRoomVisibilityQueryKey,
  getListRoomInvitesQueryKey,
  getListRoomJoinRequestsQueryKey,
  getGetHashtagQueryKey,
  getGetRoomsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Copy, Check, X, Sparkles, BarChart3 } from "lucide-react";
import { RoomAnalyticsPanel } from "./RoomAnalyticsPanel";
import { useToast } from "@/hooks/use-toast";
import { ModerationPanel, ReportsPanel } from "./moderation-panels";

export function RoomSettingsDialog({
  tag,
  open,
  onOpenChange,
  isPremium,
}: {
  tag: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isPremium: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const visibility = useGetRoomVisibility(tag, {
    query: {
      queryKey: getGetRoomVisibilityQueryKey(tag),
      enabled: open,
    },
  });

  const setVisibility = useSetRoomVisibility({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRoomVisibilityQueryKey(tag) });
        qc.invalidateQueries({ queryKey: getGetHashtagQueryKey(tag) });
        qc.invalidateQueries({ queryKey: getGetRoomsQueryKey() });
        toast({ title: "Room visibility updated" });
      },
      onError: (err: unknown) => {
        const e = err as { status?: number };
        if (e?.status === 402) {
          toast({
            title: "Free limit reached",
            description: "Upgrade to Premium for unlimited private rooms.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Could not update room", variant: "destructive" });
        }
      },
    },
  });

  const v = visibility.data;
  const canManage = v?.canManage ?? false;
  const isPrivate = v?.isPrivate ?? false;
  const isPremiumRoom = v?.isPremium ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Room settings · #{tag}</DialogTitle>
          <DialogDescription>
            Control privacy, invites, and pending join requests for this room.
          </DialogDescription>
        </DialogHeader>

        {visibility.isLoading || !v ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="visibility">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="visibility" data-testid="tab-visibility">
                Visibility
              </TabsTrigger>
              <TabsTrigger value="invites" data-testid="tab-invites" disabled={!isPrivate}>
                Invites
              </TabsTrigger>
              <TabsTrigger value="requests" data-testid="tab-requests" disabled={!isPrivate}>
                Requests
              </TabsTrigger>
              <TabsTrigger
                value="analytics"
                data-testid="tab-room-analytics"
                disabled={!canManage}
                className="gap-1"
              >
                <BarChart3 className="h-3.5 w-3.5" /> Stats
              </TabsTrigger>
              <TabsTrigger value="moderation" data-testid="tab-moderation">
                Mods
              </TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports">
                Reports
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visibility" className="space-y-4 pt-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Private room</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    When private, only invited or approved members can read or post.
                  </p>
                </div>
                <Switch
                  checked={isPrivate}
                  disabled={!canManage || setVisibility.isPending}
                  onCheckedChange={(checked) =>
                    setVisibility.mutate({
                      tag,
                      data: { isPrivate: checked },
                    })
                  }
                  data-testid="switch-room-private"
                />
              </div>
              {!canManage && (
                <p className="text-xs text-muted-foreground">
                  Only the room owner can change visibility.
                </p>
              )}
              {!isPremium && (
                <div className="flex items-start gap-2 rounded-md bg-violet-500/10 p-3 text-xs text-violet-700 dark:text-violet-300">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    Free plan: 1 private room. Upgrade to Premium for unlimited.
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                    Premium-only room
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Only Premium members can read or post. You'll always have
                    access as the owner.
                  </p>
                </div>
                <Switch
                  checked={isPremiumRoom}
                  disabled={!canManage || !isPremium || setVisibility.isPending}
                  onCheckedChange={(checked) =>
                    setVisibility.mutate({
                      tag,
                      data: { isPrivate, isPremium: checked },
                    })
                  }
                  data-testid="switch-room-premium"
                />
              </div>
              {!isPremium && (
                <p className="text-[11px] text-muted-foreground">
                  Only Premium creators can mark a room as Premium-only.
                </p>
              )}
            </TabsContent>

            <TabsContent value="invites" className="space-y-3 pt-4">
              <InvitesPanel tag={tag} canManage={canManage} />
            </TabsContent>

            <TabsContent value="requests" className="space-y-3 pt-4">
              <JoinRequestsPanel tag={tag} canManage={canManage} />
            </TabsContent>

            <TabsContent value="analytics" className="space-y-3 pt-4">
              <RoomAnalyticsPanel tag={tag} canManage={canManage} />
            </TabsContent>

            <TabsContent value="moderation" className="space-y-4 pt-4">
              <ModerationPanel
                scopeType="room"
                scopeKey={tag}
                canEditSettings={canManage}
                canModerate={v.canModerate}
                slowModeSeconds={v.slowModeSeconds}
              />
            </TabsContent>

            <TabsContent value="reports" className="space-y-3 pt-4">
              <ReportsPanel
                scopeType="room"
                scopeKey={tag}
                canModerate={v.canModerate}
              />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvitesPanel({ tag, canManage }: { tag: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListRoomInvites(tag);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const create = useCreateRoomInvite({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRoomInvitesQueryKey(tag) });
        toast({ title: "Invite created" });
      },
      onError: () => toast({ title: "Could not create invite", variant: "destructive" }),
    },
  });

  async function copy(url: string, code: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <>
      <Button
        size="sm"
        disabled={!canManage || create.isPending}
        onClick={() =>
          create.mutate({
            tag,
            data: { maxUses: null, expiresInHours: 168 },
          })
        }
        data-testid="button-create-invite"
        className="brand-gradient-bg text-white"
      >
        {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Generate invite link
      </Button>

      {list.isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : list.data && list.data.length > 0 ? (
        <ul className="space-y-2">
          {list.data.map((inv) => (
            <li
              key={inv.code}
              className="rounded-md border border-border bg-card p-3"
              data-testid={`invite-${inv.code}`}
            >
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                  {inv.url}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(inv.url, inv.code)}
                  data-testid={`button-copy-invite-${inv.code}`}
                >
                  {copiedCode === inv.code ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Used {inv.useCount}
                {inv.maxUses ? ` / ${inv.maxUses}` : ""}
                {inv.expiresAt &&
                  ` · expires ${new Date(inv.expiresAt).toLocaleDateString()}`}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No invites yet. Generate one to share with friends.
        </p>
      )}
    </>
  );
}

function JoinRequestsPanel({ tag, canManage }: { tag: string; canManage: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListRoomJoinRequests(tag, {
    query: {
      queryKey: getListRoomJoinRequestsQueryKey(tag),
      enabled: canManage,
    },
  });

  const decide = useDecideRoomJoinRequest({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListRoomJoinRequestsQueryKey(tag) });
      },
      onError: () => toast({ title: "Action failed", variant: "destructive" }),
    },
  });

  if (!canManage) {
    return (
      <p className="text-xs text-muted-foreground">
        Only the room owner can review join requests.
      </p>
    );
  }
  if (list.isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!list.data || list.data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No pending requests.</p>
    );
  }
  return (
    <ul className="space-y-2">
      {list.data.map((req) => (
        <li
          key={req.userId}
          className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
          data-testid={`join-request-${req.userId}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {req.user?.displayName ?? req.userId}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              @{req.user?.username ?? req.userId}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({
                tag,
                userId: req.userId,
                data: { decision: "deny" },
              })
            }
            data-testid={`button-deny-${req.userId}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({
                tag,
                userId: req.userId,
                data: { decision: "approve" },
              })
            }
            data-testid={`button-approve-${req.userId}`}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
