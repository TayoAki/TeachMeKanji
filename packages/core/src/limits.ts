import { and, count, eq, gt, inArray } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";

export class RateLimited extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Per-user limits on expensive actions (on top of credits), counted from the database. */
export const RATE_LIMITS = {
  agentRunsPerHour: Number(process.env.RATE_LIMIT_RUNS_PER_HOUR || 60),
  projectsPerDay: Number(process.env.RATE_LIMIT_PROJECTS_PER_DAY || 20),
};

export async function assertRunRate(db: Database, userId: string): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.userId, userId),
        inArray(schema.agentRun.kind, ["plan", "build", "edit"]),
        gt(schema.agentRun.createdAt, new Date(Date.now() - 3_600_000)),
      ),
    );
  if ((row?.n ?? 0) >= RATE_LIMITS.agentRunsPerHour) {
    throw new RateLimited(
      "You've reached the hourly limit for AI requests. Try again in a little while.",
    );
  }
}

export async function assertProjectRate(db: Database, userId: string): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(schema.project)
    .where(
      and(
        eq(schema.project.ownerId, userId),
        gt(schema.project.createdAt, new Date(Date.now() - 86_400_000)),
      ),
    );
  if ((row?.n ?? 0) >= RATE_LIMITS.projectsPerDay) {
    throw new RateLimited("You've created a lot of projects today. Try again tomorrow.");
  }
}

/**
 * A sliding-window counter kept in memory, for cheap per-key limits such as password attempts.
 * Per process: with several web instances each enforces its own window. Memory is bounded:
 * stale keys are pruned at most once per window, and past `maxKeys` the oldest keys go first.
 */
export class WindowLimiter {
  private hits = new Map<string, number[]>();
  private lastPrune = 0;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  /** Record one attempt; false when the key is over its limit (the attempt isn't counted). */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    // Re-inserting moves the key to the end, so iteration order is least recently used first.
    this.hits.delete(key);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.prune(now);
    return true;
  }

  private prune(now: number) {
    if (now - this.lastPrune >= this.windowMs) {
      this.lastPrune = now;
      for (const [key, times] of this.hits) {
        if (!times.some((t) => t > now - this.windowMs)) this.hits.delete(key);
      }
    }
    for (const key of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(key);
    }
  }

  get size(): number {
    return this.hits.size;
  }
}
