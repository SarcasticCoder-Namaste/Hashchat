import { useState } from "react";
import {
  useAdminListUsers,
  useAdminBanUser,
  useAdminUnbanUser,
  useAdminSetUserRole,
  useAdminListMvpCodes,
  useAdminCreateMvpCode,
  useAdminStats,
  getAdminListUsersQueryKey,
  getAdminListMvpCodesQueryKey,
  getAdminStatsQueryKey,
  type AdminUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetMe } from "@workspace/api-client-react";
import { PresenceAvatar, UserNameLine } from "@/components/UserBadge";
import {
  Loader2,
  ShieldAlert,
  Ban,
  Crown,
  ShieldCheck,
  Plus,
  Copy,
  Check,
  Users,
  KeyRound,
  BarChart3,
  Radio,
} from "lucide-react";

export default function AdminPanel() {
  const { data: me } = useGetMe();
  const role = me?.role;

  if (!me) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (role !== "admin" && role !== "moderator") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">
          Admins only
        </h1>
        <p className="mt-2 text-muted-foreground">
          You don't have access to the admin panel.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-3">
        <Crown className="h-6 w-6 text-amber-500" />
        <h1 className="text-3xl font-bold text-foreground">Admin panel</h1>
      </div>
      <p className="mt-1 text-muted-foreground">
        Moderate users, hand out MVP codes, and keep an eye on the platform.
      </p>

      <Tabs defaultValue="users" className="mt-6">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-admin-users">
            <Users className="mr-1.5 h-4 w-4" /> Users
          </TabsTrigger>
          <TabsTrigger value="codes" data-testid="tab-admin-codes">
            <KeyRound className="mr-1.5 h-4 w-4" /> MVP Codes
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-admin-stats">
            <BarChart3 className="mr-1.5 h-4 w-4" /> Stats
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          <UsersTab isAdmin={role === "admin"} />
        </TabsContent>
        <TabsContent value="codes" className="mt-4">
          <CodesTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useAdminListUsers();
  const [filter, setFilter] = useState("");
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getAdminListUsersQueryKey() });
  const ban = useAdminBanUser({ mutation: { onSuccess: invalidate } });
  const unban = useAdminUnbanUser({ mutation: { onSuccess: invalidate } });
  const setRole = useAdminSetUserRole({ mutation: { onSuccess: invalidate } });

  const users = (data ?? []).filter((u) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      u.username.toLowerCase().includes(f) ||
      u.displayName.toLowerCase().includes(f) ||
      (u.discriminator ?? "").includes(f)
    );
  });

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search users..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        data-testid="input-admin-user-filter"
      />
      {isLoading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No users match.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {users.map((u: AdminUser, i) => (
            <li
              key={u.id}
              className={[
                "flex flex-wrap items-center gap-3 p-4",
                i > 0 ? "border-t border-border" : "",
              ].join(" ")}
              data-testid={`admin-user-${u.username}`}
            >
              <PresenceAvatar
                displayName={u.displayName}
                avatarUrl={u.avatarUrl}
                lastSeenAt={u.lastSeenAt}
                presenceState={u.presenceState}
              />
              <div className="min-w-0 flex-1">
                <UserNameLine
                  displayName={u.displayName}
                  username={u.username}
                  discriminator={u.discriminator}
                  role={u.role}
                  mvpPlan={u.mvpPlan}
                  verified={u.verified}
                />
                {u.currentRoomTag && (
                  <p className="truncate text-[11px] font-medium text-primary">
                    <Radio className="mr-1 inline h-3 w-3" />
                    Active in #{u.currentRoomTag}
                  </p>
                )}
              </div>
              {u.bannedAt && (
                <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                  Banned
                </span>
              )}
              <div className="flex gap-1">
                {isAdmin && u.role !== "admin" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRole.mutate({ id: u.id, data: { role: "admin" } })
                    }
                    data-testid={`button-promote-admin-${u.username}`}
                  >
                    <Crown className="mr-1 h-3.5 w-3.5" /> Admin
                  </Button>
                )}
                {isAdmin && u.role === "user" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setRole.mutate({ id: u.id, data: { role: "moderator" } })
                    }
                    data-testid={`button-promote-mod-${u.username}`}
                  >
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Mod
                  </Button>
                )}
                {isAdmin && u.role !== "user" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setRole.mutate({ id: u.id, data: { role: "user" } })
                    }
                    data-testid={`button-demote-${u.username}`}
                  >
                    Demote
                  </Button>
                )}
                {u.bannedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => unban.mutate({ id: u.id })}
                    data-testid={`button-unban-${u.username}`}
                  >
                    Unban
                  </Button>
                ) : (
                  u.role !== "admin" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => ban.mutate({ id: u.id })}
                      data-testid={`button-ban-${u.username}`}
                    >
                      <Ban className="mr-1 h-3.5 w-3.5" /> Ban
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CodesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useAdminListMvpCodes();
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const create = useAdminCreateMvpCode({
    mutation: {
      onSuccess: () => {
        setNote("");
        qc.invalidateQueries({ queryKey: getAdminListMvpCodesQueryKey() });
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">
          Generate a new MVP code
        </p>
        <div className="mt-2 flex gap-2">
          <Input
            placeholder="Optional note (e.g., for Alex)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="input-mvp-note"
          />
          <Button
            onClick={() =>
              create.mutate({ data: { note: note || null } })
            }
            disabled={create.isPending}
            data-testid="button-generate-mvp"
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Generate
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/70" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No codes yet.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {(data ?? []).map((c, i) => (
            <li
              key={c.code}
              className={[
                "flex flex-wrap items-center gap-3 p-4",
                i > 0 ? "border-t border-border" : "",
              ].join(" ")}
              data-testid={`mvp-code-${c.code}`}
            >
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">
                {c.code}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(c.code);
                  setCopied(c.code);
                  setTimeout(() => setCopied(null), 1500);
                }}
                data-testid={`button-copy-${c.code}`}
              >
                {copied === c.code ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">
                  {c.note ?? "—"}
                </p>
              </div>
              {c.redeemedAt ? (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Redeemed
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Unused
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatsTab() {
  const { data, isLoading } = useAdminStats();
  if (isLoading || !data) {
    return (
      <div className="py-12 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground/70" />
      </div>
    );
  }
  const cards = [
    { label: "Users", value: data.users },
    { label: "Messages", value: data.messages },
    { label: "MVP", value: data.mvp },
    { label: "Banned", value: data.banned },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-border bg-card p-5"
          data-testid={`stat-${c.label.toLowerCase()}`}
        >
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">
            {c.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
