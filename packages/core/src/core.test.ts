import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@appbuilder/db";
import { canEdit, projectAccess } from "./authz";
import { creditBalance, ensureSignupGrant, InsufficientCredits } from "./credits";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  addMessage,
  createProject,
  duplicateProject,
  LimitReached,
  listMessages,
  publishProject,
  shareProject,
} from "./projects";
import { claimNextRun, completeRun, enqueueRun, failRun, listEvents } from "./runs";
import { makeUser, testDb } from "./test-db";
import { commitVersion, getCurrentFiles, listVersions, restoreVersion } from "./versions";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;

beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

describe("core (Postgres)", () => {
  it("connects to the test database", () => {
    expect(handle, "Postgres must be reachable for core tests").not.toBeNull();
  });

  it("grants sign-up credits once and blocks runs the balance can't cover", async () => {
    const u = await makeUser(db);
    await ensureSignupGrant(db, u.id);
    await ensureSignupGrant(db, u.id);
    expect(await creditBalance(db, u.id)).toBe(100);

    const p = await createProject(db, {
      ownerId: u.id,
      prompt: "Build me a habit tracker",
      platforms: "both",
    });
    // build reserves 40: two fit, the third doesn't (100 - 80 = 20 < 40)
    const runs = await Promise.allSettled(
      [1, 2, 3].map(() => enqueueRun(db, { projectId: p.id, userId: u.id, kind: "build" })),
    );
    expect(runs.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const rejected = runs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientCredits);
    expect(await creditBalance(db, u.id)).toBe(20);
  });

  it("settles a run at its measured cost and refunds failures", async () => {
    const u = await makeUser(db);
    await ensureSignupGrant(db, u.id);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });

    const ok = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    expect(await creditBalance(db, u.id)).toBe(88);
    // 50k in, 10k out on Opus-tier pricing = $0.40 = 8 credits
    await completeRun(db, ok, {
      model: "claude-opus-5-5",
      usage: { input: 50_000, output: 10_000, cacheRead: 0, cacheWrite: 0 },
    });
    expect(await creditBalance(db, u.id)).toBe(92);

    const bad = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    await failRun(db, bad, "boom");
    expect(await creditBalance(db, u.id)).toBe(92);
    expect((await listEvents(db, bad.id)).map((e) => e.type)).toEqual(["queued", "error"]);
  });

  it("claims each queued run exactly once across concurrent workers", async () => {
    const u = await makeUser(db);
    await ensureSignupGrant(db, u.id);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const queued = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "plan" });
    const claims = await Promise.all([1, 2, 3, 4].map(() => claimNextRun(db, ["plan"])));
    const mine = claims.filter((c) => c?.id === queued.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.status).toBe("running");
  });

  it("enforces the free plan's project limit", async () => {
    const u = await makeUser(db);
    await createProject(db, { ownerId: u.id, prompt: "a", platforms: "both" });
    await createProject(db, { ownerId: u.id, prompt: "b", platforms: "both" });
    await expect(
      createProject(db, { ownerId: u.id, prompt: "c", platforms: "both" }),
    ).rejects.toBeInstanceOf(LimitReached);
  });

  it("commits immutable versions, restores, and duplicates", async () => {
    const u = await makeUser(db);
    const other = await makeUser(db);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const v1 = await commitVersion(db, {
      projectId: p.id,
      files: { "a.ts": "1", "b.ts": "same" },
      kind: "generate",
      summary: "v1",
    });
    await commitVersion(db, {
      projectId: p.id,
      files: { "a.ts": "2", "b.ts": "same" },
      kind: "ai_edit",
      summary: "v2",
    });
    expect((await getCurrentFiles(db, p.id)).files["a.ts"]).toBe("2");

    const restored = await restoreVersion(db, p.id, v1.id, u.id);
    expect(restored.number).toBe(3);
    expect((await getCurrentFiles(db, p.id)).files).toEqual({ "a.ts": "1", "b.ts": "same" });
    expect((await listVersions(db, p.id)).map((v) => v.kind)).toEqual([
      "restore",
      "ai_edit",
      "generate",
    ]);

    const { project: fresh } = (await projectAccess(db, p.id, { id: u.id, email: u.email }))!;
    const copy = await duplicateProject(db, fresh, other.id);
    expect(copy.ownerId).toBe(other.id);
    expect((await getCurrentFiles(db, copy.id)).files).toEqual({ "a.ts": "1", "b.ts": "same" });
  });

  it("decides access for owner, members, public visitors and strangers", async () => {
    const owner = await makeUser(db);
    const editor = await makeUser(db);
    const stranger = await makeUser(db);
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    await shareProject(db, p.id, editor.email.toUpperCase(), "editor", owner.id);

    expect((await projectAccess(db, p.id, owner))?.access).toBe("owner");
    expect((await projectAccess(db, p.id, editor))?.access).toBe("editor");
    expect(canEdit((await projectAccess(db, p.id, editor))!.access)).toBe(true);
    expect(await projectAccess(db, p.id, stranger)).toBeNull();
    expect(await projectAccess(db, p.id, null)).toBeNull();

    await commitVersion(db, {
      projectId: p.id,
      files: { "x.ts": "1" },
      kind: "generate",
      summary: "v1",
    });
    const { project: fresh } = (await projectAccess(db, p.id, owner))!;
    const slug = await publishProject(db, fresh);
    expect(slug).toMatch(/^x-/);
  });

  it("keeps chat history in order", async () => {
    const u = await makeUser(db);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    await addMessage(db, { projectId: p.id, role: "user", content: { text: "one" } });
    await addMessage(db, { projectId: p.id, role: "assistant", content: { text: "two" } });
    expect((await listMessages(db, p.id)).map((m) => m.content.text)).toEqual(["one", "two"]);
  });
});

describe("crypto", () => {
  it("round-trips secrets and rejects tampering", () => {
    process.env.ENCRYPTION_KEY ??= "test-key";
    const sealed = encryptSecret("ghp_secret");
    expect(sealed).not.toContain("ghp_secret");
    expect(decryptSecret(sealed)).toBe("ghp_secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
