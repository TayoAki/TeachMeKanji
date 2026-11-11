import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { chargeForRun, costUsd, RUN_CREDITS, type TokenUsage } from "./billing";
import { emailProviderSet } from "./email";
import { reserveCredits, settleCredits } from "./credits";
import { newId } from "./ids";

const { agentRun, runEvent } = schema;

export type Run = typeof agentRun.$inferSelect;
export type RunEvent = typeof runEvent.$inferSelect;

/** A run whose worker stopped heartbeating for this long is considered abandoned. */
const STALE_AFTER = "2 minutes";
const MAX_ATTEMPTS = 3;

/** Agent runs change the project's files, so a project has at most one at a time. */
export const AGENT_RUN_KINDS: ReadonlyArray<Run["kind"]> = ["plan", "build", "edit"];

/**
 * Free credits are real money, so a step that spends them needs a verified email: one inbox,
 * one set of free credits. On only once email can actually be delivered (a real provider is
 * set); REQUIRE_VERIFIED_EMAIL_FOR_AI=1 forces it on, =0 off.
 */
export function aiNeedsVerifiedEmail(): boolean {
  const flag = process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI;
  if (flag === "0") return false;
  if (flag === "1") return true;
  return emailProviderSet();
}

export class EmailNotVerified extends Error {
  constructor() {
    super("Verify your email to start building: we sent you a link when you signed up.");
  }
}

export class RunInProgress extends Error {
  constructor() {
    super("Wait for the current step to finish.");
  }
}

/**
 * Create a queued run and reserve its credits in one transaction. For agent runs, the
 * "one active run per project" rule is checked under a per-project lock, so two concurrent
 * requests can't both start one.
 */
export async function enqueueRun(
  db: Database,
  input: { projectId: string; userId: string; kind: Run["kind"]; input?: Record<string, unknown> },
): Promise<Run> {
  const reserve = RUN_CREDITS[input.kind]?.reserve ?? 0;
  if (reserve > 0 && aiNeedsVerifiedEmail()) {
    const [owner] = await db
      .select({ verified: schema.user.emailVerified })
      .from(schema.user)
      .where(eq(schema.user.id, input.userId));
    if (!owner?.verified) throw new EmailNotVerified();
  }
  return db.transaction(async (tx) => {
    if (AGENT_RUN_KINDS.includes(input.kind)) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"runs:" + input.projectId}))`);
      const [busy] = await tx
        .select({ id: agentRun.id })
        .from(agentRun)
        .where(
          and(
            eq(agentRun.projectId, input.projectId),
            inArray(agentRun.status, ["queued", "running"]),
            inArray(agentRun.kind, [...AGENT_RUN_KINDS]),
          ),
        )
        .limit(1);
      if (busy) throw new RunInProgress();
    }
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
        and cancel_requested = 0
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

/**
 * Fail runs nobody will pick up again: abandoned after the last allowed attempt, or
 * abandoned while a cancel was pending. Releases their credits and unblocks the project.
 */
export async function reapAbandonedRuns(db: Database): Promise<Run[]> {
  const stale = await db
    .select()
    .from(agentRun)
    .where(
      and(
        eq(agentRun.status, "running"),
        lt(agentRun.heartbeatAt, sql`now() - ${sql.raw(`interval '${STALE_AFTER}'`)}`),
        sql`(${agentRun.attempts} >= ${MAX_ATTEMPTS} or ${agentRun.cancelRequested} > 0)`,
      ),
    );
  for (const run of stale) {
    await failRun(
      db,
      run,
      run.cancelRequested > 0
        ? "Cancelled"
        : "The worker stopped during this step. Please try again.",
      run.cancelRequested > 0 ? "cancelled" : "failed",
    );
  }
  return stale;
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
        inArray(agentRun.status, ["queued", "running"]),
        inArray(agentRun.kind, [...AGENT_RUN_KINDS]),
      ),
    )
    .orderBy(desc(agentRun.createdAt))
    .limit(1);
  return run ?? null;
}

export interface RunUsage {
  model?: string;
  usage?: TokenUsage;
  /** Measured cost when the run used several models (each call priced by its own model). */
  costUsd?: number;
}

const NO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** Mark a run succeeded and settle its credits from measured usage (never above the reserve). */
export async function completeRun(
  db: Database,
  run: Run,
  result: RunUsage & { output?: Record<string, unknown> },
): Promise<Run> {
  const usage = result.usage ?? NO_USAGE;
  const charge = chargeForRun(
    run.kind,
    run.creditsReserved,
    result.costUsd ?? (result.model ? costUsd(result.model, usage) : null),
    "succeeded",
  );
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

/**
 * Mark a run failed or cancelled. It pays only for the model usage it actually consumed (no
 * minimum, never above the reserve); a run that never reached the model is free.
 */
export async function failRun(
  db: Database,
  run: Run,
  error: string,
  status: "failed" | "cancelled" = "failed",
  result: RunUsage = {},
): Promise<void> {
  const usage = result.usage ?? NO_USAGE;
  const charge = chargeForRun(
    run.kind,
    run.creditsReserved,
    result.costUsd ?? (result.model ? costUsd(result.model, usage) : null),
    "failed",
  );
  await settleCredits(db, run.userId, run.id, run.creditsReserved, charge);
  await db
    .update(agentRun)
    .set({
      status,
      error,
      finishedAt: new Date(),
      model: result.model,
      tokensIn: usage.input,
      tokensOut: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      creditsCharged: charge,
    })
    .where(eq(agentRun.id, run.id));
  await addEvent(db, run.id, status === "cancelled" ? "cancelled" : "error", {
    message: error,
    credits: charge,
  });
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
