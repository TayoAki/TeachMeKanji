import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import { RUN_CREDITS } from "./billing";
import { ensureSignupGrant } from "./credits";
import { createProject } from "./projects";
import { aiNeedsVerifiedEmail, EmailNotVerified, enqueueRun } from "./runs";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());
afterEach(() => {
  delete process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

describe("free credits need a verified email", () => {
  it("is on once real email is set up, and can be forced either way", () => {
    expect(aiNeedsVerifiedEmail()).toBe(false);
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "App Builder <hello@example.com>";
    expect(aiNeedsVerifiedEmail()).toBe(true);
    process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = "0";
    expect(aiNeedsVerifiedEmail()).toBe(false);
    delete process.env.RESEND_API_KEY;
    process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = "1";
    expect(aiNeedsVerifiedEmail()).toBe(true);
  });

  it("refuses steps that spend credits until the email is verified, and nothing else", async () => {
    process.env.REQUIRE_VERIFIED_EMAIL_FOR_AI = "1";
    const user = await makeUser(db);
    await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, user.id));
    await ensureSignupGrant(db, user.id);
    const project = await createProject(db, { ownerId: user.id, prompt: "x", platforms: "both" });

    await expect(
      enqueueRun(db, { projectId: project.id, userId: user.id, kind: "plan" }),
    ).rejects.toBeInstanceOf(EmailNotVerified);
    // Steps that cost no credits (a phone preview, a GitHub push) aren't held back.
    await expect(
      enqueueRun(db, { projectId: project.id, userId: user.id, kind: "github_push" }),
    ).resolves.toMatchObject({ kind: "github_push" });

    await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, user.id));
    await expect(
      enqueueRun(db, { projectId: project.id, userId: user.id, kind: "plan" }),
    ).resolves.toMatchObject({ kind: "plan", creditsReserved: RUN_CREDITS.plan!.reserve });
  });
});
