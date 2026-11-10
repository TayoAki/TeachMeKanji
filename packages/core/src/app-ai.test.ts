import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@appbuilder/db";
import { appAiSummary, assertAppAiAllowed, recordAppAiCall } from "./app-ai";
import { creditBalance, grantCredits } from "./credits";
import { createProject } from "./projects";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

describe("AI inside generated apps (Postgres)", () => {
  it("charges the owner whole credits as the day's cost crosses each one, and pauses at zero", async () => {
    const owner = await makeUser(db);
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    await grantCredits(db, owner.id, 2, "grant", `t-${owner.id}`);
    await assertAppAiAllowed(db, p.id, owner.id);

    // A Haiku answer costs about $0.0004: the first one opens a credit ($0.05)...
    expect(
      await recordAppAiCall(db, { projectId: p.id, ownerId: owner.id, costUsd: 0.0004 }),
    ).toEqual({
      creditsCharged: 1,
    });
    // ...and the next ones are covered by it until the day's total passes $0.05.
    for (let i = 0; i < 100; i++)
      await recordAppAiCall(db, { projectId: p.id, ownerId: owner.id, costUsd: 0.0004 });
    expect(await creditBalance(db, owner.id)).toBe(1);
    expect(await appAiSummary(db, p.id)).toEqual({ calls: 101, credits: 1 });
    await recordAppAiCall(db, { projectId: p.id, ownerId: owner.id, costUsd: 0.05 });
    expect(await creditBalance(db, owner.id)).toBe(0);
    await expect(assertAppAiAllowed(db, p.id, owner.id)).rejects.toMatchObject({ status: 402 });
  });
});
