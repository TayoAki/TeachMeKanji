import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import { adminUser, adminUsers } from "./admin-report";
import { newId } from "./ids";
import { createProject } from "./projects";
import { runCostUsd } from "./runs";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const run = (
  projectId: string,
  userId: string,
  values: Partial<typeof schema.agentRun.$inferInsert> = {},
) =>
  db.insert(schema.agentRun).values({
    id: newId("run"),
    projectId,
    userId,
    kind: "build",
    status: "succeeded",
    ...values,
  });

describe("what a run cost the platform", () => {
  it("adds the free calls to the billable cost, and keeps unknown apart from free", () => {
    expect(runCostUsd({ costUsd: 0.12, freeCostUsd: 0.03 })).toBe("0.1500");
    // One million Haiku input tokens at the list price.
    expect(
      runCostUsd({
        model: "claude-haiku-5-5",
        usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
      }),
    ).toBe("0.1000");
    expect(runCostUsd({ model: "some/unpriced-model" })).toBeNull();
    expect(runCostUsd({})).toBeNull();
  });
});

describe("the operator's users report", () => {
  it("lists each account with its apps, runs and cost, recorded or estimated", async () => {
    if (!handle) return;
    const maker = await makeUser(db, "Maker");
    const idle = await makeUser(db, "Idle");
    const first = await createProject(db, { ownerId: maker.id, prompt: "a", platforms: "both" });
    const second = await createProject(db, { ownerId: maker.id, prompt: "b", platforms: "both" });
    await db
      .update(schema.project)
      .set({ deletedAt: new Date() })
      .where(eq(schema.project.id, second.id));
    await db.insert(schema.creditLedger).values({ userId: maker.id, delta: 60, reason: "grant" });
    // A recorded cost wins over the tokens; a run without one is estimated from its model.
    await run(first.id, maker.id, { costUsd: "0.5000", creditsCharged: 10, tokensIn: 999 });
    await run(first.id, maker.id, {
      kind: "edit",
      model: "claude-haiku-5-5",
      tokensIn: 2_000_000,
      creditsCharged: 4,
    });
    await run(second.id, maker.id, { status: "failed", model: "mystery/model", tokensIn: 50 });
    // Old runs fall outside a recent window.
    await run(first.id, maker.id, {
      costUsd: "9.0000",
      createdAt: new Date(Date.now() - 40 * 86_400_000),
    });

    const detail = (await adminUser(db, maker.id, { sinceDays: 30 }))!;
    expect(detail.user).toMatchObject({
      email: maker.email,
      apps: 1,
      deletedApps: 1,
      creditBalance: 60,
      runs: 3,
      failedRuns: 1,
      creditsCharged: 14,
      estimatedRuns: 1,
      unpricedRuns: 1,
    });
    expect(detail.user.costUsd).toBeCloseTo(0.7, 4); // 0.50 recorded + 2M Haiku input tokens
    expect(detail.apps.map((a) => a.id).sort()).toEqual([first.id, second.id].sort());
    const app = detail.apps.find((a) => a.id === first.id)!;
    expect(app.runs).toBe(2);
    expect(app.costUsd).toBeCloseTo(0.7, 4);
    expect(detail.apps.find((a) => a.id === second.id)!.deletedAt).toBeInstanceOf(Date);
    expect(detail.byKind.map((k) => k.kind).sort()).toEqual(["build", "edit"]);
    expect(detail.runs).toHaveLength(3);
    const unpriced = detail.runs.find((r) => r.model === "mystery/model")!;
    expect(unpriced.costUsd).toBeNull();
    expect((await adminUser(db, maker.id))!.user.costUsd).toBeCloseTo(9.7, 4);
    expect(await adminUser(db, "u_nobody")).toBeNull();

    // The list finds accounts by part of an email, treats LIKE wildcards as text, and still
    // lists an account that never ran anything.
    const found = await adminUsers(db, { search: maker.email.slice(0, 12).toUpperCase() });
    expect(found.users.map((u) => u.id)).toEqual([maker.id]);
    expect(found.totals).toMatchObject({ users: 1, apps: 1, runs: 4 });
    expect((await adminUsers(db, { search: idle.email })).users[0]).toMatchObject({
      id: idle.id,
      runs: 0,
      costUsd: 0,
      lastRunAt: null,
    });
    expect((await adminUsers(db, { search: "%" })).users).toEqual([]);
  });
});
