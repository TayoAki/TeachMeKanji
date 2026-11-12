import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@appbuilder/db";
import {
  errorFingerprint,
  errorsForAgent,
  listAppErrors,
  parseErrorReport,
  recordAppError,
  resolveAppErrors,
} from "./app-errors";
import { createProject } from "./projects";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const stack = (line: number) =>
  `TypeError: Cannot read property 'streak' of undefined\n    at StatsScreen (app/(tabs)/stats.tsx:${line}:12)\n    at renderWithHooks (react.js:100:5)`;

describe("error reports from apps", () => {
  it("keeps what a report needs and rejects the rest", () => {
    const report = parseErrorReport({
      install: "abc123def456",
      message: "  x is undefined  ",
      stack: "at A",
      screen: "/stats",
      platform: "ios",
      fatal: true,
      test: false,
      email: "someone@example.com",
    });
    expect(report).toEqual({
      install: "abc123def456",
      message: "x is undefined",
      stack: "at A",
      screen: "/stats",
      platform: "ios",
      fatal: true,
      test: false,
    });
    expect(() => parseErrorReport({ install: "abc123def456", message: "" })).toThrow();
    expect(() => parseErrorReport({ install: "x", message: "boom" })).toThrow();
  });

  it("groups the same error whatever its numbers, values or line numbers", () => {
    const a = errorFingerprint("Habit 'h12' has 3 entries", stack(20));
    const b = errorFingerprint("Habit 'h7' has 41 entries", stack(24));
    expect(a).toBe(b);
    expect(errorFingerprint("Another problem", stack(20))).not.toBe(a);
  });

  it("counts repeats, reopens fixed errors, and briefs the agent", async () => {
    const u = await makeUser(db);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const report = parseErrorReport({
      install: "abc123def456",
      message: "Cannot read property 'streak' of undefined",
      stack: stack(20),
      screen: "/stats",
      platform: "ios",
      test: true,
    });
    const first = await recordAppError(db, p.id, report);
    await recordAppError(db, p.id, { ...report, test: false, stack: stack(22) });
    let [row] = await listAppErrors(db, p.id);
    expect(row).toMatchObject({ id: first!.id, count: 2, test: false, screen: "/stats" });

    const brief = await errorsForAgent(db, p.id);
    expect(brief!.ids).toEqual([first!.id]);
    expect(brief!.brief).toContain("Error on /stats (2×, ios)");
    expect(brief!.brief).toContain("stats.tsx");

    await resolveAppErrors(db, p.id, [first!.id]);
    expect(await listAppErrors(db, p.id)).toEqual([]);
    expect(await errorsForAgent(db, p.id)).toBeNull();

    const again = await recordAppError(db, p.id, report);
    expect(again).toEqual({ id: first!.id, reopened: true });
    [row] = await listAppErrors(db, p.id);
    expect(row!.count).toBe(3);
  });
});
