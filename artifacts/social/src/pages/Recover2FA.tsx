import { useState } from "react";
import {
  useRequestTwoFactorEmailRecovery,
  useVerifyTwoFactorEmailRecovery,
  useRequestTwoFactorSmsRecovery,
  useVerifyTwoFactorSmsRecovery,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";

type Method = "email" | "sms";

export default function Recover2FA() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [method, setMethod] = useState<Method>("email");
  const [stage, setStage] = useState<"request" | "verify" | "done">("request");

  const onChallengeSuccess = () => {
    setStage("verify");
    toast({
      title: "If that account exists, a code is on the way",
      description:
        method === "sms"
          ? "Check the phone number enrolled for SMS backup."
          : "Check the email enrolled for two-factor backup.",
    });
  };
  const onChallengeError = () =>
    toast({
      title: "Could not request a code right now",
      variant: "destructive",
    });
  const onVerifySuccess = () => {
    setStage("done");
    toast({ title: "Recovered — you can sign in now" });
  };
  const onVerifyError = () =>
    toast({
      title: "Code didn't match or has expired",
      variant: "destructive",
    });

  const emailChallenge = useRequestTwoFactorEmailRecovery({
    mutation: { onSuccess: onChallengeSuccess, onError: onChallengeError },
  });
  const emailVerify = useVerifyTwoFactorEmailRecovery({
    mutation: { onSuccess: onVerifySuccess, onError: onVerifyError },
  });
  const smsChallenge = useRequestTwoFactorSmsRecovery({
    mutation: { onSuccess: onChallengeSuccess, onError: onChallengeError },
  });
  const smsVerify = useVerifyTwoFactorSmsRecovery({
    mutation: { onSuccess: onVerifySuccess, onError: onVerifyError },
  });

  const challenge = method === "sms" ? smsChallenge : emailChallenge;
  const verify = method === "sms" ? smsVerify : emailVerify;

  const Icon = method === "sms" ? MessageSquare : Mail;
  const iconWrapClass =
    method === "sms"
      ? "flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300"
      : "flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div
        className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
        data-testid="recover-2fa-card"
      >
        <div className="flex items-center gap-3">
          <span className={iconWrapClass}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Recover two-factor access
            </h1>
            <p className="text-xs text-muted-foreground">
              Lost your authenticator and backup codes? Use an enrolled backup
              channel to regain access.
            </p>
          </div>
        </div>

        {stage === "request" && (
          <div className="space-y-3">
            <div
              className="flex gap-2 rounded-lg border border-border bg-background p-1"
              data-testid="recover-method-selector"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={method === "email"}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  method === "email"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMethod("email")}
                data-testid="button-recover-method-email"
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={method === "sms"}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  method === "sms"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setMethod("sms")}
                data-testid="button-recover-method-sms"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Text message
              </button>
            </div>
            <label className="block text-xs font-medium text-foreground">
              Username
            </label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your-username"
              autoComplete="username"
              data-testid="input-recover-username"
            />
            <Button
              className="w-full"
              onClick={() =>
                challenge.mutate({
                  data: { username: username.trim().toLowerCase() },
                })
              }
              disabled={challenge.isPending || username.trim().length === 0}
              data-testid="button-request-recovery-code"
            >
              {challenge.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              {method === "sms"
                ? "Text me a recovery code"
                : "Email me a recovery code"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              For your security, we'll always say a code was sent — even if no
              backup of that type is enrolled for that username.
            </p>
          </div>
        )}

        {stage === "verify" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code we sent to the{" "}
              {method === "sms" ? "phone number" : "email"} backup for{" "}
              <span className="font-mono text-foreground">{username}</span>.
              Codes expire after 10 minutes and can only be used once.
            </p>
            <Input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              placeholder="123456"
              className="font-mono"
              data-testid="input-recover-code"
            />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() =>
                  verify.mutate({
                    data: { username: username.trim().toLowerCase(), code },
                  })
                }
                disabled={verify.isPending || code.length !== 6}
                data-testid="button-verify-recovery-code"
              >
                {verify.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Verify and unlock
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStage("request");
                  setCode("");
                }}
              >
                Back
              </Button>
            </div>
          </div>
        )}

        {stage === "done" && (
          <div
            className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4"
            data-testid="recover-2fa-success"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> All set
            </p>
            <p className="text-xs text-muted-foreground">
              Two-factor protection has been temporarily turned off. Sign in
              normally, then re-enroll your authenticator from Settings →
              Security.
            </p>
            <Button asChild className="w-full">
              <a href="/sign-in">Go to sign in</a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
