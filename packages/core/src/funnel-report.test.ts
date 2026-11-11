import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import { funnelReport } from "./funnel-report";
import { newId } from "./ids";
import { createProject } from "./projects";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const run = (projectId: string, userId: string, kind: string, status = "succeeded", daysAgo = 0) =>
  db.insert(schema.agentRun).values({
    id: newId("run"),
    projectId,
    userId,
    kind: kind as never,
    status: status as never,
    createdAt: new Date(Date.now() - daysAgo * 86_400_000),
    finishedAt: new Date(Date.now() - daysAgo * 86_400_000),
  });

describe("App Builder's own funnel", () => {
  it("counts each step once per person, and leaves the operator out", async () => {
    // Users of this test sign up in their own quiet window (a day in 2001), so tests running
    // at the same time against the same database don't change the counts.
    const day = Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 1000) * 86_400_000;
    const window = { from: new Date(day), to: new Date(day + 86_400_000) };
    const backdate = (id: string) =>
      db
        .update(schema.user)
        .set({ createdAt: new Date(day + 3_600_000) })
        .where(eq(schema.user.id, id));
    // One person goes all the way to shipping; one only plans; the operator is left out.
    const doer = await makeUser(db);
    const planner = await makeUser(db);
    const operator = await makeUser(db);
    for (const u of [doer, planner, operator]) await backdate(u.id);
    process.env.ADMIN_EMAILS = operator.email;
    const a = await createProject(db, { ownerId: doer.id, prompt: "x", platforms: "both" });
    const b = await createProject(db, { ownerId: planner.id, prompt: "x", platforms: "both" });
    await run(a.id, doer.id, "plan");
    await run(a.id, doer.id, "build");
    await run(a.id, doer.id, "build");
    await run(a.id, doer.id, "edit", "succeeded", 0.5);
    await run(a.id, doer.id, "promo_render", "succeeded", 0);
    await run(b.id, planner.id, "plan");
    await run(b.id, planner.id, "build", "failed");
    const report = await funnelReport(db, null, window);
    delete process.env.ADMIN_EMAILS;

    const step = (key: string) => report.steps.find((s) => s.key === key)!.users;
    expect(step("signed_up")).toBe(2);
    expect(step("created_project")).toBe(2);
    expect(step("planned")).toBe(2);
    expect(step("built")).toBe(1);
    expect(step("edited")).toBe(1);
    expect(step("shipped")).toBe(1);
    expect(step("paid")).toBe(0);
    expect(report.daily).toEqual([{ day: new Date(day).toISOString().slice(0, 10), signups: 2 }]);
    expect(report.medianHoursToFirstBuild).not.toBeNull();
  });
});
