import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMyTwoFactor,
  useSetupMyTwoFactor,
  useEnableMyTwoFactor,
  useDisableMyTwoFactor,
  useListMySessions,
  useRevokeMySession,
  getGetMyTwoFactorQueryKey,
  getListMySessionsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Smartphone,
  KeyRound,
  Loader2,
  Trash2,
  CheckCircle2,
} from "lucide-react";

export function SecurityPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const status = useGetMyTwoFactor({
    query: { queryKey: getGetMyTwoFactorQueryKey() },
  });
  const sessions = useListMySessions({
    query: {
      queryKey: getListMySessionsQueryKey(),
      refetchInterval: 30_000,
    },
  });

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupOtpauthUrl, setSetupOtpauthUrl] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const setup = useSetupMyTwoFactor({
    mutation: {
      onSuccess: (r) => {
        setSetupSecret(r.secret);
        setSetupOtpauthUrl(r.otpauthUrl);
      },
      onError: () => toast({ title: "Could not start setup", variant: "destructive" }),
    },
  });
  const enable = useEnableMyTwoFactor({
    mutation: {
      onSuccess: (r) => {
        setBackupCodes(r.backupCodes);
        setSetupSecret(null);
        setSetupOtpauthUrl(null);
        setEnrollCode("");
        qc.invalidateQueries({ queryKey: getGetMyTwoFactorQueryKey() });
        toast({ title: "Two-factor enabled" });
      },
      onError: () =>
        toast({ title: "Code didn't match — try again", variant: "destructive" }),
    },
  });
  const disable = useDisableMyTwoFactor({
    mutation: {
      onSuccess: () => {
        setDisableCode("");
        setBackupCodes(null);
        qc.invalidateQueries({ queryKey: getGetMyTwoFactorQueryKey() });
        toast({ title: "Two-factor disabled" });
      },
      onError: () =>
        toast({ title: "Code didn't match", variant: "destructive" }),
    },
  });
  const revoke = useRevokeMySession({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListMySessionsQueryKey() });
        toast({ title: "Session revoked" });
      },
      onError: () =>
        toast({ title: "Could not revoke", variant: "destructive" }),
    },
  });

  const enabled = !!status.data?.enabled;
  const remaining = status.data?.backupCodesRemaining ?? 0;

  return (
    <div className="space-y-5">
      <div
        className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
        data-testid="security-2fa-card"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-foreground">
              Two-factor authentication
            </h3>
            <p className="text-xs text-muted-foreground">
              Protect your account with a one-time code from your authenticator
              app (Google Authenticator, 1Password, Authy, etc.).
            </p>
          </div>
          {enabled ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
              data-testid="2fa-status-on"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> On
            </span>
          ) : (
            <span
              className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
              data-testid="2fa-status-off"
            >
              Off
            </span>
          )}
        </div>

        {!enabled && !setupSecret && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setup.mutate()}
            disabled={setup.isPending}
            data-testid="button-setup-2fa"
          >
            {setup.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Set up two-factor
          </Button>
        )}

        {setupSecret && setupOtpauthUrl && (
          <div className="space-y-3 rounded-lg border border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">
              Scan or paste this secret into your authenticator app, then enter
              the 6-digit code below.
            </p>
            <div className="rounded-md bg-muted px-2 py-1.5">
              <code
                className="break-all text-xs text-foreground"
                data-testid="2fa-secret"
              >
                {setupSecret}
              </code>
            </div>
            <div className="rounded-md bg-muted px-2 py-1.5">
              <code className="break-all text-[11px] text-muted-foreground">
                {setupOtpauthUrl}
              </code>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={enrollCode}
                onChange={(e) =>
                  setEnrollCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
                inputMode="numeric"
                className="w-32 font-mono"
                data-testid="input-2fa-enroll-code"
              />
              <Button
                size="sm"
                onClick={() =>
                  enable.mutate({ data: { code: enrollCode } })
                }
                disabled={enrollCode.length !== 6 || enable.isPending}
                data-testid="button-enable-2fa"
              >
                {enable.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Verify & enable
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSetupSecret(null);
                  setSetupOtpauthUrl(null);
                  setEnrollCode("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {backupCodes && (
          <div
            className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
            data-testid="2fa-backup-codes"
          >
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              Save these backup codes
            </p>
            <p className="text-[11px] text-muted-foreground">
              Each code works once. Store them somewhere safe — they're the only
              way to disable 2FA if you lose your authenticator.
            </p>
            <ul className="grid grid-cols-2 gap-1 font-mono text-xs">
              {backupCodes.map((c) => (
                <li
                  key={c}
                  className="rounded bg-background px-2 py-1 text-foreground"
                >
                  {c}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setBackupCodes(null)}
            >
              I've saved them
            </Button>
          </div>
        )}

        {enabled && !backupCodes && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">
              Backup codes remaining: <strong>{remaining}</strong>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={disableCode}
                onChange={(e) =>
                  setDisableCode(
                    e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 12),
                  )
                }
                placeholder="6-digit code or backup"
                className="w-48 font-mono"
                data-testid="input-2fa-disable-code"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  disable.mutate({ data: { code: disableCode } })
                }
                disabled={disableCode.length < 6 || disable.isPending}
                data-testid="button-disable-2fa"
              >
                {disable.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Turn off
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
        data-testid="security-sessions-card"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Active sessions
            </h3>
            <p className="text-xs text-muted-foreground">
              Devices that have accessed your account recently. Revoke anything
              you don't recognize.
            </p>
          </div>
        </div>
        {sessions.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sessions…
          </div>
        ) : (sessions.data?.length ?? 0) === 0 ? (
          <p className="text-xs text-muted-foreground">No sessions found.</p>
        ) : (
          <ul className="space-y-2" data-testid="sessions-list">
            {sessions.data!.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-3"
                data-testid={`session-${s.id}`}
              >
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {s.deviceLabel}
                    {s.current && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Current
                      </span>
                    )}
                    {s.revokedAt && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Revoked
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Last seen {new Date(s.lastSeenAt).toLocaleString()}
                    {s.ipRegion ? ` · ${s.ipRegion}` : ""}
                  </p>
                </div>
                {!s.current && !s.revokedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revoke.mutate({ id: s.id })}
                    disabled={revoke.isPending}
                    data-testid={`button-revoke-session-${s.id}`}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
