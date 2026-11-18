import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantCredits, isPlanId, PLANS, type PaidPlanId } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, route } from "@/lib/server";
import { planForPrice, stripe, STRIPE_APP_TAG } from "@/lib/stripe";

const { subscription, payment } = schema;

async function setPlan(userId: string, patch: Partial<typeof subscription.$inferInsert>) {
  await db()
    .insert(subscription)
    .values({ userId, plan: "free", status: "active", ...patch })
    .onConflictDoUpdate({ target: subscription.userId, set: patch });
}

/**
 * A paid plan from a Stripe price. Metadata (the plan chosen at checkout) is trusted only for
 * checkout.session.completed: later events must carry a price this server sells, so switching
 * to some other price in the portal can't keep a higher plan.
 */
function paidPlan(priceId: string | null | undefined, metadata?: Record<string, string> | null) {
  const plan = planForPrice(priceId) ?? metadata?.plan;
  return isPlanId(plan) && plan !== "free" ? (plan as PaidPlanId) : null;
}

async function userForCustomer(customerId: string): Promise<string | null> {
  const [row] = await db()
    .select()
    .from(subscription)
    .where(eq(subscription.stripeCustomerId, customerId));
  return row?.userId ?? null;
}

/**
 * Stripe webhooks: signature-verified, and idempotent (credit grants keyed by invoice id). The
 * Stripe account may be shared with other products, so only App Builder's events act: checkout
 * sessions tagged STRIPE_APP_TAG, invoices for a price this server sells, and subscriptions of
 * customers it knows. Everything else is acknowledged and ignored (never retried).
 */
export const POST = route(async (request: Request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(501, "Billing isn't configured.");
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new HttpError(400, "Missing signature.");
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    throw new HttpError(400, "Invalid signature.");
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      // Another product's checkout on a shared Stripe account: not ours.
      if (session.metadata?.app !== STRIPE_APP_TAG.app) break;
      const userId = session.client_reference_id ?? session.metadata?.userId;
      const plan = paidPlan(null, session.metadata);
      if (userId && plan) {
        await setPlan(userId, {
          plan,
          status: "active",
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : session.customer?.id,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id,
        });
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object;
      const line = invoice.lines?.data?.[0];
      const price = line?.pricing?.price_details?.price;
      // Only a price this server sells decides the plan (never metadata from an old checkout).
      // Any other price is another product's invoice, or a price we no longer sell: acknowledge
      // it, since retrying won't help.
      const plan = paidPlan(typeof price === "string" ? price : price?.id);
      if (!plan) break;
      const customer =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      // Stripe doesn't order events: this can arrive before checkout.session.completed, so
      // find the user from the subscription's metadata first.
      const fromMetadata = invoice.parent?.subscription_details?.metadata?.userId;
      const userId = fromMetadata ?? (customer ? await userForCustomer(customer) : null);
      if (!userId) {
        // Our price but not a subscriber we know yet: a 5xx makes Stripe retry later instead of
        // dropping the grant.
        throw new HttpError(503, "Subscriber not known yet.");
      }
      const periodEnd = line?.period?.end;
      await setPlan(userId, {
        plan,
        status: "active",
        ...(customer ? { stripeCustomerId: customer } : {}),
        ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
      });
      // What was collected, for the operator's revenue figures: every paid invoice for our
      // prices (first, renewal, proration), once per invoice id.
      if (invoice.id) {
        const paidAt = invoice.status_transitions?.paid_at;
        await db()
          .insert(payment)
          .values({
            id: invoice.id,
            userId,
            plan,
            amountCents: invoice.amount_paid ?? 0,
            currency: invoice.currency || "usd",
            billingReason: invoice.billing_reason ?? null,
            ...(paidAt ? { paidAt: new Date(paidAt * 1000) } : {}),
          })
          .onConflictDoNothing();
      }
      // Monthly credits only for the first invoice and renewals (not prorations or manual
      // invoices); the invoice id makes the grant idempotent.
      if (
        PLANS[plan].monthlyCredits > 0 &&
        (invoice.billing_reason === "subscription_create" ||
          invoice.billing_reason === "subscription_cycle")
      ) {
        await grantCredits(
          db(),
          userId,
          PLANS[plan].monthlyCredits,
          "monthly",
          `invoice:${invoice.id}`,
          `${PLANS[plan].name} monthly credits`,
        );
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await userForCustomer(customer);
      if (userId) {
        const active =
          event.type === "customer.subscription.updated" &&
          ["active", "trialing"].includes(sub.status);
        // Follows upgrades and downgrades made in the customer portal (a new price).
        const plan = paidPlan(sub.items?.data?.[0]?.price?.id);
        if (!active) await setPlan(userId, { plan: "free", status: sub.status });
        // An unknown price shouldn't downgrade a paying user: keep their plan, update the status.
        else await setPlan(userId, plan ? { plan, status: sub.status } : { status: sub.status });
      }
      break;
    }
  }
  return NextResponse.json({ received: true });
});
