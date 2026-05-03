import { getUncachableStripeClient } from "./stripeClient";

type TierKey = "premium" | "pro";
type Cadence = "monthly" | "annual";

const PRODUCTS: Record<
  TierKey,
  { name: string; description: string; monthlyCents: number }
> = {
  premium: {
    name: "HashChat Premium",
    description:
      "HashChat Premium: verified badge, unlimited rooms & communities, custom accent color, ad-free For You feed, and larger upload limits.",
    monthlyCents: 499,
  },
  pro: {
    name: "HashChat Pro",
    description:
      "HashChat Pro: everything in Premium plus an animated avatar, banner GIF, larger scheduled-post cap, and a Pro badge variant.",
    monthlyCents: 999,
  },
};

// Annual pricing = 12 * monthly * 0.80 (20% off, rounded to whole cents)
function annualCents(monthlyCents: number): number {
  return Math.round(monthlyCents * 12 * 0.8);
}

function lookupKey(tier: TierKey, cadence: Cadence): string {
  return `hashchat_${tier}_${cadence}`;
}

async function ensureProduct(tier: TierKey): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const meta = PRODUCTS[tier];
  const search = await stripe.products.search({
    query: `name:'${meta.name}' AND active:'true'`,
  });
  if (search.data.length > 0) {
    console.log(`Found existing product ${meta.name}: ${search.data[0].id}`);
    return search.data[0].id;
  }
  const product = await stripe.products.create({
    name: meta.name,
    description: meta.description,
    metadata: { tier },
  });
  console.log(`Created product ${meta.name}: ${product.id}`);
  return product.id;
}

async function ensurePrice(
  productId: string,
  tier: TierKey,
  cadence: Cadence,
): Promise<string> {
  const stripe = await getUncachableStripeClient();
  const key = lookupKey(tier, cadence);
  const monthly = PRODUCTS[tier].monthlyCents;
  const amount = cadence === "monthly" ? monthly : annualCents(monthly);
  const interval = cadence === "monthly" ? "month" : "year";

  const existing = await stripe.prices.list({
    product: productId,
    active: true,
    lookup_keys: [key],
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`  ${key}: ${existing.data[0].id} (existing)`);
    return existing.data[0].id;
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval },
    lookup_key: key,
    nickname: `${PRODUCTS[tier].name} ${cadence}`,
    metadata: { tier, billingPeriod: cadence },
  });
  console.log(
    `  ${key}: ${price.id} ($${(amount / 100).toFixed(2)}/${interval})`,
  );
  return price.id;
}

async function main(): Promise<void> {
  for (const tier of ["premium", "pro"] as const) {
    const productId = await ensureProduct(tier);
    for (const cadence of ["monthly", "annual"] as const) {
      await ensurePrice(productId, tier, cadence);
    }
  }
  console.log("\nDone. Lookup keys:");
  for (const tier of ["premium", "pro"] as const) {
    for (const cadence of ["monthly", "annual"] as const) {
      console.log(`  - ${lookupKey(tier, cadence)}`);
    }
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
