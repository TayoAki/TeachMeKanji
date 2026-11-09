import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireViewer, route } from "@/lib/server";
import { stripe } from "@/lib/stripe";

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const price = process.env.STRIPE_PRICE_PRO;
  if (!price) throw new HttpError(501, "Billing isn't configured on this server.");
  const origin = new URL(request.url).origin;
  const [existing] = await db()
    .select()
    .from(schema.subscription)
    .where(eq(schema.subscription.userId, viewer.id));
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: viewer.id,
    customer: existing?.stripeCustomerId ?? undefined,
    customer_email: existing?.stripeCustomerId ? undefined : viewer.email,
    success_url: `${origin}/settings?upgraded=1`,
    cancel_url: `${origin}/pricing`,
    metadata: { userId: viewer.id },
    subscription_data: { metadata: { userId: viewer.id } },
  });
  return NextResponse.json({ url: session.url });
});
