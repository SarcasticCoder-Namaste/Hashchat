import { useState } from "react";
import {
  useGetPremiumStatus,
  useCreatePremiumCheckout,
  useCreatePremiumPortalSession,
  useDevConfirmPremium,
  getGetPremiumStatusQueryKey,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Sparkles, Check, Loader2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Tier = "premium" | "pro";
type Cadence = "monthly" | "annual";

const TIERS: {
  id: Tier;
  name: string;
  tagline: string;
  monthly: number;
  perks: string[];
  highlight: boolean;
}[] = [
  {
    id: "premium",
    name: "Premium",
    tagline: "Stand out and skip the ads.",
    monthly: 4.99,
    perks: [
      "Verified blue checkmark",
      "Unlimited private rooms & communities",
      "Custom accent color",
      "Ad-free For You feed",
      "Larger uploads — up to 25MB per file",
      "Schedule up to 20 posts at once",
    ],
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Everything in Premium, plus power-user perks.",
    monthly: 9.99,
    perks: [
      "Everything in Premium",
      "Animated avatar (GIF/WebP)",
      "Banner GIF",
      "Pro badge variant",
      "Even larger uploads — up to 100MB per file",
      "Schedule up to 50 posts at once",
    ],
    highlight: true,
  },
];

function priceFor(monthly: number, cadence: Cadence): {
  display: string;
  caption: string;
} {
  if (cadence === "monthly") {
    return {
      display: `$${monthly.toFixed(2)}`,
      caption: "per month",
    };
  }
  // 20% off annual.
  const annual = monthly * 12 * 0.8;
  return {
    display: `$${annual.toFixed(2)}`,
    caption: "per year (save 20%)",
  };
}

export default function Premium() {
  const status = useGetPremiumStatus();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [cadence, setCadence] = useState<Cadence>("monthly");

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
            title: "Subscription activated!",
            description: "Welcome — your perks are live.",
          });
        }
      },
      onError: () =>
        toast({ title: "Could not start checkout", variant: "destructive" }),
    },
  });

  const portal = useCreatePremiumPortalSession({
    mutation: {
      onSuccess: (res) => {
        if (res.url) window.location.href = res.url;
      },
      onError: () =>
        toast({ title: "Could not open billing portal", variant: "destructive" }),
    },
  });

  const devConfirm = useDevConfirmPremium({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Subscription activated (dev mode)" });
      },
      onError: () =>
        toast({ title: "Dev confirm not available", variant: "destructive" }),
    },
  });

  const isActive = status.data?.active ?? false;
  const currentTier = (status.data?.tier as Tier | "free" | undefined) ?? "free";
  const currentCadence = status.data?.billingPeriod ?? null;
  const provider = status.data?.provider;

  const onChoose = (tier: Tier) => {
    if (provider === "dev") {
      devConfirm.mutate({ data: { tier, billingPeriod: cadence } });
    } else {
      checkout.mutate({ data: { tier, billingPeriod: cadence } });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8 md:py-10">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-500/15 via-card to-pink-500/15 p-8">
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            Upgrade your <span className="brand-gradient-text">HashChat</span>
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            Pick the plan that fits — Premium for everyday perks, Pro for the
            full experience. Annual saves 20%.
          </p>
          {isActive && (
            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-sm font-medium text-sky-600 dark:text-sky-400"
              data-testid="premium-active-badge"
            >
              <BadgeCheck className="h-4 w-4 fill-sky-500/20" />
              You're on{" "}
              {currentTier === "pro" ? "Pro" : currentTier === "premium" ? "Premium" : "Free"}
              {currentCadence ? ` · ${currentCadence}` : ""}
            </div>
          )}
        </div>
      </div>

      <div
        className="mx-auto inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-sm"
        role="tablist"
        aria-label="Billing period"
      >
        {(["monthly", "annual"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={cadence === c}
            onClick={() => setCadence(c)}
            data-testid={`cadence-${c}`}
            className={[
              "rounded-full px-4 py-1.5 font-medium transition-colors",
              cadence === c
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {c === "monthly" ? "Monthly" : "Annual · save 20%"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((t) => {
          const price = priceFor(t.monthly, cadence);
          const isCurrent = currentTier === t.id;
          const ctaLabel = isCurrent
            ? "Current plan"
            : currentTier === "pro" && t.id === "premium"
              ? "Switch to Premium"
              : currentTier === "premium" && t.id === "pro"
                ? "Upgrade to Pro"
                : `Choose ${t.name}`;
          const pending = checkout.isPending || devConfirm.isPending;
          return (
            <div
              key={t.id}
              data-testid={`tier-card-${t.id}`}
              className={[
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm",
                t.highlight
                  ? "border-violet-500/60 ring-2 ring-violet-500/30"
                  : "border-border",
              ].join(" ")}
            >
              {t.highlight && (
                <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Crown className="h-3 w-3" /> Best value
                </span>
              )}
              <h3 className="text-xl font-semibold text-foreground">{t.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>
              <div className="mt-4">
                <p className="text-3xl font-bold text-foreground">
                  {price.display}
                </p>
                <p className="text-xs text-muted-foreground">{price.caption}</p>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {t.perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => onChoose(t.id)}
                disabled={isCurrent || pending}
                className={
                  t.highlight
                    ? "brand-gradient-bg mt-6 w-full text-white"
                    : "mt-6 w-full"
                }
                variant={t.highlight || isCurrent ? "default" : "outline"}
                data-testid={`button-choose-${t.id}`}
              >
                {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {ctaLabel}
              </Button>
            </div>
          );
        })}
      </div>

      {isActive && provider === "stripe" && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Manage your subscription
              </h3>
              <p className="text-sm text-muted-foreground">
                Update billing, change plan, or cancel anytime in the Stripe portal.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => portal.mutate()}
              disabled={portal.isPending}
              data-testid="button-manage-billing"
            >
              {portal.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Manage in portal
            </Button>
          </div>
        </div>
      )}

      {provider === "dev" && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            Stripe is not connected in this environment, so the buttons above
            simulate a successful checkout for local development.
          </p>
        </div>
      )}

      {status.data?.currentPeriodEnd && (
        <p className="text-center text-xs text-muted-foreground">
          {status.data.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
          {new Date(status.data.currentPeriodEnd).toLocaleDateString()}.
        </p>
      )}
    </div>
  );
}
