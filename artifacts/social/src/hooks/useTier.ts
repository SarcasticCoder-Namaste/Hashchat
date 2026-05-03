import { useGetMe } from "@workspace/api-client-react";

export type Tier = "free" | "premium" | "pro";

/**
 * Reads the signed-in user's subscription tier. Falls back to "free" while
 * loading or if the user query has not resolved yet so callers can gate
 * features without flickering between states.
 */
export function useTier(): {
  tier: Tier;
  isPremium: boolean;
  isPro: boolean;
} {
  const { data } = useGetMe();
  const tier = ((data?.tier as Tier | undefined) ?? "free") as Tier;
  return {
    tier,
    isPremium: tier === "premium" || tier === "pro",
    isPro: tier === "pro",
  };
}
