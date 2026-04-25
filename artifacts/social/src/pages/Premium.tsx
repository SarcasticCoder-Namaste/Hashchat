import {
  useGetPremiumStatus,
  useCreatePremiumCheckout,
  useDevConfirmPremium,
  getGetPremiumStatusQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Sparkles, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const PERKS = [
  "Verified blue checkmark on your profile and posts",
  "Unlimited private rooms",
  "Unlimited communities",
  "Priority support",
];

export default function Premium() {
  const status = useGetPremiumStatus();
  const qc = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetPremiumStatusQueryKey() });
    qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const checkout = useCreatePremiumCheckout({
    mutation: {
      onSuccess: (res) => {
        if (res.provider === "stripe" && res.url) {
          window.location.href = res.url;
        } else {
          invalidate();
          toast({
            title: "Premium activated!",
            description: "Welcome to Premium. Enjoy your verified badge.",
          });
        }
      },
      onError: () => toast({ title: "Could not start checkout", variant: "destructive" }),
    },
  });

  const devConfirm = useDevConfirmPremium({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Premium activated (dev mode)" });
      },
      onError: () =>
        toast({ title: "Dev confirm not available", variant: "destructive" }),
    },
  });

  const isActive = status.data?.active ?? false;
  const isVerified = status.data?.verified ?? false;
  const provider = status.data?.provider;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/15 via-card to-pink-500/15 p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            HashChat <span className="brand-gradient-text">Premium</span>
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Get a verified badge, unlimited private rooms and communities, and support the team building HashChat.
          </p>
          {isActive && (
            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-sm font-medium text-sky-600 dark:text-sky-400"
              data-testid="premium-active-badge"
            >
              <BadgeCheck className="h-4 w-4 fill-sky-500/20" />
              {isVerified ? "Verified · Premium active" : "Premium active"}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground">What you get</h2>
        <ul className="mt-4 space-y-2">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-xl bg-gradient-to-br from-violet-500/10 to-pink-500/10 p-4">
          <p className="text-2xl font-bold text-foreground">
            $5<span className="text-base font-medium text-muted-foreground">/month</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cancel anytime. Verified badge applies immediately.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          {isActive ? (
            <Button variant="secondary" disabled className="flex-1">
              <BadgeCheck className="mr-1.5 h-4 w-4" />
              You're a Premium member
            </Button>
          ) : (
            <>
              <Button
                onClick={() => checkout.mutate()}
                disabled={checkout.isPending}
                className="brand-gradient-bg flex-1 text-white"
                data-testid="button-checkout-premium"
              >
                {checkout.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Upgrade to Premium
              </Button>
            </>
          )}
        </div>

        {!isActive && provider === "dev" && (
          <div className="mt-4 rounded-md border border-dashed border-border p-3">
            <p className="text-xs text-muted-foreground">
              Stripe is not configured. Use the dev button to simulate Premium activation locally.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => devConfirm.mutate()}
              disabled={devConfirm.isPending}
              className="mt-2"
              data-testid="button-dev-confirm-premium"
            >
              {devConfirm.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Activate Premium (dev)
            </Button>
          </div>
        )}

        {status.data?.currentPeriodEnd && (
          <p className="mt-4 text-xs text-muted-foreground">
            {status.data.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
            {new Date(status.data.currentPeriodEnd).toLocaleDateString()}.
          </p>
        )}
      </div>
    </div>
  );
}
