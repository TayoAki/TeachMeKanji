import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { compPlanFor, isPlanId, PLANS, type PlanId } from "./billing";

const { agentRun, creditLedger, projectVersion, subscription } = schema;

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

/** Undoing an AI edit within this many hours of it gives its credits back. */
export const UNDO_REFUND_HOURS = 24;
/** At most this many undo refunds per user per day: undo is for edits that made things worse. */
export const UNDO_REFUNDS_PER_DAY = 5;

/**
 * After a restore from `fromVersionId` back to `toVersionId`: the chat edits it undid that were
 * made in the last UNDO_REFUND_HOURS get their credits back (each once, the newest first, at most
 * UNDO_REFUNDS_PER_DAY a day per payer). Restoring a refunded edit's own version brings the edit
 * back, so its refund is taken back. Returns the credits refunded and reclaimed.
 */
export async function settleUndo(
  db: Database,
  input: { projectId: string; fromVersionId: string | null; toVersionId: string },
): Promise<{ refunded: number; reclaimed: number }> {
  let refunded = 0;
  let reclaimed = 0;

  // Bringing back a refunded edit: it pays again.
  const [target] = await db
    .select()
    .from(projectVersion)
    .where(eq(projectVersion.id, input.toVersionId));
  if (target?.kind === "ai_edit" && target.runId) {
    const [refund] = await db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.externalId, `refund:${target.runId}`));
    if (refund) {
      const added = await db
        .insert(creditLedger)
        .values({
          userId: refund.userId,
          delta: -refund.delta,
          reason: "reclaim",
          runId: target.runId,
          note: "A refunded edit was restored",
          externalId: `reclaim:${target.runId}`,
        })
        .onConflictDoNothing()
        .returning({ id: creditLedger.id });
      if (added.length) reclaimed += refund.delta;
    }
  }

  // The versions the restore undid: from the old current version back to the target.
  const undone: Array<typeof projectVersion.$inferSelect> = [];
  let cursor = input.fromVersionId;
  for (let step = 0; cursor && cursor !== input.toVersionId && step < 50; step++) {
    const [version] = await db.select().from(projectVersion).where(eq(projectVersion.id, cursor));
    if (!version || version.projectId !== input.projectId) break;
    undone.push(version);
    cursor = version.parentId;
  }
  if (cursor !== input.toVersionId) return { refunded, reclaimed };
  const since = new Date(Date.now() - UNDO_REFUND_HOURS * 3_600_000);
  const runIds = undone
    .filter((v) => v.kind === "ai_edit" && v.runId && v.createdAt > since)
    .map((v) => v.runId!);
  if (!runIds.length) return { refunded, reclaimed };
  const runs = await db
    .select()
    .from(agentRun)
    .where(
      and(
        inArray(agentRun.id, runIds),
        eq(agentRun.projectId, input.projectId),
        eq(agentRun.kind, "edit"),
        eq(agentRun.status, "succeeded"),
        gt(agentRun.creditsCharged, 0),
      ),
    );
  for (const runId of runIds) {
    const run = runs.find((r) => r.id === runId);
    if (!run) continue;
    const granted = await db.transaction(async (tx) => {
      await lockUser(tx, run.userId);
      const [today] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(creditLedger)
        .where(
          and(
            eq(creditLedger.userId, run.userId),
            eq(creditLedger.reason, "refund"),
            gt(creditLedger.createdAt, new Date(Date.now() - 86_400_000)),
          ),
        );
      if ((today?.n ?? 0) >= UNDO_REFUNDS_PER_DAY) return false;
      const added = await tx
        .insert(creditLedger)
        .values({
          userId: run.userId,
          delta: run.creditsCharged,
          reason: "refund",
          runId: run.id,
          note: "AI edit undone",
          externalId: `refund:${run.id}`,
        })
        .onConflictDoNothing()
        .returning({ id: creditLedger.id });
      return added.length > 0;
    });
    if (granted) refunded += run.creditsCharged;
  }
  return { refunded, reclaimed };
}
