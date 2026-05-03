import { getUncachableStripeClient } from "./stripeClient";

const PRODUCT_NAME = "HashChat Pro";
const PRICE_AMOUNT_CENTS = 499; // $4.99
const PRICE_LOOKUP_KEY = "hashchat_pro_monthly";

async function main(): Promise<void> {
  const stripe = await getUncachableStripeClient();

  console.log(`Looking up existing "${PRODUCT_NAME}" product...`);
  const search = await stripe.products.search({
    query: `name:'${PRODUCT_NAME}' AND active:'true'`,
  });

  let productId: string;
  if (search.data.length > 0) {
    productId = search.data[0].id;
    console.log(`Found existing product: ${productId}`);
  } else {
    const product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "HashChat Pro: verified badge, unlimited rooms & communities, larger uploads, priority support.",
      metadata: { tier: "pro" },
    });
    productId = product.id;
    console.log(`Created product: ${productId}`);
  }

  // Look up existing monthly price by lookup_key.
  const existingPrices = await stripe.prices.list({
    product: productId,
    active: true,
    lookup_keys: [PRICE_LOOKUP_KEY],
    limit: 1,
  });

  let priceId: string;
  if (existingPrices.data.length > 0) {
    priceId = existingPrices.data[0].id;
    console.log(`Found existing monthly price: ${priceId}`);
  } else {
    const price = await stripe.prices.create({
      product: productId,
      unit_amount: PRICE_AMOUNT_CENTS,
      currency: "usd",
      recurring: { interval: "month" },
      lookup_key: PRICE_LOOKUP_KEY,
      nickname: "HashChat Pro Monthly",
    });
    priceId = price.id;
    console.log(`Created monthly price: ${priceId} ($${(PRICE_AMOUNT_CENTS / 100).toFixed(2)}/mo)`);
  }

  console.log("");
  console.log("Done.");
  console.log(`Product ID: ${productId}`);
  console.log(`Price ID:   ${priceId}`);
  console.log(`Lookup key: ${PRICE_LOOKUP_KEY}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
