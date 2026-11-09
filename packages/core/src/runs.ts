import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { creditsForCost, costUsd, RUN_CREDITS, type TokenUsage } from "./billing";
import { reserveCredits, settleCredits } from "./credits";
import { newId } from "./ids";

const { agentRun, runEvent } = schema;

export type Run = typeof agentRun.$inferSelect;
export type RunEvent = typeof runEvent.$inferSelect;

/** A run whose worker stopped heartbeating for this long is considered abandoned. */
const STALE_AFTER = "2 minutes";
const MAX_ATTEMPTS = 3;

/** Create a queued run and reserve its credits in one transaction. */
export async function enqueueRun(
  db: Database,
  input: { projectId: string; userId: string; kind: Run["kind"]; input?: Record<string, unknown> },
): Promise<Run> {
  const reserve = RUN_CREDITS[input.kind]?.reserve ?? 0;
  return db.transaction(async (tx) => {
    const id = newId("run");
    await reserveCredits(tx, input.userId, id, reserve);
    const [run] = await tx
      .insert(agentRun)
      .values({
        id,
        projectId: input.projectId,
        userId: input.userId,
        kind: input.kind,
        input: input.input ?? {},
        creditsReserved: reserve,
      })
      .returning();
    await tx.insert(runEvent).values({ runId: id, type: "queued", payload: {} });
    return run!;
  });
}

/** Claim the oldest queued (or abandoned) run. Safe with many workers (SKIP LOCKED). */
export async function claimNextRun(db: Database, kinds?: Run["kind"][]): Promise<Run | null> {
  const kindFilter = kinds?.length
    ? sql`and kind in (${sql.join(
        kinds.map((k) => sql`${k}`),
        sql`, `,
      )})`
    : sql``;
  const result = await db.execute(sql`
    update agent_run set
      status = 'running',
      attempts = attempts + 1,
      started_at = coalesce(started_at, now()),
      heartbeat_at = now()
    where id = (
      select id from agent_run
      where (status = 'queued' or (status = 'running' and heartbeat_at < now() - ${sql.raw(`interval '${STALE_AFTER}'`)}))
        and attempts < ${MAX_ATTEMPTS}
        ${kindFilter}
      order by created_at
      limit 1
      for update skip locked
    )
    returning id`);
  const id = (result.rows[0] as { id?: string } | undefined)?.id;
  if (!id) return null;
  const [run] = await db.select().from(agentRun).where(eq(agentRun.id, id));
  return run ?? null;
}

export async function heartbeat(
  db: Database,
  runId: string,
): Promise<{ cancelRequested: boolean }> {
  const [row] = await db
    .update(agentRun)
    .set({ heartbeatAt: new Date() })
    .where(eq(agentRun.id, runId))
    .returning({ cancel: agentRun.cancelRequested });
  return { cancelRequested: (row?.cancel ?? 0) > 0 };
}

export async function addEvent(
  db: Database,
  runId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(runEvent).values({ runId, type, payload });
}

export async function listEvents(db: Database, runId: string, afterId = 0): Promise<RunEvent[]> {
  return db
    .select()
    .from(runEvent)
    .where(and(eq(runEvent.runId, runId), gt(runEvent.id, afterId)))
    .orderBy(asc(runEvent.id));
}

export async function getRun(db: Database, runId: string): Promise<Run | null> {
  const [run] = await db.select().from(agentRun).where(eq(agentRun.id, runId));
  return run ?? null;
}

export async function latestRuns(db: Database, projectId: string, limit = 20): Promise<Run[]> {
  return db
    .select()
    .from(agentRun)
    .where(eq(agentRun.projectId, projectId))
    .orderBy(desc(agentRun.createdAt))
    .limit(limit);
}

export async function activeRun(db: Database, projectId: string): Promise<Run | null> {
  const [run] = await db
    .select()
    .from(agentRun)
    .where(
      and(
        eq(agentRun.projectId, projectId),
        sql`${agentRun.status} in ('queued', 'running')`,
        sql`${agentRun.kind} in ('plan', 'build', 'edit')`,
      ),
    )
    .orderBy(desc(agentRun.createdAt))
    .limit(1);
  return run ?? null;
}

export interface RunResult {
  output?: Record<string, unknown>;
  model?: string;
  usage?: TokenUsage;
}

/** Mark a run succeeded and settle its credits from measured usage. */
export async function completeRun(db: Database, run: Run, result: RunResult): Promise<Run> {
  const usage = result.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const cost = result.model ? costUsd(result.model, usage) : null;
  const charge = creditsForCost(run.kind, cost);
  await settleCredits(db, run.userId, run.id, run.creditsReserved, charge);
  const [updated] = await db
    .update(agentRun)
    .set({
      status: "succeeded",
      output: result.output ?? {},
      model: result.model,
      tokensIn: usage.input,
      tokensOut: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      creditsCharged: charge,
      finishedAt: new Date(),
    })
    .where(eq(agentRun.id, run.id))
    .returning();
  await addEvent(db, run.id, "done", { credits: charge, output: result.output ?? {} });
  return updated!;
}

/** Mark a run failed (or cancelled) and give back its reservation: failures are free. */
export async function failRun(
  db: Database,
  run: Run,
  error: string,
  status: "failed" | "cancelled" = "failed",
  usage?: { model?: string; usage?: TokenUsage },
): Promise<void> {
  await settleCredits(db, run.userId, run.id, run.creditsReserved, 0);
  await db
    .update(agentRun)
    .set({
      status,
      error,
      finishedAt: new Date(),
      model: usage?.model,
      tokensIn: usage?.usage?.input ?? 0,
      tokensOut: usage?.usage?.output ?? 0,
    })
    .where(eq(agentRun.id, run.id));
  await addEvent(db, run.id, status === "cancelled" ? "cancelled" : "error", { message: error });
}

export async function requestCancel(db: Database, runId: string): Promise<void> {
  await db.update(agentRun).set({ cancelRequested: 1 }).where(eq(agentRun.id, runId));
  // A run nobody has picked up yet can be cancelled immediately.
  const [run] = await db
    .select()
    .from(agentRun)
    .where(and(eq(agentRun.id, runId), eq(agentRun.status, "queued")));
  if (run) await failRun(db, run, "Cancelled", "cancelled");
}
