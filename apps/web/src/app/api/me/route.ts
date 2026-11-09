import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { creditBalance, PLANS, userPlan } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, requireViewer, route } from "@/lib/server";
import { billingAvailability } from "@/lib/stripe";
import { MCP_RESOURCE } from "@/lib/auth";

export const GET = route(async () => {
  const viewer = await requireViewer();
  const plan = await userPlan(db(), viewer.id);
  const ledger = await db()
    .select()
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, viewer.id))
    .orderBy(desc(schema.creditLedger.id))
    .limit(30);
  const integrations = await db()
    .select({
      provider: schema.integration.provider,
      label: schema.integration.label,
      createdAt: schema.integration.createdAt,
    })
    .from(schema.integration)
    .where(eq(schema.integration.userId, viewer.id));
  return NextResponse.json({
    user: viewer,
    credits: await creditBalance(db(), viewer.id),
    plan,
    limits: PLANS[plan],
    ledger: ledger.map((l) => ({
      id: l.id,
      delta: l.delta,
      reason: l.reason,
      note: l.note,
      createdAt: l.createdAt,
    })),
    integrations,
    billing: billingAvailability(),
    mcpUrl: MCP_RESOURCE,
  });
});
