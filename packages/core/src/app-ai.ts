/**
 * AI features inside generated apps (askAI() in the template's data/ai.ts → App Cloud /ai).
 * Calls run on a small, fast model and are paid for by the app's owner: each day's measured
 * cost is added up per app, and the owner's credits are charged as it crosses each credit
 * (so many cheap calls add up to one credit, instead of each costing a whole one).
 */
import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { AppCloudError } from "./app-cloud";
import { CREDIT_USD } from "./billing";
import { creditBalance } from "./credits";

export const APP_AI = {
  model: "claude-haiku-5-5",
  maxOutputTokens: 1024,
  /** Per app, per UTC day: a runaway loop in an app can't drain the owner. */
  callsPerAppPerDay: 2000,
  /** Per app user, per hour. */
  callsPerUserPerHour: 60,
  promptChars: 6000,
  instructionChars: 2000,
  imageBytes: 3 * 1024 * 1024,
} as const;

const today = () => new Date().toISOString().slice(0, 10);

/** Throws if the app can't make another AI call now (owner out of credits, daily cap). */
export async function assertAppAiAllowed(
  db: Database,
  projectId: string,
  ownerId: string,
): Promise<void> {
  if ((await creditBalance(db, ownerId)) < 1)
    throw new AppCloudError(402, "AI in this app is paused: the app's owner is out of credits.");
  const [row] = await db
    .select({ calls: schema.appAiUsage.calls })
    .from(schema.appAiUsage)
    .where(and(eq(schema.appAiUsage.projectId, projectId), eq(schema.appAiUsage.day, today())));
  if ((row?.calls ?? 0) >= APP_AI.callsPerAppPerDay)
    throw new AppCloudError(429, "This app reached today's AI limit. Try again tomorrow.");
}

/** Add one call's measured cost to today's total and charge the owner whole credits. */
export async function recordAppAiCall(
  db: Database,
  input: { projectId: string; ownerId: string; costUsd: number },
): Promise<{ creditsCharged: number }> {
  const micro = Math.max(0, Math.round(input.costUsd * 1_000_000));
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.appAiUsage)
      .values({ projectId: input.projectId, day: today(), calls: 1, costMicroUsd: micro })
      .onConflictDoUpdate({
        target: [schema.appAiUsage.projectId, schema.appAiUsage.day],
        set: {
          calls: sql`${schema.appAiUsage.calls} + 1`,
          costMicroUsd: sql`${schema.appAiUsage.costMicroUsd} + ${micro}`,
        },
      })
      .returning();
    const owed = Math.ceil(row!.costMicroUsd / (CREDIT_USD * 1_000_000)) - row!.creditsCharged;
    if (owed <= 0) return { creditsCharged: 0 };
    // Same per-user lock as every other ledger write (credits.ts), so balance checks stay right.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credits:" + input.ownerId}))`);
    await tx
      .update(schema.appAiUsage)
      .set({ creditsCharged: row!.creditsCharged + owed })
      .where(
        and(eq(schema.appAiUsage.projectId, input.projectId), eq(schema.appAiUsage.day, row!.day)),
      );
    await tx.insert(schema.creditLedger).values({
      userId: input.ownerId,
      delta: -owed,
      reason: "app_ai",
      note: `AI in your app (${input.projectId}), ${row!.day}`,
    });
    return { creditsCharged: owed };
  });
}

/** This month's AI use of one app, for the Data tab. */
export async function appAiSummary(db: Database, projectId: string) {
  const month = today().slice(0, 7);
  const [row] = await db
    .select({
      calls: sql<number>`coalesce(sum(${schema.appAiUsage.calls}), 0)::int`,
      credits: sql<number>`coalesce(sum(${schema.appAiUsage.creditsCharged}), 0)::int`,
    })
    .from(schema.appAiUsage)
    .where(
      and(
        eq(schema.appAiUsage.projectId, projectId),
        sql`${schema.appAiUsage.day} like ${month + "-%"}`,
      ),
    );
  return { calls: row?.calls ?? 0, credits: row?.credits ?? 0 };
}
