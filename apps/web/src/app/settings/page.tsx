import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { creditBalance, PLANS, userPlan } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { SettingsView, type SettingsData } from "@/components/settings-view";
import { plain } from "@/lib/serialize";
import { db, getViewer } from "@/lib/server";
import { billingAvailability } from "@/lib/stripe";
import { MCP_RESOURCE } from "@/lib/auth";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
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
      auth: schema.integration.auth,
    })
    .from(schema.integration)
    .where(eq(schema.integration.userId, viewer.id));
  const data = plain({
    user: { name: viewer.name, email: viewer.email, image: viewer.image },
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
  }) as unknown as SettingsData;
  return <SettingsView initial={data} />;
}
