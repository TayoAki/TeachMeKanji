import "server-only";
import Stripe from "stripe";
import { PAID_PLANS, type PaidPlanId } from "@appbuilder/core";
import { HttpError } from "./server";

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new HttpError(501, "Billing isn't configured on this server.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

/** The Stripe price (monthly) for each paid plan: STRIPE_PRICE_BUILDER, _STUDIO, _PRO. */
export function priceForPlan(plan: PaidPlanId): string | null {
  const prices: Record<PaidPlanId, string | undefined> = {
    builder: process.env.STRIPE_PRICE_BUILDER,
    studio: process.env.STRIPE_PRICE_STUDIO,
    pro: process.env.STRIPE_PRICE_PRO,
  };
  return prices[plan] || null;
}

/** Which plan a Stripe price belongs to, so portal upgrades and downgrades are followed. */
export function planForPrice(priceId: string | null | undefined): PaidPlanId | null {
  if (!priceId) return null;
  return PAID_PLANS.find((plan) => priceForPlan(plan) === priceId) ?? null;
}

/** Which plans can be bought on this server. */
export function billingAvailability(): Record<PaidPlanId, boolean> {
  const keyed = Boolean(process.env.STRIPE_SECRET_KEY);
  return {
    builder: keyed && Boolean(priceForPlan("builder")),
    studio: keyed && Boolean(priceForPlan("studio")),
    pro: keyed && Boolean(priceForPlan("pro")),
  };
}
