import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { compPlanFor, isPlanId, PLANS, type PlanId } from "./billing";

const { creditLedger, subscription } = schema;

export class InsufficientCredits extends Error {
  constructor(
    readonly balance: number,
    readonly needed: number,
  ) {
    super(`Not enough credits: ${balance} available, ${needed} needed`);
  }
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Tx;

/** Serialize all ledger writes for one user (balance checks stay correct under concurrency). */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"credits:" + userId}))`);
}

export async function creditBalance(db: Executor, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId));
  return row?.total ?? 0;
}

export async function userPlan(db: Executor, userId: string): Promise<PlanId> {
  const [row] = await db.select().from(subscription).where(eq(subscription.userId, userId));
  if (
    row &&
    isPlanId(row.plan) &&
    row.plan !== "free" &&
    ["active", "trialing"].includes(row.status)
  ) {
    return row.plan;
  }
  if (process.env.COMP_PLANS) {
    const [owner] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, userId));
    const comp = owner ? compPlanFor(owner.email) : null;
    if (comp) return comp;
  }
  return "free";
}

/** Give a new user their sign-up credits once (idempotent). */
export async function ensureSignupGrant(db: Database, userId: string): Promise<void> {
  await db
    .insert(creditLedger)
    .values({
      userId,
      delta: PLANS.free.signupCredits,
      reason: "grant",
      note: "Sign-up credits",
      externalId: `signup:${userId}`,
    })
    .onConflictDoNothing();
}

export async function grantCredits(
  db: Database,
  userId: string,
  amount: number,
  reason: "purchase" | "monthly" | "grant",
  externalId: string,
  note?: string,
): Promise<boolean> {
  const inserted = await db
    .insert(creditLedger)
    .values({ userId, delta: amount, reason, externalId, note })
    .onConflictDoNothing()
    .returning({ id: creditLedger.id });
  return inserted.length > 0;
}

/** Reserve credits for a run inside the caller's transaction; throws if the balance is short. */
export async function reserveCredits(
  tx: Tx,
  userId: string,
  runId: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await lockUser(tx, userId);
  const balance = await creditBalance(tx, userId);
  if (balance < amount) throw new InsufficientCredits(balance, amount);
  await tx.insert(creditLedger).values({ userId, delta: -amount, reason: "reserve", runId });
}

/** Release a run's reservation and charge what it actually cost. */
export async function settleCredits(
  db: Database,
  userId: string,
  runId: string,
  reserved: number,
  charge: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await tx
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(and(eq(creditLedger.runId, runId), eq(creditLedger.reason, "settle")));
    if (existing.length > 0) return; // already settled
    if (reserved > 0)
      await tx.insert(creditLedger).values({ userId, delta: reserved, reason: "release", runId });
    await tx.insert(creditLedger).values({ userId, delta: -charge, reason: "settle", runId });
  });
}
