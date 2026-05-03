import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSetRoomSlowMode,
  useSetCommunitySlowMode,
  useListRoomModerators,
  useAddRoomModerator,
  useRemoveRoomModerator,
  useListCommunityModerators,
  useAddCommunityModerator,
  useRemoveCommunityModerator,
  useListRoomReports,
  useListCommunityReports,
  useResolveReport,
  getListRoomModeratorsQueryKey,
  getListCommunityModeratorsQueryKey,
  getListRoomReportsQueryKey,
  getListCommunityReportsQueryKey,
  getGetRoomVisibilityQueryKey,
  getGetCommunityQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, X, Plus, Check, Trash2, Lock as LockIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SLOW_MODE_OPTIONS = [
  { v: 0, label: "Off" },
  { v: 10, label: "10 seconds" },
  { v: 30, label: "30 seconds" },
  { v: 60, label: "1 minute" },
  { v: 300, label: "5 minutes" },
];

interface PanelProps {
  scopeType: "room" | "community";
  scopeKey: string;
  canModerate: boolean;
  canEditSettings: boolean;
  slowModeSeconds: number;
}

export function ModerationPanel({
  scopeType,
  scopeKey,
  canModerate,
  canEditSettings,
  slowModeSeconds,
}: PanelProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newModId, setNewModId] = useState("");

  const setRoom = useSetRoomSlowMode({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetRoomVisibilityQueryKey(scopeKey) });
        toast({ title: "Slow mode updated" });
      },
      onError: () => toast({ title: "Could not update slow mode", variant: "destructive" }),
    },
  });
  const setCommunity = useSetCommunitySlowMode({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetCommunityQueryKey(scopeKey) });
        toast({ title: "Slow mode updated" });
      },
      onError: () => toast({ title: "Could not update slow mode", variant: "destructive" }),
    },
  });
  const roomMods = useListRoomModerators(scopeKey, {
    query: {
      queryKey: getListRoomModeratorsQueryKey(scopeKey),
      enabled: scopeType === "room",
    },
  });
  const communityMods = useListCommunityModerators(scopeKey, {
    query: {
      queryKey: getListCommunityModeratorsQueryKey(scopeKey),
      enabled: scopeType === "community",
    },
  });
  const mods = scopeType === "room" ? roomMods.data : communityMods.data;
  const modsLoading = scopeType === "room" ? roomMods.isLoading : communityMods.isLoading;

  const invalidateMods = () => {
    if (scopeType === "room") {
      qc.invalidateQueries({ queryKey: getListRoomModeratorsQueryKey(scopeKey) });
    } else {
      qc.invalidateQueries({ queryKey: getListCommunityModeratorsQueryKey(scopeKey) });
      qc.invalidateQueries({ queryKey: getGetCommunityQueryKey(scopeKey) });
    }
  };

  const addRoom = useAddRoomModerator({
    mutation: {
      onSuccess: () => {
        invalidateMods();
        setNewModId("");
        toast({ title: "Moderator added" });
      },
      onError: (err: unknown) => {
        const e = err as { data?: { message?: string } };
        toast({ title: e?.data?.message ?? "Could not add", variant: "destructive" });
      },
    },
  });
  const addCommunity = useAddCommunityModerator({
    mutation: {
      onSuccess: () => {
        invalidateMods();
        setNewModId("");
        toast({ title: "Moderator added" });
      },
      onError: (err: unknown) => {
        const e = err as { data?: { message?: string } };
        toast({ title: e?.data?.message ?? "Could not add", variant: "destructive" });
      },
    },
  });
  const removeRoom = useRemoveRoomModerator({
    mutation: { onSuccess: () => invalidateMods() },
  });
  const removeCommunity = useRemoveCommunityModerator({
    mutation: { onSuccess: () => invalidateMods() },
  });

  function setSlow(seconds: number) {
    const s = seconds as 0 | 10 | 30 | 60 | 300;
    if (scopeType === "room") {
      setRoom.mutate({ tag: scopeKey, data: { seconds: s } });
    } else {
      setCommunity.mutate({ slug: scopeKey, data: { seconds: s } });
    }
  }

  function addMod() {
    const userId = newModId.trim();
    if (!userId) return;
    if (scopeType === "room") {
      addRoom.mutate({ tag: scopeKey, data: { userId } });
    } else {
      addCommunity.mutate({ slug: scopeKey, data: { userId } });
    }
  }

  function removeMod(userId: string) {
    if (!confirm("Remove this moderator?")) return;
    if (scopeType === "room") {
      removeRoom.mutate({ tag: scopeKey, userId });
    } else {
      removeCommunity.mutate({ slug: scopeKey, userId });
    }
  }

  if (!canModerate) {
    return (
      <p className="text-xs text-muted-foreground">
        Only moderators can see this panel.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Slow mode
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {SLOW_MODE_OPTIONS.map((opt) => {
            const active = slowModeSeconds === opt.v;
            return (
              <Button
                key={opt.v}
                size="sm"
                variant={active ? "default" : "outline"}
                disabled={!canEditSettings || setRoom.isPending || setCommunity.isPending}
                onClick={() => setSlow(opt.v)}
                data-testid={`slow-mode-${opt.v}`}
              >
                {active && <Check className="mr-1 h-3 w-3" />}
                {opt.label}
              </Button>
            );
          })}
        </div>
        {!canEditSettings && (
          <p className="mt-2 text-xs text-muted-foreground">
            Only the owner can change slow mode.
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Moderators
        </h3>
        {modsLoading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : mods && mods.length > 0 ? (
          <ul className="mb-3 space-y-1.5">
            {mods.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm"
                data-testid={`mod-${m.id}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {m.displayName}{" "}
                  <span className="text-xs text-muted-foreground">@{m.username}</span>
                </span>
                {canEditSettings && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => removeMod(m.id)}
                    data-testid={`button-remove-mod-${m.id}`}
                    aria-label="Remove moderator"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-xs text-muted-foreground">No moderators yet.</p>
        )}
        {canEditSettings && (mods?.length ?? 0) < 3 && (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={newModId}
              onChange={(e) => setNewModId(e.target.value)}
              placeholder="User ID"
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
              data-testid="input-new-mod-id"
            />
            <Button
              size="sm"
              onClick={addMod}
              disabled={!newModId.trim() || addRoom.isPending || addCommunity.isPending}
              data-testid="button-add-mod"
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
        )}
        {canEditSettings && (mods?.length ?? 0) >= 3 && (
          <p className="text-xs text-muted-foreground">
            Maximum 3 moderators per scope.
          </p>
        )}
      </section>
    </div>
  );
}

export function ReportsPanel({
  scopeType,
  scopeKey,
  canModerate,
}: {
  scopeType: "room" | "community";
  scopeKey: string;
  canModerate: boolean;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const roomReports = useListRoomReports(scopeKey, {
    query: {
      queryKey: getListRoomReportsQueryKey(scopeKey),
      enabled: canModerate && scopeType === "room",
    },
  });
  const communityReports = useListCommunityReports(scopeKey, {
    query: {
      queryKey: getListCommunityReportsQueryKey(scopeKey),
      enabled: canModerate && scopeType === "community",
    },
  });
  const list = scopeType === "room" ? roomReports.data : communityReports.data;
  const loading = scopeType === "room" ? roomReports.isLoading : communityReports.isLoading;

  const resolve = useResolveReport({
    mutation: {
      onSuccess: () => {
        if (scopeType === "room") {
          qc.invalidateQueries({ queryKey: getListRoomReportsQueryKey(scopeKey) });
        } else {
          qc.invalidateQueries({ queryKey: getListCommunityReportsQueryKey(scopeKey) });
        }
        toast({ title: "Report resolved" });
      },
      onError: () => toast({ title: "Could not resolve", variant: "destructive" }),
    },
  });

  if (!canModerate) {
    return (
      <p className="text-xs text-muted-foreground">
        Only moderators can review reports.
      </p>
    );
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!list || list.length === 0) {
    return <p className="text-xs text-muted-foreground">No open reports.</p>;
  }

  return (
    <ul className="space-y-2">
      {list.map((r) => (
        <li
          key={r.id}
          className="rounded-md border border-border bg-card p-3"
          data-testid={`report-${r.id}`}
        >
          <p className="text-xs text-muted-foreground">
            {new Date(r.createdAt).toLocaleString()} · {r.targetType} #{r.targetId}
          </p>
          <p className="mt-1 text-sm text-foreground">{r.reason}</p>
          {r.reporter && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reported by @{r.reporter.username}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onClick={() =>
                resolve.mutate({ id: r.id, data: { action: "dismiss" } })
              }
              data-testid={`button-dismiss-${r.id}`}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onClick={() =>
                resolve.mutate({ id: r.id, data: { action: "lock" } })
              }
              data-testid={`button-resolve-lock-${r.id}`}
            >
              <LockIcon className="mr-1 h-3 w-3" /> Lock
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={resolve.isPending}
              onClick={() =>
                resolve.mutate({ id: r.id, data: { action: "remove" } })
              }
              data-testid={`button-resolve-remove-${r.id}`}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Remove
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
