import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { PAID_PLANS, type PaidPlanId } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, readJson, requireViewer, route } from "@/lib/server";
import { priceForPlan, stripe } from "@/lib/stripe";

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const body = await readJson<{ plan?: string }>(request).catch(() => ({ plan: undefined }));
  const plan = (body.plan ?? "pro") as PaidPlanId;
  if (!PAID_PLANS.includes(plan)) throw new HttpError(400, "Unknown plan.");
  const price = priceForPlan(plan);
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
    metadata: { userId: viewer.id, plan },
    subscription_data: { metadata: { userId: viewer.id, plan } },
  });
  return NextResponse.json({ url: session.url });
});
