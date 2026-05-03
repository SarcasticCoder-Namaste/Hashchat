import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useRedeemInvite } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Gift, Loader2, Sparkles, Check } from "lucide-react";

export default function ReferralRedeem({ token }: { token: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redeem = useRedeemInvite({
    mutation: {
      onSuccess: () => {
        setDone(true);
        toast({ title: "Welcome aboard!", description: "Your inviter just earned MVP credit." });
      },
      onError: (err: unknown) => {
        const e = err as { status?: number; data?: { error?: string } };
        if (e?.status === 409) setError("You've already redeemed an invite.");
        else if (e?.status === 404) setError("This invite link is invalid.");
        else if (e?.status === 400) setError(e.data?.error ?? "Invalid invite.");
        else setError("Could not redeem invite.");
      },
    },
  });

  useEffect(() => {
    if (!done && !error && !redeem.isPending) {
      redeem.mutate({ token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-10">
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/10 via-card to-pink-500/10 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Referral invite
            </p>
            <h1 className="text-xl font-bold text-foreground">
              Welcome to HashChat
            </h1>
          </div>
        </div>

        {redeem.isPending && (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Redeeming your invite…
          </div>
        )}

        {done && (
          <div className="mt-6 space-y-3" data-testid="referral-success">
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <Check className="h-4 w-4" />
              You're in. Your friend earned credit toward MVP.
            </div>
            <Button asChild className="brand-gradient-bg w-full text-white">
              <Link href="/app/discover">
                <Sparkles className="mr-1 h-4 w-4" /> Start exploring
              </Link>
            </Button>
          </div>
        )}

        {error && (
          <div className="mt-6 space-y-3" data-testid="referral-error">
            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              {error}
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/app/discover">Continue to HashChat</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
