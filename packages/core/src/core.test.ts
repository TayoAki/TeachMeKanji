import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@appbuilder/db";
import { canEdit, projectAccess } from "./authz";
import { acceptInvite, createInvite, InviteInvalid, peekInvite } from "./invites";
import { revokeAssistantAccess } from "./assistants";
import { creditBalance, ensureSignupGrant, InsufficientCredits } from "./credits";
import { decryptSecret, encryptSecret } from "./crypto";
import {
  addMessage,
  createProject,
  duplicateProject,
  LimitReached,
  listMessages,
  listProjectsFor,
  publishProject,
  shareProject,
} from "./projects";
import { eq, inArray } from "drizzle-orm";
import { schema } from "@appbuilder/db";
import {
  activeRun,
  claimNextRun,
  completeRun,
  enqueueRun,
  failRun,
  listEvents,
  reapAbandonedRuns,
  RunInProgress,
} from "./runs";
import { makeUser, testDb } from "./test-db";
import {
  commitVersion,
  getCurrentFiles,
  listVersions,
  restoreVersion,
  VersionConflict,
} from "./versions";

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

    const a = await createProject(db, { ownerId: u.id, prompt: "a", platforms: "both" });
    const b = await createProject(db, { ownerId: u.id, prompt: "b", platforms: "both" });
    // A build reserves 60: the first fits, the second (on another project) doesn't.
    const runs = await Promise.allSettled(
      [a, b].map((p) => enqueueRun(db, { projectId: p.id, userId: u.id, kind: "build" })),
    );
    expect(runs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = runs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InsufficientCredits);
    expect(await creditBalance(db, u.id)).toBe(40);
  });

  it("allows one agent run per project, even under concurrent requests", async () => {
    const u = await makeUser(db);
    await ensureSignupGrant(db, u.id);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const runs = await Promise.allSettled(
      [1, 2, 3].map(() => enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" })),
    );
    expect(runs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of runs.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RunInProgress);
    }
    expect(await creditBalance(db, u.id)).toBe(88);
  });

  it("charges measured usage, capped at the reserve, including for failed runs", async () => {
    const u = await makeUser(db);
    await ensureSignupGrant(db, u.id);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const opus = "claude-opus-5-5";

    // 50k in + 10k out on Opus-tier pricing = $0.40 = 8 credits.
    const ok = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    await completeRun(db, ok, {
      model: opus,
      usage: { input: 50_000, output: 10_000, cacheRead: 0, cacheWrite: 0 },
    });
    expect(await creditBalance(db, u.id)).toBe(92);

    // A failure before any model call is free.
    const early = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    await failRun(db, early, "boom");
    expect(await creditBalance(db, u.id)).toBe(92);
    expect((await listEvents(db, early.id)).map((e) => e.type)).toEqual(["queued", "error"]);

    // A cancelled run pays for what it used: 10k output = $0.20 = 4 credits.
    const cancelled = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    await failRun(db, cancelled, "Cancelled", "cancelled", {
      model: opus,
      usage: { input: 0, output: 10_000, cacheRead: 0, cacheWrite: 0 },
    });
    expect(await creditBalance(db, u.id)).toBe(88);

    // Never more than the reserve (12 for an edit), however expensive the run was.
    const huge = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    await completeRun(db, huge, {
      model: opus,
      usage: { input: 0, output: 5_000_000, cacheRead: 0, cacheWrite: 0 },
    });
    expect(await creditBalance(db, u.id)).toBe(76);
  });

  it("reaps runs abandoned after the last attempt and unblocks the project", async () => {
    const u = await makeUser(db);
    await ensureSignupGrant(db, u.id);
    const p = await createProject(db, { ownerId: u.id, prompt: "x", platforms: "both" });
    const run = await enqueueRun(db, { projectId: p.id, userId: u.id, kind: "edit" });
    await db
      .update(schema.agentRun)
      .set({ status: "running", attempts: 3, heartbeatAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(schema.agentRun.id, run.id));
    expect(await activeRun(db, p.id)).not.toBeNull();
    const reaped = await reapAbandonedRuns(db);
    expect(reaped.map((r) => r.id)).toContain(run.id);
    expect(await activeRun(db, p.id)).toBeNull();
    expect(await creditBalance(db, u.id)).toBe(100);
  });

  it("claims each queued run exactly once across concurrent workers", async () => {
    // The queue is global: settle leftovers from earlier tests so only this run is claimable.
    await db
      .update(schema.agentRun)
      .set({ status: "failed" })
      .where(inArray(schema.agentRun.status, ["queued", "running"]));
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

    await expect(
      commitVersion(db, {
        projectId: p.id,
        files: {},
        kind: "inline_edit",
        summary: "stale",
        expectedParentId: v1.id,
      }),
    ).rejects.toBeInstanceOf(VersionConflict);

    const { project: fresh } = (await projectAccess(db, p.id, { id: u.id, email: u.email }))!;
    const copy = await duplicateProject(db, fresh, other.id);
    expect(copy.ownerId).toBe(other.id);
    expect((await getCurrentFiles(db, copy.id)).files).toEqual({ "a.ts": "1", "b.ts": "same" });
    expect(copy.prompt).toBe("x");

    // A public visitor's remix gets the files but not the private prompt.
    const remix = await duplicateProject(db, fresh, (await makeUser(db)).id, {
      includePrivate: false,
    });
    expect(remix.prompt).toBe(`Remix of “${fresh.name}”`);
    expect((await getCurrentFiles(db, remix.id)).files).toEqual({ "a.ts": "1", "b.ts": "same" });
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

    // Invites are keyed on email, so with verification required an unverified address gets nothing.
    process.env.REQUIRE_VERIFIED_EMAIL = "1";
    try {
      expect(await projectAccess(db, p.id, { ...editor, emailVerified: false })).toBeNull();
      expect((await projectAccess(db, p.id, { ...editor, emailVerified: true }))?.access).toBe(
        "editor",
      );
      expect((await projectAccess(db, p.id, { ...owner, emailVerified: false }))?.access).toBe(
        "owner",
      );
    } finally {
      delete process.env.REQUIRE_VERIFIED_EMAIL;
    }

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

  it("lets an invite link holder join once, without email verification", async () => {
    const owner = await makeUser(db);
    const guest = { ...(await makeUser(db)), emailVerified: false };
    const other = { ...(await makeUser(db)), emailVerified: false };
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    process.env.REQUIRE_VERIFIED_EMAIL = "1";
    try {
      const { token } = await createInvite(db, {
        projectId: p.id,
        role: "editor",
        createdBy: owner.id,
      });
      expect((await peekInvite(db, token))?.projectId).toBe(p.id);
      expect(await projectAccess(db, p.id, guest)).toBeNull();

      await acceptInvite(db, token, guest);
      expect((await projectAccess(db, p.id, guest))?.access).toBe("editor");
      expect((await listProjectsFor(db, guest)).map((c) => c.id)).toContain(p.id);

      // Single use: a forwarded link doesn't let anyone else in.
      await expect(acceptInvite(db, token, other)).rejects.toBeInstanceOf(InviteInvalid);
      expect(await projectAccess(db, p.id, other)).toBeNull();
      expect(await peekInvite(db, token)).toBeNull();

      // An email invite to an unverified address still grants nothing.
      await shareProject(db, p.id, other.email, "viewer", owner.id);
      expect(await projectAccess(db, p.id, other)).toBeNull();
      expect((await listProjectsFor(db, other)).map((c) => c.id)).not.toContain(p.id);

      // Expired links are refused.
      const old = await createInvite(db, { projectId: p.id, role: "viewer", createdBy: owner.id });
      await db
        .update(schema.projectInvite)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.projectInvite.projectId, p.id));
      await expect(acceptInvite(db, old.token, other)).rejects.toBeInstanceOf(InviteInvalid);
    } finally {
      delete process.env.REQUIRE_VERIFIED_EMAIL;
    }
  });

  it("never hands an email invite's role to an unverified account using that address", async () => {
    const owner = await makeUser(db);
    const squatter = { ...(await makeUser(db)), emailVerified: false };
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    process.env.REQUIRE_VERIFIED_EMAIL = "1";
    try {
      // The owner invited this address as an editor; the account holding it isn't verified.
      await shareProject(db, p.id, squatter.email, "editor", owner.id);
      const { token } = await createInvite(db, {
        projectId: p.id,
        role: "viewer",
        createdBy: owner.id,
      });
      await acceptInvite(db, token, squatter);
      expect((await projectAccess(db, p.id, squatter))?.access).toBe("viewer");
    } finally {
      delete process.env.REQUIRE_VERIFIED_EMAIL;
    }
  });

  it("disconnects every AI assistant from an account", async () => {
    const u = await makeUser(db);
    const clientId = `client-${u.id}`;
    const now = new Date();
    await db
      .insert(schema.oauthClient)
      .values({ id: clientId, clientId, redirectUris: ["https://x.example/cb"] });
    await db.insert(schema.oauthConsent).values({
      id: `consent-${u.id}`,
      clientId,
      userId: u.id,
      scopes: ["openid"],
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.oauthRefreshToken).values({
      id: `rt-${u.id}`,
      token: `rt-${u.id}`,
      clientId,
      userId: u.id,
      scopes: ["openid"],
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: now,
    });
    await revokeAssistantAccess(db, u.id);
    expect(
      await db.select().from(schema.oauthConsent).where(eq(schema.oauthConsent.userId, u.id)),
    ).toEqual([]);
    const [token] = await db
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.userId, u.id));
    expect(token?.revoked).toBeInstanceOf(Date);
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
