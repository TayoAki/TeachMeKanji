import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { grantCredits, PLANS } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, route } from "@/lib/server";
import { stripe } from "@/lib/stripe";

const { subscription } = schema;

async function setPlan(userId: string, patch: Partial<typeof subscription.$inferInsert>) {
  await db()
    .insert(subscription)
    .values({ userId, plan: "free", status: "active", ...patch })
    .onConflictDoUpdate({ target: subscription.userId, set: patch });
}

async function userForCustomer(customerId: string): Promise<string | null> {
  const [row] = await db()
    .select()
    .from(subscription)
    .where(eq(subscription.stripeCustomerId, customerId));
  return row?.userId ?? null;
}

/** Stripe webhooks: signature-verified, and idempotent (credit grants keyed by invoice id). */
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
      const userId = session.client_reference_id ?? session.metadata?.userId;
      if (userId) {
        await setPlan(userId, {
          plan: "pro",
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
      const customer =
        typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      const userId = customer ? await userForCustomer(customer) : null;
      if (userId) {
        await grantCredits(
          db(),
          userId,
          PLANS.pro.monthlyCredits,
          "monthly",
          `invoice:${invoice.id}`,
          "Pro monthly credits",
        );
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        if (periodEnd)
          await setPlan(userId, {
            currentPeriodEnd: new Date(periodEnd * 1000),
            status: "active",
            plan: "pro",
          });
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
        await setPlan(userId, { plan: active ? "pro" : "free", status: sub.status });
      }
      break;
    }
  }
  return NextResponse.json({ received: true });
});
