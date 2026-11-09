import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import { E2E_STRIPE_KEY, E2E_STRIPE_PRICES, E2E_STRIPE_WEBHOOK_SECRET } from "./env";

/**
 * The Stripe webhook, with real signature verification: events are signed with the webhook
 * secret exactly as Stripe signs them. (Checkout itself needs a Stripe account.)
 */

const stripe = new Stripe(E2E_STRIPE_KEY);

function eventId() {
  return `evt_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

async function send(
  request: APIRequestContext,
  type: string,
  object: Record<string, unknown>,
  options: { id?: string; secret?: string } = {},
) {
  const payload = JSON.stringify({
    id: options.id ?? eventId(),
    object: "event",
    type,
    data: { object },
  });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? E2E_STRIPE_WEBHOOK_SECRET,
  });
  return request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "content-type": "application/json", "stripe-signature": signature },
  });
}

async function account(page: Page) {
  const me = (await (await page.request.get("/api/me")).json()) as {
    user: { id: string };
    plan: string;
    credits: number;
  };
  return { userId: me.user.id, plan: me.plan, credits: me.credits };
}

test("Stripe webhook: verified, ordered either way, and idempotent", async ({ page, request }) => {
  const email = `billing-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Billing");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("100");
  const { userId } = await account(page);
  const customer = `cus_e2e_${Date.now()}`;
  const subscription = `sub_e2e_${Date.now()}`;

  // Unsigned and wrongly signed requests are rejected.
  const unsigned = await request.post("/api/stripe/webhook", { data: "{}" });
  expect(unsigned.status()).toBe(400);
  const forged = await send(request, "invoice.paid", {}, { secret: "whsec_not_the_secret" });
  expect(forged.status()).toBe(400);

  // The first invoice can arrive before checkout completes: the user comes from the
  // subscription's metadata, and the plan and monthly credits are granted.
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
  const line = (price: string) => ({
    lines: { data: [{ period: { end: periodEnd }, pricing: { price_details: { price } } }] },
  });
  const firstInvoice = {
    id: `in_e2e_${Date.now()}`,
    object: "invoice",
    customer,
    billing_reason: "subscription_create",
    parent: { subscription_details: { metadata: { userId }, subscription } },
    ...line(E2E_STRIPE_PRICES.pro),
  };
  const eventIdFirst = eventId();
  expect((await send(request, "invoice.paid", firstInvoice, { id: eventIdFirst })).status()).toBe(
    200,
  );
  expect(await account(page)).toMatchObject({ plan: "pro", credits: 250 });

  // Stripe retries deliveries: the same invoice never grants twice.
  expect((await send(request, "invoice.paid", firstInvoice, { id: eventIdFirst })).status()).toBe(
    200,
  );
  expect((await send(request, "invoice.paid", firstInvoice)).status()).toBe(200);
  expect((await account(page)).credits).toBe(250);

  // Checkout completion links the Stripe customer to the user.
  const checkout = await send(request, "checkout.session.completed", {
    id: `cs_e2e_${Date.now()}`,
    object: "checkout.session",
    client_reference_id: userId,
    customer,
    subscription,
  });
  expect(checkout.status()).toBe(200);

  // A proration invoice keeps the plan but grants nothing.
  const proration = { ...firstInvoice, id: `in_e2e_upd_${Date.now()}`, parent: null };
  proration.billing_reason = "subscription_update";
  expect((await send(request, "invoice.paid", proration)).status()).toBe(200);
  expect((await account(page)).credits).toBe(250);

  // A renewal is matched by customer and grants the next month's credits.
  const renewal = {
    ...firstInvoice,
    id: `in_e2e_cycle_${Date.now()}`,
    billing_reason: "subscription_cycle",
    parent: null,
  };
  expect((await send(request, "invoice.paid", renewal)).status()).toBe(200);
  expect(await account(page)).toMatchObject({ plan: "pro", credits: 400 });

  // An invoice for a customer we don't know yet asks Stripe to retry later.
  const unknown = await send(request, "invoice.paid", {
    ...renewal,
    id: `in_e2e_unknown_${Date.now()}`,
    customer: `cus_unknown_${Date.now()}`,
  });
  expect(unknown.status()).toBe(503);

  // Switching to Studio in the customer portal: the new price decides the plan, and a Studio
  // renewal grants no credits (Studio users bring their own AI).
  const switched = await send(request, "customer.subscription.updated", {
    id: subscription,
    object: "subscription",
    customer,
    status: "active",
    metadata: { userId, plan: "pro" },
    items: { data: [{ price: { id: E2E_STRIPE_PRICES.studio } }] },
  });
  expect(switched.status()).toBe(200);
  expect((await account(page)).plan).toBe("studio");
  const studioRenewal = {
    ...renewal,
    id: `in_e2e_studio_${Date.now()}`,
    ...line(E2E_STRIPE_PRICES.studio),
  };
  expect((await send(request, "invoice.paid", studioRenewal)).status()).toBe(200);
  expect(await account(page)).toMatchObject({ plan: "studio", credits: 400 });

  // A price this server doesn't sell can't keep or raise a plan, whatever the old checkout's
  // metadata says: the plan stays, and nothing is granted.
  const unknownPrice = await send(request, "customer.subscription.updated", {
    id: subscription,
    object: "subscription",
    customer,
    status: "active",
    metadata: { userId, plan: "pro" },
    items: { data: [{ price: { id: "price_not_sold_here" } }] },
  });
  expect(unknownPrice.status()).toBe(200);
  const strayInvoice = {
    ...renewal,
    id: `in_e2e_stray_${Date.now()}`,
    parent: { subscription_details: { metadata: { userId, plan: "pro" }, subscription } },
    ...line("price_not_sold_here"),
  };
  expect((await send(request, "invoice.paid", strayInvoice)).status()).toBe(200);
  expect(await account(page)).toMatchObject({ plan: "studio", credits: 400 });

  // Cancelling the subscription returns the user to Free; credits already granted stay.
  const cancelled = await send(request, "customer.subscription.deleted", {
    id: subscription,
    object: "subscription",
    customer,
    status: "canceled",
  });
  expect(cancelled.status()).toBe(200);
  expect(await account(page)).toMatchObject({ plan: "free", credits: 400 });
});
