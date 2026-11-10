import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import { BACKEND_CONFIG_FILE, backendConfigFile, readPlatformConfig } from "@appbuilder/contract";
import {
  APP_CLOUD_LIMITS,
  AppCloudError,
  createAnonymousUser,
  deleteAppUser,
  deleteRecord,
  listRecords,
  putRecords,
  sessionUser,
  signInApp,
  signOutApp,
  signUpApp,
  appDataSummary,
  previewSession,
  pruneAppCloud,
  revokePreviewSessions,
} from "./app-cloud";
import { registerPushToken } from "./app-push";
import { createProject, duplicateProject } from "./projects";
import { commitVersion, getCurrentFiles } from "./versions";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;

beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

async function cloudProject() {
  const owner = await makeUser(db);
  const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
  await db.update(schema.project).set({ backend: "cloud" }).where(eq(schema.project.id, p.id));
  return p;
}

describe("App Cloud (Postgres)", () => {
  it("keeps each app user's records separate", async () => {
    const p = await cloudProject();
    const a = await createAnonymousUser(db, p.id);
    const b = await createAnonymousUser(db, p.id);
    await putRecords(db, a.user, "expenses", [{ id: "e1", title: "Coffee", value: 4 }]);
    await putRecords(db, b.user, "expenses", [{ id: "e1", title: "Rent", value: 900 }]);
    expect(await listRecords(db, a.user, "expenses")).toEqual([
      { id: "e1", title: "Coffee", value: 4 },
    ]);
    expect(await listRecords(db, b.user, "expenses")).toEqual([
      { id: "e1", title: "Rent", value: 900 },
    ]);

    await putRecords(db, a.user, "expenses", [{ id: "e1", title: "Tea", value: 3 }]);
    await deleteRecord(db, b.user, "expenses", "e1");
    expect(await listRecords(db, a.user, "expenses")).toEqual([
      { id: "e1", title: "Tea", value: 3 },
    ]);
    expect(await listRecords(db, b.user, "expenses")).toEqual([]);
  });

  it("upgrades an anonymous user on sign-up, so their data stays theirs", async () => {
    const p = await cloudProject();
    const anon = await createAnonymousUser(db, p.id);
    await putRecords(db, anon.user, "notes", [{ id: "n1", text: "hello" }]);
    const signedUp = await signUpApp(
      db,
      p.id,
      { email: "Sam@Example.com", password: "long-password" },
      anon.user,
    );
    expect(signedUp.user.id).toBe(anon.user.id);
    expect(signedUp.user.email).toBe("sam@example.com");

    const signedIn = await signInApp(db, p.id, {
      email: "sam@example.com",
      password: "long-password",
    });
    expect(await listRecords(db, signedIn.user, "notes")).toEqual([{ id: "n1", text: "hello" }]);
    await expect(
      signInApp(db, p.id, { email: "sam@example.com", password: "wrong-password" }),
    ).rejects.toBeInstanceOf(AppCloudError);
    await expect(
      signUpApp(db, p.id, { email: "sam@example.com", password: "long-password" }, null),
    ).rejects.toThrow(/already exists/);

    expect((await sessionUser(db, p.id, signedIn.token))?.id).toBe(anon.user.id);
    await signOutApp(db, signedIn.token);
    expect(await sessionUser(db, p.id, signedIn.token)).toBeNull();

    // A token from one app never works for another app.
    const other = await cloudProject();
    expect(await sessionUser(db, other.id, signedUp.token)).toBeNull();

    const summary = await appDataSummary(db, p.id);
    expect(summary.users).toEqual({ total: 1, signedUp: 1 });
    expect(summary.collections).toEqual([{ name: "notes", records: 1 }]);
  });

  it("deletes an account with its data, sessions and push tokens, but only empties the preview user", async () => {
    const p = await cloudProject();
    const anon = await createAnonymousUser(db, p.id);
    const { user, token } = await signUpApp(
      db,
      p.id,
      { email: `gone-${Date.now()}@example.com`, password: "long enough" },
      anon.user,
    );
    const other = await createAnonymousUser(db, p.id);
    await putRecords(db, user, "notes", [{ id: "n1", text: "mine" }]);
    await putRecords(db, other.user, "notes", [{ id: "n1", text: "theirs" }]);
    await registerPushToken(db, {
      projectId: p.id,
      userId: user.id,
      token: "ExponentPushToken[gone]",
      platform: "ios",
    });

    expect(await deleteAppUser(db, user)).toEqual({ preview: false });
    expect(await sessionUser(db, p.id, token)).toBeNull();
    expect(await sessionUser(db, p.id, anon.token)).toBeNull();
    const left = await db
      .select()
      .from(schema.appRecord)
      .where(eq(schema.appRecord.ownerId, user.id));
    expect(left).toEqual([]);
    const tokens = await db
      .select()
      .from(schema.appPushToken)
      .where(eq(schema.appPushToken.userId, user.id));
    expect(tokens).toEqual([]);
    // Nobody else's data goes with it, and the email can sign up again.
    expect(await listRecords(db, other.user, "notes")).toEqual([{ id: "n1", text: "theirs" }]);
    await expect(
      signInApp(db, p.id, { email: user.email!, password: "long enough" }),
    ).rejects.toMatchObject({ status: 401 });

    // The workspace preview's shared user keeps working for the other editors.
    const previewToken = await previewSession(db, p.id);
    const preview = (await sessionUser(db, p.id, previewToken))!;
    await putRecords(db, preview, "notes", [{ id: "n1", text: "preview" }]);
    expect(await deleteAppUser(db, preview)).toEqual({ preview: true });
    expect((await sessionUser(db, p.id, previewToken))?.id).toBe(preview.id);
    expect(await listRecords(db, preview, "notes")).toEqual([]);
  });

  it("validates collections, ids and sizes", async () => {
    const p = await cloudProject();
    const { user } = await createAnonymousUser(db, p.id);
    await expect(listRecords(db, user, "Drop Table")).rejects.toBeInstanceOf(AppCloudError);
    await expect(putRecords(db, user, "items", [{ id: "../x" }])).rejects.toThrow(/id/);
    await expect(
      putRecords(db, user, "items", [{ id: "big", blob: "x".repeat(40_000) }]),
    ).rejects.toThrow(/32 KB/);
  });

  it("caps records per user under concurrent writes, and updates don't count", async () => {
    const p = await cloudProject();
    const { user } = await createAnonymousUser(db, p.id);
    const limit = APP_CLOUD_LIMITS.recordsPerAnonymousUser;
    APP_CLOUD_LIMITS.recordsPerAnonymousUser = 5;
    try {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) => putRecords(db, user, "items", [{ id: `i${i}` }])),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
      expect(await listRecords(db, user, "items")).toHaveLength(5);
      // Replacing existing records is always allowed; the same id twice in a batch is one record.
      const [first] = await listRecords(db, user, "items");
      await putRecords(db, user, "items", [
        { id: first!.id, v: 1 },
        { id: first!.id, v: 2 },
      ]);
      expect((await listRecords(db, user, "items")).find((r) => r.id === first!.id)).toEqual({
        id: first!.id,
        v: 2,
      });
      await expect(putRecords(db, user, "items", [{ id: "one-more" }])).rejects.toThrow(
        /storage limit/,
      );
    } finally {
      APP_CLOUD_LIMITS.recordsPerAnonymousUser = limit;
    }
  });

  it("keeps the preview user shared but never upgradable, and revocable", async () => {
    const p = await cloudProject();
    const token = await previewSession(db, p.id);
    const preview = (await sessionUser(db, p.id, token))!;
    expect(preview.name).toBe("Preview");
    const [session] = await db
      .select()
      .from(schema.appSession)
      .where(eq(schema.appSession.appUserId, preview.id));
    expect(session!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3_600_000);

    // Signing up from the preview creates a separate account instead of upgrading it.
    const signedUp = await signUpApp(
      db,
      p.id,
      { email: "tester@example.com", password: "long-password" },
      preview,
    );
    expect(signedUp.user.id).not.toBe(preview.id);
    expect((await sessionUser(db, p.id, token))?.email).toBeNull();

    await revokePreviewSessions(db, p.id);
    expect(await sessionUser(db, p.id, token)).toBeNull();
    expect(await sessionUser(db, p.id, signedUp.token)).not.toBeNull();
  });

  it("prunes expired sessions and idle anonymous users, but nothing with data", async () => {
    const p = await cloudProject();
    const idle = await createAnonymousUser(db, p.id);
    const active = await createAnonymousUser(db, p.id);
    await putRecords(db, active.user, "notes", [{ id: "n1" }]);
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db
      .update(schema.appUser)
      .set({ createdAt: old })
      .where(eq(schema.appUser.projectId, p.id));
    await previewSession(db, p.id);
    await db
      .update(schema.appSession)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.appSession.appUserId, active.user.id));
    await db
      .update(schema.appUser)
      .set({ createdAt: old })
      .where(eq(schema.appUser.projectId, p.id));

    const pruned = await pruneAppCloud(db);
    expect(pruned.sessions).toBeGreaterThanOrEqual(1);
    expect(pruned.users).toBeGreaterThanOrEqual(1);
    const left = await db
      .select({ id: schema.appUser.id, name: schema.appUser.name })
      .from(schema.appUser)
      .where(eq(schema.appUser.projectId, p.id));
    expect(left.map((u) => u.id)).toContain(active.user.id);
    expect(left.map((u) => u.id)).not.toContain(idle.user.id);
    expect(left.map((u) => u.name)).toContain("Preview");
    expect(await sessionUser(db, p.id, active.token)).toBeNull();
  });

  it("gives a remix its own, on-device data config", async () => {
    const p = await cloudProject();
    const config = backendConfigFile({
      apiUrl: "https://app.example.com",
      projectId: p.id,
      imageEndpoint: "https://ik.imagekit.io/demo",
    });
    await commitVersion(db, {
      projectId: p.id,
      files: { [BACKEND_CONFIG_FILE]: config, "app/index.tsx": "x" },
      kind: "generate",
      summary: "v1",
    });
    const [source] = await db.select().from(schema.project).where(eq(schema.project.id, p.id));
    const remix = await duplicateProject(db, source!, (await makeUser(db)).id, {
      includePrivate: false,
    });
    const { files } = await getCurrentFiles(db, remix.id);
    expect(readPlatformConfig(files)).toEqual({
      apiUrl: "",
      projectId: remix.id,
      imageEndpoint: "https://ik.imagekit.io/demo",
    });
    expect(remix.backend).toBe("local");
  });
});
