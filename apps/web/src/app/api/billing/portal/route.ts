import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireViewer, route } from "@/lib/server";
import { stripe } from "@/lib/stripe";

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const [sub] = await db()
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.userId, viewer.id));
  if (!sub?.stripeCustomerId) throw new HttpError(400, "You don't have a subscription yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${new URL(request.url).origin}/settings`,
    // App Builder's own portal settings (its plans, terms and privacy links), so a Stripe
    // account shared with another business keeps its default portal untouched.
    ...(process.env.STRIPE_PORTAL_CONFIGURATION
      ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION }
      : {}),
  });
  return NextResponse.json({ url: session.url });
});
