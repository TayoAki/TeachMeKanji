#!/usr/bin/env node
/**
 * Create (or find) App Builder's three paid plans in Stripe and print the price ids to put in
 * STRIPE_PRICE_BUILDER / _STUDIO / _PRO. Run it once with a test key, and again with the live key
 * when you switch: test and live prices have different ids.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
 *
 * Idempotent: products are found by metadata app_builder_plan, and an active monthly USD price
 * with the right amount is reused. Prints no secrets.
 */
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (sk_test_… or sk_live_…).");
  process.exit(1);
}
const PLANS = [
  { id: "builder", name: "App Builder — Builder", cents: 2500 },
  { id: "studio", name: "App Builder — Studio", cents: 4900 },
  { id: "pro", name: "App Builder — Pro", cents: 9900 },
];

async function stripe(method, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = `https://api.stripe.com/v1/${path}${method === "GET" && body ? `?${body}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${json.error?.message ?? res.status}`);
  return json;
}

const mode = key.startsWith("sk_live_") ? "LIVE" : "test";
console.log(`Stripe ${mode} mode`);
const out = {};
for (const plan of PLANS) {
  const found = await stripe("GET", "products/search", {
    query: `metadata['app_builder_plan']:'${plan.id}' AND active:'true'`,
  });
  const product =
    found.data[0] ??
    (await stripe("POST", "products", {
      name: plan.name,
      "metadata[app_builder_plan]": plan.id,
    }));
  const prices = await stripe("GET", "prices", {
    product: product.id,
    active: "true",
    limit: "100",
  });
  const price =
    prices.data.find(
      (p) =>
        p.currency === "usd" &&
        p.unit_amount === plan.cents &&
        p.recurring?.interval === "month" &&
        p.recurring?.interval_count === 1,
    ) ??
    (await stripe("POST", "prices", {
      product: product.id,
      currency: "usd",
      unit_amount: String(plan.cents),
      "recurring[interval]": "month",
      "metadata[app_builder_plan]": plan.id,
    }));
  out[`STRIPE_PRICE_${plan.id.toUpperCase()}`] = price.id;
}
for (const [name, value] of Object.entries(out)) console.log(`${name}=${value}`);
console.log(
  "\nThen add a webhook endpoint https://<your web domain>/api/stripe/webhook for checkout.session.completed, invoice.paid, customer.subscription.updated and customer.subscription.deleted, and put its signing secret in STRIPE_WEBHOOK_SECRET.",
);
