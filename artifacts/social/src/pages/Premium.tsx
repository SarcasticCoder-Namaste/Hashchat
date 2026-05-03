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
import { useTranslation } from "@/lib/i18n";

type Tier = "premium" | "pro";
type Cadence = "monthly" | "annual";

const TIERS: {
  id: Tier;
  nameKey: string;
  taglineKey: string;
  monthly: number;
  perkKeys: string[];
  highlight: boolean;
}[] = [
  {
    id: "premium",
    nameKey: "premium.tierPremium",
    taglineKey: "premium.tagPremium",
    monthly: 4.99,
    perkKeys: [
      "premium.perkVerified",
      "premium.perkUnlimitedRooms",
      "premium.perkAccent",
      "premium.perkAdFree",
      "premium.perkUploads",
      "premium.perkSchedule20",
    ],
    highlight: false,
  },
  {
    id: "pro",
    nameKey: "premium.tierPro",
    taglineKey: "premium.tagPro",
    monthly: 9.99,
    perkKeys: [
      "premium.perkEverything",
      "premium.perkAnimAvatar",
      "premium.perkBannerGif",
      "premium.perkProBadge",
      "premium.perkUploadsPro",
      "premium.perkScheduled",
    ],
    highlight: true,
  },
];

export default function Premium() {
  const { t } = useTranslation();
  const priceFor = (monthly: number, cadence: Cadence) => {
    if (cadence === "monthly") {
      return { display: `$${monthly.toFixed(2)}`, caption: t("premium.perMonth") };
    }
    const annual = monthly * 12 * 0.8;
    return { display: `$${annual.toFixed(2)}`, caption: t("premium.perYearSave") };
  };
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
            title: t("premium.activated"),
            description: t("premium.activatedDesc"),
          });
        }
      },
      onError: () =>
        toast({ title: t("premium.checkoutFailed"), variant: "destructive" }),
    },
  });

  const portal = useCreatePremiumPortalSession({
    mutation: {
      onSuccess: (res) => {
        if (res.url) window.location.href = res.url;
      },
      onError: () =>
        toast({ title: t("premium.portalFailed"), variant: "destructive" }),
    },
  });

  const devConfirm = useDevConfirmPremium({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: t("premium.devActivated") });
      },
      onError: () =>
        toast({ title: t("premium.devUnavailable"), variant: "destructive" }),
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
            {t("premium.title")} <span className="brand-gradient-text">HashChat</span>
          </h1>
          <p className="mt-2 max-w-lg text-muted-foreground">
            {t("premium.subtitle")}
          </p>
          {isActive && (
            <div
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-500/15 px-3 py-1 text-sm font-medium text-sky-600 dark:text-sky-400"
              data-testid="premium-active-badge"
            >
              <BadgeCheck className="h-4 w-4 fill-sky-500/20" />
              {t("premium.activeOn")}{" "}
              {currentTier === "pro" ? t("premium.tierPro") : currentTier === "premium" ? t("premium.tierPremium") : t("premium.tierFree")}
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
            {c === "monthly" ? t("premium.cadenceMonthly") : t("premium.cadenceAnnual")}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {TIERS.map((tier) => {
          const tierName = t(tier.nameKey);
          const price = priceFor(tier.monthly, cadence);
          const isCurrent = currentTier === tier.id;
          const ctaLabel = isCurrent
            ? t("premium.currentPlan")
            : currentTier === "pro" && tier.id === "premium"
              ? t("premium.switchToPremium")
              : currentTier === "premium" && tier.id === "pro"
                ? t("premium.upgradeToPro")
                : t("premium.choose", { tier: tierName });
          const pending = checkout.isPending || devConfirm.isPending;
          return (
            <div
              key={tier.id}
              data-testid={`tier-card-${tier.id}`}
              className={[
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm",
                tier.highlight
                  ? "border-violet-500/60 ring-2 ring-violet-500/30"
                  : "border-border",
              ].join(" ")}
            >
              {tier.highlight && (
                <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-violet-500 to-pink-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Crown className="h-3 w-3" /> {t("premium.bestValue")}
                </span>
              )}
              <h3 className="text-xl font-semibold text-foreground">{tierName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(tier.taglineKey)}</p>
              <div className="mt-4">
                <p className="text-3xl font-bold text-foreground">
                  {price.display}
                </p>
                <p className="text-xs text-muted-foreground">{price.caption}</p>
              </div>
              <ul className="mt-5 flex-1 space-y-2">
                {tier.perkKeys.map((perkKey) => (
                  <li
                    key={perkKey}
                    className="flex items-start gap-2 text-sm text-foreground"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                    <span>{t(perkKey)}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => onChoose(tier.id)}
                disabled={isCurrent || pending}
                className={
                  tier.highlight
                    ? "brand-gradient-bg mt-6 w-full text-white"
                    : "mt-6 w-full"
                }
                variant={tier.highlight || isCurrent ? "default" : "outline"}
                data-testid={`button-choose-${tier.id}`}
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
                {t("premium.manageTitle")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t("premium.manageSubtitle")}
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
              {t("premium.manageButton")}
            </Button>
          </div>
        </div>
      )}

      {provider === "dev" && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {t("premium.devNote")}
          </p>
        </div>
      )}

      {status.data?.currentPeriodEnd && (
        <p className="text-center text-xs text-muted-foreground">
          {t("premium.renewsOn", {
            action: status.data.cancelAtPeriodEnd ? t("premium.cancels") : t("premium.renews"),
            date: new Date(status.data.currentPeriodEnd).toLocaleDateString(),
          })}
        </p>
      )}
    </div>
  );
}
